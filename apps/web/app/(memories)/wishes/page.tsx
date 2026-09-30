import type {Metadata} from "next";
import Link from "next/link";
import {BrandEyebrow, BrandTheme, Section} from "@grad/ui";
import {SiteFooter} from "../../site/SiteFooter";
import {SiteHeader} from "../../site/SiteHeader";
import {WishForm} from "./WishForm";

export const metadata: Metadata = {title: "Guestbook | GRAD '26"};

export default function WishesPage() {
  return (
    <BrandTheme>
      <SiteHeader current="wishes" />
      <main>
        <Section tone="blue" aria-labelledby="wishes-title">
          <div className="mem-hero">
            <BrandEyebrow ellipsis>Guestbook / Digital locket</BrandEyebrow>
            <h1 id="wishes-title" className="mem-title">Leave a memory.</h1>
            <Link className="mem-link" href="/polaroid">Take a disposable photo instead</Link>
          </div>
        </Section>
        <Section tone="white" density="compact" narrow>
          <WishForm />
        </Section>
      </main>
      <SiteFooter />
    </BrandTheme>
  );
}
