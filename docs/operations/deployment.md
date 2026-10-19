# Deployment

The public site and handbook are two Next.js apps in one pnpm/Turborepo workspace. Deploy them as **two Vercel projects from the same repository**:

| Vercel project | Root Directory | Serves |
| --- | --- | --- |
| Web | `apps/web` | The custom domain, including `/`, invitations and other product routes |
| Docs | `apps/docs` | The handbook at `/docs` and `/docs/*` |

The web app rewrites `/docs` requests to the docs project's production URL. The docs app uses Next.js `basePath: "/docs"`, so its links and assets carry the same prefix. Only the web project owns the custom domain.

## Vercel settings

For **both** projects:

1. Import this repository and select the Root Directory shown above. Set the Framework Preset to Next.js.
2. Enable **Include source files outside of the Root Directory in the Build Step**. Both apps use workspace packages; docs also reads repository-level Markdown.
3. For docs, the committed `apps/docs/vercel.json` installs only `@grad/docs` and its workspace dependencies (`pnpm install --filter @grad/docs...`), so the private `asciify` dependency of web is never fetched and no token is needed. For web, the committed `apps/web/vercel.json` provides the private-dependency install command; add the `GITHUB_READ_TOKEN` described in [`docs/development/private-dependencies.md`](../development/private-dependencies.md). The script still uses the pnpm version selected by the root `packageManager` and frozen lockfile.
4. Use the detected Turborepo build command and the framework's default Output Directory. If setting the command manually, use `turbo build` with the app Root Directory selected.

Both `vercel.json` files set an `ignoreCommand` that builds **Production only**: pushes to any branch other than `main`, including pull requests, are skipped as preview builds so they do not consume the Hobby plan's deployment quota. On `main`, a project still skips the build when the commit does not affect it (`turbo-ignore`; docs also rebuilds when `docs/` changes). To get a one-off preview, remove the `VERCEL_ENV` guard on a branch or run `vercel deploy` locally.

Deploy the docs project first. Its project URL will serve the handbook at `https://<docs-project>.vercel.app/docs`.

For the **web** project, set `DOCS_ORIGIN` in Vercel's Environment Variables to the docs project's production origin, for example `https://<docs-project>.vercel.app` (no trailing `/docs`). Apply it to Production, then redeploy the web project. Assign the custom domain to the web project only.

## Speed Insights

The web project reports Core Web Vitals to [Vercel Speed Insights](https://vercel.com/fuisls-projects/vgu-graduation/speed-insights) (#8). Enable Speed Insights once in the web project's dashboard; the `@vercel/speed-insights` component in `apps/web/app/layout.tsx` renders only when `VERCEL` is set, so local and homelab builds load nothing. Docs is not instrumented.

Invitation URLs are bearer credentials, so every event passes through `scrubSpeedInsightsEvent` (`apps/web/lib/analytics/speed-insights.ts`) before it leaves the browser: the query string and fragment are dropped, the segment after `/invite/` becomes `[token]` (except `/invite/demo`), any other token-shaped segment (20 or more base64url characters) becomes `[id]`, and `/admin` pages are not reported at all. Change that function, and its tests, before adding any route that carries an identifier in its path.

## Verify

- `https://<domain>/` shows the landing page.
- `https://<domain>/docs` shows the handbook.
- `https://<domain>/docs/architecture/overview` shows the architecture page and its diagram.
- `https://<domain>/docs/_next/...` assets load from the docs project through the rewrite.
- `https://<domain>/invite/demo` still comes from the web project.

Locally, `pnpm dev` starts web on port 3000 and docs on port 3001. Web uses `http://localhost:3001` as the docs origin in development. Run `pnpm build` from the repository root to check both apps through Turbo.
