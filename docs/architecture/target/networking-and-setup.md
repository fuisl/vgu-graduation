# 8. Networking and setup

## 8.1 Hostnames

| Hostname | DNS record | Proxied | Points to | Purpose |
| --- | --- | --- | --- | --- |
| `grad26.example`, `www` | A or CNAME to Vercel | No, DNS only | Vercel web project | Public site, guest pages, admin UI, `/docs` rewrite |
| `api.grad26.example` | CNAME to the tunnel | Yes | cloudflared to Traefik to api | JSON API, uploads, WebSockets, derivatives |
| `ops.grad26.example` (optional) | CNAME to the tunnel | Yes | Garage admin or metrics | Behind Cloudflare Access, admins only |
| `venue.grad26.example` (open item) | A to the node's LAN address | No | Traefik on the LAN | Venue overlay |

Vercel-served hostnames stay DNS-only so Vercel terminates TLS and manages its own certificate. Only tunnel hostnames are proxied by Cloudflare.

## 8.2 Cloudflare configuration

1. Move the domain's nameservers to Cloudflare; keep the registrar.
2. DNS: apex and `www` per Vercel's instructions, DNS only. The tunnel creates its own CNAME for `api` when a public hostname is added.
3. Create an API token with `Zone:DNS:Edit` and `Zone:Zone:Read` limited to this zone. It goes into the SOPS-encrypted Secret `cloudflare-api-token` in the `cert-manager` namespace.
4. Zero Trust, Networks, Tunnels: create a remotely managed tunnel, copy its token into the SOPS-encrypted Secret `cloudflared-token` in the `edge` namespace.
5. Add public hostnames to the tunnel: `api.grad26.example` with service `http://traefik.kube-system.svc.cluster.local:80`. Optionally `ops.grad26.example` to the Garage admin Service. WebSockets are enabled by default on tunnel hostnames.
6. If `ops` exists, create a Cloudflare Access application for it with a policy allowing only the admins' email addresses through a one-time PIN or GitHub identity.
7. SSL/TLS: Full (strict) mode, Always Use HTTPS on, minimum TLS 1.2.
8. WAF: the Free plan allows one rate-limiting rule. Scope it to `api.grad26.example` on `/invitations/*` and `/rsvp` per client IP so token lookups cannot be brute-forced or hammered.
9. Cache rule: cache `api.grad26.example/media/*` at the edge with a long TTL. Derivative names are content-addressed, so they never change under the same URL.
10. Origin: no origin certificate is needed because cloudflared speaks HTTP to Traefik inside the cluster; the tunnel itself is encrypted.

## 8.3 Vercel configuration

- Web project environment variables: `API_ORIGIN=https://api.grad26.example`, `DOCS_ORIGIN` as already documented, `ADMIN_SESSION_SECRET` matching the API's Secret, `COOKIE_DOMAIN=.grad26.example`.
- Function region: `sin1`, set in `apps/web/vercel.json` under `regions`.
- Previews: point `API_ORIGIN` at a staging hostname if one is added; otherwise previews must not carry production credentials.
- Domains: apex and `www` on the web project only, as in `operations/deployment.md`.

## 8.4 Cluster ingress

- Traefik listens on the node's LAN address through ServiceLB on ports 80 and 443. From the internet, only cloudflared reaches it, over the pod network on port 80.
- Ingress resources use `ingressClassName: traefik`. The `api` Ingress has no TLS section for the tunnel path, because TLS terminates at Cloudflare. For the LAN path a `Certificate` from `letsencrypt-dns` is attached to the same Ingress.
- Client IP: cloudflared sets `CF-Connecting-IP` and `X-Forwarded-For`. Traefik trusts forwarded headers from the pod CIDR; the API reads `CF-Connecting-IP` for rate limiting and audit.
- WebSockets pass through Traefik with no extra configuration.
- Body size is enforced by the API rather than by Traefik buffering, so uploads stream instead of being spooled.

## 8.5 Internal service names and ports

