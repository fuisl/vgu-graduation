import type { Metadata } from "next";
import { BrandEyebrow, BrandTheme, Cta, Section } from "@grad/ui";
import { getEvent } from "../../../../lib/api/event";
import { getPublicGallery, getPublicWishes } from "../../../../lib/api/public-memories";
import { publicApiOrigin } from "../../../../lib/calendar/links";
import { buildTimeline, formatClock, formatDay, type TimelineChapter } from "../../../../lib/memories/timeline";
import { SiteFooter } from "../../../site/SiteFooter";
import { SiteHeader } from "../../../site/SiteHeader";
import { MemoryPhoto } from "../MemoryPhoto";
import "../archive.css";
import "./timeline.css";

export const metadata: Metadata = {
  title: "Timeline | GRAD '26",
  description: "Graduation day for the VGU Class of 2026, in order: curated photos and wishes from arrival to celebration.",
};

/**
 * Cohort timeline (#76). Static and cached like /memories: the curated listings
 * (tags `gallery-public`, `wishes-public`) plus GET /event (tag `event`) for the
 * chapter boundaries. If the event config is unavailable it falls back to days
 * or hours instead of failing.
 */
export const revalidate = 60;

/** The first photo entry loads eagerly; the rest lazily as the guest scrolls. */
const EAGER_ENTRIES = 1;

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function chapterSummary(chapter: TimelineChapter): string {
  const parts = [];
  if (chapter.photoCount) parts.push(plural(chapter.photoCount, "photo", "photos"));
  if (chapter.wishCount) parts.push(plural(chapter.wishCount, "wish", "wishes"));
  return parts.join(" · ");
}

export default async function TimelinePage() {
  const [gallery, wishes, eventResult] = await Promise.all([getPublicGallery(), getPublicWishes(), getEvent()]);
  const origin = publicApiOrigin();
  const event = eventResult.status === "ok" ? eventResult.data : null;
  const failed = gallery.status !== "ok" && wishes.status !== "ok";
  const partial = !failed && (gallery.status !== "ok" || wishes.status !== "ok");
  const timeline = buildTimeline({
    photos: gallery.status === "ok" ? gallery.data.items : [],
    wishes: wishes.status === "ok" ? wishes.data.items : [],
    event,
  });
  const { chapters, timeZone } = timeline;
  let photoEntriesSeen = 0;

  return (
    <BrandTheme>
      <SiteHeader />
      <main>
        <Section tone="blue" aria-labelledby="timeline-title">
          <div className="mem-hero">
            <BrandEyebrow ellipsis>Archive / Timeline</BrandEyebrow>
            <h1 id="timeline-title" className="mem-title">The day, in order.</h1>
            <p className="mem-lead">
              {event ? `${formatDay(event.startsAt, timeZone)} at ${event.venue.name}. ` : null}
              Curated photos and wishes, from arrival to the last goodbye.
            </p>
            <Cta tone="on-blue" variant="secondary" href="/memories">Back to the archive</Cta>
          </div>
        </Section>

        <Section tone="white" density="compact" aria-labelledby="timeline-chapters-title">
          <BrandEyebrow>Chapters</BrandEyebrow>
          <h2 id="timeline-chapters-title" className="arc-h2">
            {chapters.length > 0 ? plural(chapters.length, "chapter", "chapters") : "Nothing curated yet"}
          </h2>

          {failed ? (
            <p className="arc-state" role="status">
              The timeline is temporarily unavailable. <a className="arc-link" href="/memories/timeline">Try again</a>.
            </p>
          ) : chapters.length === 0 ? (
            <div className="tl-empty">
              <p className="arc-state">
                The timeline fills in after the ceremony, once the organizers choose photos and wishes for the archive.
                Until then, everything guests share is in the event gallery.
              </p>
              <div className="arc-actions">
                <Cta tone="on-white" variant="secondary" href="/gallery">Event gallery</Cta>
                <a className="arc-link arc-link--tap" href="/wishes">Guestbook</a>
              </div>
            </div>
          ) : (
            <>
              {partial ? (
                <p className="mem-status mem-status--notice" role="status">
                  Some memories could not be loaded. Showing the ones that are available.
                </p>
              ) : null}
              <div className="tl-layout">
              <nav className="tl-index" aria-label="Chapters">
                <ol>
                  {chapters.map((chapter) => (
                    <li key={chapter.id}>
                      <a href={`#${chapter.id}`}>
                        <span className="tl-index__title">{chapter.title}</span>
                        <span className="tl-index__range">{chapter.range}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>

              <div className="tl-chapters">
                {chapters.map((chapter) => (
                  <section key={chapter.id} id={chapter.id} className="tl-chapter" aria-labelledby={`${chapter.id}-title`}>
                    <header className="tl-chapter__head">
                      <BrandEyebrow>{chapter.range}</BrandEyebrow>
                      <h3 id={`${chapter.id}-title`} className="tl-chapter__title">{chapter.title}</h3>
                      <p className="tl-chapter__summary">{chapterSummary(chapter)}</p>
                    </header>
                    <ol className="tl-entries">
                      {chapter.entries.map((entry) => {
                        const clock = formatClock(entry.at, timeZone);
                        if (entry.kind === "wish") {
                          return (
                            <li key={entry.id} className="tl-entry">
                              <time className="tl-time" dateTime={entry.at}>{clock}</time>
                              <figure className="tl-wish">
                                <blockquote className="tl-wish__body">{entry.wish.body}</blockquote>
                                <figcaption className="tl-wish__author">{entry.wish.authorName}</figcaption>
                              </figure>
                            </li>
                          );
                        }
                        const eager = photoEntriesSeen < EAGER_ENTRIES;
                        photoEntriesSeen += 1;
                        const single = entry.photos.length === 1;
                        return (
                          <li key={entry.id} className="tl-entry">
                            <time className="tl-time" dateTime={entry.at}>{clock}</time>
                            <ul className={single ? "tl-photos tl-photos--single" : "tl-photos"}>
                              {entry.photos.map((photo) => (
                                <li key={photo.publicId}>
                                  <MemoryPhoto
                                    className="tl-photo"
                                    photo={photo}
                                    origin={origin}
                                    sizes={single ? "(max-width: 960px) 88vw, 560px" : "(max-width: 960px) 44vw, 240px"}
                                    alt={`Guest photo, ${formatClock(photo.createdAt, timeZone)}`}
                                    eager={eager}
                                  />
                                </li>
                              ))}
                            </ul>
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                ))}
              </div>
              </div>
            </>
          )}
        </Section>
      </main>
      <SiteFooter />
    </BrandTheme>
  );
}
