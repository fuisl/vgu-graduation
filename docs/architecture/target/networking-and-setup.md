# 8. Networking and setup

## 8.1 Hostnames

Decided 2026-09-27 (ADR-009): no Cloudflare Tunnel, no Cloudflare proxy. DNS stays at Spaceship. The router forwards ports 80 and 443 directly to Traefik.

| Hostname | DNS record | Points to | Purpose |
| --- | --- | --- | --- |
| `grad26.fuisloy.dev`, `www` | A or CNAME to Vercel | Vercel web project | Public site, guest pages, admin UI, `/docs` rewrite |
| `api.grad26.fuisloy.dev` | A to the home connection's current public IP, kept current by a Dynamic DNS updater | Traefik directly, over the forwarded ports | JSON API, uploads, WebSockets, derivatives |
| `ops.grad26.fuisloy.dev` (optional) | Same pattern as `api`, if used | Garage admin or metrics, behind its own auth | Admins only |
| `venue.grad26.fuisloy.dev` (open item) | A to the node's LAN address | Traefik on the LAN | Venue overlay |

Vercel-served hostnames are unaffected by ADR-009: Vercel still terminates its own TLS and manages its own certificate, set up per Vercel's own instructions when the custom domain is added.

## 8.2 Direct exposure configuration

1. At the router, forward TCP 80 and 443 to the k3s node's LAN address. Nothing else is forwarded — not Postgres, Garage, the GPU service, or the printer, all of which stay unreachable from the internet regardless of the router's forwarding table.
2. At Spaceship's DNS panel, create the `A` record for `api.grad26.fuisloy.dev` (and `ops` if used). The home connection's IP is dynamic, so this record's value is not set once — the Dynamic DNS updater (below) owns keeping it current.
3. Dynamic DNS: Spaceship has a real DNS API (`docs.spaceship.dev`) — `PUT /v1/dns/records/{domain}` with an `X-Api-Key`/`X-Api-Secret` pair (from the API Manager at `spaceship.com/application/api-manager/`, scoped to the `dnsrecords:read` and `dnsrecords:write` permissions), body `{"items":[{"type":"A","name":"api.grad26","address":"<ip>","ttl":300}]}`. The `ddns` CronJob (a short custom script, section 7) checks the current public IP every five minutes and calls this endpoint when it changes; since `PUT` adds rather than replaces a record whose address differs, it then deletes the old `A` record. The key/secret pair is a SOPS-encrypted Secret, same as every other credential. Use a short TTL (e.g. 300s) on this record so a change propagates quickly.
4. `cert-manager`'s `ClusterIssuer` uses the **HTTP-01** challenge, not DNS-01: DNS is not on Cloudflare, so there is no DNS API for cert-manager to automate against, and HTTP-01 needs nothing beyond port 80 already being forwarded. This also means no wildcard certificates; `venue.grad26.fuisloy.dev` will need its own HTTP-01 request when that open item is taken up.
5. There is no WAF, no DDoS scrubbing, and no edge cache rule — all of that lived in Cloudflare's proxy layer, which is no longer in the path. Traefik's own rate-limiting middleware (section 7.6) is the only rate limiting; see section 9 and section 10 for the residual risk this leaves.
6. TLS: Full end-to-end, terminated by Traefik itself using the cert-manager-issued certificate. There is no separate "origin certificate" step, unlike the Tunnel model — Traefik's certificate *is* the one clients see.

## 8.3 Vercel configuration

- Web project environment variables: `API_ORIGIN=https://api.grad26.fuisloy.dev`, `DOCS_ORIGIN` as already documented, `ADMIN_SESSION_SECRET` matching the API's Secret, `COOKIE_DOMAIN=.grad26.fuisloy.dev`.
- Function region: `sin1`, set in `apps/web/vercel.json` under `regions`.
- Previews: point `API_ORIGIN` at a staging hostname if one is added; otherwise previews must not carry production credentials.
- Domains: apex and `www` on the web project only, as in `operations/deployment.md`.

## 8.4 Cluster ingress

