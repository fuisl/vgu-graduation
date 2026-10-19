# Guest email

The API sends three emails to guests from the owner's Gmail account (ADR-012). Each has a branded HTML part in the site's blue-and-white theme and a plain-text part with the same content (ADR-013):

| Email | When | Goes to | Path |
| --- | --- | --- | --- |
| Invitation link | An admin ticks "Email the link to the guest" when creating an invitation, or "Also email the new link" when rotating one | The guest's stored address | Sent by the API before it answers; the admin sees the result next to the link |
| Calendar invite | A guest with an invitation uses "Get the calendar invite by email" on `/venue` | The address the guest types | Sent by the API; at most 5 per invitation per day |
| RSVP confirmation | A guest saves an RSVP and their guest record has an address | The guest's stored address | Worker job, two minutes later; only the latest answer is confirmed |

With calendar RSVP on (`MAIL_CALENDAR_RSVP=true`, ADR-013), the invitation email is also a calendar invitation: Gmail, Outlook and Apple Mail show **Yes / Maybe / No**, and the worker reads the replies from the same inbox and records Yes and No as the guest's RSVP. See [Calendar RSVP](#calendar-rsvp) below.

With no SMTP credentials, nothing is sent: the admin notice says email is not set up, the venue form is hidden and RSVPs queue nothing. The rest of the site works the same.

## Set it up

1. **Turn on 2-step verification** for the Google account that should send (Google Account → Security). App passwords need it.
2. **Create an app password**: Google Account → Security → 2-Step Verification → App passwords. Name it `grad26-api`. Google shows 16 characters once. Don't paste it into chat, an issue or a commit.
3. **Create the Secret in the infrastructure repository** (`~/vgu-graduation-deployment`), on a branch:

   ```sh
   cd ~/vgu-graduation-deployment
   cat > workloads/home/api-service/api-mail.sops.yaml <<'EOF'
   apiVersion: v1
   kind: Secret
   metadata:
       name: api-mail
   type: Opaque
   stringData:
       SMTP_USER: you@gmail.com
       SMTP_PASSWORD: the-16-character-app-password
       MAIL_FROM: "GRAD '26 <you@gmail.com>"
   EOF
   sops --encrypt --in-place workloads/home/api-service/api-mail.sops.yaml
   grep -c ENC workloads/home/api-service/api-mail.sops.yaml   # 3: every value is encrypted
   ```

   Encrypt before `git add`. The plaintext file must never be committed. `MAIL_FROM` must use the same address as `SMTP_USER`; Gmail rewrites any other sender to it. Then add `- api-mail.sops.yaml` to `resources` in `workloads/home/api-service/kustomization.yaml`.
4. **Merge and let Flux apply.** The `api-service` and `worker` Deployments already list `api-mail` as an optional `envFrom`, and `allow-mail-egress` opens port 587 for both. Flux restarts nothing by itself when a Secret changes, so roll both: `kubectl -n grad rollout restart deployment/api-service deployment/worker`.
5. **Check:** `curl -s https://api.grad26.fuisloy.dev/mail/status` returns `{"enabled":true}` (the response is cached for up to a minute). Then create a test invitation for yourself with "Email the link to the guest" ticked; the notice should say "Emailed to the guest".

## Calendar RSVP

1. **Turn it on** in the infrastructure repository: `MAIL_CALENDAR_RSVP: "true"` on both the `api-service` and `worker` containers (the API attaches the calendar request, the worker reads replies), and `allow-imap-egress` lets the worker reach `imap.gmail.com:993`. The same app password works for IMAP; Gmail has IMAP on for every account.
2. **Check:** after the rollout the worker logs `worker started` with `calendarReplies: true`. Send yourself a test invitation from the admin page to an address other than the sending account (for example a second Gmail). It should show the Yes / Maybe / No bar. Tap **Yes**; within about a minute the worker logs `calendar reply` with `outcome: "applied"`, and `/admin/rsvps` shows the guest as attending.
3. **What counts:** only a reply from the address the invitation was emailed to, signed for that address's domain (DMARC or DKIM pass as recorded by Gmail), for an active invitation. Yes = attending (plus-ones kept), No = not attending (plus-ones cleared), Maybe = no change. If the guest changed their answer on the site after replying, the site answer wins.
4. **Outcomes in the logs** (`calendar reply`, by invitation id): `applied`, `unchanged`, `maybe`, `stale` (the site answer is newer), `unauthenticated`, `wrong_attendee` (forwarded invitation, or a different address), `inactive` (revoked or expired). `calendar replies polled` counts each pass; `calendar reply poll failed` carries an error code only.
5. **Keep replies in the inbox.** The worker reads the INBOX only, from the newest message it has seen (its position is in the `mail_cursors` table). A Gmail filter that archives "Accepted:" mail would hide replies. To re-read, `DELETE FROM mail_cursors;` makes the next pass look back 30 days; re-applying a reply changes nothing.
6. **Turn it off:** set `MAIL_CALENDAR_RSVP` to `false` and roll both. Invitations go out as normal emails again; replies to earlier calendar invitations stay in the inbox unread by the worker.

## Day to day

- **Logs** carry the invitation id and the outcome, never an address or link: `invitation email` and `calendar invite email` lines from the API, `job succeeded` or `job failed` with type `mail.rsvp_confirmation` from the worker.
- **A failed RSVP confirmation** retries five times with backoff (10 s up to 10 min), then stays `failed` in the `jobs` table with an error code such as `EAUTH` or `ETIMEDOUT`. No address is stored there.
- **Gmail's limit** is about 500 recipients a day for a personal account. Over it, Gmail refuses mail for up to 24 hours: the admin notice says the email could not be sent, and the link is still there to copy. Spread a big batch of invitations over several days.
- **Spam folders:** mail from a personal address sent by a server sometimes lands in spam, especially at first. Ask early guests to mark it "Not spam". The admin notice reminds admins to keep a copy of the link.
- **The Sent folder** of the sending account keeps a copy of every email, including invitation links (bearer credentials). Keep the account's 2-step verification on, and clear the Sent folder after the event if you don't want to keep them.

## Rotate or stop

- **Rotate the app password:** create a new one, update `SMTP_PASSWORD` with `sops workloads/home/api-service/api-mail.sops.yaml`, merge, roll both Deployments, then delete the old app password in the Google account.
- **Stop all email at once:** delete the `grad26-api` app password in the Google account. Sends fail immediately (`EAUTH`); invitations, RSVP and the venue page keep working, and the venue form shows "couldn't be sent" with the `.ics` fallback. To hide the form as well, remove the `api-mail` Secret and roll the API.
- **Move to a transactional provider:** set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` and `SMTP_PASSWORD` to the provider's SMTP settings and `MAIL_FROM` to a verified address on your domain. No code change.

## Local development

Mail is off unless `.env` sets `SMTP_USER` and `SMTP_PASSWORD`. To see real messages without mailing anyone, run a local catcher such as Mailpit (`docker run -p 1025:1025 -p 8025:8025 axllent/mailpit`) and set `SMTP_HOST=localhost`, `SMTP_PORT=1025` with any user and password. Only a server on `localhost` may skip TLS; every other host must offer STARTTLS or the send fails.
