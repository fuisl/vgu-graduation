import type { Metadata } from "next";
import type { AccessibilitySummary, AdminAccessibilityRow } from "@grad/contract";
import { getAccessibilityNeeds } from "../../../../lib/api/admin";
import { DEFAULT_EVENT_TIME_ZONE, formatAdminDateTime } from "../../../../lib/admin/datetime";
import { ACCESSIBILITY_NEED_LABELS, ACCESSIBILITY_PLANNING_GROUPS, describeNeeds } from "../../../../lib/admin/labels";
import { redirectIfUnauthorized, requireAdminSession } from "../../../../lib/admin/session";
import { LoadError } from "../../_components/LoadError";
import { PrintButton } from "../../_components/PrintButton";

/*
 * Accessibility needs (#176) for the venue team. Sensitive: admin only, never
 * logged, never in a URL, never cached (the API sends no-store and this page
 * renders per request, so Next answers `Cache-Control: no-store`). Deleted
 * after the event (docs/operations/event-runbook.md, "After the ceremony").
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export const metadata: Metadata = { title: "Accessibility needs | Admin | GRAD '26" };

export default async function AccessibilityPage() {
  const { token } = await requireAdminSession();
  const result = await getAccessibilityNeeds(token);
  redirectIfUnauthorized(result);

  return (
    <>
      <div className="admin-page-head">
        <h1>Accessibility needs</h1>
        {result.status === "ok" && result.data.items.length > 0 ? <PrintButton>Print for venue staff</PrintButton> : null}
      </div>
      <SensitiveNotice />
      {result.status !== "ok" ? (
        <LoadError what="accessibility needs" result={result} />
      ) : (
        <Needs summary={result.data.summary} items={result.data.items} />
      )}
    </>
  );
}

function SensitiveNotice() {
  return (
    <div className="admin-notice admin-notice--sensitive" role="note">
      <p>
        <strong>Sensitive: health-related guest information.</strong> Share it only with the venue staff who prepare
        seating and assistance. Don&apos;t copy it into chats, issues or spreadsheets, and shred printed copies after
        the ceremony.
      </p>
      <p>
        Delete after the event, before the first archive export (event runbook, &ldquo;After the ceremony&rdquo;).
      </p>
    </div>
  );
}

function Needs({ summary, items }: { summary: AccessibilitySummary; items: AdminAccessibilityRow[] }) {
  const attending = items.filter((row) => row.attending);
  const declined = items.filter((row) => !row.attending);

  if (items.length === 0) {
    return <p>No guest has stated an accessibility need yet. Guests can add them with their RSVP.</p>;
  }

  return (
    <>
      <p className="admin-print-only admin-muted">
        GRAD &apos;26 accessibility needs, printed {formatAdminDateTime(new Date().toISOString(), DEFAULT_EVENT_TIME_ZONE)}.
        Sensitive: destroy after the ceremony.
      </p>
      <section aria-labelledby="needs-summary">
        <h2 id="needs-summary">For planning</h2>
        <p>
          {summary.guests} attending guest{summary.guests === 1 ? "" : "s"} stated a need
          {summary.withNote > 0 ? `; ${summary.withNote} wrote a note` : ""}. Counts cover attending guests on active
          invitations.
        </p>
        <PlanningSummary summary={summary} />
      </section>

      <section aria-labelledby="needs-attending">
        <h2 id="needs-attending">Attending ({attending.length})</h2>
        {attending.length === 0 ? (
          <p>None of the guests with stated needs is attending.</p>
        ) : (
          <NeedsTable rows={attending} label="Attending guests' needs, table" />
        )}
      </section>

      {declined.length > 0 ? (
        <section aria-labelledby="needs-declined" className="admin-no-print">
          <details className="admin-details">
            <summary className="admin-button admin-button--outline">
              <span id="needs-declined">Declined, but stated needs ({declined.length})</span>
            </summary>
            <p className="admin-muted">Kept in case they change their answer. Not counted above.</p>
            <NeedsTable rows={declined} label="Declined guests' needs, table" />
          </details>
        </section>
      ) : null}
    </>
  );
}

function PlanningSummary({ summary }: { summary: AccessibilitySummary }) {
  return (
    <div className="admin-plan-groups">
      {ACCESSIBILITY_PLANNING_GROUPS.map((group) => (
        <div key={group.title}>
          <h3 className="admin-plan-groups__title">{group.title}</h3>
          <dl className="admin-stats">
            {group.keys.map((key) => (
              <div key={key}>
                <dt>{ACCESSIBILITY_NEED_LABELS[key]}</dt>
                <dd>{summary.needs[key]}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

/** `label` names the scroll region; it differs from the section heading so the two landmarks stay distinct. */
function NeedsTable({ rows, label }: { rows: AdminAccessibilityRow[]; label: string }) {
  return (
    <div className="admin-table-wrap" role="region" aria-label={label} tabIndex={0}>
      <table className="admin-table admin-table--print">
        <thead>
          <tr>
            <th scope="col">Guest</th>
            <th scope="col" className="admin-num">
              Party
            </th>
            <th scope="col">Needs</th>
            <th scope="col">Note</th>
            <th scope="col">Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const needs = describeNeeds(row.accessibility);
            return (
              <tr key={row.invitationId}>
                <td>{row.guestName}</td>
                <td className="admin-num">
                  {1 + row.plusOnesCount}
                  <span className="admin-visually-hidden"> people</span>
                </td>
                <td>{needs.length > 0 ? needs.join(", ") : "—"}</td>
                <td style={{ whiteSpace: "pre-line" }}>{row.accessibility.note || "—"}</td>
                <td>{formatAdminDateTime(row.updatedAt, DEFAULT_EVENT_TIME_ZONE)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
