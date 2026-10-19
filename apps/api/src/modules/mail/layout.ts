import type { MailLocale } from "@grad/contract";

/*
 * The brand email layout (ADR-013): the site's blue-and-white theme
 * (packages/design-tokens/src/brand.css) in email-safe HTML. Tables and inline
 * styles only, one 600px column that shrinks to the phone, no script, no
 * tracking. Inter Tight and Geist Mono load where the client allows web fonts
 * (Apple Mail, iOS, Thunderbird); Gmail and Outlook fall back to Arial and the
 * system monospace. Every email also carries the same content as plain text,
 * rendered from the same blocks.
 */

/** packages/design-tokens/src/brand.css, copied: email can't read CSS variables. */
export const BRAND = {
  blue: "#1f4bb0",
  blueDeep: "#16378a",
  blueSoft: "#e8eefb",
  white: "#ffffff",
  ink: "#0b1a3a",
  mutedOnBlue: "#b9c8ee",
  mutedOnWhite: "#5b6784",
  lineOnWhite: "#d9e0f0",
  accent: "#69e8d4",
} as const;

const SANS = "'Inter Tight', Arial, Helvetica, sans-serif";
const MONO = "'Geist Mono', ui-monospace, Menlo, Consolas, monospace";
const FONTS_URL = "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;700&family=Geist+Mono:wght@400&display=swap";

/** One language's part of an email. Strings are plain text; the renderer escapes them. */
export interface EmailSection {
  lang: MailLocale;
  greeting?: string;
  paragraphs: string[];
  /** Label and value rows, e.g. When / Where. */
  facts?: [string, string][];
  cta?: { label: string; href: string };
  /** Smaller lines under the button: a privacy note, a fallback link. */
  notes?: string[];
  signOff: string[];
}

export interface EmailContent {
  subject: string;
  /** The inbox preview line; hidden in the body. */
  preheader: string;
  /** The big heading in the blue band (the event name). */
  title: string;
  /** The line under it (the date). */
  subtitle?: string;
  sections: EmailSection[];
  /** The public site, for the logo and the footer link. */
  siteUrl: string;
}

const LANGUAGE_NAMES: Record<MailLocale, string> = { vi: "Tiếng Việt", en: "English" };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s) links are rendered as links; anything else becomes plain text. */
function safeHref(href: string): string | null {
  return /^https?:\/\//i.test(href) || /^webcal:\/\//i.test(href) ? escapeHtml(href) : null;
}

