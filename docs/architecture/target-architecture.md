# Target Architecture

Status: Proposed. Date: 2026-09-26. Supersedes the diagram in `architecture/overview.md` once accepted; decisions listed in section 11 become ADRs.

This document is the complete description of the GRAD '26 platform: what runs where, why, how each product use case flows through it, how the homelab Kubernetes cluster is built, and everything that has to be configured on the network side. It is written for a free-tier budget with a mandatory homelab. Where a choice is still open it is marked as such.

Placeholders: `grad26.example` stands for the real domain, `<owner>` for the GitHub owner of the repository and container images. Versions are the ones current at the time of writing and must be re-pinned when manifests are written.

## Contents

- [1. Goals and constraints](/docs/architecture/target/goals-and-constraints)
- [2. System context](/docs/architecture/target/system-context)
- [3. Traffic paths](/docs/architecture/target/traffic-paths)
- [4. Applications and repository layout](/docs/architecture/target/applications-and-repository)
- [5. Data and storage](/docs/architecture/target/data-and-storage)
- [6. How the architecture serves the use cases](/docs/architecture/target/use-cases)
- [7. Kubernetes workload design](/docs/architecture/target/kubernetes-workloads)
- [8. Networking and setup](/docs/architecture/target/networking-and-setup)
- [9. Homelab robustness](/docs/architecture/target/homelab-robustness)
- [10. Security summary](/docs/architecture/target/security-summary)
- [11. Open items and decisions to record](/docs/architecture/target/open-items-and-decisions)
