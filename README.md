# One-Click Deploy Platform

A **Cloudflare Worker** that gives users a self-hosted control panel for deploying static websites to Cloudflare Pages from a browser — no CLI, no local toolchain, no DevOps experience required.

```
User fills in tokens → picks a framework template → Worker creates a
GitHub repo, pushes starter source files, and wires up Cloudflare Pages →
site is live on a *.pages.dev URL within minutes.
```

---

## Features

| What | How |
|------|-----|
| Zero-build-step control panel | Entire UI is a single Worker (`worker.js`) — no React build, no bundler |
| 8 framework starters | Astro, React, Vue 3, SvelteKit, Vite, Hugo, Gatsby, Angular |
| Live deploy progress | KV-backed state with 700 ms polling |
| Burn-after-reading credentials | Generated password returned exactly once, then redacted in KV |
| Daily template refresh | Cron invalidates the template cache; fresh data fetched from GitHub Search API |
| GitHub Actions CI | Framework-aware workflow injected per deploy (Node 20 for JS frameworks, Hugo action for Hugo) |

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| [Cloudflare account](https://dash.cloudflare.com/sign-up) | Free plan works |
| [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) | `npm install -g wrangler` |
| Node.js ≥ 18 | For running tests and Wrangler |
| GitHub account | For repo creation during deployments |

---

## Setup

### 1 — Clone and install

```bash
git clone https://github.com/ShiYuPIay/one-click-deploy.git
cd one-click-deploy
npm install
```

### 2 — Authenticate with Cloudflare

```bash
wrangler login
```

### 3 — Create a KV namespace

The Worker uses KV to store deploy-job state and the daily template cache.

```bash
wrangler kv namespace create KV
```

Copy the `id` from the output and paste it into `wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  {
    "binding": "KV",
    "id": "<paste-your-id-here>"   // ← replace the placeholder
  }
]
```

For local development with `wrangler dev`, also add a `preview_id`:

```bash
wrangler kv namespace create KV --preview
```

```jsonc
"kv_namespaces": [
  {
    "binding": "KV",
    "id": "<production-id>",
    "preview_id": "<preview-id>"
  }
]
```

### 4 — (Optional) Enable live template data

Without a GitHub token the Worker serves the built-in static template list.
To pull live trending repos from the GitHub Search API:

```bash
wrangler secret put GITHUB_TOKEN
# paste a GitHub personal access token with public_repo scope
```

### 5 — Deploy

```bash
npm run deploy
# equivalent: wrangler deploy
```

Wrangler prints the Worker URL:

```
https://one-click-deploy.<your-account>.workers.dev
```

Open that URL in a browser — the control panel loads immediately.

---

## Usage

1. **Fill in tokens** — Cloudflare API token + Account ID, GitHub access token + username.
2. **Test connection** — the "连接测试" button validates the Cloudflare credentials live.
3. **Pick a template** — choose one of the framework cards.
4. **Deploy** — watch the real-time log. The pipeline:
   - Creates a private GitHub repository
   - Pushes framework-appropriate starter source files
   - Injects a GitHub Actions CI workflow
   - Creates and connects a Cloudflare Pages project
   - Returns the `*.pages.dev` URL plus one-time admin credentials
5. **Save credentials** — shown exactly once, then wiped from memory.

---

## API Reference

All endpoints are served by the Worker at the same origin as the UI.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | HTML control panel |
| `GET` | `/health` | Health check (JSON) |
| `GET` | `/api/templates` | Template list (cached daily) |
| `GET` | `/api/search?q=&limit=` | Search templates |
| `POST` | `/api/test-connection` | Validate Cloudflare credentials |
| `POST` | `/api/deploy` | Start a deploy job |
| `GET` | `/api/deploy/:id` | Poll deploy progress |

### POST /api/deploy — request body

```json
{
  "cfToken":     "Bearer eyJhbGci...",
  "cfAccountId": "a1b2c3d4...",
  "ghToken":     "ghp_xxxx...",
  "ghUsername":  "your-username",
  "template": {
    "name":      "Astro 极速博客",
    "framework": "Astro",
    "buildCmd":  "npm run build",
    "outputDir": "dist",
    "compatible": true
  }
}
```

### POST /api/deploy — response

```json
{ "deployId": "<uuid>", "message": "Deploy started. Poll /api/deploy/:id for progress." }
```

### GET /api/deploy/:id — response

```json
{
  "status":  "running | complete | failed",
  "step":    3,
  "logs":    [{ "ts": "12:34:56", "text": "...", "type": "info" }],
  "result":  { "frontendUrl": "https://site-abc.pages.dev", "domain": "...", "password": "..." }
}
```

> **Note:** `result.password` is returned exactly once (burn-after-reading). Subsequent polls return `[Secret already displayed]`.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `KV` (binding) | **Yes** | KV namespace for state and cache |
| `GITHUB_TOKEN` | No | GitHub token for live template data from GitHub Search API |

---

## Template Frameworks

| Framework | Build command | Output dir | Compatible |
|-----------|--------------|-----------|------------|
| Astro | `npm run build` | `dist` | ✅ |
| React (Vite) | `npm run build` | `build` | ✅ |
| Vue 3 (Vite) | `npm run build` | `dist` | ✅ |
| SvelteKit (Vite) | `npm run build` | `build` | ✅ |
| Vite | `npm run build` | `dist` | ✅ |
| Hugo | `hugo --minify` | `public` | ✅ |
| Gatsby | `gatsby build` | `public` | ✅ |
| Angular | `ng build --configuration production` | `dist` | ✅ |
| Next.js | `next build` | `.next` | ⚠️ SSR requires persistent runtime |
| Nuxt 3 | `nuxt generate` | `.output/public` | ⚠️ SSR requires persistent runtime |

Incompatible frameworks show a detailed explanation and upgrade path when selected.

---

## Development

### Local development

```bash
wrangler dev
# Worker runs at http://localhost:8787
```

### Tests

```bash
npm test           # run all tests (node:test)
npm run check:bundle  # dry-run Wrangler bundle (catches build errors)
```

### Project structure

```
one-click-deploy/
├── worker.js              # Main Worker — UI + API + pipeline
├── deploy-tool.jsx        # Reference React component (not built by default)
├── migrations/
│   └── state.js           # KV state schema + migration helpers
├── test/
│   ├── worker.test.js     # API + routing tests
│   ├── starters.test.js   # Template starter coverage tests
│   └── state-migrations.test.js  # Schema migration tests
├── .github/workflows/
│   ├── ci.yml             # CI: test + bundle-check on every push
│   └── template-sync.yml  # Daily + monthly scheduled validation
├── wrangler.jsonc          # Cloudflare Workers configuration
└── package.json
```

### Adding a template

1. Add an entry to `STATIC_TEMPLATES` in `worker.js`.
2. Add matching starter files to `TEMPLATE_STARTERS` (same framework key).
3. Add a matching entry to `TDATA` (the frontend fallback array) with the same `id`.
4. Run `npm test` — the `starters.test.js` suite verifies coverage.

---

## Architecture

```
Browser
  └── GET /  → Worker serves PAGE (inline HTML+CSS+JS, no build)
  └── POST /api/deploy → Worker spawns ctx.waitUntil(runPipeline)
        └── runPipeline (background)
              ├── Step 0: framework detection
              ├── Step 1: create GitHub repo (private, auto_init)
              ├── Step 2: push starter files + CI workflow via GitHub Contents API
              ├── Step 3: create Cloudflare Pages project (GitHub-connected)
              └── Step 4: post-deployment log → status=complete
  └── GET /api/deploy/:id → KV state polling (burn-after-reading for password)
```

Template cache flow:

```
GET /api/templates
  ├── KV hit (today's cache) → return immediately
  └── KV miss
        ├── env.GITHUB_TOKEN present → fetch GitHub Search API → cache 26 h
        └── no token → return STATIC_TEMPLATES
```

---

## Security Notes

- Tokens submitted to `/api/deploy` are used only within `runPipeline` and are never written to KV logs.
- The generated admin password is stored in KV only until the first `/api/deploy/:id` poll after completion, then replaced with a redacted placeholder.
- The UI prompts users to revoke their API tokens after deployment.
- `buildCmd` and `outputDir` are validated against an injection-character allowlist before use.
- Consider revoking your Cloudflare API token after each deployment session.

---

## License

MIT — see [LICENSE](./LICENSE).
