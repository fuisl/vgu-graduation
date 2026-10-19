"use client";

/* Gallery derivatives are already resized, immutable JPEGs from the media API; a Next image proxy would add an unnecessary hop. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { Cta, PillGroup, PillToggle } from "@grad/ui";
import type { GalleryItem } from "../../../data/gallery";
import { sliceTranslator, type MessageSlice, type SliceTranslator } from "../../../lib/i18n/format";
import { PrintRequest, usePrintAvailability } from "./PrintRequest";
import "./gallery.css";

/** `pickMessages(locale, "gallery.", "print.")`: the gallery and its print action in the guest's language (#9). */
type GalleryMessages = MessageSlice<"gallery." | "print.">;
type T = SliceTranslator<keyof GalleryMessages>;

type Filter = "ALL" | "WISHES" | "POLAROIDS";
type ViewMode = "GRID" | "CAROUSEL";
type GridSize = "S" | "M" | "L";

const FILTERS: { value: Filter; label: keyof GalleryMessages }[] = [
  { value: "ALL", label: "gallery.filter.all" },
  { value: "WISHES", label: "gallery.filter.wishes" },
  { value: "POLAROIDS", label: "gallery.filter.polaroids" },
];
const GRID_SIZES: { value: GridSize; label: keyof GalleryMessages }[] = [
  { value: "S", label: "gallery.size.s" },
  { value: "M", label: "gallery.size.m" },
  { value: "L", label: "gallery.size.l" },
];

