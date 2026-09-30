# 7. Kubernetes workload design

## 7.1 Cluster shape

One k3s server node at home. Packaged components used as shipped: containerd, flannel, CoreDNS, Traefik ingress controller, ServiceLB, local-path-provisioner, metrics-server, and the network policy controller. Nothing is disabled at install time.

Host prerequisites:

- Ubuntu LTS or Debian stable, static LAN address, SSH with keys only.
- NVIDIA driver and the NVIDIA Container Toolkit installed before k3s, so k3s detects the runtime and writes it into its containerd configuration at startup.
- A UPS with a daemon that shuts the node down cleanly and BIOS set to power on after loss.
- Disk layout: OS on one device; `/var/lib/rancher/k3s/storage` (local-path volumes) on the largest, ideally mirrored, device.

## 7.2 Installing k3s and customizing Traefik

Place the Traefik customization in the auto-deploy manifests directory before or right after install; k3s applies it on start and on change.

```yaml
# /var/lib/rancher/k3s/server/manifests/traefik-config.yaml
apiVersion: helm.cattle.io/v1
kind: HelmChartConfig
metadata:
  name: traefik
  namespace: kube-system
spec:
  valuesContent: |-
    logs:
      access:
        enabled: true
        fields:
          general:
            defaultmode: keep
            names:
              RequestPath: drop        # never write paths; tokens must not reach logs
          headers:
            defaultmode: drop
    providers:
      kubernetesCRD:
        enabled: true
      kubernetesIngress:
        enabled: true
```

```sh
curl -sfL https://get.k3s.io | sh -s - server --write-kubeconfig-mode 644
kubectl get runtimeclass nvidia   # recent k3s creates it when the NVIDIA runtime is detected
```

If the `nvidia` RuntimeClass is not present, add it under `deploy/infra/configs`:

```yaml
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: nvidia
handler: nvidia
```

## 7.3 GitOps with Flux

Bootstrap once from a workstation with a GitHub token that has repository scope. The token is used only during bootstrap and is not stored in the repository.

```sh
age-keygen -o age.agekey
kubectl create namespace flux-system
cat age.agekey | kubectl create secret generic sops-age --namespace=flux-system --from-file=age.agekey=/dev/stdin

flux bootstrap github \
  --owner=<owner> --repository=<infra-repo> --branch=main \
  --path=deploy/clusters/home --personal \
  --components-extra=image-reflector-controller,image-automation-controller
```

Root `.sops.yaml`:

```yaml
creation_rules:
  - path_regex: deploy/.*\.sops\.ya?ml$
    encrypted_regex: ^(data|stringData)$
    age: age1PUBLICKEYPLACEHOLDER
```

Reconciliation order is expressed with three Flux Kustomizations in `deploy/clusters/home`:

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: infra-controllers
  namespace: flux-system
spec:
  interval: 10m
  path: ./deploy/infra/controllers
  prune: true
  sourceRef: { kind: GitRepository, name: flux-system }
  wait: true
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: infra-configs
  namespace: flux-system
spec:
  interval: 10m
  dependsOn: [{ name: infra-controllers }]
  path: ./deploy/infra/configs
  prune: true
  sourceRef: { kind: GitRepository, name: flux-system }
  decryption: { provider: sops, secretRef: { name: sops-age } }
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: apps
  namespace: flux-system
spec:
  interval: 5m
  dependsOn: [{ name: infra-configs }]
  path: ./deploy/apps/home
  prune: true
  sourceRef: { kind: GitRepository, name: flux-system }
  decryption: { provider: sops, secretRef: { name: sops-age } }
  healthChecks:
    - { apiVersion: apps/v1, kind: Deployment, name: api, namespace: grad }
