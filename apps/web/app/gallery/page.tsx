"use client";

/* Gallery derivatives are already resized, immutable JPEGs from the media API; a Next image proxy would add an unnecessary hop. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import type { GalleryItem } from "../../data/gallery";
import { DecodeText } from "../landing-title/DecodeText";
import { MemoriesShell } from "../memories/MemoriesShell";

type Filter = "ALL" | "WISHES" | "POLAROIDS";
type ViewMode = "GRID" | "CAROUSEL";
type GridSize = "S" | "M" | "L";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "All entries" },
  { value: "WISHES", label: "Guestbook wishes" },
  { value: "POLAROIDS", label: "Polaroid snaps" },
];
const GRID_SIZES: { value: GridSize; label: string }[] = [
  { value: "S", label: "Small, 4 columns" },
  { value: "M", label: "Medium, 3 columns" },
  { value: "L", label: "Large, 2 columns" },
];

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function GalleryPage() {
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

  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
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
        setLoadError("The gallery is temporarily unavailable. Please try again in a moment.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadGallery();
    return () => controller.abort();
  }, []);

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
    closeButtonRef.current?.focus();
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
    return new Date(isoString).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
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
    <MemoriesShell current="gallery" label="Gallery">
      <div className="memories-wrapper">
        <div className="memories-container memories-container--wide">
          <div className="memories-heading">
            <div className="landing-event-meta mono">
              <p><DecodeText text="ARCHIVE / ALL MEMORIES" delay={80} /></p>
              <span className="landing-event-signal" aria-hidden="true" />
            </div>
            <h1 className="memories-title"><DecodeText text="Digital Locket." delay={200} duration={800} /></h1>
          </div>

          <div className="memories-controls">
            <div className="memories-control-group" role="group" aria-label="Show">
              {FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  className="memories-button"
                  aria-pressed={filter === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="memories-control-group">
              {viewMode === "GRID" && (
                <div className="memories-control-group" role="group" aria-label="Card size">
                  <span className="memories-control-label" aria-hidden="true">Size</span>
                  {GRID_SIZES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setGridSize(option.value)}
                      className="memories-button memories-button--square"
                      aria-pressed={gridSize === option.value}
                      aria-label={option.label}
                      title={option.label}
                    >
                      {option.value}
                    </button>
                  ))}
                </div>
              )}

              <div className="memories-control-group" role="group" aria-label="Layout">
                <button type="button" onClick={() => setViewMode("GRID")} className="memories-button" aria-pressed={viewMode === "GRID"}>
                  Grid
                </button>
                <button type="button" onClick={() => setViewMode("CAROUSEL")} className="memories-button" aria-pressed={viewMode === "CAROUSEL"}>
                  Carousel
                </button>
              </div>
            </div>
          </div>

          {isPartial ? (
            <p role="status" className="memories-status memories-status--notice">
              Some memories could not be loaded. Showing the entries that are available.
            </p>
          ) : null}

          {isLoading ? (
            <p role="status" className="memories-status">Loading memories…</p>
          ) : loadError ? (
            <p role="alert" className="memories-status memories-status--error">{loadError}</p>
          ) : len === 0 ? (
            <p className="memories-status">No entries yet.</p>
          ) : viewMode === "GRID" ? (
            <div className="memories-masonry">
              {masonryColumns.map((col, colIndex) => (
                <div key={colIndex} className="memories-masonry-col">
                  {col.map((item, itemIndex) => (
                    <GalleryCard
                      key={item.id}
                      item={item}
                      index={colIndex * 2 + itemIndex}
                      onView={() => openItem(item)}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div
              className="memories-carousel"
              role="region"
              aria-roledescription="carousel"
              aria-label="Memories"
              onMouseEnter={() => setIsAutoPlaying(false)}
              onMouseLeave={() => setIsAutoPlaying(true)}
              onFocus={() => setIsAutoPlaying(false)}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <div className="memories-carousel-nav">
                <button type="button" className="memories-button memories-button--square" onClick={handlePrev} aria-label="Previous memory">←</button>
                <button type="button" className="memories-button memories-button--square" onClick={handleNext} aria-label="Next memory">→</button>
              </div>

              <div className="memories-carousel-track">
                {filteredItems.map((item, index) => (
                  <div
                    key={`carousel-${item.id}`}
                    className="memories-carousel-slot"
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
                    />
                  </div>
                ))}
              </div>

              <p className="memories-carousel-count" aria-live="polite">
                {frontIndex + 1} / {len}
              </p>
            </div>
          )}
        </div>
      </div>

      {selectedItem && (
        <div className="memories-dialog-backdrop" onClick={() => setSelectedItem(null)}>
          <div
            className="memories-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={selectedItem.type === "WISH" ? `Wish from ${selectedItem.sender}` : `Photo from ${selectedItem.sender}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="memories-dialog-bar">
              <button ref={closeButtonRef} type="button" className="memories-button" onClick={() => setSelectedItem(null)}>
                Close
              </button>
            </div>

            <CardMeta item={selectedItem} formatDate={formatDate} />

            {selectedItem.type === "WISH" ? (
              <div className="memories-wish memories-wish--full">
                <span className="memories-quote" aria-hidden="true">&ldquo;</span>
                {selectedItem.content}
              </div>
            ) : (
              <div className="memories-polaroid">
                <div className="memories-polaroid-frame">
                  <img src={selectedItem.content} alt={`Photo from ${selectedItem.sender}`} className="memories-polaroid-img" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </MemoriesShell>
  );
}

function CardMeta({ item, formatDate }: { item: GalleryItem; formatDate: (d: string) => string }) {
  return (
    <div className="memories-meta">
      <p className="memories-meta-list">
        <span className="memories-meta-label">From: <span className="memories-meta-value">{item.sender}</span></span>
        <span className="memories-meta-label">To: <span className="memories-meta-value">{item.receivers.join(", ")}</span></span>
      </p>
      <time className="memories-meta-time" dateTime={item.timestamp}>{formatDate(item.timestamp)}</time>
    </div>
  );
}

function GalleryCard({
  item,
  index,
  onView,
  formatDate,
  tabIndex,
}: {
  item: GalleryItem;
  index: number;
  onView: (e?: React.MouseEvent) => void;
  formatDate: (d: string) => string;
  tabIndex?: number;
}) {
  return (
    <article className="memories-card" style={{ animationDelay: `${index * 50}ms` }}>
      <CardMeta item={item} formatDate={formatDate} />

      {item.type === "WISH" ? (
        <div className="memories-wish memories-wish--clamp">
          <span className="memories-quote" aria-hidden="true">&ldquo;</span>
          {item.content}
        </div>
      ) : (
        <div className="memories-polaroid">
          <div className="memories-polaroid-frame">
            <img src={item.content} alt={`Photo from ${item.sender}`} className="memories-polaroid-img" loading="lazy" />
          </div>
        </div>
      )}

      <div className="memories-card-footer">
        <button type="button" className="memories-button" onClick={onView} tabIndex={tabIndex}>
          View details
        </button>
      </div>
    </article>
  );
}
