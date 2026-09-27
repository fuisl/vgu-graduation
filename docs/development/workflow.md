# Development Workflow
GitHub is the execution source of truth; repository docs are the durable knowledge source.
## Flow
Epic/parent issue → scoped issue → branch → PR → review → merge.
A PR represents one understandable change and references its issue.
Recommended Project fields: Status, Priority, Area, Size, Risk, Iteration, Owner, Target.
Issues include context, requirements, acceptance criteria, design/docs links, dependencies and explicit out-of-scope.
PRs explain what/why, include UI evidence, testing and docs/schema impact. Prefer squash merge.
Move durable architectural decisions from chat into ADRs.
Running the apps day to day, the API image and CI: `docs/development/local-development.md`.

## Branch protection

Decided 2026-09-27 (#86): `main` requires a pull request, at least one approving review, the `checks` CI status (lint/typecheck/test/build), and conversation resolution before merge. No force pushes or branch deletion. Merges are squash-only with the head branch auto-deleted. Admin bypass is enabled (`RepositoryRole` admin, always) so an event-day emergency fix doesn't get stuck behind review — using it is a deliberate exception, not the default path.

## Roles and area owners
fuisl is the project owner: leads design, web and features, and approves ADRs.
nhientruong04 leads backend and infra and sets up their foundations.
dducwsxuaan and AndrwPham take non-crucial web work that few other issues depend on, and AndrwPham also helps with PM and backend.
The area owner merges PRs in their area. Nobody merges their own PR.

| Area | Owner | Backup reviewer |
| --- | --- | --- |
| API and data | nhientruong04 | AndrwPham |
| Infrastructure and homelab | nhientruong04 | fuisl |
| Web and design | fuisl | dducwsxuaan |
| Docs and ADRs | fuisl | AndrwPham |
| Experimental (3D, printing, translation) | fuisl | nhientruong04 (inference) |

Experimental work stays out of M1 so it cannot compromise event-critical flows. Roles are revisited as the project moves.