```

Experimental workloads are their own Flux Kustomizations under `apps` so they can be suspended without touching anything else:

```sh
flux suspend kustomization translation   # ceremony-day switch, reversible with resume
```

## 7.4 Namespaces

| Namespace | Contents | Notes |
| --- | --- | --- |
| `flux-system` | Flux controllers, GitRepository, image automation | Created by bootstrap |
| `cert-manager` | cert-manager | Helm |
| `cnpg-system` | CloudNativePG operator and Barman Cloud plugin | Helm; plugin must share the operator's namespace |
| `nvidia-device-plugin` | Device plugin DaemonSet | Helm |
| `garage` | Garage StatefulSet | Helm, vendored chart |
| `edge` | static fallback | Ingress-facing helpers. No `cloudflared` (ADR-009): the router forwards ports 80/443 straight to Traefik in `kube-system` |
| `grad` | api, worker, Postgres cluster, translation, print | Application namespace |
| `kube-system` | Traefik, CoreDNS, ServiceLB, local-path | Packaged with k3s |

## 7.5 Workload catalogue

| Workload | Namespace | Kind | Source | Version at writing | Storage | Exposure | Layer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| cert-manager | cert-manager | HelmRelease | `oci://quay.io/jetstack/charts` chart `cert-manager` | v1.21.2 | none | none | infra-controllers |
| cloudnative-pg | cnpg-system | HelmRelease | `https://cloudnative-pg.github.io/charts` chart `cloudnative-pg` | latest 1.26+ | none | none | infra-controllers |
| plugin-barman-cloud | cnpg-system | HelmRelease | same repo, chart `plugin-barman-cloud` | 0.15.0 | none | none | infra-controllers |
| nvidia-device-plugin | nvidia-device-plugin | HelmRelease | `https://nvidia.github.io/k8s-device-plugin` chart `nvidia-device-plugin` | 0.17.1 | none | none | infra-controllers |
| ClusterIssuer, RuntimeClass, NetworkPolicies, Middlewares, namespaces | various | plain manifests | this repo | n/a | none | none | infra-configs |
| garage | garage | HelmRelease | vendored `charts/garage` from the Garage repository | Garage v2.4.1 (chart 0.10.2) | 2 PVCs: meta 5 Gi, data sized to the archive | ClusterIP 3900 | apps |
| grad-db | grad | CNPG Cluster | operator | Postgres 17 | PVC 20 Gi | ClusterIP 5432 | apps |
| garage-backups | grad | ObjectStore + ScheduledBackup | plugin | n/a | uses Garage | none | apps |
| api | grad | Deployment, Service, Ingress | `docker.io/fuisl/grad26-api` (public, no pull secret needed) | image automation | none | Ingress `api.grad26.fuisloy.dev`, port-forwarded (ADR-009) | apps |
| worker | grad | Deployment | same image | image automation | none | none | apps |
| ddns | grad | CronJob | `docker.io/curlimages/curl` + `update.sh` (ConfigMap) | pinned | none | outbound only (TCP 443, public ranges) | apps |
| fallback | edge | Deployment, Service, ConfigMap | static server image | pinned | none | via Traefik errors middleware | apps |
| translation | grad | Deployment, Service | `ghcr.io/<owner>/grad-translation` | image automation | emptyDir for model cache or PVC | none, reached only from the API | apps, suspendable |
| printer | grad | Deployment | `ghcr.io/<owner>/grad-printer` | image automation | none | none | venue overlay only |
| web-mirror | grad | Deployment, Service, Ingress | `ghcr.io/<owner>/grad-web` | image automation | none | LAN hostname | venue overlay only |
| offsite-mirror | garage | CronJob | `rclone/rclone` | pinned | none | outbound only | apps |

## 7.6 Per-workload specifications

