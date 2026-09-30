# Onboarding

Start here. Details live in `docs/development/workflow.md` and `docs/development/local-development.md`; read `AGENTS.md` before writing code.

## Prerequisites

- Node 24 (`.nvmrc`), e.g. `nvm use`
- pnpm 10: `corepack enable` (bundled with Node 24) or `npm i -g pnpm@10`
- Docker (for Postgres and Garage)
- `gh` CLI, logged in (`gh auth login`)
- Optional: [Bruno](https://www.usebruno.com) to call the API by hand

## Install

```sh
git clone git@github.com:fuisl/vgu-graduation.git
cd vgu-graduation
pnpm install
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
```

A skipped `asciify` optional dependency is expected; see `docs/development/private-dependencies.md`.

## Run the stack

```sh
pnpm services:up   # Postgres + Garage, creates the buckets
pnpm db:migrate    # create the schema
pnpm dev           # web :3000, docs :3001, api :4000
```

- One app only: `pnpm dev:web`, `pnpm dev:docs`, `pnpm dev:api`
- Check the API: `curl localhost:4000/healthz`
- Stop services: `pnpm services:down`; wipe and restart: `pnpm services:reset`, then `pnpm db:migrate`
- Admin sign-in needs the real `GITHUB_CLIENT_SECRET` in `apps/web/.env.local`; ask the project owner (fuisl)

Before pushing:

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Pick a task

1. Open the [project board](https://github.com/users/fuisl/projects/21) and take an issue in **Ready**, in the current milestone, highest priority first (P0 > P1 > P2).
2. No blockers open (check "blocked by" on the issue). Size is a hint: XS < half a day, S ~1 day, M 2-3 days.
3. Assign yourself and move it to **In progress**.
4. Unsure about scope? Ask on the issue, not in chat.

## PR flow

1. Branch from `main`: `feat/<topic>-<issue>`, `fix/...`, `docs/...`, `chore/...`
2. Small commits; conventional titles, e.g. `feat(web): RSVP form (#38)`
3. Open a PR, fill in the template, write `Closes #<issue>`, move the issue to **In review**
4. CI `checks` must pass; one approval; resolve all conversations
5. The area owner squash-merges. Nobody merges their own PR. Owners: the table in `docs/development/workflow.md`

## Labels and milestones

| Label | Meaning |
| --- | --- |
| `area:web`, `area:api`, `area:infra`, `area:docs`, `area:design` | Which area, so which owner reviews |
| `epic` | Parent issue grouping sub-issues; don't implement it directly |
| `needs-decision` | A human decision comes first. Don't start code; the result is recorded as a "Decided YYYY-MM-DD" comment (or an ADR) and the issue closes |
| `manual-ops` | Done by hand outside the repo (dashboards, hardware, GitHub settings). Close with a comment describing what was done, never with secrets |
| `experimental` | 3D, printing, translation. Must never block or break event-critical flows |
| `good first issue` | A good first pick |
| `bug`, `accessibility`, `documentation` | As named |

Milestones are delivery stages, in order: M1 Foundations and decisions, M2 Invitation MVP (done), M3 Production platform, M4 Ceremony-day utilities, M5 Experimental, M6 Web polish and after the ceremony. Work the earliest open milestone first; the board is the source of truth for status.