/** Text with bare URLs turned into links, escaped. */
function linkify(text: string, color: string): string {
  return text
    .split(/(\b(?:https?|webcal):\/\/[^\s<>"']+)/g)
    .map((part, i) =>
      i % 2 === 1
        ? `<a href="${escapeHtml(part)}" style="color:${color};text-decoration:underline;word-break:break-all">${escapeHtml(part)}</a>`
        : escapeHtml(part),
    )
    .join("");
}

function button(cta: { label: string; href: string }): string {
  const href = safeHref(cta.href);
  if (!href) return "";
  // The brand CTA: a blue button with a white square tile holding the arrow.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px">
<tr><td style="background:${BRAND.blue};border-radius:4px">
<a href="${href}" style="display:block;text-decoration:none;color:${BRAND.white};font-family:${SANS};font-size:16px;font-weight:500;line-height:44px;mso-line-height-rule:exactly">
<span style="display:inline-block;padding:0 16px;vertical-align:middle">${escapeHtml(cta.label)}</span><span style="display:inline-block;width:36px;height:36px;margin:4px 4px 4px 0;background:${BRAND.white};border-radius:2px;color:${BRAND.blue};text-align:center;line-height:36px;vertical-align:middle;font-size:18px">&#8599;</span>
</a></td></tr></table>`;
}

function section(content: EmailSection, index: number): string {
  const p = (text: string) =>
    `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:1.5;color:${BRAND.ink}">${linkify(text, BRAND.blue)}</p>`;
  const label = `<p style="margin:0 0 16px;font-family:${MONO};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.mutedOnWhite}">${LANGUAGE_NAMES[content.lang]}</p>`;
  const facts = content.facts?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 8px;border-top:1px solid ${BRAND.lineOnWhite}">${content.facts
        .map(
          ([name, value]) => `<tr>
<td valign="top" style="padding:12px 16px 12px 0;width:96px;font-family:${MONO};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.mutedOnWhite};border-bottom:1px solid ${BRAND.lineOnWhite}">${escapeHtml(name)}</td>
<td valign="top" style="padding:12px 0;font-family:${SANS};font-size:16px;line-height:1.4;color:${BRAND.ink};border-bottom:1px solid ${BRAND.lineOnWhite}">${linkify(value, BRAND.blue)}</td>
</tr>`,
        )
        .join("")}</table>`
    : "";
  const notes = (content.notes ?? [])
    .map(
      (note) =>
        `<p style="margin:0 0 8px;font-family:${SANS};font-size:14px;line-height:1.5;color:${BRAND.mutedOnWhite}">${linkify(note, BRAND.blue)}</p>`,
    )
    .join("");
  const signOff = `<p style="margin:24px 0 0;font-family:${SANS};font-size:16px;line-height:1.5;color:${BRAND.ink}">${content.signOff
    .map((line) => linkify(line, BRAND.blue))
    .join("<br>")}</p>`;
  return `<tr><td lang="${content.lang}" style="padding:32px 32px 32px;${index > 0 ? `border-top:1px solid ${BRAND.lineOnWhite};` : ""}" class="pad">
${label}${content.greeting ? p(content.greeting) : ""}${content.paragraphs.map(p).join("")}${facts}${content.cta ? button(content.cta) : ""}${notes}${signOff}
</td></tr>`;
}

/** The HTML body: blue header band, white sections per language, a quiet footer. */
export function renderHtml(content: EmailContent): string {
  const logo = `${content.siteUrl}/brand/logo-compact-on-blue.png`;
  const lang = content.sections[0]?.lang ?? "en";
  return `<!doctype html>
<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(content.subject)}</title>
<link href="${FONTS_URL}" rel="stylesheet">
<style>
@media (max-width: 620px) {
  .pad { padding-left: 20px !important; padding-right: 20px !important; }
  .title { font-size: 32px !important; }
}
a { color: ${BRAND.blue}; }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.blueSoft};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BRAND.blueSoft}">${escapeHtml(content.preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND.blueSoft}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background:${BRAND.white};border-radius:4px;overflow:hidden">
<tr><td class="pad" style="background:${BRAND.blue};padding:28px 32px 32px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:middle;padding-right:12px"><img src="${escapeHtml(logo)}" width="32" height="32" alt="" style="display:block;border:0"></td>
<td style="vertical-align:middle;font-family:${MONO};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.mutedOnBlue}">GRAD '26</td>
</tr></table>
<h1 class="title" style="margin:24px 0 0;font-family:${SANS};font-size:40px;line-height:1.02;letter-spacing:-0.03em;font-weight:700;color:${BRAND.white}">${escapeHtml(content.title)}</h1>
${content.subtitle ? `<p style="margin:12px 0 0;font-family:${SANS};font-size:18px;line-height:1.4;color:${BRAND.white}">${escapeHtml(content.subtitle)}</p>` : ""}
<div style="margin-top:24px;width:48px;height:4px;background:${BRAND.accent};font-size:0;line-height:0">&nbsp;</div>
</td></tr>
${content.sections.map(section).join("\n")}
<tr><td class="pad" style="background:${BRAND.blueSoft};padding:20px 32px;font-family:${MONO};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.mutedOnWhite}">
<a href="${escapeHtml(content.siteUrl)}" style="color:${BRAND.mutedOnWhite};text-decoration:none">${escapeHtml(new URL(content.siteUrl).host)}</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}

/** The plain-text alternative, from the same blocks. */
export function renderText(content: EmailContent): string {
  const parts = content.sections.map((s) =>
    [
      s.greeting,
      ...s.paragraphs,
      s.facts?.map(([name, value]) => `${name}: ${value}`).join("\n"),
      s.cta ? `${s.cta.label}:\n${s.cta.href}` : undefined,
      ...(s.notes ?? []),
      s.signOff.join("\n"),
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n\n"),
  );
  return `${parts.join("\n\n— — —\n\n")}\n`;
}
