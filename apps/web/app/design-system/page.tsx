import type {Metadata} from "next";
import type {ReactNode} from "react";
import {ArrowUpRightPixel, BrandEyebrow, BrandTheme, Cta, PillGroup, PillItem, PillToggle, Section} from "@grad/ui";
import {BrandLogo} from "../logo/BrandLogo";
import {SiteFooter} from "../site/SiteFooter";
import {SignedInChip} from "../site/GuestChip";
import {SignedOutChip} from "../site/SiteAction";
import {SiteHeader} from "../site/SiteHeader";

export const metadata: Metadata = {title: "Design system · GRAD '26"};

const SWATCHES = [
  {token: "--brand-blue", cls: "blue", hex: "#1F4BB0", role: "Blue section surface, primary button on white, links on white"},
  {token: "--brand-blue-deep", cls: "blue-deep", hex: "#16378A", role: "Pill container, pressed states, footer band"},
  {token: "--brand-blue-soft", cls: "blue-soft", hex: "#E8EEFB", role: "Tinted panels, hover fills on white"},
  {token: "--brand-white", cls: "white", hex: "#FFFFFF", role: "Type on blue, white sections, active pill"},
  {token: "--brand-ink", cls: "ink", hex: "#0B1A3A", role: "Body text on white"},
  {token: "--brand-muted-on-blue", cls: "muted-on-blue", hex: "#B9C8EE", role: "Secondary text and labels on blue"},
  {token: "--brand-muted-on-white", cls: "muted-on-white", hex: "#5B6784", role: "Secondary text on white"},
  {token: "--brand-line-on-blue", cls: "line-on-blue", hex: "rgba(255,255,255,.18)", role: "Hairlines on blue"},
  {token: "--brand-line-on-white", cls: "line-on-white", hex: "#D9E0F0", role: "Hairlines on white"},
  {token: "--brand-accent", cls: "accent", hex: "#69E8D4", role: "Rare highlight, focus ring on blue (at most one per view)"},
  {token: "--brand-danger-on-white", cls: "danger-on-white", hex: "#B42318", role: "Status text on white"},
  {token: "--brand-danger-on-blue", cls: "danger-on-blue", hex: "#FFC2B8", role: "Status text on blue"},
  {token: "--brand-success-on-white", cls: "success-on-white", hex: "#0F7A3E", role: "Status text on white"},
  {token: "--brand-success-on-blue", cls: "success-on-blue", hex: "#8EF0B0", role: "Status text on blue"},
] as const;

const CONTRAST = [
  ["white", "blue", "7.80", "AA, AAA"],
  ["white", "blue-deep", "10.78", "AA, AAA"],
  ["ink", "white", "17.17", "AA, AAA"],
  ["ink", "blue-soft", "14.76", "AA, AAA"],
  ["muted-on-blue", "blue", "4.67", "AA"],
  ["muted-on-blue", "blue-deep", "6.45", "AA"],
  ["muted-on-white", "white", "5.65", "AA"],
  ["muted-on-white", "blue-soft", "4.86", "AA"],
  ["blue", "white", "7.80", "AA, AAA"],
  ["blue", "blue-soft", "6.71", "AA, AAA"],
  ["danger-on-white", "white", "6.57", "AA"],
  ["danger-on-blue", "blue", "5.08", "AA"],
  ["success-on-white", "white", "5.42", "AA"],
  ["success-on-blue", "blue", "5.66", "AA"],
  ["accent", "blue", "5.24", "AA (focus ring, non-text 3:1)"],
  ["accent", "blue-deep", "7.24", "AA"],
  ["accent", "white", "1.49", "Fails"],
] as const;

const TYPE = [
  {cls: "display", token: "--brand-text-display", sample: "Graduation, together"},
  {cls: "h1", token: "--brand-text-h1", sample: "Heading one"},
  {cls: "h2", token: "--brand-text-h2", sample: "Heading two"},
  {cls: "h3", token: "--brand-text-h3", sample: "Heading three"},
  {cls: "lead", token: "--brand-text-lead", sample: "A lead paragraph introduces the page in one or two calm sentences."},
  {cls: "body", token: "--brand-text-body", sample: "Body text is 16 to 18px with a 1.5 line height and stays within 70 characters per line."},
] as const;

const SPACE = [
  ["--space-1", "4px", "1"], ["--space-2", "8px", "2"], ["--space-3", "12px", "3"], ["--space-4", "16px", "4"],
  ["--space-5", "24px", "5"], ["--space-6", "32px", "6"], ["--space-7", "48px", "7"], ["--space-8", "64px", "8"],
] as const;

