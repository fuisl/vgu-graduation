import { cookies } from "next/headers";
import type { EventConfig } from "@grad/contract";
import { getPass } from "../../../lib/api/pass";
import type { ApiResult } from "../../../lib/api/result";
import { INVITATION_COOKIE } from "../../../lib/invite/cookie";
import { formatEventWhen } from "../../../lib/invite/format";
import { renderPassQrSvg } from "../../../lib/invite/qr";
import { PassBadgeView } from "./PassBadgeView";

/** Server component: fetches the signed pass and renders the QR. Any failure degrades to a note; it never throws into the page. */
export async function PassBadge({ guestName, event }: { guestName: string; event: ApiResult<EventConfig> }) {
  try {
    const token = (await cookies()).get(INVITATION_COOKIE)?.value;
    if (!token) return <PassBadgeView state="unavailable" />;
    const pass = await getPass(token);
    if (pass.status !== "ok") return <PassBadgeView state="unavailable" />;
    const svg = await renderPassQrSvg(pass.data);
    const eventName = event.status === "ok" ? event.data.name : "GRAD '26";
    const date = event.status === "ok" ? formatEventWhen(event.data).date : null;
    return <PassBadgeView state="ready" svg={svg} guestName={guestName} eventName={eventName} date={date} />;
  } catch {
    return <PassBadgeView state="unavailable" />;
  }
}

export function PassBadgeSkeleton() {
  return (
    <section aria-labelledby="badge-heading">
      <h2 id="badge-heading">Your badge</h2>
      <p role="status">Preparing your badge…</p>
    </section>
  );
}
