# AxiomPilotCode — website

Official public landing page for [AxiomPilotCode](https://github.com/zaoastronaftik-bit/axiom-pilot-code).

## Live site / free hosting

This is a static GitHub Pages website, published from `main` → `/(root)`.

Expected URL: **https://zaoastronaftik-bit.github.io/axiom-pilot-code.PAGES/**

If GitHub Pages isn't enabled, go to **Settings → Pages → Deploy from a branch → main → /(root) → Save**.

The root `index.html` runs without any build step. CSS and JavaScript live in separate files.

## Design

- Light glassmorphism with blur, restrained animation and responsive layout
- Blue-only palette; no color/theme picker
- Original inline SVG arrow artwork; no Unicode arrow glyphs in the UI
- Subtle pointer states and accessible keyboard focus indicators
- Reduced-motion preferences are respected

## Authentication status

The login, registration and account screens are implemented with forms for:

- Sign in: email + password
- Create account: email + password + repeat password
- Password recovery by email and setting a new password
- Signed-in profile displaying email and Free/Pro status, plus sign out

**Live authentication is not yet enabled.** The site does not collect or store credentials while Supabase configuration is empty. The forms will display an unavailable message instead of pretending to create an account.

To enable real login and registration:

1. Create a **dedicated Supabase project** for AxiomPilotCode; never reuse an unrelated project's users or database.
2. Run [`supabase/profiles.sql`](./supabase/profiles.sql) on that project using Supabase SQL Editor. It adds `public.profiles`, initializes every new user at **Free**, and uses row-level security so signed-in users **cannot change their plan**.
3. In **Supabase → Authentication → URL Configuration**, set the Site URL to the real GitHub Pages URL above. Add that URL to **Redirect URLs**.
4. In **Authentication → Providers → Email**, configure whether new signups require email confirmation. The current UI supports both flows. Disabling confirmation removes an extra verification step, but password validation, rate limits and normal Supabase protections still apply.
5. Copy the **Project URL** and the **public anon/publishable key** into [`supabase-config.js`](./supabase-config.js), as `url` and `anonKey` respectively.
6. Commit changes to `main`. GitHub Pages will publish the updated static site automatically.

**Never commit a `service_role` or secret key.** Only the public anon/publishable key belongs in frontend code. Supabase Auth securely manages passwords and sessions; browsers do not handle password hashing themselves.

## Source files

- `index.html` — the landing page and account markup
- `auth.css` — light-glass modal and interaction design
- `auth.js` — Supabase Auth login, signup, reset and profile flows
- `supabase-config.js` — public configuration placeholders
- `supabase/profiles.sql` — server-side profile + RLS schema
- `favicon.svg` — blue-only AxiomPilotCode mark

The login screens do not yet authorize CLI devices; the browser-to-CLI sign-in handshake is a later separate feature.