**cert-manager**

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata: { name: jetstack, namespace: flux-system }
spec: { type: oci, interval: 12h, url: oci://quay.io/jetstack/charts }
---
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata: { name: cert-manager, namespace: cert-manager }
spec:
  interval: 1h
  chart:
    spec:
      chart: cert-manager
      version: "v1.21.2"
      sourceRef: { kind: HelmRepository, name: jetstack, namespace: flux-system }
  values:
    crds: { enabled: true }
```

ClusterIssuer using the **HTTP-01** solver (ADR-009: DNS is not on Cloudflare, so there is no DNS API for a DNS-01 solver to use; HTTP-01 needs only port 80, already forwarded). No API token Secret is needed for this at all.

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata: { name: letsencrypt-http01 }
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: YOUR_CONTACT_EMAIL_HERE
    privateKeySecretRef: { name: letsencrypt-http01-account }
    solvers:
      - http01:
          ingress: { ingressClassName: traefik }
```

**CloudNativePG operator, Barman Cloud plugin, and the database**

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata: { name: cnpg, namespace: flux-system }
spec: { interval: 12h, url: https://cloudnative-pg.github.io/charts }
---
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata: { name: cloudnative-pg, namespace: cnpg-system }
spec:
  interval: 1h
  chart:
    spec:
      chart: cloudnative-pg
      sourceRef: { kind: HelmRepository, name: cnpg, namespace: flux-system }
---
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata: { name: plugin-barman-cloud, namespace: cnpg-system }
spec:
  interval: 1h
  dependsOn: [{ name: cloudnative-pg }, { name: cert-manager, namespace: cert-manager }]
  chart:
    spec:
      chart: plugin-barman-cloud
      sourceRef: { kind: HelmRepository, name: cnpg, namespace: flux-system }
```

```yaml
apiVersion: barmancloud.cnpg.io/v1
kind: ObjectStore
metadata: { name: garage-backups, namespace: grad }
spec:
  retentionPolicy: "30d"
  configuration:
    destinationPath: s3://grad-backups/postgres/
    endpointURL: http://garage.garage.svc.cluster.local:3900
    s3Credentials:
      accessKeyId: { name: garage-backup-key, key: ACCESS_KEY_ID }
      secretAccessKey: { name: garage-backup-key, key: ACCESS_SECRET_KEY }
    wal: { compression: gzip }
---
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata: { name: grad-db, namespace: grad }
spec:
  instances: 1
  imageName: ghcr.io/cloudnative-pg/postgresql:17
  storage: { size: 20Gi, storageClass: local-path }
  resources:
    requests: { cpu: 250m, memory: 512Mi }
    limits: { memory: 1Gi }
  bootstrap:
    initdb: { database: grad, owner: grad }
  plugins:
    - name: barman-cloud.cloudnative-pg.io
      isWALArchiver: true
      parameters: { barmanObjectName: garage-backups }
---
apiVersion: postgresql.cnpg.io/v1
kind: ScheduledBackup
metadata: { name: grad-db-nightly, namespace: grad }
spec:
  schedule: "0 0 19 * * *"        # six fields, seconds first; 19:00 UTC is 02:00 in Ho Chi Minh City
  backupOwnerReference: self
  cluster: { name: grad-db }
  method: plugin
  pluginConfiguration: { name: barman-cloud.cloudnative-pg.io }
```

The operator creates the Secret `grad-db-app` containing the application role's credentials and a ready-made connection URI, which the API consumes directly.

**Garage**

The upstream chart lives inside the Garage repository at `script/helm/garage` rather than in a published index, so a pinned copy is vendored into `charts/garage` in the infrastructure repository (provenance in its `VENDORED.md`). Keep its version in step with `docker-compose.yml` here.

```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata: { name: garage, namespace: garage }
spec:
  interval: 1h
  chart:
    spec:
      chart: ./charts/garage
      reconcileStrategy: Revision
      sourceRef: { kind: GitRepository, name: flux-system, namespace: flux-system }
  values:
    garage:
      singleNode: true             # one replica, replication_factor = 1, layout assigned on first start
      existingRpcSecret: garage-rpc  # SOPS-encrypted, not generated by Helm
    image: { repository: dxflrs/garage }
    persistence:
      meta: { storageClass: local-path, size: 5Gi }
      data: { storageClass: local-path, size: 200Gi }
    ingress:
      s3:
        api: { enabled: false }
        web: { enabled: false }
```

`--single-node` assigns the layout itself, so the one-time bootstrap only creates buckets and keys. `scripts/garage-bootstrap.sh` in the infrastructure repository does it idempotently: it creates `grad-originals`, `grad-derivatives` and `grad-backups`, imports `api-key` and `backup-key` from the SOPS-encrypted `garage-keys` Secret (so git stays the source of truth), and grants `api-key` read/write on the first two and `backup-key` on `grad-backups`.

The same credentials reach their consumers as SOPS-encrypted Secrets in `grad`: `api-s3` (the `S3_*` variables for the api and worker) and `garage-backup-key` (the Barman Cloud ObjectStore).

The S3 endpoint inside the cluster is `http://garage.garage.svc.cluster.local:3900`, region `garage`, path-style addressing. Only pods in `grad` may reach it, and only on 3900 (§7.7).

**NVIDIA device plugin**

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata: { name: nvdp, namespace: flux-system }
spec: { interval: 12h, url: https://nvidia.github.io/k8s-device-plugin }
---
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata: { name: nvidia-device-plugin, namespace: nvidia-device-plugin }
spec:
  interval: 1h
  chart:
    spec:
      chart: nvidia-device-plugin
      version: "0.17.1"
      sourceRef: { kind: HelmRepository, name: nvdp, namespace: flux-system }
  values:
    runtimeClassName: nvidia
```

**ddns**

Per ADR-009: keeps Spaceship's `api.grad26.fuisloy.dev` `A` record pointed at the home connection's current public IP. Runs on a short interval rather than continuously, since it only needs to notice a change, not hold anything open. The deployed version lives in the infrastructure repository at `workloads/home/ddns/`: `update.sh` looks the IP up from two services (they must agree), reads the record with `GET /v1/dns/records/{domain}`, and only on a change `PUT`s the new `A` record and `DELETE`s the old one, because Spaceship's `PUT` adds a record when the address differs rather than replacing it.

```yaml
apiVersion: batch/v1
kind: CronJob
metadata: { name: ddns, namespace: grad }
spec:
  schedule: "*/5 * * * *"
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      backoffLimit: 1
      activeDeadlineSeconds: 120
      template:
        spec:
          restartPolicy: Never
          automountServiceAccountToken: false
          securityContext: { runAsNonRoot: true, runAsUser: 100, runAsGroup: 101 }
          containers:
            - name: ddns
              image: docker.io/curlimages/curl:8.22.0
              command: ["/bin/sh", "/scripts/update.sh"]   # ConfigMap ddns-script
              env: [{ name: DOMAIN, value: fuisloy.dev }, { name: RECORD_NAME, value: api.grad26 }, { name: TTL, value: "300" }]
              envFrom:
                - secretRef: { name: spaceship-api }   # SPACESHIP_API_KEY / SPACESHIP_API_SECRET, dnsrecords read + write only
              resources:
                requests: { cpu: 10m, memory: 16Mi }
                limits: { memory: 64Mi }
```

**API and worker**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: api, namespace: grad }
spec:
  replicas: 1
  strategy: { type: RollingUpdate, rollingUpdate: { maxUnavailable: 0, maxSurge: 1 } }
  selector: { matchLabels: { app: api } }
  template:
    metadata: { labels: { app: api } }
    spec:
      securityContext: { runAsNonRoot: true, runAsUser: 1000, fsGroup: 1000 }
      initContainers:
        - name: migrate
          image: docker.io/fuisl/grad26-api:main-20260101000000-0000000 # {"$imagepolicy": "flux-system:grad26-api"}
          args: ["node", "dist/migrate.js"]
          envFrom:
            - secretRef: { name: grad-db-app }
      containers:
        - name: api
          image: docker.io/fuisl/grad26-api:main-20260101000000-0000000 # {"$imagepolicy": "flux-system:grad26-api"}
          ports: [{ name: http, containerPort: 4000 }]
          envFrom:
            - configMapRef: { name: api-config }
            - secretRef: { name: api-s3 }
            - secretRef: { name: api-service-tokens }
            - secretRef: { name: api-admin }
          env:
            - name: DATABASE_URL
              valueFrom: { secretKeyRef: { name: grad-db-app, key: uri } }
          readinessProbe: { httpGet: { path: /readyz, port: http }, periodSeconds: 5 }
          livenessProbe: { httpGet: { path: /healthz, port: http }, periodSeconds: 10 }
          resources:
            requests: { cpu: 250m, memory: 256Mi }
            limits: { memory: 512Mi }
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: ["ALL"] }
          volumeMounts: [{ name: tmp, mountPath: /tmp }]
      volumes: [{ name: tmp, emptyDir: {} }]
---
apiVersion: v1
kind: Service
metadata: { name: api, namespace: grad }
spec:
  selector: { app: api }
  ports: [{ name: http, port: 80, targetPort: http }]
---
apiVersion: apps/v1
kind: Deployment
metadata: { name: worker, namespace: grad }
spec:
  replicas: 1
  selector: { matchLabels: { app: worker } }
  template:
    metadata: { labels: { app: worker } }
    spec:
      containers:
        - name: worker
          image: docker.io/fuisl/grad26-api:main-20260101000000-0000000 # {"$imagepolicy": "flux-system:grad26-api"}
          args: ["node", "dist/worker.js"]
          envFrom:
            - configMapRef: { name: api-config }
            - secretRef: { name: api-s3 }
          env:
            - name: DATABASE_URL
              valueFrom: { secretKeyRef: { name: grad-db-app, key: uri } }
          resources:
            requests: { cpu: 250m, memory: 512Mi }
            limits: { memory: 1Gi }
```

Ingress and Traefik middlewares. The errors middleware returns the static fallback page whenever the API answers with a gateway error or is unreachable. The rate-limit middleware reads the connection's real IP directly (ADR-009: no proxy in front sets a header for it, unlike the earlier `CF-Connecting-IP`). The Ingress now carries its own TLS section since Traefik terminates TLS itself.

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata: { name: fallback, namespace: edge }   # beside its Service: Traefik's allowCrossNamespace is off
spec:
  errors:
    status: ["502-504"]
    service: { name: fallback, port: 80 }
    query: "/index.html"
---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata: { name: api-ratelimit, namespace: grad }
spec:
  rateLimit:
    average: 50
    burst: 100
    sourceCriterion:
      ipStrategy: {}   # the connection's real remote IP; nothing sits in front to trust a header from instead
---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata: { name: api-headers, namespace: grad }
spec:
  headers:
    stsSeconds: 31536000
    contentTypeNosniff: true
    frameDeny: true
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api
  namespace: grad
  annotations:
    traefik.ingress.kubernetes.io/router.middlewares: grad-api-headers@kubernetescrd,grad-api-ratelimit@kubernetescrd,edge-fallback@kubernetescrd
    cert-manager.io/cluster-issuer: letsencrypt-http01
spec:
  ingressClassName: traefik
  tls:
    - hosts: [api.grad26.fuisloy.dev]
      secretName: api-tls
  rules:
    - host: api.grad26.fuisloy.dev
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: { service: { name: api, port: { number: 80 } } }
```

Flux image automation for the API image. `docker.io/fuisl/grad26-api` is public, so no `secretRef` is needed to read it.

```yaml
apiVersion: image.toolkit.fluxcd.io/v1
kind: ImageRepository
metadata: { name: grad26-api, namespace: flux-system }
spec:
  image: docker.io/fuisl/grad26-api
  interval: 5m
---
apiVersion: image.toolkit.fluxcd.io/v1
kind: ImagePolicy
metadata: { name: grad26-api, namespace: flux-system }
spec:
  imageRepositoryRef: { name: grad26-api }
  # docker-api.yml (this repo's CI) pushes `latest`, `sha-<short-sha>` and
  # `main-<YYYYMMDDHHmmss UTC>-<7-char sha>` per push to main (#52). Only the
  # main-* tag is sortable: the UTC build timestamp is extracted and compared
  # numerically, so the newest build wins regardless of the sha.
  filterTags:
    pattern: '^main-(?P<ts>[0-9]{14})-[a-f0-9]{7}$'
    extract: '$ts'
  policy:
    numerical: { order: asc }
---
apiVersion: image.toolkit.fluxcd.io/v1
kind: ImageUpdateAutomation
metadata: { name: grad, namespace: flux-system }
spec:
  interval: 10m
  sourceRef: { kind: GitRepository, name: flux-system }
  git:
    checkout: { ref: { branch: main } }
    commit:
      author: { name: fluxcdbot, email: fluxcdbot@users.noreply.github.com }
      messageTemplate: "chore(deploy): bump images"
    push: { branch: flux/image-updates }
  update: { path: ./deploy/apps, strategy: Setters }
```

Pushing to a separate branch keeps the bump under review, which matches the pull-request workflow in `development/workflow.md`.

**Translation (GPU)**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: translation, namespace: grad }
spec:
  replicas: 1
  strategy: { type: Recreate }        # one GPU, no surge
  selector: { matchLabels: { app: translation } }
  template:
    metadata: { labels: { app: translation } }
    spec:
      runtimeClassName: nvidia
      imagePullSecrets: [{ name: ghcr-pull }]
      containers:
        - name: translation
          image: ghcr.io/<owner>/grad-translation:main-0000000-0 # {"$imagepolicy": "flux-system:grad-translation"}
          ports: [{ name: http, containerPort: 8000 }]
          env:
            - { name: API_INTERNAL_URL, value: http://api.grad.svc.cluster.local }
            - name: SERVICE_TOKEN
              valueFrom: { secretKeyRef: { name: api-service-tokens, key: SERVICE_TOKEN_TRANSLATION } }
            - { name: MODEL_CACHE, value: /models }
          resources:
            requests: { cpu: "1", memory: 4Gi }
            limits: { memory: 8Gi, nvidia.com/gpu: 1 }
          volumeMounts: [{ name: models, mountPath: /models }]
      volumes:
        - name: models
          persistentVolumeClaim: { claimName: translation-models }
```

Model weights are cached on a small PVC so a pod restart does not re-download them during the ceremony. The service is its own Flux Kustomization so it can be suspended.

**Printer daemon (venue overlay only)**

Runs only where a label marks the venue node, needs the USB bus, and is the one pod that breaks the clean containment model. It is confined to its own overlay and never present at home.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: printer, namespace: grad }
spec:
  replicas: 1
  selector: { matchLabels: { app: printer } }
  template:
    metadata: { labels: { app: printer } }
    spec:
      nodeSelector: { grad.vgu/venue: "true" }
      imagePullSecrets: [{ name: ghcr-pull }]
      containers:
        - name: printer
          image: ghcr.io/<owner>/grad-printer:main-0000000-0 # {"$imagepolicy": "flux-system:grad-printer"}
          securityContext: { privileged: true }   # USB access for CUPS; venue only
          env:
            - { name: API_INTERNAL_URL, value: http://api.grad.svc.cluster.local }
            - name: SERVICE_TOKEN
              valueFrom: { secretKeyRef: { name: api-service-tokens, key: SERVICE_TOKEN_PRINTER } }
          volumeMounts: [{ name: usb, mountPath: /dev/bus/usb }]
      volumes:
        - name: usb
          hostPath: { path: /dev/bus/usb }
```

**Static fallback**

A tiny static server with one HTML page from a ConfigMap: event name, date, venue address, a map link, and the fallback QR codes the runbook asks for. Traefik serves it whenever the API is unreachable.

**Offsite mirror**

```yaml
apiVersion: batch/v1
kind: CronJob
metadata: { name: offsite-mirror, namespace: garage }
spec:
  schedule: "30 20 * * *"            # 03:30 in Ho Chi Minh City
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: rclone
              image: rclone/rclone:1.68
              args: ["sync", "garage:", "offsite-crypt:", "--fast-list", "--transfers", "4"]
              envFrom: [{ secretRef: { name: rclone-config } }]   # RCLONE_CONFIG_* variables, SOPS-encrypted
              resources:
                requests: { cpu: 100m, memory: 128Mi }
                limits: { memory: 512Mi }
```

The `offsite-crypt` remote wraps the real target with rclone's client-side encryption. The real target is an open item.

## 7.7 Network policies

k3s ships a policy controller, so these are enforced, not decorative. Default deny ingress in `grad` and `garage`, then explicit allows.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: default-deny-ingress, namespace: grad }
spec:
  podSelector: {}
  policyTypes: [Ingress]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: api-from-traefik, namespace: grad }
spec:
  podSelector: { matchLabels: { app: api } }
  ingress:
    - from:
        - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: kube-system } }
          podSelector: { matchLabels: { app.kubernetes.io/name: traefik } }
        - podSelector: { matchLabels: { app: translation } }
        - podSelector: { matchLabels: { app: printer } }
      ports: [{ port: 3000 }]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: postgres-from-app, namespace: grad }
spec:
  podSelector: { matchLabels: { cnpg.io/cluster: grad-db } }
  ingress:
    - from:
        - podSelector: { matchLabels: { app: api } }
        - podSelector: { matchLabels: { app: worker } }
      ports: [{ port: 5432 }]
    - from:
        - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: cnpg-system } }
      ports: [{ port: 8000 }]          # operator to instance manager
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: translation-from-api, namespace: grad }
spec:
  podSelector: { matchLabels: { app: translation } }
  ingress:
    - from:
        - podSelector: { matchLabels: { app: api } }
      ports: [{ port: 8000 }]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: garage-from-grad, namespace: garage }
spec:
  podSelector: { matchLabels: { app.kubernetes.io/name: garage } }
  ingress:
    - from:
        - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: grad } }
        - podSelector: {}               # the mirror CronJob in the same namespace
      ports: [{ port: 3900 }]
```

Label selectors for Traefik and Garage pods must be checked against the deployed charts before the policies are committed, because a wrong label silently blocks traffic.

## 7.8 Resource budget

| Workload | CPU request | Memory request | Memory limit |
| --- | --- | --- | --- |
| api | 250m | 256 Mi | 512 Mi |
| worker | 250m | 512 Mi | 1 Gi |
| grad-db | 250m | 512 Mi | 1 Gi |
| garage | 250m | 256 Mi | 1 Gi |
| traefik | 100m | 128 Mi | 256 Mi |
| ddns | 10m | 16 Mi | 64 Mi |
| cert-manager, cnpg operator, plugin, flux, device plugin | 500m | 700 Mi | 1.5 Gi |
| fallback | 10m | 16 Mi | 32 Mi |
| translation | 1 | 4 Gi | 8 Gi, plus GPU |
| Total without translation | about 1.7 | about 2.5 Gi | about 5.5 Gi |
| Total with translation | about 2.7 | about 6.5 Gi | about 13.5 Gi |

The planned node is a laptop (ROG Zephyrus G15) running Ubuntu 24.04: Ryzen 9 6900HS with 8 cores, about 15 GB of RAM, 913 GB on the root disk, and an RTX 3060 Mobile with 6 GB of VRAM. CPU and RAM cover this with headroom. VRAM is the limit: Whisper large-class models need roughly 10 GB, so they do not fit; medium fits in about 5 GB but leaves little room, so plan on small or int8-quantised models and test them on the node. Because the node is a laptop, power, thermals and lid behaviour are part of the event-day risk (see the drills below).

## 7.9 Day-two operations

- Upgrades: bump chart versions and image tags in git; Flux applies them. Roll back by reverting the commit.
- Switching experimental features off: suspend the Flux Kustomization; resume to bring it back. No manifest change required on the day.
- Secret rotation: re-encrypt with SOPS, commit, Flux applies; restart the consuming Deployment.
- Node reboot: k3s starts on boot, local-path volumes reattach, the router's port forward survives (it's a router config, not a cluster one) and Traefik comes back up. Expected recovery is under two minutes from power, plus however long it takes the DDNS updater's next scheduled run to confirm the IP is still correct.
- Drills before the ceremony: restore Postgres from Garage into a scratch cluster, restore a sample of originals from the offsite copy, pull the power on the node and time recovery.
