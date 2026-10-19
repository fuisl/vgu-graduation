import { Suspense, use, type CSSProperties } from "react";
import { BADGE_ASCII, BADGE_MARK, estimateNameSize, type BadgeCard, type PassArt } from "./card";

/**
 * The CSS name badge: a white strap and a white card printed like the WebGL card's texture (same
 * layout, `card.ts`), hanging where the 3D card comes to rest. Server-rendered, so it is what the
 * guest sees first, and what stays under reduced motion, on low-power devices, without WebGL and
 * while three.js loads. Decorative: the badge's `role="img"` wrapper carries the accessible name.
 * `art` is the pass QR; until it resolves (or without a pass) the card shows the ASCII artwork.
 * No `card` draws a blank card, for loading states.
 */
export function BadgeFallback({ card, art }: { card: BadgeCard | null; art?: Promise<PassArt | null> }) {
  const style = card ? ({ "--name-px": String(estimateNameSize(card.givenName)) } as CSSProperties) : undefined;
  return (
    <div className="name-badge__hang" aria-hidden="true">
      <span className="name-badge__strap" />
      <span className="name-badge__clip" />
      <div className="name-badge__card" style={style}>
        <span className="name-badge__mark">{BADGE_MARK.left}</span>
        <span className="name-badge__mark name-badge__mark--end">{BADGE_MARK.right}</span>
        {card ? (
          <>
            <div className="name-badge__art">
              {art ? (
                <Suspense fallback={<AsciiArt />}>
                  <PassQr art={art} />
                </Suspense>
              ) : (
                <AsciiArt />
              )}
            </div>
            <span className="name-badge__name">{card.givenName}</span>
            {card.fullName ? <span className="name-badge__fullname">{card.fullName}</span> : null}
            <span className="name-badge__rule" />
            <span className="name-badge__row name-badge__row--1">{card.role}</span>
            {card.date ? <span className="name-badge__row name-badge__row--1 name-badge__row--end">{card.date}</span> : null}
            <span className="name-badge__row name-badge__row--2">{card.place}</span>
            {card.status ? <span className="name-badge__row name-badge__row--2 name-badge__row--end">{card.status}</span> : null}
            <span className="name-badge__tagline">{card.tagline}</span>
          </>
        ) : (
          <span className="name-badge__rule" />
        )}
      </div>
    </div>
  );
}

/** A blank CSS badge in place of NameBadge, for loading states: no client code, no three.js. */
export function BadgePlaceholder() {
  return (
    <div className="name-badge" aria-hidden="true">
      <div className="name-badge__fallback">
        <BadgeFallback card={null} />
      </div>
    </div>
  );
}

function AsciiArt() {
  return (
    <pre className="name-badge__ascii">
      {BADGE_ASCII.map((line, index) => (
        <span key={index} className={index === 3 ? "name-badge__ascii-key" : undefined}>
          {line}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

/** The SVG comes from our own QR renderer (`lib/invite/qr.ts`), never from user input. */
function PassQr({ art }: { art: Promise<PassArt | null> }) {
  const pass = use(art);
  if (!pass) return <AsciiArt />;
  const style = { "--qr-n": String(pass.size) } as CSSProperties;
  return <div className="name-badge__qr" style={style} dangerouslySetInnerHTML={{ __html: pass.svg }} />;
}
