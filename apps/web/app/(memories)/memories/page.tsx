import type { Metadata } from "next";
import { BrandEyebrow, BrandTheme, Cta, Section } from "@grad/ui";
import { getPublicGallery, getPublicWishes } from "../../../lib/api/public-memories";
import { publicApiOrigin } from "../../../lib/calendar/links";
import { DEFAULT_TIME_ZONE, formatClock, formatDay } from "../../../lib/memories/timeline";
import { SiteFooter } from "../../site/SiteFooter";
import { SiteHeader } from "../../site/SiteHeader";
import { MemoryPhoto } from "./MemoryPhoto";
import "./archive.css";

export const metadata: Metadata = {
  title: "Memories | GRAD '26",
  description: "The curated archive of the VGU Class of 2026 graduation: photos and wishes chosen by the organizers.",
};

/**
 * Curated public archive (#75). Static and cached on Vercel: it reads only the
 * curated GET /gallery/public and GET /wishes/public listings (tags
 * `gallery-public` and `wishes-public`), so an admin's public-flag or takedown
 * revalidates this page too. The event gallery at /gallery stays as it is.
 */
export const revalidate = 60;

/** Photos above the fold on a phone (two rows of two) load eagerly. */
const EAGER_PHOTOS = 4;

function photoAlt(createdAt: string): string {
  return `Guest photo, ${formatDay(createdAt, DEFAULT_TIME_ZONE)}, ${formatClock(createdAt, DEFAULT_TIME_ZONE)}`;
}

export default async function MemoriesPage() {
  const [gallery, wishes] = await Promise.all([getPublicGallery(), getPublicWishes()]);
  const origin = publicApiOrigin();
  const photos = gallery.status === "ok" ? gallery.data.items : null;
  const words = wishes.status === "ok" ? wishes.data.items : null;
  const nothingCurated = photos !== null && words !== null && photos.length === 0 && words.length === 0;

  return (
    <BrandTheme>
      <SiteHeader />
      <main>
        <Section tone="blue" aria-labelledby="memories-title">
          <div className="mem-hero">
            <BrandEyebrow ellipsis>Archive / Curated</BrandEyebrow>
            <h1 id="memories-title" className="mem-title">Class of 2026, remembered.</h1>
            <p className="mem-lead">
              Photos and wishes from graduation day, chosen by the organizers and kept for the four-year archive.
            </p>
            <div className="arc-actions">
              {nothingCurated ? (
                <Cta tone="on-blue" href="/gallery">Open the event gallery</Cta>
              ) : (
                <>
                  <Cta tone="on-blue" href="/memories/timeline">Walk the timeline</Cta>
                  <Cta tone="on-blue" variant="secondary" href="/gallery">Event gallery</Cta>
                </>
              )}
            </div>
          </div>
        </Section>

        {nothingCurated ? (
          <Section tone="white" density="compact" aria-labelledby="memories-empty-title">
            <BrandEyebrow>After the ceremony</BrandEyebrow>
            <h2 id="memories-empty-title" className="arc-h2">Nothing curated yet</h2>
            <p className="arc-state">
              After the ceremony the organizers choose photos and wishes for this public archive. Until then, everything guests
              share is in the <a className="arc-link" href="/gallery">event gallery</a> and the{" "}
              <a className="arc-link" href="/wishes">guestbook</a>.
            </p>
          </Section>
        ) : (
          <>
            <Section tone="white" density="compact" aria-labelledby="memories-photos-title">
              <BrandEyebrow>Photos</BrandEyebrow>
              <h2 id="memories-photos-title" className="arc-h2">
                From the day{photos && photos.length > 0 ? <span className="arc-count"> {photos.length}</span> : null}
              </h2>
              {photos === null ? (
                <p className="arc-state" role="status">
                  The archive photos are temporarily unavailable. <a className="arc-link" href="/memories">Try again</a>.
                </p>
              ) : photos.length === 0 ? (
                <p className="arc-state">No photos have been curated yet.</p>
              ) : (
                <ul className="arc-photos">
                  {photos.map((photo, index) => (
                    <li key={photo.publicId}>
                      <MemoryPhoto
                        className="arc-photo"
                        photo={photo}
                        origin={origin}
                        sizes="(max-width: 960px) 50vw, 300px"
                        alt={photoAlt(photo.createdAt)}
                        eager={index < EAGER_PHOTOS}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {gallery.status === "ok" && gallery.data.truncated ? (
                <p className="arc-state arc-state--note">Showing the most recent {photos?.length} photos.</p>
              ) : null}
            </Section>

            <Section tone="blue" aria-labelledby="memories-wishes-title">
              <BrandEyebrow>Wishes</BrandEyebrow>
              <h2 id="memories-wishes-title" className="arc-h2">Words for the class</h2>
              {words === null ? (
                <p className="arc-state" role="status">
                  The archive wishes are temporarily unavailable. <a className="arc-link" href="/memories">Try again</a>.
                </p>
              ) : words.length === 0 ? (
                <p className="arc-state">No wishes have been curated yet.</p>
              ) : (
                <ul className="arc-wishes">
                  {words.map((wish) => (
                    <li key={wish.id} className="arc-wish">
                      <blockquote className="arc-wish__body">{wish.body}</blockquote>
                      <p className="arc-wish__author">{wish.authorName}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section tone="white" density="compact" aria-labelledby="memories-more-title">
              <BrandEyebrow>Everything else</BrandEyebrow>
              <h2 id="memories-more-title" className="arc-h2">The whole day</h2>
              <p className="arc-state">
                This archive is a selection. Everything guests shared on the day stays in the event gallery and the guestbook.
              </p>
              <div className="arc-actions">
                <Cta tone="on-white" variant="secondary" href="/memories/timeline">Open the timeline</Cta>
                <Cta tone="on-white" variant="secondary" href="/gallery">Event gallery</Cta>
                <a className="arc-link arc-link--tap" href="/wishes">Guestbook</a>
              </div>
            </Section>
          </>
        )}
      </main>
      <SiteFooter />
    </BrandTheme>
  );
}
