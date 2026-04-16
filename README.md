# vital. — Health & Weight Loss Dashboard

A personal health tracking dashboard with WHOOP API integration, caffeine decay modelling, and weight journey tracking.

---

## Architecture

All WHOOP API calls are proxied through a Netlify serverless function (`netlify/functions/whoop.js`). The `WHOOP_TOKEN` environment variable lives only in Netlify — it is never embedded in the frontend, never stored in localStorage, and never visible in the browser.

```
Browser → /.netlify/functions/whoop?path=... → api.prod.whoop.com
                   ↑
          WHOOP_TOKEN injected here
          via Netlify env var (server-side only)
```

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/health-dashboard.git
cd health-dashboard
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
7. **Trigger a redeploy**, then visit your site and click **Connect WHOOP** — done, tokens auto-refresh forever

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

### 4. Configure the dashboard

Once deployed, open your Netlify URL and click **Configure** to set:
- Starting / current / target weight (kg)
- Daily step target
- Wake and sleep times

These are stored in your browser's localStorage — personal to your device.

---

## Local development

```bash
# Install Netlify CLI to run functions locally
npm install -g netlify-cli

# Create a local env file (never commit this)
echo "WHOOP_TOKEN=your_token_here" > .env

# Start local dev server with function support
netlify dev
```

The Netlify CLI will inject `.env` variables and serve `/.netlify/functions/whoop` locally.

---

## File structure

```
health-dashboard/
├── index.html                    # Dashboard UI
├── css/
│   └── style.css                 # Styles + light/dark themes
├── js/
│   ├── config.js                 # localStorage config (no token)
│   ├── whoop.js                  # Calls serverless proxy
│   ├── weight.js                 # Weight chart
│   ├── caffeine.js               # Caffeine decay model
│   ├── steps.js                  # Step ring
│   └── app.js                    # Orchestration + theme
├── netlify/
│   └── functions/
│       └── whoop.js              # Serverless proxy — token lives here
├── netlify.toml                  # Build + functions config
└── README.md
```

---

## Storage model

| What | Where | Syncs across devices? |
|---|---|---|
| WHOOP_TOKEN | Netlify env var (server only) | N/A — never in browser |
| Start / current / target weight | Netlify Blobs (server) | Yes |
| Step target + manual step count | Netlify Blobs (server) | Yes |
| Wake / sleep times | Netlify Blobs (server) | Yes |
| Caffeine doses log | Netlify Blobs (server) | Yes |
| Caffeine metabolism profile | Netlify Blobs (server) | Yes |
| Theme preference | localStorage (device only) | No — intentionally local |

All user data except theme syncs across every device automatically. Open the dashboard on your phone and your laptop — same state everywhere.

### Offline resilience
If the Netlify Blobs function is unreachable (e.g. network down or local dev without `netlify dev`), the last known server state is cached in localStorage under `vital_server_cache` and used as a fallback. Saves made offline are also written to the cache so no data is lost, and will sync next time the function is reachable.

### Local development
```bash
npm install -g netlify-cli
netlify dev   # starts functions + local Blobs emulator
```
Plain `open index.html` works for visual dev but all Blobs calls will gracefully return empty defaults.

---

## Caffeine model

Single-compartment pharmacokinetic decay with a **5.5-hour half-life** (population average). The curve runs from your wake time through 2 hours past your target sleep time. Dose logging persists across page refreshes via localStorage.

---

## License

MIT
