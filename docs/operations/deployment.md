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
3. Leave the Install Command on **Automatic** for docs. For web, private ASCIIGen access requires the install override and `GITHUB_READ_TOKEN` described in [`docs/development/private-dependencies.md`](../development/private-dependencies.md); the script still uses the pnpm version selected by the root `packageManager` and frozen lockfile.
4. Use the detected Turborepo build command and the framework's default Output Directory. If setting the command manually, use `turbo build` with the app Root Directory selected.

Deploy the docs project first. Its project URL will serve the handbook at `https://<docs-project>.vercel.app/docs`.

For the **web** project, set `DOCS_ORIGIN` in Vercel's Environment Variables to the docs project's production origin, for example `https://<docs-project>.vercel.app` (no trailing `/docs`). Apply it to Production and Preview if both should serve the handbook, then redeploy the web project. Assign the custom domain to the web project only.

## Verify

- `https://<domain>/` shows the landing page.
- `https://<domain>/docs` shows the handbook.
- `https://<domain>/docs/architecture/overview` shows the architecture page and its diagram.
- `https://<domain>/docs/_next/...` assets load from the docs project through the rewrite.
- `https://<domain>/invite/demo` still comes from the web project.

Locally, `pnpm dev` starts web on port 3000 and docs on port 3001. Web uses `http://localhost:3001` as the docs origin in development. Run `pnpm build` from the repository root to check both apps through Turbo.