const DO = [
  "Use blue as a surface and alternate blue and white sections.",
  "Show one primary Cta per view.",
  "Let borders, spacing and type size carry hierarchy.",
  "Keep radii small: 2px and 4px.",
  "Use accent only as a rare highlight on blue, at most once per view.",
  "Use Geist Mono uppercase for small labels and sentence case for headlines.",
];
const DONT = [
  "No gradients, glass blur, glows or drop shadows.",
  "Never put accent on white: it is 1.49:1.",
  "No large rounded cards.",
  "No hard-coded colours: use brand tokens.",
  "No decorative emoji.",
  "Do not use muted-on-blue on any lighter blue surface.",
];

function Tone({label, children}: {label: string; children: ReactNode}) {
  return (
    <div className="brand-ds-row">
      <p className="brand-ds-row__label">{label}</p>
      <div className="brand-ds-row__items">{children}</div>
    </div>
  );
}

function Pills({title, tone = "on-blue"}: {title: string; tone?: "on-blue" | "on-white"}) {
  return (
    <PillGroup label={title} tone={tone}>
      <PillItem href="#pills" current>Home</PillItem>
      <PillItem href="#pills">Venue</PillItem>
      <PillItem href="#pills">Gallery</PillItem>
      <PillItem href="#pills">Wishes</PillItem>
    </PillGroup>
  );
}

function Toggles({title, tone}: {title: string; tone: "on-blue" | "on-white"}) {
  return (
    <PillGroup as="toggle" label={title} tone={tone}>
      <PillToggle pressed>Grid</PillToggle>
      <PillToggle pressed={false}>Carousel</PillToggle>
    </PillGroup>
  );
}

