import { cookies } from "next/headers";
import type { EventConfig } from "@grad/contract";
import { getPass } from "../../../lib/api/pass";
import type { ApiResult } from "../../../lib/api/result";
import { pickMessages, type I18n } from "../../../lib/i18n/dictionary";
import { INVITATION_COOKIE } from "../../../lib/invite/cookie";
import { formatEventWhen } from "../../../lib/invite/format";
import { renderPassQrSvg } from "../../../lib/invite/qr";
import { PassBadgeView } from "./PassBadgeView";

/** Server component: fetches the signed pass and renders the QR. Any failure degrades to a note; it never throws into the page. */
export async function PassBadge({ guestName, event, i18n }: { guestName: string; event: ApiResult<EventConfig>; i18n: I18n }) {
  const messages = pickMessages(i18n.locale, "pass.");
  try {
    const token = (await cookies()).get(INVITATION_COOKIE)?.value;
    if (!token) return <PassBadgeView state="unavailable" messages={messages} />;
    const pass = await getPass(token);
    if (pass.status !== "ok") return <PassBadgeView state="unavailable" messages={messages} />;
    const svg = await renderPassQrSvg(pass.data);
    const eventName = event.status === "ok" ? event.data.name : "GRAD '26";
    const date = event.status === "ok" ? formatEventWhen(event.data, i18n).date : null;
    return <PassBadgeView state="ready" svg={svg} guestName={guestName} eventName={eventName} date={date} messages={messages} />;
  } catch {
    return <PassBadgeView state="unavailable" messages={messages} />;
  }
}

export function PassBadgeSkeleton({ i18n }: { i18n: I18n }) {
  return (
    <section aria-labelledby="badge-heading" className="invite-pass">
      <h2 id="badge-heading" className="invite-heading">{i18n.t("pass.title")}</h2>
      <p className="invite-pass__meta" role="status">{i18n.t("pass.preparing")}</p>
    </section>
  );
}
