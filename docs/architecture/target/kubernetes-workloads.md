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
    ports:
      web:
        forwardedHeaders:
          trustedIPs: ["10.42.0.0/16"]  # pod CIDR, so cloudflared's X-Forwarded-* are honored
      websecure:
        forwardedHeaders:
          trustedIPs: ["10.42.0.0/16"]
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
  --owner=<owner> --repository=vgu-graduation --branch=main \
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
| `edge` | cloudflared, static fallback | Ingress-facing helpers |
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
| garage | garage | HelmRelease | vendored `deploy/charts/garage` from the Garage repository | Garage v2.3.0 | 2 PVCs: meta 5 Gi, data sized to the archive | ClusterIP 3900 | apps |
| grad-db | grad | CNPG Cluster | operator | Postgres 17 | PVC 20 Gi | ClusterIP 5432 | apps |
| garage-backups | grad | ObjectStore + ScheduledBackup | plugin | n/a | uses Garage | none | apps |
| api | grad | Deployment, Service, Ingress | `ghcr.io/<owner>/grad-api` | image automation | none | Ingress `api.grad26.example` | apps |
| worker | grad | Deployment | same image | image automation | none | none | apps |
| cloudflared | edge | Deployment x2 | `cloudflare/cloudflared` | pinned release | none | outbound only | apps |
| fallback | edge | Deployment, Service, ConfigMap | static server image | pinned | none | via Traefik errors middleware | apps |
| translation | grad | Deployment, Service | `ghcr.io/<owner>/grad-translation` | image automation | emptyDir for model cache or PVC | Ingress `api.grad26.example/ingest` only | apps, suspendable |
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

ClusterIssuer using the Cloudflare DNS-01 solver. The API token Secret lives in the `cert-manager` namespace and is SOPS-encrypted. It needs `Zone:DNS:Edit` and `Zone:Zone:Read` scoped to the one zone.

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata: { name: letsencrypt-dns }
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: YOUR_CONTACT_EMAIL_HERE
    privateKeySecretRef: { name: letsencrypt-dns-account }
    solvers:
      - dns01:
          cloudflare:
            apiTokenSecretRef: { name: cloudflare-api-token, key: api-token }
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

The upstream chart lives inside the Garage repository at `script/helm/garage` rather than in a published index, so a pinned copy is vendored into `deploy/charts/garage`. Confirmed value keys are `garage.replicationFactor`, `deployment.replicaCount`, `persistence.meta.*`, `persistence.data.*` and `ingress.s3.api.enabled`; verify the rest against the vendored `values.yaml`.

```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata: { name: garage, namespace: garage }
spec:
  interval: 1h
  chart:
    spec:
      chart: ./deploy/charts/garage
      sourceRef: { kind: GitRepository, name: flux-system, namespace: flux-system }
  values:
    garage:
      replicationFactor: 1
    deployment:
      replicaCount: 1
    persistence:
      meta: { storageClass: local-path, size: 5Gi }
      data: { storageClass: local-path, size: 200Gi }
    ingress:
      s3:
        api: { enabled: false }
```

One-time bootstrap after the first start. The layout must be assigned before Garage accepts data; keys are imported from the SOPS-encrypted values so that git stays the source of truth.

```sh
kubectl -n garage exec garage-0 -- ./garage status
kubectl -n garage exec garage-0 -- ./garage layout assign -z home -c 200G <node-id>
kubectl -n garage exec garage-0 -- ./garage layout apply --version 1
for b in grad-originals grad-derivatives grad-backups; do
  kubectl -n garage exec garage-0 -- ./garage bucket create $b
done
kubectl -n garage exec garage-0 -- ./garage key import --yes <API_ACCESS_KEY_ID> <API_SECRET_KEY> -n api-key
kubectl -n garage exec garage-0 -- ./garage key import --yes <BACKUP_ACCESS_KEY_ID> <BACKUP_SECRET_KEY> -n backup-key
kubectl -n garage exec garage-0 -- ./garage bucket allow --read --write grad-originals   --key api-key
kubectl -n garage exec garage-0 -- ./garage bucket allow --read --write grad-derivatives --key api-key
kubectl -n garage exec garage-0 -- ./garage bucket allow --read --write grad-backups     --key backup-key
```

The S3 endpoint inside the cluster is `http://garage.garage.svc.cluster.local:3900`, region `garage`, path-style addressing.

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

**cloudflared**

