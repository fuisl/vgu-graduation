# Private Git dependencies on Vercel

The web app's one experimental, self-contained feature (`/ascii-live`) consumes ASCIIGen from `semicolons-dev/asciify`. The dependency is pinned to commit `bebc7e038246230b3f3dc18d1a625749e3524457`; update the commit and lockfile together when intentionally adopting a new engine release.

`asciify` is an `optionalDependency` of `@grad/web`, not a `dependency`: it does not link to any event-critical flow, and other contributors should not need GitHub access to `semicolons-dev/asciify` just to run and build the app.

- If your account can read `semicolons-dev/asciify` and SSH authentication works, `pnpm install` fetches it as usual and `/ascii-live` renders the live camera effect.
- If it can't, pnpm skips it (`... is an optional dependency and failed compatibility check`) and installs everything else normally. `apps/web/next.config.mjs` detects the package is missing at build time and aliases every `asciify` import to a small local stub in `apps/web/vendor/asciify-stub`, so lint, typecheck and build all still pass. `/ascii-live` itself renders a plain "not available in this build" message instead of the camera UI; nothing else in the app is affected.

The package ships application TypeScript rather than a compiled library entrypoint, so `next.config.mjs` includes it in `transpilePackages` when it's installed. The route's small `asciify-runtime.js` boundary imports the real runtime modules while its adjacent declaration exposes only the browser API to this app's type checker. `/ascii-live` imports only `GpuAscii`, `measureLevels`, and charset modules. It does not import ASCIIGen's Electron capture or filesystem APIs.

## Local development

Optional. If you want the live ASCII effect to work, your GitHub account needs read access to the private repository and SSH authentication must work:

```sh
ssh -T git@github.com
pnpm install
```

If you skip this, `pnpm install` still succeeds and the rest of the app is unaffected.

Do not put a GitHub token in `package.json`, `.npmrc`, the lockfile, or a committed Git remote URL.

## Vercel setup

1. In GitHub, create a fine-grained personal access token owned by an account that can read `semicolons-dev/asciify`. Select only that repository. Grant **Contents: Read-only**; **Metadata: Read-only** is included for repository access. Prefer an expiry date and rotate the token before it expires. Organization policy may require an administrator to approve the token.
2. In the Vercel project, open **Settings → Environment Variables**. Create a sensitive variable named `GITHUB_READ_TOKEN`, paste the token, and enable it for **Production only**. Preview deployments (including PRs from contributors without access to `semicolons-dev/asciify`) build without the token, install without `asciify`, and show `/ascii-live`'s fallback message; that is expected, not a failure.
3. The committed `apps/web/vercel.json` sets the Install Command shown below. The `../../` prefix is required because this repository's web Vercel project uses `apps/web` as its Root Directory. You do not need a dashboard override; if one already exists, either remove it or set it to the same value:

   ```sh
   ../../scripts/install-private-dependencies.sh
   ```

4. Keep the normal build command (`pnpm turbo build`, or the existing project command) and redeploy. If the GitHub organization uses SAML SSO, authorize the token for that organization before deploying.

The install script temporarily rewrites only GitHub clone URLs to authenticated HTTPS, installs the web app and its workspace dependencies from the frozen lockfile, and removes the rewrite on exit. The secret never enters the dependency manifest or lockfile. Vercel's build container is ephemeral, but the cleanup also prevents later build steps from inheriting the credential. The separate docs Vercel project does not need this token.

`NPM_RC` is not used here: that pattern is for packages published to GitHub Packages or another npm registry. ASCIIGen is being installed straight from its private Git repository.

## Updating ASCIIGen

Pin a reviewed commit instead of a branch name, then run the full web checks:

```sh
pnpm --filter @grad/web add 'asciify@github:semicolons-dev/asciify#<full-commit-sha>'
pnpm --filter @grad/web typecheck
pnpm --filter @grad/web lint
pnpm --filter @grad/web test
pnpm --filter @grad/web build
```

Never log `GITHUB_READ_TOKEN`, enable shell tracing in the install script, or paste deployment logs containing authenticated clone URLs into issues.
