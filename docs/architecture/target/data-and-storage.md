# 5. Data and storage

## 5.1 PostgreSQL

One CloudNativePG `Cluster` with a single instance on the local-path storage class. Entities follow `architecture/data-model.md`: `User`, `Guest`, `Invitation`, `InvitationInviter`, `RSVP`, `Photo`, `Wish`, `TranslationSegment`, plus a `jobs` table for the worker and an `audit` table for admin actions.

Backups use the Barman Cloud plugin, which requires CloudNativePG 1.26 or newer and replaces the deprecated in-tree object store configuration. Continuous WAL archiving plus a nightly base backup go to the `grad-backups` bucket in Garage. Retention is 30 days. Restore is rehearsed once before the ceremony by bootstrapping a scratch cluster from the backup.

## 5.2 Garage buckets

| Bucket | Content | Access key | Exposure |
| --- | --- | --- | --- |
| `grad-originals` | Full-resolution uploads, immutable, never served | `api-key` read and write | Cluster only |
| `grad-derivatives` | Resized and stripped variants, content-addressed names | `api-key` read and write | Served by the API, cached by Cloudflare |
| `grad-backups` | Postgres base backups and WAL | `backup-key` read and write | Cluster only |

Keys are generated in advance, stored SOPS-encrypted, and imported into Garage during bootstrap so that git remains the source of truth for credentials. Garage runs with replication factor 1 on the single node.

## 5.3 Offsite copy

A CronJob runs `rclone sync` nightly from all three buckets to an offsite target. The target is an open item: a disk at a second household reached over Tailscale is the free option; a paid object storage bucket is the low-effort option. Either way the copy is encrypted client-side by rclone and a restore from it is part of the pre-event drill.

## 5.4 What never leaves the cluster

Original photos, raw tokens (never stored at all), database credentials and S3 keys. Derivatives are the only media that cross the tunnel.