Remotely managed tunnel: public hostnames are configured in the Cloudflare dashboard, the connector only needs its token. Two replicas keep the tunnel up through a pod restart or an image upgrade.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: cloudflared, namespace: edge }
spec:
  replicas: 2
  selector: { matchLabels: { app: cloudflared } }
  template:
    metadata: { labels: { app: cloudflared } }
    spec:
      securityContext: { runAsNonRoot: true, runAsUser: 65532 }
      containers:
        - name: cloudflared
          image: cloudflare/cloudflared:2025.9.0   # re-pin at implementation
          args: ["tunnel", "--no-autoupdate", "--loglevel", "info", "--output", "json", "--metrics", "0.0.0.0:2000", "run"]
          env:
            - name: TUNNEL_TOKEN
              valueFrom: { secretKeyRef: { name: cloudflared-token, key: token } }
          livenessProbe:
            httpGet: { path: /ready, port: 2000 }
            initialDelaySeconds: 10
            periodSeconds: 10
          resources:
            requests: { cpu: 50m, memory: 64Mi }
            limits: { memory: 128Mi }
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
      imagePullSecrets: [{ name: ghcr-pull }]
      securityContext: { runAsNonRoot: true, runAsUser: 1000, fsGroup: 1000 }
      initContainers:
        - name: migrate
          image: ghcr.io/<owner>/grad-api:main-0000000-0 # {"$imagepolicy": "flux-system:grad-api"}
          args: ["node", "dist/migrate.js"]
          envFrom:
            - secretRef: { name: grad-db-app }
      containers:
        - name: api
          image: ghcr.io/<owner>/grad-api:main-0000000-0 # {"$imagepolicy": "flux-system:grad-api"}
          ports: [{ name: http, containerPort: 3000 }]
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
      imagePullSecrets: [{ name: ghcr-pull }]
      containers:
        - name: worker
          image: ghcr.io/<owner>/grad-api:main-0000000-0 # {"$imagepolicy": "flux-system:grad-api"}
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

Ingress and Traefik middlewares. The errors middleware returns the static fallback page whenever the API answers with a gateway error or is unreachable.

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata: { name: api-fallback, namespace: grad }
spec:
  errors:
    status: ["502-504"]
    service: { name: fallback, namespace: edge, port: 80 }
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
      requestHeaderName: CF-Connecting-IP
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
    traefik.ingress.kubernetes.io/router.middlewares: grad-api-headers@kubernetescrd,grad-api-ratelimit@kubernetescrd,grad-api-fallback@kubernetescrd
spec:
  ingressClassName: traefik
  rules:
    - host: api.grad26.example
      http:
        paths:
          - path: /ingest
            pathType: Prefix
            backend: { service: { name: translation, port: { number: 80 } } }
          - path: /
            pathType: Prefix
            backend: { service: { name: api, port: { number: 80 } } }
```

Flux image automation for the API image:

```yaml
apiVersion: image.toolkit.fluxcd.io/v1
kind: ImageRepository
metadata: { name: grad-api, namespace: flux-system }
spec:
  image: ghcr.io/<owner>/grad-api
  interval: 5m
  secretRef: { name: ghcr-pull }
---
apiVersion: image.toolkit.fluxcd.io/v1
kind: ImagePolicy
metadata: { name: grad-api, namespace: flux-system }
spec:
  imageRepositoryRef: { name: grad-api }
  filterTags:
    pattern: '^main-[a-fA-F0-9]+-(?P<ts>[0-9]+)'
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
    push: { branch: flux-image-updates }
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
metadata: { name: translation-from-traefik, namespace: grad }
spec:
  podSelector: { matchLabels: { app: translation } }
  ingress:
    - from:
        - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: kube-system } }
          podSelector: { matchLabels: { app.kubernetes.io/name: traefik } }
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
| cloudflared x2 | 100m | 128 Mi | 256 Mi |
| traefik | 100m | 128 Mi | 256 Mi |
| cert-manager, cnpg operator, plugin, flux, device plugin | 500m | 700 Mi | 1.5 Gi |
| fallback | 10m | 16 Mi | 32 Mi |
| translation | 1 | 4 Gi | 8 Gi, plus GPU |
| Total without translation | about 1.7 | about 2.5 Gi | about 5.5 Gi |
| Total with translation | about 2.7 | about 6.5 Gi | about 13.5 Gi |

A node with 4 cores, 16 GB of RAM and a GPU with at least 8 GB of VRAM covers this with headroom. Whisper large-class models need roughly 10 GB of VRAM; medium fits in 5 GB.

## 7.9 Day-two operations

- Upgrades: bump chart versions and image tags in git; Flux applies them. Roll back by reverting the commit.
- Switching experimental features off: suspend the Flux Kustomization; resume to bring it back. No manifest change required on the day.
- Secret rotation: re-encrypt with SOPS, commit, Flux applies; restart the consuming Deployment.
- Node reboot: k3s starts on boot, local-path volumes reattach, cloudflared reconnects. Expected recovery is under two minutes from power.
- Drills before the ceremony: restore Postgres from Garage into a scratch cluster, restore a sample of originals from the offsite copy, pull the power on the node and time recovery.
