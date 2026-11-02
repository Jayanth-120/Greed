# Greed: Shaping the World — online browser prototype

This is a self-hostable, server-authoritative browser RPG prototype. The server uses Node.js built-ins (HTTP, `node:sqlite`, cryptography); the browser renders an original, procedural 3D scene with a locally installed Three.js module (no CDN dependency).

## Run locally

1. Install Node.js 24 or newer (tested with 24.21).
2. From this folder run `npm start`.
3. Open `http://localhost:3000`, create an account, and play. SQLite data is stored in `data/world.sqlite` by default.
4. To run integration tests, use `npm test`.

The shared world includes registered accounts, persistent characters and quests, server-validated actions, chat, online presence, a shared Morpheus event state, and autonomous NPC decisions. Browser clients poll the server, so multiple players can share one deployed instance. This is a prototype-scale architecture; it is not ready for large public traffic.

## Public deployment

`render.yaml` describes a single Render web service with a persistent disk for SQLite. The current deployment is at [https://greed-r2ax.onrender.com](https://greed-r2ax.onrender.com). The persistent disk requires a paid service plan on Render. The SQLite database stays private on the server disk; do not expose it directly to browsers.

### Google sign-in and admin setup

In Google Cloud Console, create an OAuth 2.0 Web application client. Add `https://greed-r2ax.onrender.com/auth/google/callback` as an authorized redirect URI. In Render's environment settings, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` to that exact callback URL, and `ADMIN_EMAIL` to the verified Google account that should be an administrator. Keep the client secret private; never commit it or send it in chat. Admin promotion occurs on Google sign-in for that exact email, and admin API routes enforce the role on the server.

For a larger game, replace SQLite with managed PostgreSQL, add server-side migration tooling, multi-instance coordination, moderation, backups, monitoring, TLS, account recovery, anti-cheat/rate limits, and proper multiplayer load tests. The current Morpheus director is rules-based, not a general-purpose AI model. The content and art are original/fan-inspired, not a full reproduction of the manhwa.
