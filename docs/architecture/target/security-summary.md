# 10. Security summary

- Invitation tokens are 128-bit random, transmitted only in the initial URL and thereafter as an `HttpOnly`, `Secure`, `SameSite=Lax` cookie on the parent domain. Only hashes are stored. Tokens can be revoked and reissued.
- No token or guest PII appears in URLs after the first hop, in Traefik logs (path dropped), or in API logs (redacted fields).
- TLS everywhere on the internet; plaintext only inside the pod network of a single machine.
- Postgres, Garage, the GPU service and the printer have no Ingress and no public hostname; NetworkPolicies enforce who may talk to them.
- Secrets exist in git only as SOPS-encrypted files; the age private key lives on the cluster and offline, never in the repository.
- Images are private on GHCR, pinned by tag through image automation, and built without secrets in layers.
- Every pod runs as non-root with a read-only root filesystem and dropped capabilities, except the printer daemon, which is confined to the venue overlay.
- Cloudflare WAF rate limiting protects token lookups; Traefik rate limiting protects the same endpoints on the LAN.
- Admin actions are audited in the database.
