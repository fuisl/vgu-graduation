import { sliceTranslator, type MessageSlice } from "../../../lib/i18n/format";

type Props = { messages: MessageSlice<"pass."> } & (
  | { state: "unavailable" }
  | { state: "ready"; svg: string; guestName: string; eventName: string; date: string | null }
);

/** Presentational badge section. The SVG string comes from our own QR renderer, never from user input. */
export function PassBadgeView(props: Props) {
  const t = sliceTranslator(props.messages);
  if (props.state === "unavailable") {
    return (
      <section aria-labelledby="badge-heading" className="invite-pass">
        <h2 id="badge-heading" className="invite-heading">{t("pass.title")}</h2>
        <p className="invite-pass__meta" role="status">{t("pass.unavailable")}</p>
      </section>
    );
  }
  const { svg, guestName, eventName, date } = props;
  const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return (
    <section aria-labelledby="badge-heading" className="invite-pass">
      <h2 id="badge-heading" className="invite-heading">{t("pass.title")}</h2>
      <div
        role="img"
        aria-label={t("pass.qrLabel", { name: guestName, event: eventName })}
        className="invite-pass__qr"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="invite-pass__meta">
        <strong>{guestName}</strong>
        <br />
        {eventName}
        {date ? (
          <>
            <br />
            {date}
          </>
        ) : null}
      </p>
      <p className="invite-pass__meta">{t("pass.keepsake")}</p>
      <a className="invite-link" href={href} download="grad26-badge.svg">
        {t("pass.save")}
      </a>
    </section>
  );
}
