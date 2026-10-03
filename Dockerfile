# syntax=docker/dockerfile:1
#
# dab's image: the SPA and the small axum binary that serves it.
#   docker build --target dab -t dab .
#
# The family's shape — vendored yarn, tonistiigi/xx cross-compile, scratch. The
# node tag must match frontend/.node-version (26).

# --- Cross-compilation helper ---
FROM --platform=$BUILDPLATFORM tonistiigi/xx AS xx

# ============================================================================
# Frontend (vendored yarn — no corepack)
# ============================================================================
# The yarn workspace is the repo root: core/, frontend/ and cli/ are its
# members, and install needs every member's manifest (cli's too, though the
# image does not ship it). Manifests first, so install caches across
# source-only changes. The frontend builds against core's SOURCE (vite
# aliases dab-core to core/src), so core needs no build of its own.
FROM --platform=$BUILDPLATFORM node:26-alpine AS frontend-build
WORKDIR /app
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases ./.yarn/releases
COPY core/package.json core/package.json
COPY frontend/package.json frontend/package.json
COPY cli/package.json cli/package.json
RUN node .yarn/releases/yarn-*.cjs install --immutable --network-timeout 1000000
COPY core ./core
COPY frontend ./frontend
RUN node .yarn/releases/yarn-*.cjs workspace dab-frontend run build   # → frontend/dist

# ============================================================================
# Rust backend (warm dep cache via stub source)
# ============================================================================
FROM --platform=$BUILDPLATFORM rust:1-alpine AS workspace-deps
COPY --from=xx / /
RUN apk add --no-cache clang lld musl-dev curl
ARG TARGETPLATFORM
RUN xx-apk add --no-cache musl-dev gcc
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
# EVERY workspace member's manifest, not only the one being built: cargo reads
# the whole workspace before it builds any of it, and a member it cannot read is
# a hard error. One member today; this is the line to extend for a second.
COPY backend/Cargo.toml backend/Cargo.toml
RUN mkdir -p backend/src \
    && printf 'fn main() {}\n' > backend/src/main.rs \
    && xx-cargo build --release -p dab-backend

FROM workspace-deps AS backend-build
ARG TARGETPLATFORM
COPY backend/src ./backend/src
# `touch` so cargo notices the stub→real source swap and rebuilds the package.
RUN touch backend/src/main.rs \
    && xx-cargo build --release -p dab-backend \
    && cp target/*/release/dab-backend /dab-backend

# ============================================================================
# Runtime image (scratch + binary + dist + certs)
# ============================================================================
FROM scratch AS dab
WORKDIR /app
LABEL org.opencontainers.image.description="dab — a pixel editor for character-grid sprites"
LABEL org.opencontainers.image.source="https://github.com/eetu/dab"
COPY --from=backend-build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=backend-build /dab-backend ./dab-backend
COPY --from=frontend-build /app/frontend/dist ./dist
ENV DAB_BIND=0.0.0.0:3060
ENV DAB_STATIC_DIR=./dist
USER 1000
EXPOSE 3060
CMD ["./dab-backend"]
