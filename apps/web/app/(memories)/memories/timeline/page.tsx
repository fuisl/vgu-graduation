import type { Metadata } from "next";
import { BrandEyebrow, BrandTheme, Cta, Section } from "@grad/ui";
import { getEvent } from "../../../../lib/api/event";
import { localizeEvent } from "../../../../lib/i18n/event";
import { getPublicGallery, getPublicWishes } from "../../../../lib/api/public-memories";
import { publicApiOrigin } from "../../../../lib/calendar/links";
import type { I18n } from "../../../../lib/i18n/dictionary";
import { formatRich } from "../../../../lib/i18n/format";
import { getI18n } from "../../../../lib/i18n/server";
import { buildTimeline, formatClock, type TimelineChapter } from "../../../../lib/memories/timeline";
import { SiteFooter } from "../../../site/SiteFooter";
import { SiteHeader } from "../../../site/SiteHeader";
import { MemoryPhoto } from "../MemoryPhoto";
import "../archive.css";
import "./timeline.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("timeline.metaTitle"), description: t("timeline.metaDescription") };
}

/**
 * Cohort timeline (#76). Like /memories: the curated listings (tags
 * `gallery-public`, `wishes-public`) plus GET /event (tag `event`) for the
 * chapter boundaries, all from the fetch cache; the page itself renders per
 * request in the guest's language (#9). If the event config is unavailable it
 * falls back to days or hours instead of failing.
 */

/** The first photo entry loads eagerly; the rest lazily as the guest scrolls. */
const EAGER_ENTRIES = 1;

function chapterSummary(chapter: TimelineChapter, { t }: I18n): string {
  const parts = [];
  if (chapter.photoCount) parts.push(t.plural("timeline.photos", chapter.photoCount));
  if (chapter.wishCount) parts.push(t.plural("timeline.wishes", chapter.wishCount));
  return parts.join(" · ");
}

export default async function TimelinePage() {
  const [gallery, wishes, eventResult, i18n] = await Promise.all([getPublicGallery(), getPublicWishes(), getEvent(), getI18n()]);
  const { t } = i18n;
  const origin = publicApiOrigin();
  const event = eventResult.status === "ok" ? localizeEvent(eventResult.data, i18n.locale) : null;
  const failed = gallery.status !== "ok" && wishes.status !== "ok";
  const partial = !failed && (gallery.status !== "ok" || wishes.status !== "ok");
  const timeline = buildTimeline({
    photos: gallery.status === "ok" ? gallery.data.items : [],
    wishes: wishes.status === "ok" ? wishes.data.items : [],
    event,
    i18n,
  });
  const { chapters, timeZone } = timeline;
  let photoEntriesSeen = 0;

  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <main id="main">
        <Section tone="blue" aria-labelledby="timeline-title">
          <div className="mem-hero">
            <h1 id="timeline-title" className="mem-title">{t("timeline.title")}</h1>
          </div>
        </Section>

        <Section tone="white" density="compact" aria-labelledby="timeline-chapters-title">
          <h2 id="timeline-chapters-title" className="arc-h2">
            {chapters.length > 0 ? t.plural("timeline.chapterCount", chapters.length) : t("memories.empty.title")}
          </h2>

          {failed ? (
            <p className="arc-state" role="status">
              {formatRich(t("timeline.unavailable"), {
                retry: <a className="arc-link" href="/memories/timeline">{t("common.tryAgain")}</a>,
              })}
            </p>
          ) : chapters.length === 0 ? (
            <div className="tl-empty">
              <p className="arc-state">{t("timeline.empty")}</p>
              <Cta tone="on-white" variant="secondary" href="/gallery">{t("memories.openGallery")}</Cta>
            </div>
          ) : (
            <>
              {partial ? (
                <p className="mem-status mem-status--notice" role="status">{t("timeline.partial")}</p>
              ) : null}
              <div className="tl-layout">
              <nav className="tl-index" aria-label={t("timeline.chapters")}>
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
                      <p className="tl-chapter__summary">{chapterSummary(chapter, i18n)}</p>
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
                                    alt={t("timeline.photoAlt", { time: formatClock(photo.createdAt, timeZone) })}
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
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