- Traefik listens on the node's LAN address through ServiceLB on ports 80 and 443. From the internet, only the router's forwarded ports 80/443 reach it (ADR-009) — there is no `cloudflared` and no pod-network hop in front of it anymore.
- Ingress resources use `ingressClassName: traefik`. Since ADR-009, the `api` Ingress *does* need a TLS section — a `Certificate` from the `letsencrypt-http01` `ClusterIssuer` (section 7.6), because Traefik itself now terminates TLS; there is no Cloudflare edge to do it instead. The same `ClusterIssuer` covers the LAN-path Ingress too.
- Client IP: with no proxy in front, Traefik sees the real client IP directly on the connection; there is no forwarded-header trust configuration to set up (ADR-009 removes the `cloudflared`-specific `trustedIPs` config that section 7.2's Traefik customization used to need). The API reads it from the connection, same as Traefik, for rate limiting and audit.
- WebSockets pass through Traefik with no extra configuration.
- Body size is enforced by the API rather than by Traefik buffering, so uploads stream instead of being spooled.

## 8.5 Internal service names and ports

| Service | DNS name | Port | Clients |
| --- | --- | --- | --- |
| Traefik | `traefik.kube-system.svc.cluster.local` | 80, 443 | the router's port forward, LAN |
| api | `api.grad.svc.cluster.local` | 80 to 3000 | Traefik, translation, printer |
| translation | `translation.grad.svc.cluster.local` | 80 to 8000 | api, as audio proxy |
| Postgres primary | `grad-db-rw.grad.svc.cluster.local` | 5432 | api, worker |
| Garage S3 | `garage.garage.svc.cluster.local` | 3900 | api, worker, CNPG backup, rclone |
| Garage admin | `garage.garage.svc.cluster.local` | 3903 | ops hostname only |
| fallback | `fallback.edge.svc.cluster.local` | 80 | Traefik errors middleware |

## 8.6 Egress

Outbound connections from the cluster are limited to: Docker Hub from the kubelet and Flux, GitHub from Flux, Let's Encrypt from cert-manager, Spaceship (or the DDNS provider) from the Dynamic DNS updater, the offsite target from rclone, and model downloads by the translation service on first start. Nothing else needs the internet.

Inbound is no longer "nothing": per ADR-009, the home router forwards TCP 80 and 443 to Traefik. Nothing else is forwarded — Postgres, Garage, the GPU service, and the printer stay unreachable from the internet regardless.

## 8.7 Venue LAN exposure (open item)

If a venue node exists, Traefik on that node serves the same Ingresses on the LAN address. `venue.grad26.fuisloy.dev` resolves to that address, its certificate is issued in advance through the HTTP-01 solver (ADR-009 — no DNS-01 available, since DNS is not on Cloudflare), and local DNS on the venue network answers for the name when the uplink is down. Guest phones need a secure context for the camera, which is why the certificate matters. Everything else about the venue is deferred to the open item.

## 8.8 Request walkthroughs

Path A, invitation read:

1. Browser to Vercel over HTTPS, `GET /invite`.
2. Vercel function in `sin1` calls `https://api.grad26.fuisloy.dev/invitations/me` with the forwarded credential.
3. The router forwards the connection to Traefik on port 443; Traefik terminates TLS with its cert-manager-issued certificate.
4. Traefik matches the `api` Ingress, applies middlewares, forwards to `api:3000`.
5. The API hashes the token, reads Postgres, returns JSON.
6. Vercel caches the response under the invitation tag and renders HTML.

Path B, photo upload:

1. Browser posts to `https://api.grad26.fuisloy.dev/media` with the parent-domain cookie and `credentials: include`.
2. The router forwards the connection to Traefik on port 443.
3. Traefik forwards to the API, which enforces its own 25 MB cap, streams the body into Garage on port 3900, and writes the row.

## 8.9 Setup checklist

1. `api.grad26.fuisloy.dev` DNS record created at Spaceship; Vercel records added per Vercel's instructions; site verified at the apex.
2. Dynamic DNS updater running and confirmed keeping the `A` record current as the public IP changes.
3. Router forwarding TCP 80 and 443 to the node's LAN address; nothing else forwarded.
4. Host prepared: OS, static IP, NVIDIA driver and Container Toolkit, UPS daemon, BIOS power-on.
5. Traefik `HelmChartConfig` placed in the k3s manifests directory.
6. k3s installed; `kubectl get nodes` ready; `nvidia` RuntimeClass present.
7. age key generated; private key stored offline and in the `sops-age` Secret; public key in `.sops.yaml`.
8. Flux bootstrapped with image automation components.
9. Flux reconciles `infra-controllers`, then `infra-configs`, then `apps`; all Kustomizations report Ready.
10. `cert-manager`'s HTTP-01 `ClusterIssuer` issues a certificate for `api.grad26.fuisloy.dev`; Traefik serves it.
11. Garage layout applied, buckets created, keys imported.
12. Postgres cluster healthy; first on-demand `Backup` succeeds and appears in `grad-backups`.
13. `curl https://api.grad26.fuisloy.dev/healthz` returns OK from outside.
14. Vercel environment variables set; region set; web project redeployed; an invitation renders end to end.
15. Traefik's rate-limit middleware active on `/invitations/*` and `/rsvp` (no edge WAF exists to do this instead, see section 10).
16. External uptime monitor watching `api.grad26.fuisloy.dev/healthz` with alerts, including an alert if the Dynamic DNS updater stops running.
17. Offsite mirror configured; first sync completes; a restore of one file verified.
18. Restore drill: Postgres restored into a scratch cluster from Garage.
19. Power-loss drill: node recovers unattended, the router's port forward survives a reboot, and the Dynamic DNS record is still correct afterward.
