# ADR-008: Separate infrastructure repository
Status: Accepted
Date: 2026-09-27
## Context
Manifests and encrypted secrets should not share a repository, permissions or review path with application code. This repository is public.
## Decision
Manifests and SOPS-encrypted secrets live in `fuisl/vgu-graduation-deployment`, with nhientruong04 as collaborator. The repository is public by decision, so only SOPS and age ciphertext is ever committed and plaintext secrets never are. The age private key is held offline by nhientruong04, with an escrow backup held by fuisl, and never appears in git or chat. Supersedes an earlier decision that it would be private.
## Alternatives considered
- Keep `deploy/` in this repository: one place, but mixes infrastructure history and access with application changes.
- Private repository: hides topology, but adds CI friction, and secrets are encrypted regardless.
## Consequences
- Cluster topology and hostnames are public; that is acceptable because none grant access.
- Security rests entirely on the age key and on never committing plaintext, so a secret scan is worth adding to CI.
- Changes that span code and infrastructure need two PRs.
