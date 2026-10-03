# Security

dab is a pixel editor that runs in the browser. It has no accounts and no
server-side data: the backend serves the built page and an unauthenticated
`/status`, and nothing else. The same page is published on GitHub Pages; a
self-hosted instance sits on a home Pi behind oauth2-proxy forward-auth and
Traefik. The threat model is therefore the page's: what it can reach on the
machine it runs on, and what a file opened in it can do.

## Trust boundaries

- **The folder.** Sprites are read and written through the browser's File
  System Access API. The grant is the user's, per origin, to the one folder they
  picked; the page cannot widen it, and after a restart the browser asks again
  before writing. The folder handle is kept in IndexedDB on that origin only.
- **Files opened in it.** A sprite (`.json`), a palette file (`.hex`, `.gpl`)
  or a dropped file is parsed as data — `JSON.parse` and the validator, or a
  line-by-line read — and never evaluated. A sprite that fails validation is
  refused with its errors, not partly loaded.
- **Browser storage.** The working draft, the last saved state and the desk
  preferences live in `localStorage` on the serving origin. Anyone with the
  browser profile can read the art in progress; nothing leaves the machine.
- **The server.** Serves static files with an SPA fallback, sets
  `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`, and
  reads no headers, cookies or bodies. Behind oauth2-proxy it relies on the edge
  for access; it has no identity of its own to check.
- **No third parties.** No CDN, analytics, embeds or remote fonts are loaded;
  exports and downloads are blobs made in the page.

## Secrets

None. The image carries no credentials; `DAB_BIND` and `DAB_STATIC_DIR` are the
only settings, and `backend/.env` is gitignored. The container runs as UID 1000
on `scratch`.

## Accepted risks

- **No Content-Security-Policy yet.** The page loads only its own bundle, so a
  CSP would mostly document what is already true; revisit when anything third
  party is added, or when the MCP work (#12) puts a second writer on the files.

## Out of scope

Multi-user isolation (there are no users), rate limiting (there is nothing to
exhaust), and protecting a sprite from someone who already has the browser
profile or the folder.

## Reporting

A personal project: flag an issue privately to the maintainer rather than in a
public issue with exploit detail.
