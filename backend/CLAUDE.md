# backend — working here

One file, `src/main.rs`: `/status`, and `frontend/dist` with an SPA fallback.
It holds no sprites by design — the editor reaches the disk through the browser
(root `CLAUDE.md`) — so a route that would take or serve a sprite is the wrong
fix for whatever prompted it. Settings are `DAB_BIND` and `DAB_STATIC_DIR`
(`.env.example`); tests drive the router in-process with `oneshot`.
