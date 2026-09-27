# 9. Homelab robustness

The homelab is mandatory. The concern is stated here plainly so it is a known, accepted risk: the invitation and RSVP flow, the most critical thing the product does, depends for months on a residential power feed, a residential internet connection and one machine. None of those has a service level. The mitigations below make the failure modes short and visible rather than impossible.

| Risk | Mitigation | Residual |
| --- | --- | --- |
| Power loss | UPS with clean shutdown; BIOS power-on after loss; k3s starts on boot | Outage for the length of the power cut plus about two minutes |
| ISP outage | Router with a 4G or 5G dongle as failover WAN; cloudflared reconnects automatically | Slower and metered while on failover |
| Node hardware failure | Nightly backups in Garage and offsite; every manifest in git; documented rebuild time under one hour on any spare machine | Data since the last WAL archive; hours of downtime |
| Disk failure | Mirrored data device if available; offsite copy regardless | Restore time |
| Tunnel down while node up | Two cloudflared replicas; Vercel serves stale reads; static event info always cached | Writes fail with a visible retry state |
| Silent failure | External uptime monitor on the public health endpoint with phone alerts; Flux alerts on failed reconciliation | Response time of a human |
| Resource exhaustion on the day | Requests and limits on every pod; experimental services suspendable; budget in 7.8 | None if the budget holds |
| Software drift | Everything pinned in git; upgrades are commits; rollback is a revert | None |

Two further measures raise the ceiling if the risk proves unacceptable in practice:

- A second k3s node on a small VPS holding only `api`, `worker` and Postgres, with the homelab keeping GPU, originals and printing. The Compose-era plan already isolated the core so this is a relocation, not a redesign. It is explicitly out of scope unless measured uptime over a month is poor.
- Pre-rendered invitations: a scheduled job on Vercel snapshots every invitation's essential content into the cache so that even never-visited invitations render during an outage.
