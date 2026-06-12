# vital. — Health & Weight Loss Dashboard

A personal health tracking dashboard with multi-user accounts, WHOOP API integration, caffeine decay modelling, circadian phase tracking, and weight journey tracking.

---

## Architecture

The dashboard is a static frontend backed by Netlify serverless functions. All data lives server-side in Netlify Blobs, scoped per user. WHOOP credentials never reach the browser.

```
Browser ── session cookie (HttpOnly) ──→ /api/* ──→ Netlify Functions
                                                        │
                                          ┌─────────────┼──────────────┐
                                          │             │              │
                                    Netlify Blobs   WHOOP OAuth   WHOOP API proxy
                                    (users, sessions,  (per-user      (allowlisted
                                     config, tokens)    tokens)        paths only)
```

- **Authentication** — username/password accounts with PBKDF2-SHA256 hashing (600,000 iterations), HTTP-only session cookies, and per-IP rate limiting on login. The first visit prompts you to create an admin account; admins can add and manage further users.
- **WHOOP integration** — each user connects their own WHOOP account via the OAuth authorization-code flow. Tokens are stored server-side and auto-refreshed; the proxy (`netlify/functions/whoop.js`) only forwards allowlisted API paths.
- **Per-user data** — weight logs, caffeine doses, and dashboard config are stored in Netlify Blobs keyed by user ID and sync across devices.

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/vital-dashboard.git
cd vital-dashboard
```

### 2. Create a WHOOP developer app

1. Go to [developer.whoop.com](https://developer.whoop.com) and sign in
2. Click **Create App**
3. Set the redirect URI to: `https://YOUR-SITE.netlify.app/.netlify/functions/auth-callback`
4. Note your **Client ID** and **Client Secret**

### 3. Deploy to Netlify

**Option A — Netlify UI**