/** "a guest" for a photo, the author's name for a wish. */
function senderOf(item: GalleryItem, t: T): string {
  return item.sender ?? t("gallery.anonymous");
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function GalleryView({ messages, intl }: { messages: GalleryMessages; intl: string }) {
  const t = useMemo(() => sliceTranslator(messages), [messages]);
  const [isMounted, setIsMounted] = useState(false);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [viewMode, setViewMode] = useState<ViewMode>("CAROUSEL");
  const [gridSize, setGridSize] = useState<GridSize>("M");
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);

  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isPartial, setIsPartial] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const isAutoPlayingRef = useRef(isAutoPlaying);
  isAutoPlayingRef.current = isAutoPlaying;

  const [computedCols, setComputedCols] = useState(3);
  // Guest print requests (#74): hidden unless the web flag is on; the API enforces its own.
  const printAvailability = usePrintAvailability();

  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const closeBarRef = useRef<HTMLDivElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setIsMounted(true);
    const controller = new AbortController();

    async function loadGallery() {
      try {
        const response = await fetch("/api/gallery", { signal: controller.signal });
        const body: unknown = await response.json();
        if (!response.ok || !body || typeof body !== "object" || !("items" in body) || !Array.isArray(body.items)) {
          throw new Error("Invalid gallery response");
        }
        setGalleryItems(body.items as GalleryItem[]);
        setIsPartial("partial" in body && body.partial === true);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(t("gallery.unavailable"));
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadGallery();
    return () => controller.abort();
  }, [t]);

  const filteredItems = galleryItems.filter((item) => {
    if (filter === "WISHES") return item.type === "WISH";
    if (filter === "POLAROIDS") return item.type === "POLAROID";
    return true;
  });

  useEffect(() => {
    setCarouselIndex(0);
  }, [filter]);

  useEffect(() => {
    const updateCols = () => {
      if (window.innerWidth < 600) setComputedCols(1);
      else if (window.innerWidth < 900) setComputedCols(2);
      else setComputedCols(gridSize === "S" ? 4 : gridSize === "M" ? 3 : 2);
    };

    updateCols();
    window.addEventListener("resize", updateCols);
    return () => window.removeEventListener("resize", updateCols);
  }, [gridSize]);

  // Autoplay advances the carousel every 3s; never under reduced motion (docs/design/motion.md).
  useEffect(() => {
    if (viewMode !== "CAROUSEL" || filteredItems.length <= 1 || prefersReducedMotion()) return;

    const interval = setInterval(() => {
      if (isAutoPlayingRef.current) setCarouselIndex((prev) => prev + 1);
    }, 3000);

    return () => clearInterval(interval);
  }, [viewMode, filteredItems.length]);

  // Dialog: focus the close button on open, close on Escape, return focus on close.
  useEffect(() => {
    if (!selectedItem) return;
    closeBarRef.current?.querySelector("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedItem(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      lastFocusRef.current?.focus();
    };
  }, [selectedItem]);

  const openItem = (item: GalleryItem) => {
    lastFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedItem(item);
  };

  const handleNext = () => setCarouselIndex((prev) => prev + 1);
  const handlePrev = () => setCarouselIndex((prev) => prev - 1);

  // Clicking a side card spins to it along the shortest path; clicking the front card opens it.
  const handleCardClick = (targetIndex: number) => {
    const len = filteredItems.length;
    if (len <= 1) {
      openItem(filteredItems[targetIndex]);
      return;
    }

    const currentMod = ((carouselIndex % len) + len) % len;
    let diff = targetIndex - currentMod;
    if (diff > len / 2) diff -= len;
    else if (diff < -len / 2) diff += len;

    if (diff === 0) {
      openItem(filteredItems[targetIndex]);
      return;
    }

    setCarouselIndex((prev) => prev + diff);
    setIsAutoPlaying(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchEndX.current = e.targetTouches[0].clientX;
    setIsAutoPlaying(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    const distance = touchStartX.current - touchEndX.current;
    if (distance > 50) handleNext();
    else if (distance < -50) handlePrev();
    setIsAutoPlaying(true);
  };

  const formatDate = (isoString: string) => {
    if (!isMounted) return "--:--";
    return new Date(isoString).toLocaleTimeString(intl, { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  // Linear carousel geometry: computed per card, so it stays inline.
  const getCarouselCardStyle = (index: number): React.CSSProperties => {
    const len = filteredItems.length;
    if (len <= 1) return { transform: "scale(1)", opacity: 1, zIndex: 100 };

    let virtualIndex = index;
    const halfLen = len / 2;
    while (virtualIndex < carouselIndex - halfLen) virtualIndex += len;
    while (virtualIndex > carouselIndex + halfLen) virtualIndex -= len;

    const offset = virtualIndex - carouselIndex;
    const absOffset = Math.abs(offset);
    const scale = offset === 0 ? 1 : Math.max(0.75, 1 - absOffset * 0.1);
    const opacity = offset === 0 ? 1 : Math.max(0.1, 0.6 - absOffset * 0.2);

    return {
      transform: `translateX(${offset * 260}px) scale(${scale})`,
      opacity,
      zIndex: 50 - Math.round(absOffset),
    };
  };

  const len = filteredItems.length;
  const frontIndex = len > 0 ? ((carouselIndex % len) + len) % len : 0;

  const masonryColumns = Array.from({ length: computedCols }, () => [] as GalleryItem[]);
  filteredItems.forEach((item, i) => {
    masonryColumns[i % computedCols].push(item);
  });

  return (
    <>
      <div className="gal-controls">
        <PillGroup as="toggle" label={t("gallery.show")} tone="on-white">
          {FILTERS.map((option) => (
            <PillToggle key={option.value} pressed={filter === option.value} onClick={() => setFilter(option.value)}>
              {t(option.label)}
            </PillToggle>
          ))}
        </PillGroup>

        <div className="gal-control-group">
          {viewMode === "GRID" && (
            <div className="gal-control-group">
              <span className="mem-label mem-group-label" aria-hidden="true">{t("gallery.size")}</span>
              <PillGroup as="toggle" label={t("gallery.cardSize")} tone="on-white">
                {GRID_SIZES.map((option) => (
                  <PillToggle
                    key={option.value}
                    pressed={gridSize === option.value}
                    onClick={() => setGridSize(option.value)}
                    aria-label={t(option.label)}
                    title={t(option.label)}
                  >
                    {option.value}
                  </PillToggle>
                ))}
              </PillGroup>
            </div>
          )}

          <PillGroup as="toggle" label={t("gallery.layout")} tone="on-white">
            <PillToggle pressed={viewMode === "GRID"} onClick={() => setViewMode("GRID")}>{t("gallery.grid")}</PillToggle>
            <PillToggle pressed={viewMode === "CAROUSEL"} onClick={() => setViewMode("CAROUSEL")}>{t("gallery.carousel")}</PillToggle>
          </PillGroup>
        </div>
      </div>

      {isPartial ? (
        <p role="status" className="mem-status mem-status--notice">{t("gallery.partial")}</p>
      ) : null}

      {isLoading ? (
        <p role="status" className="mem-status mem-status--center">{t("gallery.loading")}</p>
      ) : loadError ? (
        <p role="alert" className="mem-status mem-status--error mem-status--center">{loadError}</p>
      ) : len === 0 ? (
        <p className="mem-status mem-status--center">{t("gallery.empty")}</p>
      ) : viewMode === "GRID" ? (
        <div className="gal-masonry">
          {masonryColumns.map((col, colIndex) => (
            <div key={colIndex} className="gal-masonry-col">
              {col.map((item, itemIndex) => (
                <GalleryCard
                  key={item.id}
                  item={item}
                  index={colIndex * 2 + itemIndex}
                  onView={() => openItem(item)}
                  formatDate={formatDate}
                  t={t}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div
          className="gal-carousel"
          role="region"
          aria-roledescription="carousel"
          aria-label={t("gallery.carouselLabel")}
          onMouseEnter={() => setIsAutoPlaying(false)}
          onMouseLeave={() => setIsAutoPlaying(true)}
          onFocus={() => setIsAutoPlaying(false)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="gal-carousel-nav">
            <Cta tone="on-white" variant="secondary" onClick={handlePrev} aria-label={t("gallery.previous")}>←</Cta>
            <Cta tone="on-white" variant="secondary" onClick={handleNext} aria-label={t("gallery.next")}>→</Cta>
          </div>

          <div className="gal-carousel-track">
            {filteredItems.map((item, index) => (
              <div
                key={`carousel-${item.id}`}
                className="gal-carousel-slot"
                style={getCarouselCardStyle(index)}
                onClick={() => handleCardClick(index)}
                aria-hidden={index !== frontIndex}
              >
                <GalleryCard
                  item={item}
                  index={0}
                  tabIndex={index === frontIndex ? 0 : -1}
                  onView={(e) => {
                    e?.stopPropagation();
                    handleCardClick(index);
                  }}
                  formatDate={formatDate}
                  t={t}
                />
              </div>
            ))}
          </div>

          <p className="gal-carousel-count" aria-live="polite">
            {frontIndex + 1} / {len}
          </p>
        </div>
      )}

      {selectedItem && (
        <div className="gal-dialog-backdrop" onClick={() => setSelectedItem(null)}>
          <div
            className="gal-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t(selectedItem.type === "WISH" ? "gallery.wishFrom" : "gallery.photoFrom", { name: senderOf(selectedItem, t) })}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="gal-dialog-bar" ref={closeBarRef}>
              <Cta tone="on-white" variant="secondary" onClick={() => setSelectedItem(null)}>{t("gallery.close")}</Cta>
            </div>

            <CardMeta item={selectedItem} formatDate={formatDate} t={t} />

            {selectedItem.type === "WISH" ? (
              <div className="gal-wish gal-wish--full">
                <span className="gal-quote" aria-hidden="true">&ldquo;</span>
                {selectedItem.content}
              </div>
            ) : (
              <div className="mem-polaroid">
                <div className="mem-polaroid-frame">
                  <img src={selectedItem.content} alt={t("gallery.photoFrom", { name: senderOf(selectedItem, t) })} className="mem-polaroid-img" />
                </div>
              </div>
            )}

            {selectedItem.type === "POLAROID" && selectedItem.publicId ? (
              <PrintRequest key={selectedItem.publicId} publicId={selectedItem.publicId} availability={printAvailability} t={t} />
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}

function CardMeta({ item, formatDate, t }: { item: GalleryItem; formatDate: (d: string) => string; t: T }) {
  return (
    <div className="gal-meta">
      <p className="gal-meta-list">
        <span className="gal-meta-label">{t("gallery.from")} <span className="gal-meta-value">{senderOf(item, t)}</span></span>
        <span className="gal-meta-label">{t("gallery.to")} <span className="gal-meta-value">{t(`gallery.audience.${item.audience}`)}</span></span>
      </p>
      <time className="gal-meta-time" dateTime={item.timestamp}>{formatDate(item.timestamp)}</time>
    </div>
  );
}

function GalleryCard({
  item,
  index,
  onView,
  formatDate,
  tabIndex,
  t,
}: {
  item: GalleryItem;
  index: number;
  onView: (e?: React.MouseEvent) => void;
  formatDate: (d: string) => string;
  tabIndex?: number;
  t: T;
}) {
  return (
    <article className="gal-card" style={{ animationDelay: `${index * 50}ms` }}>
      <CardMeta item={item} formatDate={formatDate} t={t} />

      {item.type === "WISH" ? (
        <div className="gal-wish gal-wish--clamp">
          <span className="gal-quote" aria-hidden="true">&ldquo;</span>
          {item.content}
        </div>
      ) : (
        <div className="mem-polaroid">
          <div className="mem-polaroid-frame">
            <img src={item.content} alt={t("gallery.photoFrom", { name: senderOf(item, t) })} className="mem-polaroid-img" loading="lazy" />
          </div>
        </div>
      )}

      <div className="gal-card-footer">
        <Cta tone="on-white" variant="secondary" onClick={onView} tabIndex={tabIndex}>{t("gallery.view")}</Cta>
      </div>
    </article>
  );
}