export default function DesignSystem() {
  return (
    <BrandTheme>
      <main className="brand-ds">
        <Section tone="blue" aria-labelledby="ds-intro">
          <BrandEyebrow ellipsis>GRAD &apos;26 / Blue and white</BrandEyebrow>
          <h1 id="ds-intro" className="brand-ds-title">Design system</h1>
          <p className="brand-ds-lead">The palette, type, spacing and primitives of the blue-and-white language, in one place for owner sign-off.</p>
          <p className="brand-ds-note">
            Brief: <code>docs/design/redesign-2026-10.md</code>. Epic:{" "}
            <a className="brand-ds-link" href="https://github.com/fuisl/vgu-graduation/issues/142">#142 on GitHub</a>.
          </p>
        </Section>

        <Section tone="white" aria-labelledby="ds-palette">
          <BrandEyebrow ellipsis>Palette</BrandEyebrow>
          <h2 id="ds-palette" className="brand-ds-h2">Colour</h2>
          <ul className="brand-ds-swatches">
            {SWATCHES.map((s) => (
              <li key={s.token} className="brand-ds-swatch">
                <span className={`brand-ds-chip brand-ds-chip--${s.cls}`} aria-hidden="true" />
                <span className="brand-ds-swatch__text">
                  <code>{s.token}</code>
                  <span className="brand-ds-swatch__hex">{s.hex}</span>
                  <span>{s.role}</span>
                </span>
              </li>
            ))}
          </ul>
          <h3 className="brand-ds-h3">Contrast</h3>
          <p className="brand-ds-note">WCAG 2.x relative luminance. Text needs 4.5:1. Accent on white fails: <strong>accent never on white</strong>.</p>
          <div className="brand-ds-scroll" role="region" aria-label="Contrast table" tabIndex={0}>
            <table className="brand-ds-table">
              <thead>
                <tr><th scope="col">Foreground</th><th scope="col">Background</th><th scope="col">Ratio</th><th scope="col">Result</th></tr>
              </thead>
              <tbody>
                {CONTRAST.map(([fg, bg, ratio, result]) => (
                  <tr key={`${fg}-${bg}`} className={result === "Fails" ? "brand-ds-fail" : undefined}>
                    <td>{fg}</td><td>{bg}</td><td>{ratio}</td>
                    <td>{result === "Fails" ? "Fail: never use accent on white" : `Pass ${result}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section tone="blue" aria-labelledby="ds-type">
          <BrandEyebrow ellipsis>Typography</BrandEyebrow>
          <h2 id="ds-type" className="brand-ds-h2">Inter Tight and Geist Mono</h2>
          <dl className="brand-ds-type">
            {TYPE.map((t) => (
              <div key={t.cls} className="brand-ds-type__row">
                <dt><code>{t.token}</code></dt>
                <dd className={`brand-ds-type__sample brand-ds-type__sample--${t.cls}`}>{t.sample}</dd>
              </div>
            ))}
          </dl>
          <h3 className="brand-ds-h3">Vietnamese</h3>
          <p className="brand-ds-lead" lang="vi">Chúc mừng tốt nghiệp, khóa 2026</p>
          <h3 className="brand-ds-h3">Labels</h3>
          <div className="brand-ds-stack">
            <BrandEyebrow>Software engineering</BrandEyebrow>
            <BrandEyebrow ellipsis>Software engineering</BrandEyebrow>
          </div>
        </Section>

        <Section tone="white" aria-labelledby="ds-space">
          <BrandEyebrow ellipsis>Spacing and radii</BrandEyebrow>
          <h2 id="ds-space" className="brand-ds-h2">Rhythm and shape</h2>
          <ul className="brand-ds-space">
            {SPACE.map(([token, px, n]) => (
              <li key={token} className="brand-ds-space__row">
                <code>{token}</code>
                <span className={`brand-ds-space__bar brand-ds-space__bar--${n}`} aria-hidden="true" />
                <span>{px}</span>
              </li>
            ))}
          </ul>
          <div className="brand-ds-radii">
            <div className="brand-ds-radius brand-ds-radius--sm"><code>--brand-radius-sm</code> 2px</div>
            <div className="brand-ds-radius brand-ds-radius--md"><code>--brand-radius</code> 4px</div>
          </div>
        </Section>

        <Section tone="blue" aria-labelledby="ds-on-blue">
          <BrandEyebrow ellipsis>Components</BrandEyebrow>
          <h2 id="ds-on-blue" className="brand-ds-h2">On blue</h2>
          <Tone label="Cta as link"><Cta tone="on-blue" href="#ctas">Your invitation</Cta></Tone>
          <Tone label="Cta as button"><Cta tone="on-blue">Your invitation</Cta></Tone>
          <Tone label="Cta secondary (outlined) and external">
            <Cta tone="on-blue" variant="secondary" href="#ctas">Back to gallery</Cta>
            <Cta tone="on-blue" variant="secondary" href="https://example.com" external>Directions</Cta>
          </Tone>
          <Tone label="Cta disabled (outlined)">
            <Cta tone="on-blue" disabled>Your invitation</Cta>
            <Cta tone="on-blue" href="#ctas" disabled>As a link</Cta>
          </Tone>
          <Tone label="PillGroup tone on-blue (deep-blue container)"><Pills title="Pills on blue" /></Tone>
          <Tone label="PillGroup as toggle (buttons, aria-pressed)"><Toggles title="Toggle on blue" tone="on-blue" /></Tone>
          <Tone label="BrandLogo compact, on-blue (header mark)"><span className="brand-ds-logo brand-ds-logo--compact"><BrandLogo variant="compact" tone="on-blue" /></span></Tone>
          <Tone label="BrandEyebrow"><BrandEyebrow ellipsis>Venue and time</BrandEyebrow></Tone>
          <Tone label="ArrowUpRightPixel"><span className="brand-ds-arrow"><ArrowUpRightPixel /></span></Tone>
          <p className="brand-ds-note">This band is itself a <code>{'Section tone="blue"'}</code>: full bleed, content in Container.</p>
        </Section>

        <Section tone="white" aria-labelledby="ds-on-white">
          <BrandEyebrow ellipsis>Components</BrandEyebrow>
          <h2 id="ds-on-white" className="brand-ds-h2">On white</h2>
          <Tone label="Cta as link"><Cta tone="on-white" href="#ctas">Your invitation</Cta></Tone>
          <Tone label="Cta as button"><Cta tone="on-white">Your invitation</Cta></Tone>
          <Tone label="Cta secondary (outlined) and external">
            <Cta tone="on-white" variant="secondary" href="#ctas">Back to gallery</Cta>
            <Cta tone="on-white" variant="secondary" href="https://example.com" external>Directions</Cta>
          </Tone>
          <Tone label="Cta disabled (outlined)">
            <Cta tone="on-white" disabled>Your invitation</Cta>
            <Cta tone="on-white" href="#ctas" disabled>As a link</Cta>
          </Tone>
          <Tone label="PillGroup tone on-white (blue-soft container, blue active pill)"><Pills title="Pills on white" tone="on-white" /></Tone>
          <Tone label="PillGroup as toggle (buttons, aria-pressed)"><Toggles title="Toggle on white" tone="on-white" /></Tone>
          <Tone label="BrandLogo compact and full, on-white">
            <span className="brand-ds-logo brand-ds-logo--compact"><BrandLogo variant="compact" tone="on-white" /></span>
            <span className="brand-ds-logo brand-ds-logo--full"><BrandLogo variant="full" tone="on-white" /></span>
          </Tone>
          <Tone label="BrandEyebrow"><BrandEyebrow ellipsis>Venue and time</BrandEyebrow></Tone>
          <Tone label="ArrowUpRightPixel"><span className="brand-ds-arrow"><ArrowUpRightPixel /></span></Tone>
          <p className="brand-ds-note">This band is a <code>{'Section tone="white"'}</code>.</p>
        </Section>

        <Section tone="white" aria-labelledby="ds-density">
          <BrandEyebrow ellipsis>Density</BrandEyebrow>
          <h2 id="ds-density" className="brand-ds-h2">Airy and compact</h2>
          <p className="brand-ds-note">
            <code>{'Section density="airy"'}</code> (default) pads about 6rem on desktop and 4rem on mobile.{" "}
            <code>{'density="compact"'}</code> pads about 3rem and 2rem, for forms, the invitation, RSVP and the gallery.
            Content is capped at <code>--brand-content</code> (1600px); reading text at <code>--brand-measure</code> (70ch).
          </p>
        </Section>
        <Section tone="blue" density="compact" aria-labelledby="ds-compact">
          <BrandEyebrow>Compact</BrandEyebrow>
          <h3 id="ds-compact" className="brand-ds-h3">Blue band, compact density</h3>
        </Section>
        <Section tone="white" density="airy" aria-labelledby="ds-airy">
          <BrandEyebrow>Airy</BrandEyebrow>
          <h3 id="ds-airy" className="brand-ds-h3">White band, airy density</h3>
        </Section>
        <Section tone="blue-deep" density="compact" aria-labelledby="ds-deep">
          <BrandEyebrow>Blue-deep</BrandEyebrow>
          <h3 id="ds-deep" className="brand-ds-h3">Blue-deep tone, compact density</h3>
        </Section>

        <Section tone="blue" aria-labelledby="ds-shell">
          <BrandEyebrow ellipsis>Site shell</BrandEyebrow>
          <h2 id="ds-shell" className="brand-ds-h2">Header and footer</h2>
          <p className="brand-ds-note">The real <code>SiteHeader</code> (compact mark only, Menu pill on mobile) and <code>SiteFooter</code> (deep-blue band, the only full wordmark), shown below.</p>
        </Section>
        <SiteHeader current="home" />
        <Section tone="white" density="compact" aria-labelledby="ds-shell-gap">
          <h3 id="ds-shell-gap" className="brand-ds-h3">Page content sits here</h3>
        </Section>
        <SiteFooter />

        <Section tone="blue" aria-labelledby="ds-chip">
          <BrandEyebrow ellipsis>Guest chip</BrandEyebrow>
          <h2 id="ds-chip" className="brand-ds-h2">Two states</h2>
          <p className="brand-ds-note">
            The header&apos;s right-hand action. Signed in, it shows the guest&apos;s animated blobatar (seeded by guest id, eyes follow the cursor, still under reduced motion) and first name. <code>GuestAvatar</code> is reusable for the profile (#139).
          </p>
          <div className="brand-ds-row">
            <p className="brand-ds-row__label">Signed out</p>
            <div className="brand-ds-row__items"><SignedOutChip /></div>
          </div>
          <div className="brand-ds-row">
            <p className="brand-ds-row__label">Signed in</p>
            <div className="brand-ds-row__items"><SignedInChip firstName="Linh" avatarSeed="3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70" /></div>
          </div>
        </Section>

        <Section tone="white" aria-labelledby="ds-dodont">
          <BrandEyebrow ellipsis>Rules</BrandEyebrow>
          <h2 id="ds-dodont" className="brand-ds-h2">Do and don&apos;t</h2>
          <div className="brand-ds-dodont">
            <div>
              <h3 className="brand-ds-h3">Do</h3>
              <ul className="brand-ds-list">{DO.map((d) => <li key={d}>{d}</li>)}</ul>
            </div>
            <div>
              <h3 className="brand-ds-h3">Don&apos;t</h3>
              <ul className="brand-ds-list">{DONT.map((d) => <li key={d}>{d}</li>)}</ul>
            </div>
          </div>
        </Section>
      </main>
    </BrandTheme>
  );
}
