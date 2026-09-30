type Props =
  | { state: "unavailable" }
  | { state: "ready"; svg: string; guestName: string; eventName: string; date: string | null };

/** Presentational badge section. The SVG string comes from our own QR renderer, never from user input. */
export function PassBadgeView(props: Props) {
  if (props.state === "unavailable") {
    return (
      <section aria-labelledby="badge-heading" className="invite-pass">
        <h2 id="badge-heading" className="invite-heading">Your badge</h2>
        <p className="invite-pass__meta" role="status">Your badge is unavailable right now. Please try again later.</p>
      </section>
    );
  }
  const { svg, guestName, eventName, date } = props;
  const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return (
    <section aria-labelledby="badge-heading" className="invite-pass">
      <h2 id="badge-heading" className="invite-heading">Your badge</h2>
      <div
        role="img"
        aria-label={`QR code badge for ${guestName}, ${eventName}`}
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
      <p className="invite-pass__meta">A keepsake from your graduation. Keep it, or save it to remember the day.</p>
      <a className="invite-link" href={href} download="grad26-badge.svg">
        Save badge
      </a>
    </section>
  );
}