| Service | DNS name | Port | Clients |
| --- | --- | --- | --- |
| Traefik | `traefik.kube-system.svc.cluster.local` | 80, 443 | cloudflared, LAN |
| api | `api.grad.svc.cluster.local` | 80 to 3000 | Traefik, translation, printer |
| translation | `translation.grad.svc.cluster.local` | 80 to 8000 | Traefik for ingest |
| Postgres primary | `grad-db-rw.grad.svc.cluster.local` | 5432 | api, worker |
| Garage S3 | `garage.garage.svc.cluster.local` | 3900 | api, worker, CNPG backup, rclone |
| Garage admin | `garage.garage.svc.cluster.local` | 3903 | ops hostname only |
| fallback | `fallback.edge.svc.cluster.local` | 80 | Traefik errors middleware |

## 8.6 Egress

Outbound connections from the cluster are limited to: Cloudflare edge from cloudflared, GHCR from the kubelet and Flux, GitHub from Flux, Let's Encrypt and the Cloudflare API from cert-manager, the offsite target from rclone, and model downloads by the translation service on first start. Nothing else needs the internet. The home router needs no port forwarding at all.

## 8.7 Venue LAN exposure (open item)

If a venue node exists, Traefik on that node serves the same Ingresses on the LAN address. `venue.grad26.example` resolves to that address, its certificate is issued in advance through the DNS-01 solver, and local DNS on the venue network answers for the name when the uplink is down. Guest phones need a secure context for the camera, which is why the certificate matters. Everything else about the venue is deferred to the open item.

## 8.8 Request walkthroughs

Path A, invitation read:

1. Browser to Vercel over HTTPS, `GET /invite`.
2. Vercel function in `sin1` calls `https://api.grad26.example/invitations/me` with the forwarded credential.
3. Cloudflare edge terminates TLS, applies WAF and rate limit, forwards down the tunnel.
4. cloudflared in the `edge` namespace forwards to Traefik on port 80 with the original Host header.
5. Traefik matches the `api` Ingress, applies middlewares, forwards to `api:3000`.
6. The API hashes the token, reads Postgres, returns JSON.
7. Vercel caches the response under the invitation tag and renders HTML.

Path B, photo upload:

1. Browser posts to `https://api.grad26.example/media` with the parent-domain cookie and `credentials: include`.
2. Cloudflare checks the body against its proxy limit, which is far above the API's own 25 MB cap, and forwards down the tunnel.
3. Traefik forwards to the API, which streams the body into Garage on port 3900 and writes the row.

## 8.9 Setup checklist

1. Domain on Cloudflare DNS; Vercel records added DNS-only; site verified at the apex.
2. Cloudflare API token created and stored as a SOPS Secret.
3. Tunnel created; token stored as a SOPS Secret; public hostname for `api` added.
4. Host prepared: OS, static IP, NVIDIA driver and Container Toolkit, UPS daemon, BIOS power-on.
5. Traefik `HelmChartConfig` placed in the k3s manifests directory.
6. k3s installed; `kubectl get nodes` ready; `nvidia` RuntimeClass present.
7. age key generated; private key stored offline and in the `sops-age` Secret; public key in `.sops.yaml`.
8. Flux bootstrapped with image automation components.
9. Flux reconciles `infra-controllers`, then `infra-configs`, then `apps`; all Kustomizations report Ready.
10. Garage layout applied, buckets created, keys imported.
11. Postgres cluster healthy; first on-demand `Backup` succeeds and appears in `grad-backups`.
12. `curl https://api.grad26.example/healthz` returns OK from outside.
13. Vercel environment variables set; region set; web project redeployed; an invitation renders end to end.
14. WAF rate-limit rule and media cache rule active.
15. External uptime monitor watching `api.grad26.example/healthz` with alerts.
16. Offsite mirror configured; first sync completes; a restore of one file verified.
17. Restore drill: Postgres restored into a scratch cluster from Garage.
18. Power-loss drill: node recovers unattended and the tunnel reports healthy.
