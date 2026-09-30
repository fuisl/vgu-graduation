import type {Metadata} from "next";
import {BrandEyebrow, BrandTheme, Cta, Section} from "@grad/ui";
import {SiteFooter} from "../../site/SiteFooter";
import {SiteHeader} from "../../site/SiteHeader";
import {CameraPanel} from "./CameraPanel";

export const metadata: Metadata = {title: "Disposable camera | GRAD '26"};

/** Not a nav item (the brief keeps four); reached from Gallery and Wishes. */
export default function PolaroidPage() {
  return (
    <BrandTheme>
      <SiteHeader />
      <main>
        <Section tone="blue" aria-labelledby="polaroid-title">
          <div className="mem-hero">
            <BrandEyebrow ellipsis>1-take / Polaroid</BrandEyebrow>
            <h1 id="polaroid-title" className="mem-title">Snap a memory.</h1>
            <Cta tone="on-blue" variant="secondary" href="/gallery">Back to the gallery</Cta>
          </div>
        </Section>
        <Section tone="white" density="compact" narrow>
          <CameraPanel />
        </Section>
      </main>
      <SiteFooter />
    </BrandTheme>
  );
}
