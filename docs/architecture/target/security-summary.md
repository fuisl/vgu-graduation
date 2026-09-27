# 10. Security summary

- Invitation tokens are 128-bit random, transmitted only in the initial URL and thereafter as an `HttpOnly`, `Secure`, `SameSite=Lax` cookie on the parent domain. Only hashes are stored. Tokens can be revoked and reissued.
- No token or guest PII appears in URLs after the first hop, in Traefik logs (path dropped), or in API logs (redacted fields).
- TLS everywhere on the internet; plaintext only inside the pod network of a single machine.
- Postgres, Garage, the GPU service and the printer have no Ingress and no public hostname; NetworkPolicies enforce who may talk to them.
- Secrets exist in git only as SOPS-encrypted files; the age private key lives on the cluster and offline, never in the repository.
- Images are private on GHCR, pinned by tag through image automation, and built without secrets in layers.
- Every pod runs as non-root with a read-only root filesystem and dropped capabilities, except the printer daemon, which is confined to the venue overlay.
- Traefik rate limiting protects token lookups, both from the internet and on the LAN. **Accepted residual risk (ADR-009):** there is no edge WAF or DDoS scrubbing in front of it — the home connection is directly port-forwarded, not hidden behind Cloudflare's proxy — so Traefik's rate limiting is the only defense against a volumetric or scanning attack, not a second layer behind one.
- Admin actions are audited in the database.
