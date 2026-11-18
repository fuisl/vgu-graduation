import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { listInvitations } from "../../../lib/api/admin";
import { buildLaunchpad, formatPendingCount } from "../../../lib/admin/launchpad";
import { getLaunchpadStatus, type LaunchpadStatus } from "../../../lib/admin/launchpad-status";
import { computeAdminCounts } from "../../../lib/admin/overview";
import { redirectIfUnauthorized, requireAdminSession } from "../../../lib/admin/session";
import { displayLink, publicSiteOrigin, renderLinkQrSvg } from "../../../lib/live/site-link";
import { LoadError } from "../_components/LoadError";
import "./launchpad.css";

export default async function AdminOverviewPage() {
  const { token } = await requireAdminSession();
  const [invitations, status, requestHeaders] = await Promise.all([listInvitations(token), getLaunchpadStatus(token), headers()]);
  redirectIfUnauthorized(invitations);

  const origin = publicSiteOrigin(process.env.PUBLIC_ORIGIN, requestHeaders.get("host"), requestHeaders.get("x-forwarded-proto"));
  const launchpad = buildLaunchpad(origin, { PHOTOBOOTH_PUBLIC_URL: process.env.PHOTOBOOTH_PUBLIC_URL });
  const links = [...launchpad.pages, ...(launchpad.photobooth ? [{ id: "photobooth", url: launchpad.photobooth.url }] : [])];
  const qr = new Map(await Promise.all(links.map(async (link) => [link.id, await renderLinkQrSvg(link.url).catch(() => "")] as const)));

  return (
    <>
      <h1>Overview</h1>
      <section aria-labelledby="overview-launchpad" className="admin-launchpad">
        <h2 id="overview-launchpad">Launchpad</h2>
        <p className="admin-muted admin-lead">
          Every page and tool for graduation day. The full checklist is the{" "}
          <a href={launchpad.runbookUrl} target="_blank" rel="noopener noreferrer">event runbook</a> in the handbook.
        </p>

        <LiveStatus status={status} />

        <h3 id="launchpad-pages">Public pages</h3>
        <ul className="admin-card-grid" aria-labelledby="launchpad-pages">
          {launchpad.pages.map((page) => (
            <LinkCard key={page.id} id={page.id} name={page.name} purpose={page.purpose} note={page.note} url={page.url} qrSvg={qr.get(page.id) ?? ""} />
          ))}
        </ul>

        {launchpad.photobooth ? (
          <>
            <h3 id="launchpad-venue">Venue tools</h3>
            <ul className="admin-card-grid" aria-labelledby="launchpad-venue">
              <LinkCard
                id="photobooth"
                name="Receipt photobooth"
                purpose="Guests take a photo strip that prints on the receipt printer."
                note={launchpad.photobooth.note}
                url={launchpad.photobooth.url}
                qrSvg={qr.get("photobooth") ?? ""}
              />
            </ul>
          </>
        ) : null}

        <h3 id="launchpad-howto">Day-of how-to</h3>
        <DayOfSteps />
      </section>

      {invitations.status !== "ok" ? (
        <LoadError what="the invitation counts" result={invitations} />
      ) : invitations.data.items.length === 0 ? (
        <p>
          No invitations yet. <Link href="/admin/graduates">Add graduates</Link>, then{" "}
          <Link href="/admin/invitations">create an invitation</Link>.
        </p>
      ) : (
        <Counts rows={invitations.data.items} />
      )}
    </>
  );
}

function LiveStatus({ status }: { status: LaunchpadStatus }) {
  return (
    <>
      <h3 id="launchpad-status">Live status</h3>
      <dl className="admin-stats" aria-labelledby="launchpad-status">
        <Stat label="API" value={status.apiUp ? "Reachable" : "Not reachable"} />
        {status.print ? (
          <>
            <Stat label="Print queued" value={status.print.queued} />
            <Stat label="Printing" value={status.print.printing} />
            <Stat label="Print failed" value={status.print.failed} />
          </>
        ) : (
          <Stat label="Print queue" value="Unavailable" />
        )}
        {status.pending ? <Stat label="Awaiting approval" value={formatPendingCount(status.pending)} /> : null}
      </dl>
      <p className="admin-muted">
        Reload the page to refresh. Details in <Link href="/admin/print">Print</Link>
        {status.pending ? (
          <>
            {" "}and <Link href="/admin/moderation">Moderation</Link>, where photos wait for approval
          </>
        ) : null}
        .
      </p>
    </>
  );
}