1. Push this repo to GitHub
2. Log into [netlify.com](https://netlify.com)
3. Click **Add new site → Import an existing project** → select your repo
4. Build settings:
   - Build command: *(leave empty)*
   - Publish directory: `.`
5. Click **Deploy site**
6. Go to **Site settings → Environment variables** and add:
   - `WHOOP_CLIENT_ID` — from developer.whoop.com
   - `WHOOP_CLIENT_SECRET` — from developer.whoop.com
   - `WHOOP_REDIRECT_URI` — `https://YOUR-SITE.netlify.app/.netlify/functions/auth-callback`
7. **Trigger a redeploy**

**Option B — Netlify CLI**

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify env:set WHOOP_CLIENT_ID your_client_id
netlify env:set WHOOP_CLIENT_SECRET your_client_secret
netlify env:set WHOOP_REDIRECT_URI https://YOUR-SITE.netlify.app/.netlify/functions/auth-callback
netlify deploy --prod
```

### 4. Create your account

Visit your site — you'll be redirected to the login page, which offers first-time setup. Create the initial admin account (this is only possible while no users exist). Additional users can be added from the admin panel inside the dashboard.

### 5. Connect WHOOP and configure

After logging in, click **Connect WHOOP** to run the OAuth flow — tokens auto-refresh from then on. Then open **Configure** to set:
- Starting / current / target weight (kg)
- Daily step target
- Wake and sleep times
- Caffeine metabolism profile

All of this is stored server-side per user and syncs across devices.

---

## Security

- **Password hashing** — PBKDF2-SHA256 with 600,000 iterations (OWASP-recommended) and per-user salts. Hashes created at older iteration counts are transparently upgraded on the next successful login.
- **Sessions** — 256-bit random tokens in `HttpOnly; Secure; SameSite=Lax` cookies with a 24-hour TTL. Changing a password bumps the user's `tokenVersion`, instantly invalidating all existing sessions.
- **Rate limiting** — login and password-change attempts are limited per IP (10 attempts per 15-minute window) using Netlify's spoof-proof `x-nf-client-connection-ip` header.
- **Input validation** — all writes to server-side config (`weight logs`, `caffeine doses`, etc.) are validated against an allowlist of keys with per-field type and range checks.
- **Headers** — strict Content-Security-Policy (`default-src 'none'`), `X-Frame-Options: DENY`, `nosniff`, restrictive Permissions-Policy. The Chart.js CDN script is pinned with Subresource Integrity.
- **WHOOP proxy** — rejects path traversal and forwards only allowlisted WHOOP API paths under the requesting user's own token.

---

## File structure

```
vital-dashboard/
├── index.html                    # Dashboard UI
├── login.html                    # Login + first-time setup page
├── css/
│   └── style.css                 # Styles + light/dark themes
├── js/
│   ├── session-guard.js          # Redirects unauthenticated visitors to login
│   ├── login.js                  # Login / setup page logic
│   ├── config.js                 # Server-synced config with localStorage fallback
│   ├── whoop.js                  # Calls the serverless WHOOP proxy
│   ├── weight.js                 # Weight chart + log
│   ├── caffeine.js               # Caffeine pharmacokinetic decay model
│   ├── prc.js                    # Phase Response Curve (circadian) widget
│   └── app.js                    # Orchestration, theme, admin panel
├── netlify/
│   └── functions/
│       ├── lib/
│       │   ├── users.js          # User store + PBKDF2 hashing/verification
│       │   ├── session.js        # Cookie session create/validate/delete
│       │   ├── ratelimit.js      # Per-IP sliding-window rate limiter
│       │   └── get-valid-token.js# WHOOP token refresh helper
│       ├── setup.js              # First-run admin account creation
│       ├── login.js              # Password login (rate-limited)
│       ├── logout.js             # Session teardown
│       ├── session-check.js      # Lightweight auth probe for the frontend
│       ├── me.js                 # Current user profile
│       ├── change-password.js    # Password change (invalidates sessions)
│       ├── admin-users.js        # Admin: list/create/update/delete users
│       ├── auth-start.js         # WHOOP OAuth: redirect with state
│       ├── auth-callback.js      # WHOOP OAuth: code exchange + token storage
│       ├── auth-status.js        # WHOOP connection status
│       ├── config-get.js         # Read per-user config
│       ├── config-set.js         # Write per-user config (validated)
│       └── whoop.js              # WHOOP API proxy (allowlisted paths)
├── netlify.toml                  # Redirects, security headers, functions config
├── package.json                  # @netlify/blobs, @netlify/functions
└── README.md
```

---

## Storage model

| What | Where | Syncs across devices? |
|---|---|---|
| User accounts + password hashes | Netlify Blobs (server) | N/A — server only |
| Sessions | Netlify Blobs (server), HttpOnly cookie in browser | N/A |
| WHOOP OAuth tokens | Netlify Blobs (server, per user) | N/A — never in browser |
| Start / current / target weight | Netlify Blobs (per user) | Yes |
| Weight log entries | Netlify Blobs (per user) | Yes |
| Step target + manual step count | Netlify Blobs (per user) | Yes |
| Wake / sleep times | Netlify Blobs (per user) | Yes |
| Caffeine doses log | Netlify Blobs (per user) | Yes |
| Caffeine metabolism profile | Netlify Blobs (per user) | Yes |
| Theme preference | localStorage (device only) | No — intentionally local |

All user data except theme syncs across every device automatically. Open the dashboard on your phone and your laptop — same state everywhere.

### Offline resilience
If the Netlify Blobs function is unreachable (e.g. network down or local dev without `netlify dev`), the last known server state is cached in localStorage under `vital_server_cache` and used as a fallback. Saves made offline are also written to the cache so no data is lost, and will sync next time the function is reachable.

---

## Local development

```bash
npm install -g netlify-cli
npm install
netlify dev   # starts functions + local Blobs emulator
```

Set the WHOOP env vars in a local `.env` file (never commit it) if you want the OAuth flow to work locally:

```
WHOOP_CLIENT_ID=your_client_id
WHOOP_CLIENT_SECRET=your_client_secret
WHOOP_REDIRECT_URI=http://localhost:8888/.netlify/functions/auth-callback
```

Plain `open index.html` works for visual dev, but auth and all Blobs calls require `netlify dev`.

---

## Caffeine model

Single-compartment pharmacokinetic model with first-order absorption and elimination, using a **5.5-hour half-life** (population average, adjustable via metabolism profiles). The curve runs from your wake time through 2 hours past your target sleep time. Dose logging persists server-side in Netlify Blobs and syncs across devices.

---

## Phase Response Curve

The PRC widget derives circadian light-sensitivity zones (advance / delay / dead zone / temperature minimum) from your WHOOP sleep midpoint and draws them on a 24-hour clock, falling back to a demo sleep schedule when WHOOP isn't connected.

---

## License

MIT
