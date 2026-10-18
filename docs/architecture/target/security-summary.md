# 10. Security summary

- Invitation tokens are 128-bit random, transmitted only in the initial URL and thereafter as an `HttpOnly`, `Secure`, `SameSite=Lax` cookie on the parent domain. Only hashes are stored. Tokens can be revoked and reissued.
- No token or guest PII appears in URLs after the first hop, in Traefik logs (path dropped), or in API logs (redacted fields).
- TLS everywhere on the internet; plaintext only inside the pod network of a single machine.
- Postgres, Garage, the GPU service and the printer have no Ingress and no public hostname; NetworkPolicies enforce who may talk to them.
- Secrets exist in git only as SOPS-encrypted files; the age private key lives on the cluster and offline, never in the repository.
- Images are public (the source is public too): the API on Docker Hub (`fuisl/grad26-api`), translation and printer on GHCR (`ghcr.io/fuisl/grad-translation`, `ghcr.io/fuisl/grad-printer`). They are pinned by immutable `main-<timestamp>-<sha>` tags through image automation and built without secrets in layers.
- Every pod runs as non-root with a read-only root filesystem and dropped capabilities. The printer daemon is the one containment exception: it also mounts the venue host's CUPS socket (one `hostPath` of type `Socket`, no privileged mode, no USB device), runs alone in the `print` namespace with default-deny networking, and exists only in the venue overlay (`clusters/venue`), never at home.
- Archive exports hold guest data and are encrypted with age before they leave the machine that made them (`operations/archive.md`).
- Traefik rate limiting protects token lookups, both from the internet and on the LAN. **Accepted residual risk (ADR-009):** there is no edge WAF or DDoS scrubbing in front of it — the home connection is directly port-forwarded, not hidden behind Cloudflare's proxy — so Traefik's rate limiting is the only defense against a volumetric or scanning attack, not a second layer behind one.
- Admin actions are audited in the database.
