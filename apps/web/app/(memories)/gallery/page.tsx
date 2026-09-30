import type {Metadata} from "next";
import Link from "next/link";
import {BrandEyebrow, BrandTheme, Section} from "@grad/ui";
import {SiteFooter} from "../../site/SiteFooter";
import {SiteHeader} from "../../site/SiteHeader";
import {GalleryView} from "./GalleryView";

export const metadata: Metadata = {title: "Gallery | GRAD '26"};

export default function GalleryPage() {
  return (
    <BrandTheme>
      <SiteHeader current="gallery" />
      <main>
        <Section tone="blue" aria-labelledby="gallery-title">
          <div className="mem-hero">
            <BrandEyebrow ellipsis>Archive / All memories</BrandEyebrow>
            <h1 id="gallery-title" className="mem-title">Digital Locket.</h1>
            <Link className="mem-link" href="/polaroid">Take a disposable photo</Link>
          </div>
        </Section>
        <Section tone="white" density="compact">
          <GalleryView />
        </Section>
      </main>
      <SiteFooter />
    </BrandTheme>
  );
}
