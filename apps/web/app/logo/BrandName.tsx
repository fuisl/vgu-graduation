import { BrandLogo } from "./BrandLogo";

/**
 * Header logo for the existing dark and blue surfaces (landing, memories, guest
 * prototype). Kept as a wrapper so those call sites keep working until they move
 * to the shared SiteHeader (#145); new code should use BrandLogo directly.
 */
export function BrandName() {
  return (
    <span className="brand-logo">
      <BrandLogo variant="full" tone="on-blue" />
    </span>
  );
}
