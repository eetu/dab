//! dab's backend: it serves the built SPA and answers a liveness probe.
//!
//! That is the whole job. The editor reaches sprite files through the browser's
//! File System Access API — the folder handle belongs to the page, not to this
//! process — so there is no upload endpoint, no store, and nothing here that
//! knows what a sprite is. Keeping it that way is deliberate: the tool works the
//! same served from this binary, from `vite dev`, or from a file:// build.
use std::net::SocketAddr;
use std::path::PathBuf;

use axum::Router;
use axum::http::{HeaderName, HeaderValue};
use axum::routing::get;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::set_header::SetResponseHeaderLayer;

/// Liveness, unauthenticated, for gatus to poll. Deliberately says nothing about
/// the state of anything — there is no state.
async fn status() -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!({ "ok": true, "version": env!("CARGO_PKG_VERSION") }))
}

fn app(static_dir: PathBuf) -> Router {
    // SPA fallback: any path that is not a file on disk gets index.html, so a deep
    // link and a reload both land in the app rather than on a 404.
    let index = static_dir.join("index.html");
    let files = ServeDir::new(&static_dir).fallback(ServeFile::new(index));

    Router::new()
        .route("/status", get(status))
        .fallback_service(files)
        // The editor is a document tool with no accounts and no third-party
        // embeds; it needs none of the powerful features a page can ask for.
        .layer(SetResponseHeaderLayer::overriding(
            HeaderName::from_static("x-content-type-options"),
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            HeaderName::from_static("referrer-policy"),
            HeaderValue::from_static("no-referrer"),
        ))
}

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let bind: SocketAddr = std::env::var("DAB_BIND")
        .unwrap_or_else(|_| "127.0.0.1:3060".into())
        .parse()
        .expect("DAB_BIND must be host:port");
    let static_dir =
        PathBuf::from(std::env::var("DAB_STATIC_DIR").unwrap_or_else(|_| "frontend/dist".into()));

    tracing::info!(%bind, dir = %static_dir.display(), "serving dab");
    let listener = tokio::net::TcpListener::bind(bind).await.expect("bind");
    axum::serve(listener, app(static_dir)).await.expect("serve");
}

#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

    use super::*;

    /// A directory with an index and one real file, so the fallback can be told
    /// apart from a hit.
    fn fixture() -> tempfile::TempDir {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir.path().join("index.html"), "<!doctype html>app").expect("write");
        std::fs::write(dir.path().join("thing.txt"), "real file").expect("write");
        dir
    }

    #[tokio::test]
    async fn status_is_open_and_says_ok() {
        let dir = fixture();
        let res = app(dir.path().to_path_buf())
            .oneshot(Request::get("/status").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn a_real_file_is_served_and_anything_else_gets_the_app() {
        let dir = fixture();
        let hit = app(dir.path().to_path_buf())
            .oneshot(Request::get("/thing.txt").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(hit.status(), StatusCode::OK);

        // A deep link is not a 404: the SPA owns routing.
        let miss = app(dir.path().to_path_buf())
            .oneshot(Request::get("/some/deep/link").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(miss.status(), StatusCode::OK);
        let body = http_body_util::BodyExt::collect(miss.into_body())
            .await
            .unwrap()
            .to_bytes();
        assert!(String::from_utf8_lossy(&body).contains("app"));
    }
}
