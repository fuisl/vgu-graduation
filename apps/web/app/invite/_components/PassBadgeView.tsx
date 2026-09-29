type Props =
  | { state: "unavailable" }
  | { state: "ready"; svg: string; guestName: string; eventName: string; date: string | null };

/** Presentational badge section. The SVG string comes from our own QR renderer, never from user input. */
export function PassBadgeView(props: Props) {
  if (props.state === "unavailable") {
    return (
      <section aria-labelledby="badge-heading">
        <h2 id="badge-heading">Your badge</h2>
        <p role="status">Your badge is unavailable right now. Please try again later.</p>
      </section>
    );
  }
  const { svg, guestName, eventName, date } = props;
  const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return (
    <section aria-labelledby="badge-heading">
      <h2 id="badge-heading">Your badge</h2>
      <div style={{ display: "grid", gap: "var(--space-3)", justifyItems: "start" }}>
        <div
          role="img"
          aria-label={`QR code badge for ${guestName}, ${eventName}`}
          style={{ width: "min(100%, 16rem)", background: "#ffffff", lineHeight: 0 }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p style={{ margin: 0 }}>
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
        <p style={{ margin: 0 }}>A keepsake from your graduation. Keep it, or save it to remember the day.</p>
        <a href={href} download="grad26-badge.svg">
          Save badge
        </a>
      </div>
    </section>
  );
}
