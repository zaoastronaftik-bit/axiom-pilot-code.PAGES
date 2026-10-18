# AxiomPilotCode Account API (deployment candidate)

This is the **independent** account server for the static GitHub Pages frontend. It uses [Better Auth](https://better-auth.com) for email/password and PostgreSQL hosted on Supabase **only as a database** (no Supabase Auth).

## Architecture

- Website: `https://zaoastronaftik-bit.github.io/axiom-pilot-code.PAGES/` (GitHub Pages)
- API: a separate Vercel Node.js project with **Root Directory = `server`**.
- Auth: Better Auth `bearer` plugin. The web frontend and API are on unrelated origins, so cross-site cookies cannot be relied on; the browser stores the bearer session in **sessionStorage**, not persistent localStorage. This is an explicit tradeoff: a successful same-origin script injection can access the token. The frontend must keep strict CSP, no untrusted scripts and no HTML injection. A custom same-site domain is preferable in the long term.
- Database: Better Auth creates its `user`, `session`, `account`, `verification` tables. Our `axiom_profiles` table is read by the API only. New users start with `free`; clients cannot elevate their plan.

## Deployment checklist

1. Confirm which Supabase organization will own a new **dedicated** AxiomPilotCode project. Never reuse an unrelated project.
2. In the `server` directory, run `npm install` and `npm run db:generate` to inspect the proposed schema, then `npm run db:migrate` after reviewing it. Set `DATABASE_URL` to the project's pooled PostgreSQL URL.
3. Run `sql/001_profiles.sql` **after** Better Auth creates its tables.
4. In Vercel, create a Git-linked project from this repository with **Root Directory `server`**. Configure `BETTER_AUTH_SECRET` (random at least 32 bytes), `DATABASE_URL` (encrypted), `BETTER_AUTH_URL` (its HTTPS origin) and `WEB_ORIGIN=https://zaoastronaftik-bit.github.io`. Never add DB credentials or secrets to Git.
5. Optional: setup a verified email domain/provider and set `RESEND_API_KEY`, `EMAIL_FROM` on Vercel. Until configured, the site should not offer live reset emails.
6. In the Github Pages root `api-config.js`, set `baseURL` to the deployed API origin. Change only that public address; never put a secret into the frontend.
7. Validate live sign-up, duplicate email behavior, passwords, sign-in, token persistence across refresh, `/api/profile` returning Free, sign-out, rate limit, CORS rejection of unrelated origins, password recovery (if email enabled) and a mobile viewport.

**Release blocker:** This service has not been installed against a real database or smoke-tested end-to-end. Do not claim the account system is live until deployment and manual verification succeed.

## Local checks

```bash
npm install
npm run check
npm test
```

The tests cover CORS and request utilities. Add real DB integration tests before public beta. Never disable Better Auth CSRF/origin checks in production.

## Security

- Auth provider does password hashing/session rotation and endpoint-level rate limiting.
- API CORS allows only exact `WEB_ORIGIN`, and does not grant cookie credentials.
- `api/profile.js` derives the user ID from an authenticated session, never from a request body; all SQL parameters use placeholders.
- No public write path for `plan`. Only trusted backend/database maintenance can assign Pro.
- Profiles and secrets are never stored in GitHub Pages. No telemetry or cloud model interaction.
- Reset emails require a trusted sender and the backend secret.
