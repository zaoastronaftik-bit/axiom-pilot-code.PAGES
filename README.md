# AxiomPilotCode Website + Account API

Official light-blue glass landing page for [AxiomPilotCode](https://github.com/zaoastronaftik-bit/axiom-pilot-code).

## Website hosting

The static website is hosted by **GitHub Pages** from `main` / `(root)`, with no build step.

Public URL: https://zaoastronaftik-bit.github.io/axiom-pilot-code.PAGES/

## Site files

- `index.html`, `site.css`, `site.js` — responsive static landing page
- `auth.css`, `account.js`, `api-config.js` — account dialogs, independent API integration
- `favicon.svg` — AxiomPilotCode brand mark

The design uses a single blue accent with CSS blur/glass treatments, hand-drawn SVG arrows and reduced-motion support. JavaScript is externalized and restricted by a CSP.

## Account backend

- `server/` — independent [Better Auth](https://better-auth.com/) + PostgreSQL API designed for Vercel.
- **Supabase Auth is NOT used.** Supabase is intended only as a dedicated PostgreSQL host.
- New accounts start on Free. Pro is assigned only via trusted server/database administration.
- Browser bearer sessions currently use tab-scoped sessionStorage because the site and server are on unrelated origins; see the [security tradeoffs](./server/README.md).
- Recovery emails require a separate verified email-sending provider.

**Current status:** server source and UI exist, but real account creation is **not active**. The dedicated database and Vercel deployment still need to be provisioned, and the public API URL configured in `api-config.js`. The login dialog warns visitors before accepting production credentials. The code is a deployment candidate, not a production-tested authentication system.

## Setup

1. Enable **Settings → Pages → Deploy from a branch → main → /(root)**.
2. Create a separate dedicated AxiomPilotCode PostgreSQL project; do not reuse databases from unrelated apps.
3. Follow the [server deployment checklist](./server/README.md) to apply migrations and configure Vercel secrets.
4. Set `window.AXIOM_ACCOUNT_API.baseURL` in `api-config.js` to your new HTTPS API origin, commit, and test the entire sign-up/sign-in/profile flow.
5. Keep model inference and projects local; the account API does not store user source code.

No mandatory accounts for core local CLI features.
