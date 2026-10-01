/**
 * Pixel-style paper plane on a 24x24 grid of 2-unit pixels, decorative (aria-hidden).
 * The "send" icon from pixelarticons by Gerrit Halfmann (MIT, https://pixelarticons.com).
 * Pass it to Cta's `icon` for send actions; it shares the arrow's class, so it sizes and nudges the same.
 */
export function PaperPlanePixel() {
  return (
    <svg className="brand-arrow brand-arrow--plane" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M4 19h4v2H2v-8h2v6Zm8 0H8v-2h4v2Zm4-2h-4v-2h4v2Zm4-2h-4v-2h4v2Zm-10-2H4v-2h6v2Zm12 0h-2v-2h2v2ZM8 5H4v6H2V3h6v2Zm12 6h-4V9h4v2Zm-4-2h-4V7h4v2Zm-4-2H8V5h4v2Z" />
    </svg>
  );
}
