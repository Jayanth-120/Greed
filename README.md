# Greed: Shaping the World — online browser prototype

This is a self-hostable, server-authoritative browser RPG prototype. It uses only Node.js built-ins (HTTP, `node:sqlite`, cryptography); there are no CDN assets or runtime package dependencies.

## Run locally

1. Install Node.js 24 or newer (tested with 24.21).
2. From this folder run `npm start`.
3. Open `http://localhost:3000`, create an account, and play. SQLite data is stored in `data/world.sqlite` by default.
4. To run integration tests, use `npm test`.

The shared world includes registered accounts, persistent characters and quests, server-validated actions, chat, online presence, a shared Morpheus event state, and autonomous NPC decisions. Browser clients poll the server, so multiple players can share one deployed instance. This is a prototype-scale architecture; it is not ready for large public traffic.

## Public deployment

`render.yaml` describes a single Render web service with a persistent disk for SQLite. Deploy the `GreedWeb` directory as the repository root; the host will create the actual public URL after a successful build. The persistent disk requires a paid service plan on Render. **No public URL is deployed yet** because there is no hosting account/project authorization in this workspace. The SQLite database stays private on the server disk; do not expose it directly to browsers.

### Google sign-in and admin setup

In Google Cloud Console, create an OAuth 2.0 Web application client. Add `https://YOUR-RENDER-HOST/auth/google/callback` as an authorized redirect URI after Render assigns the service hostname. In Render's environment settings, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` to that exact callback URL, and `ADMIN_EMAIL` to the verified Google account that should be an administrator. Keep the client secret private; never commit it or send it in chat. Admin promotion occurs on Google sign-in for that exact email, and admin API routes enforce the role on the server.

For a larger game, replace SQLite with managed PostgreSQL, add server-side migration tooling, multi-instance coordination, moderation, backups, monitoring, TLS, account recovery, anti-cheat/rate limits, and proper multiplayer load tests. The current Morpheus director is rules-based, not a general-purpose AI model. The content and art are original/fan-inspired, not a full reproduction of the manhwa.
