# ADR-005: Garage object storage and CloudNativePG
Status: Accepted
Date: 2026-09-27
## Context
Photos and originals need durable S3-compatible storage, and PostgreSQL needs continuous backups, on one node with no managed services.
## Decision
Object storage is Garage with replication factor 1. PostgreSQL is run by CloudNativePG as a single-instance cluster, with the Barman Cloud plugin archiving WAL and nightly base backups to a Garage bucket, kept for 30 days. Nightly `rclone` copies the buckets, encrypted client-side, to an offsite disk on nhientruong04's server over Tailscale.
## Alternatives considered
- MinIO: familiar, but its community licensing and feature trimming make it a poor long-term base.
- Managed Postgres and buckets: less operation, but recurring cost and data leaves our control.
- Plain Postgres in a StatefulSet: simpler, without operator-managed backup and restore.
## Consequences
- Backup restore must be rehearsed before the event and from the offsite copy.
- The offsite disk needs a long-term custodian for the four-year archive.
- Replication factor 1 means the offsite copy is the only defence against disk loss.
