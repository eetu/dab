# dab — task runner. Two flows, as in the sibling apps: the whole thing with one
# command, or each half in its own terminal.
yarn := "node .yarn/releases/yarn-4.16.0.cjs"

default:
    @just --list

# Everything at once: the backend (headless bacon, so its logs join this stream)
# and the frontend's dev server. One Ctrl-C takes both down — the trap kills the
# children AND their grandchildren, because killing `bacon` alone leaves the
# binary it spawned holding the port.
dev:
    #!/usr/bin/env bash
    set -uo pipefail
    pids=""
    trap 'for p in $pids; do pkill -P "$p" 2>/dev/null || true; kill "$p" 2>/dev/null || true; done' EXIT
    ( cd backend && exec bacon --headless -j run ) &
    back=$!; pids="$pids $back"
    ( exec {{yarn}} workspace dab-frontend run dev ) &
    front=$!; pids="$pids $front"
    # Wait for whichever falls over first, and SAY which it was.
    #
    # This was a bare `wait` under `set -e`: either half exiting non-zero ended
    # the script, the trap took the other half down with it, and nothing was
    # printed to say why. So a vite crash looked like the dev server going quiet
    # for no reason, and the fix looked like "restart `just dev`". macOS ships
    # bash 3.2, which has no `wait -n`, so this polls.
    while kill -0 "$back" 2>/dev/null && kill -0 "$front" 2>/dev/null; do sleep 1; done
    kill -0 "$front" 2>/dev/null || echo "dev: the frontend exited — its output is above" >&2
    kill -0 "$back" 2>/dev/null || echo "dev: the backend exited — its output is above" >&2

# The editor alone. Nothing in the tool needs the backend — it reaches the disk
# through the browser — so this is the usual way to work on it.
ui:
    {{yarn}} workspace dab-frontend run dev

# Everything CI runs, in CI's order. Run this before pushing.
check: fmt lint types test

fmt:
    {{yarn}} format
    cargo fmt --all -- --check

lint:
    {{yarn}} lint
    cargo clippy --workspace --all-targets -- -D warnings

types:
    {{yarn}} typecheck

test:
    {{yarn}} test
    cargo test --workspace

# Drive the editor into a set of states and photograph each one, into
# frontend/shots/out/. NOT part of `check` — these are for looking at, and the
# only way to catch a control that collapsed or a marquee saying the wrong
# thing. Add a scene in frontend/shots/*.shot.ts; the rig is shots/rig.ts.
# Takes an optional FILE filter: `just shots editor` runs shots/editor.shot.ts.
# To pick one scene out of a file, add `-t "part of its name"`.
shots filter="":
    {{yarn}} workspace dab-frontend run shots {{filter}}

# The SPA, then the binary that serves it.
build:
    {{yarn}} build
    cargo build --release

# Build core's dist. Not a publish step — core is private (see CLAUDE.md); this
# exists so a type error in the format fails locally the way it will in CI.
build-core:
    {{yarn}} workspace dab-core run build