function LinkCard({ id, name, purpose, note, url, qrSvg }: { id: string; name: string; purpose: string; note?: string; url: string; qrSvg: string }) {
  return (
    <li className="admin-item">
      <h4 className="admin-item__title">{name}</h4>
      <p className="admin-item__text admin-muted">{purpose}</p>
      {note ? <p className="admin-item__text">{note}</p> : null}
      <p className="admin-item__text admin-link-output admin-launchpad__url">{url}</p>
      <div className="admin-actions">
        <a className="admin-button admin-button--outline" href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${name} in a new tab`}>
          Open
        </a>
        {qrSvg ? (
          <details className="admin-details admin-details--wide">
            <summary className="admin-button admin-button--outline" aria-label={`QR code for ${name}`}>QR</summary>
            <figure className="admin-launchpad__qr" id={`launchpad-qr-${id}`}>
              <div role="img" aria-label={`QR code linking to ${url}`} dangerouslySetInnerHTML={{ __html: qrSvg }} />
              <figcaption className="admin-link-output">{displayLink(url)}</figcaption>
            </figure>
          </details>
        ) : null}
      </div>
    </li>
  );
}

const STEPS: { title: string; body: ReactNode }[] = [
  {
    title: "Before doors open: the projector",
    body: (
      <>
        On the projector laptop, open the kiosk invitation link once (create one in{" "}
        <Link href="/admin/invitations">Invitations</Link> if there is none). Then open <code>/display</code> and press{" "}
        <kbd>F</kbd> for full screen. Check that photos and the wishes QR show.
      </>
    ),
  },
  {
    title: "Photobooth",
    body: (
      <>
        Start the booth app on the booth laptop. Start the printer daemon in photobooth mode (see{" "}
        <code>apps/printer/README.md</code>). Check the printer in <Link href="/admin/print">Print</Link>: nothing should
        sit in Queued for long.
      </>
    ),
  },
  {
    title: "Moderation",
    body: (
      <>
        Photos from guests without an invitation wait for approval in{" "}
        <Link href="/admin/moderation">Moderation</Link>. Hide anything wrong at once. Keyboard: <kbd>J</kbd>/<kbd>K</kbd>{" "}
        move, <kbd>V</kbd> show, <kbd>H</kbd> hide, <kbd>R</kbd> remove, <kbd>P</kbd> public.
      </>
    ),
  },
  {
    title: "Live captions",
    body: (
      <>
        Start the capture client on the AV laptop and check its status line reads live (event runbook, Live translation).
        Guests read along at <code>/live</code>; the display shows a caption line. If it causes any trouble, switch it off:
        nothing else depends on it.
      </>
    ),
  },
  {
    title: "If the Wi-Fi drops",
    body: (
      <>
        Do nothing at first. The display and the guest pages keep the last content on screen and reconnect by themselves.
        If the API stays down, the fallback page with the event facts and QR codes takes over (event runbook, Preflight).
      </>
    ),
  },
  {
    title: "After the ceremony",
    body: (
      <>
        Curate the public archive: in <Link href="/admin/moderation">Moderation</Link>, mark the best photos and wishes{" "}
        <strong>Public</strong>. They appear on <code>/memories</code>.
      </>
    ),
  },
];

function DayOfSteps() {
  return (
    <ol className="admin-stack admin-launchpad__steps" aria-labelledby="launchpad-howto">
      {STEPS.map((step) => (
        <li key={step.title}>
          <details className="admin-details admin-item">
            <summary>{step.title}</summary>
            <p>{step.body}</p>
          </details>
        </li>
      ))}
    </ol>
  );
}

function Counts({ rows }: { rows: Parameters<typeof computeAdminCounts>[0] }) {
  const counts = computeAdminCounts(rows);
  return (
    <>
      <section aria-labelledby="overview-invitations">
        <h2 id="overview-invitations">Invitations</h2>
        <dl className="admin-stats">
          <Stat label="Total" value={counts.invitations.total} />
          <Stat label="Active" value={counts.invitations.active} />
          <Stat label="Revoked" value={counts.invitations.revoked} />
        </dl>
      </section>
      <section aria-labelledby="overview-rsvp">
        <h2 id="overview-rsvp">RSVPs</h2>
        <dl className="admin-stats">
          <Stat label="Attending" value={counts.rsvp.attending} />
          <Stat label="Declined" value={counts.rsvp.declined} />
          <Stat label="No answer" value={counts.rsvp.pending} />
          <Stat label="Plus-ones" value={counts.rsvp.plusOnes} />
        </dl>
        <p className="admin-muted">
          Counts cover active invitations only. Plus-ones are those of attending guests.
        </p>
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
