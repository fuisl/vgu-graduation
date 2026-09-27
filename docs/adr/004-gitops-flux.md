# ADR-004: GitOps with Flux, Kustomize and SOPS
Status: Accepted
Date: 2026-09-27
## Context
The cluster must be rebuildable within an hour on a spare machine, and every change must be reviewable and revertible. Secrets have to live alongside manifests without being readable.
## Decision
Flux reconciles Kustomize manifests from git onto k3s. Upstream Helm charts are used where they exist. Secrets are encrypted with SOPS and age. Image automation commits tag bumps. Upgrades are commits and rollback is a revert. Manifests live in the separate repository from ADR-008.
## Alternatives considered
- Manual `kubectl apply` or scripts: fast to start, but drifts and cannot be audited.
- Argo CD: capable, but heavier to run on one small node.
- Sealed Secrets or an external secret manager: more moving parts than a single age key.
## Consequences
- The age private key is critical: losing it means re-encrypting and rotating every secret.
- Experimental workloads are separate Kustomizations and can be suspended without touching core services.
- Contributors need to learn Flux and SOPS to change infrastructure.
