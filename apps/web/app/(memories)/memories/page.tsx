import type { Metadata } from "next";
import { BrandTheme, Cta, Section } from "@grad/ui";
import { getPublicGallery, getPublicWishes } from "../../../lib/api/public-memories";
import { publicApiOrigin } from "../../../lib/calendar/links";
import type { I18n } from "../../../lib/i18n/dictionary";
import { formatRich } from "../../../lib/i18n/format";
import { getI18n } from "../../../lib/i18n/server";
import { DEFAULT_TIME_ZONE, formatClock, formatDay } from "../../../lib/memories/timeline";
import { SiteFooter } from "../../site/SiteFooter";
import { SiteHeader } from "../../site/SiteHeader";
import { MemoryPhoto } from "./MemoryPhoto";
import "./archive.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("memories.metaTitle"), description: t("memories.metaDescription") };
}

/**
 * Curated public archive (#75). It reads only the curated GET /gallery/public and
 * GET /wishes/public listings, cached in the fetch cache (tags `gallery-public` and
 * `wishes-public`), so an admin's public-flag or takedown reaches this page too.
 * Rendered per request in the guest's language (#9, ADR-010), so there is no page-level
 * revalidate: the listings themselves stay cached. Kept short: a headline, the timeline, the photos, the wishes.
 */

/** Photos above the fold on a phone (two rows of two) load eagerly. */
const EAGER_PHOTOS = 4;

function photoAlt(createdAt: string, { t, intl }: I18n): string {
  return t("memories.photoAlt", {
    day: formatDay(createdAt, DEFAULT_TIME_ZONE, intl),
    time: formatClock(createdAt, DEFAULT_TIME_ZONE),
  });
}

export default async function MemoriesPage() {
  const [gallery, wishes, i18n] = await Promise.all([getPublicGallery(), getPublicWishes(), getI18n()]);
  const { t } = i18n;
  const origin = publicApiOrigin();
  const photos = gallery.status === "ok" ? gallery.data.items : null;
  const words = wishes.status === "ok" ? wishes.data.items : null;
  const nothingCurated = photos !== null && words !== null && photos.length === 0 && words.length === 0;

  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <main id="main">
        <Section tone="blue" aria-labelledby="memories-title">
          <div className="mem-hero">
            <h1 id="memories-title" className="mem-title">{t("memories.title")}</h1>
            {nothingCurated ? (
              <Cta tone="on-blue" href="/gallery">{t("memories.openGallery")}</Cta>
            ) : (
              <Cta tone="on-blue" href="/memories/timeline">{t("memories.walkTimeline")}</Cta>
            )}
          </div>
        </Section>

        {nothingCurated ? (
          <Section tone="white" density="compact" aria-labelledby="memories-empty-title">
            <h2 id="memories-empty-title" className="arc-h2">{t("memories.empty.title")}</h2>
            <p className="arc-state">{t("memories.empty.body")}</p>
          </Section>
        ) : (
          <>
            <Section tone="white" density="compact" aria-labelledby="memories-photos-title">
              <h2 id="memories-photos-title" className="arc-h2">
                {t("memories.photos.title")}{photos && photos.length > 0 ? <span className="arc-count"> {photos.length}</span> : null}
              </h2>
              {photos === null ? (
                <p className="arc-state" role="status">
                  {formatRich(t("memories.photos.unavailable"), {
                    retry: <a className="arc-link" href="/memories">{t("common.tryAgain")}</a>,
                  })}
                </p>
              ) : photos.length === 0 ? (
                <p className="arc-state">{t("memories.photos.empty")}</p>
              ) : (
                <ul className="arc-photos">
                  {photos.map((photo, index) => (
                    <li key={photo.publicId}>
                      <MemoryPhoto
                        className="arc-photo"
                        photo={photo}
                        origin={origin}
                        sizes="(max-width: 960px) 50vw, 300px"
                        alt={photoAlt(photo.createdAt, i18n)}
                        eager={index < EAGER_PHOTOS}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {gallery.status === "ok" && gallery.data.truncated ? (
                <p className="arc-state arc-state--note">{t("memories.photos.truncated", { count: photos?.length ?? 0 })}</p>
              ) : null}
            </Section>

            <Section tone="blue" aria-labelledby="memories-wishes-title">
              <h2 id="memories-wishes-title" className="arc-h2">{t("memories.wishes.title")}</h2>
              {words === null ? (
                <p className="arc-state" role="status">
                  {formatRich(t("memories.wishes.unavailable"), {
                    retry: <a className="arc-link" href="/memories">{t("common.tryAgain")}</a>,
                  })}
                </p>
              ) : words.length === 0 ? (
                <p className="arc-state">{t("memories.wishes.empty")}</p>
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
          </>
        )}
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
