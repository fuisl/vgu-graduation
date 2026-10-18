/**
 * Site-wide text size (#176). The choice is a `data-text-size` attribute on <html>;
 * globals.css raises the root font size for it, and every brand size is in rem, so
 * type, spacing and Cta labels scale together. "default" removes the attribute and
 * leaves the browser's own setting alone. Remembered per device in localStorage.
 */
export const TEXT_SIZES = ["default", "large", "largest"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  default: "Default",
  large: "Large",
  largest: "Largest",
};

export const TEXT_SIZE_STORAGE_KEY = "grad26.textSize";
export const TEXT_SIZE_ATTRIBUTE = "data-text-size";

export function parseTextSize(value: unknown): TextSize {
  return typeof value === "string" && (TEXT_SIZES as readonly string[]).includes(value) ? (value as TextSize) : "default";
}

/** Sets or clears the attribute on the root element. */
export function applyTextSize(root: Element, size: TextSize): void {
  if (size === "default") root.removeAttribute(TEXT_SIZE_ATTRIBUTE);
  else root.setAttribute(TEXT_SIZE_ATTRIBUTE, size);
}

/**
 * Inline script for <head>: applies the stored size before first paint, so a guest who
 * chose "Largest" never sees the page jump. No user data, never throws (private mode).
 */
export const TEXT_SIZE_BOOT_SCRIPT =
  `try{var s=localStorage.getItem(${JSON.stringify(TEXT_SIZE_STORAGE_KEY)});` +
  `if(s==="large"||s==="largest")document.documentElement.setAttribute(${JSON.stringify(TEXT_SIZE_ATTRIBUTE)},s)}catch(e){}`;
