"use client";

/* Gallery derivatives are already resized, immutable JPEGs from the media API; a Next image proxy would add an unnecessary hop. */
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { BackgroundMotion } from "../background/BackgroundMotion";
import { TwinkleField } from "../background/TwinkleField";
import { GridCells } from "../background/GridCells";
import { BrandName } from "../logo/BrandName";
import { DecodeText } from "../landing-title/DecodeText";
import type { GalleryItem } from "../../data/gallery";

export default function GalleryPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "WISHES" | "POLAROIDS">("ALL");
  const [viewMode, setViewMode] = useState<"GRID" | "CAROUSEL">("CAROUSEL");
  const [gridSize, setGridSize] = useState<"S" | "M" | "L">("M");
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

  // Swipe Tracking Refs
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

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
      if (window.innerWidth < 600) {
        setComputedCols(1);
      } else if (window.innerWidth < 900) {
        setComputedCols(2);
      } else {
        if (gridSize === "S") setComputedCols(4);
        else if (gridSize === "M") setComputedCols(3);
        else if (gridSize === "L") setComputedCols(2);
      }
    };

    updateCols();
    window.addEventListener("resize", updateCols);
    return () => window.removeEventListener("resize", updateCols);
  }, [gridSize]);

  useEffect(() => {
    if (viewMode !== "CAROUSEL" || filteredItems.length <= 1) return;

    const interval = setInterval(() => {
      if (isAutoPlayingRef.current) {
        setCarouselIndex((prev) => prev + 1);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [viewMode, filteredItems.length]);

  const handleNext = () => setCarouselIndex((prev) => prev + 1);
  const handlePrev = () => setCarouselIndex((prev) => prev - 1);

  // ====== DIRECT JUMP SPIN LOGIC ======
  const handleCardClick = (targetIndex: number) => {
    const len = filteredItems.length;
    if (len <= 1) {
      setSelectedItem(filteredItems[targetIndex]);
      return;
    }

    const currentMod = ((carouselIndex % len) + len) % len;
    let diff = targetIndex - currentMod;

    // Find the shortest path around the carousel
    if (diff > len / 2) diff -= len;
    else if (diff < -len / 2) diff += len;

    // If they clicked the card that is ALREADY at the front, open the modal
    if (diff === 0) {
      setSelectedItem(filteredItems[targetIndex]);
      return;
    }

    // Instantly apply the difference, letting CSS effortlessly handle the transition
    setCarouselIndex((prev) => prev + diff);
    setIsAutoPlaying(false);
  };

  // Mobile Swipe Handlers
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
    const date = new Date(isoString);
    return date.toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  // ====== CLASSIC LINEAR CAROUSEL ======
  const getCarouselCardStyle = (index: number) => {
    const len = filteredItems.length;
    if (len <= 1) return { transform: 'scale(1)', opacity: 1, zIndex: 100 };

    let virtualIndex = index;
    const halfLen = len / 2;

    while (virtualIndex < carouselIndex - halfLen) virtualIndex += len;
    while (virtualIndex > carouselIndex + halfLen) virtualIndex -= len;

    const offset = virtualIndex - carouselIndex;
    const absOffset = Math.abs(offset);

    // Smooth scaling and spacing
    const scale = offset === 0 ? 1 : Math.max(0.75, 1 - absOffset * 0.1);

    // Deep transparency fade for background cards
    const opacity = offset === 0 ? 1 : Math.max(0.1, 0.6 - absOffset * 0.2);

    const translateX = offset * 260; // Distance between cards
    const zIndex = 50 - Math.round(absOffset);

    return {
      transform: `translateX(${translateX}px) scale(${scale})`,
      opacity: opacity,
      zIndex: zIndex,
      // Change: Always allow pointer events so side cards can be clicked to jump!
      pointerEvents: "auto" as const,
    };
  };

  const activeItem = filteredItems.length > 0 ? filteredItems[((carouselIndex % filteredItems.length) + filteredItems.length) % filteredItems.length] : null;
  const displayIndex = filteredItems.length > 0 ? ((carouselIndex % filteredItems.length) + filteredItems.length) % filteredItems.length + 1 : 0;

  const masonryColumns = Array.from({ length: computedCols }, () => [] as GalleryItem[]);
  filteredItems.forEach((item, i) => {
    masonryColumns[i % computedCols].push(item);
  });

  return (
    <main className="landing-page">
      <style dangerouslySetInnerHTML={{ __html: `
        .g-wrapper { display: flex; flex-direction: column; align-items: center; padding: 40px 20px 100px; overflow-x: hidden; overflow-y: auto; width: 100%; box-sizing: border-box; }
        .g-container { width: 100%; max-width: 1200px; margin: 0 auto; position: relative; }
        .g-header { text-align: center; margin-bottom: 48px; }
        .g-title { font-size: clamp(2.5rem, 6vw, 4rem); font-weight: 500; color: #ECF0F9; margin: 12px 0 0 0; letter-spacing: -0.02em; }

        .g-controls-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 48px; flex-wrap: wrap; gap: 24px; border-bottom: 1px solid rgba(150, 168, 211, 0.14); padding-bottom: 24px; }

        .g-filters { display: flex; gap: 12px; flex-wrap: wrap; }
        .g-tab { background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(150, 168, 211, 0.2); color: #8790A7; padding: 10px 24px; font-family: var(--font-mono, monospace); font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer; transition: all 0.2s ease; backdrop-filter: blur(4px); }
        .g-tab:hover { border-color: rgba(150, 168, 211, 0.5); color: #ECF0F9; }
        .g-tab.active { background: rgba(141, 165, 227, 0.15); border-color: #8da5e3; color: #fff; box-shadow: 0 0 12px rgba(141, 165, 227, 0.2); }

        .g-view-controls { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
        .g-view-toggles { display: flex; gap: 8px; }
        .g-view-btn { background: transparent; border: 1px solid rgba(150, 168, 211, 0.2); color: #8790A7; padding: 10px 16px; font-family: var(--font-mono, monospace); font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer; transition: all 0.2s ease; }
        .g-view-btn.active { background: #8da5e3; color: #070a12; border-color: #8da5e3; }

        .g-size-selector { display: flex; align-items: center; gap: 8px; font-family: var(--font-mono, monospace); font-size: 10px; color: #8790A7; text-transform: uppercase; letter-spacing: 0.1em; }
        .g-size-btn { background: transparent; border: 1px solid rgba(150, 168, 211, 0.2); color: #8790A7; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease; font-weight: bold; }
        .g-size-btn:hover { border-color: #8da5e3; color: #ECF0F9; }
        .g-size-btn.active { background: rgba(141, 165, 227, 0.15); border-color: #8da5e3; color: #fff; }

        .g-masonry-flex { display: flex; gap: 24px; width: 100%; align-items: flex-start; }
        .g-masonry-col { display: flex; flex-direction: column; gap: 24px; flex: 1; min-width: 0; }

        /* Carousel Container */
        .g-carousel-container {
          position: relative; width: 100%; height: 500px;
          display: flex; align-items: center; justify-content: center;
          perspective: 1000px; touch-action: pan-y; overflow: hidden;
        }
        .g-carousel-track {
          position: relative; width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
        }
        .g-carousel-card-wrapper {
          position: absolute; width: 340px; height: auto;
          transition: transform 0.6s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.6s ease, z-index 0.6s ease;
          cursor: pointer;
        }

        .g-carousel-nav { position: absolute; top: 50%; transform: translateY(-50%); z-index: 150; display: flex; justify-content: space-between; width: 100%; pointer-events: none; }
        .g-carousel-nav-btn { pointer-events: auto; background: transparent; border: 1px solid rgba(141, 165, 227, 0.4); color: #8da5e3; width: 56px; height: 56px; border-radius: 50%; font-family: var(--font-mono, monospace); font-size: 20px; cursor: pointer; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
        .g-carousel-nav-btn:hover { background: #8da5e3; color: #070a12; transform: scale(1.1); box-shadow: 0 0 20px rgba(141, 165, 227, 0.5); }

        /* HIDE ARROWS ON MOBILE (<= 768px) */
        @media (max-width: 768px) {
          .hide-on-mobile { display: none !important; }
        }

        @keyframes cardFadeIn { 0% { opacity: 0; transform: translateY(15px); } 100% { opacity: 1; transform: translateY(0); } }

        .g-card {
          background: rgba(7, 10, 18, 0.95); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(150, 168, 211, 0.25); display: flex; flex-direction: column;
          transition: border-color 0.3s ease, box-shadow 0.3s ease; position: relative; overflow: hidden;
          height: auto;
          box-shadow: 0 25px 45px rgba(0,0,0,0.8);
          opacity: 0; animation: cardFadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .g-card:hover { border-color: rgba(150, 168, 211, 0.6); box-shadow: 0 30px 60px -10px rgba(0, 0, 0, 0.95); }

        .g-meta { padding: 16px; border-bottom: 1px solid rgba(150, 168, 211, 0.1); display: flex; justify-content: space-between; align-items: flex-start; font-family: var(--font-mono, monospace); }
        .g-meta-left { display: flex; flex-direction: column; gap: 4px; }
        .g-meta-label { font-size: 9px; color: #8790A7; text-transform: uppercase; letter-spacing: 0.1em; }
        .g-meta-value { font-size: 12px; color: #ECF0F9; }
        .g-meta-time { font-size: 10px; color: #8da5e3; }

        .g-wish-content { padding: 32px 24px; font-family: var(--font-mono, monospace); font-size: 14px; line-height: 1.6; color: #ECF0F9; text-align: left; background: linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 100%); }
        .g-quote-mark { color: #8da5e3; opacity: 0.4; font-size: 24px; line-height: 0; vertical-align: middle; margin-right: 8px; }
        .g-wish-text-clamp { display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; }

        .g-polaroid-wrapper { padding: 20px; background: rgba(0,0,0,0.2); display: flex; justify-content: center; }
        .g-polaroid-frame { background: #fdfdfd; padding: 12px 12px 45px 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.6), inset 0 1px 2px rgba(255,255,255,0.8); width: 100%; border-radius: 2px; transition: transform 0.3s ease; }
        .g-card:hover .g-polaroid-frame { transform: scale(1.02) rotate(-1deg); }
        .g-polaroid-img-square { width: 100%; aspect-ratio: 1/1; object-fit: cover; background: #000; border: 1px solid rgba(0,0,0,0.1); filter: contrast(1.1) sepia(0.1) saturate(1.2); }

        .g-corner { position: absolute; width: 6px; height: 6px; border-color: #8da5e3; opacity: 0; transition: opacity 0.3s ease; }
        .g-card:hover .g-corner { opacity: 1; }
        .g-corner-tl { top: 0; left: 0; border-top: 1px solid; border-left: 1px solid; }
        .g-corner-tr { top: 0; right: 0; border-top: 1px solid; border-right: 1px solid; }
        .g-corner-bl { bottom: 0; left: 0; border-bottom: 1px solid; border-left: 1px solid; }
        .g-corner-br { bottom: 0; right: 0; border-bottom: 1px solid; border-right: 1px solid; }

        .g-footer { display: flex; border-top: 1px solid rgba(150, 168, 211, 0.1); margin-top: auto; }
        .g-footer-btn { flex: 1; padding: 12px; background: transparent; border: none; color: #8790A7; font-family: var(--font-mono, monospace); font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer; transition: all 0.2s ease; }
        .g-footer-btn:hover { background: rgba(141, 165, 227, 0.1); color: #ECF0F9; }

        .g-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; animation: fadeInOverlay 0.3s ease forwards; }
        @keyframes fadeInOverlay { from { opacity: 0; } to { opacity: 1; } }
        .g-modal-content { background: rgba(7, 10, 18, 0.95); border: 1px solid rgba(141, 165, 227, 0.4); width: 100%; max-width: 600px; max-height: 90vh; overflow-y: auto; position: relative; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8); animation: slideUpModal 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes slideUpModal { from { opacity: 0; transform: translateY(30px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

        .g-modal-top-bar { display: flex; justify-content: flex-end; padding: 16px 20px 0 20px; }
        .g-modal-close { background: transparent; border: 1px solid rgba(150, 168, 211, 0.3); color: #8790A7; font-family: var(--font-mono, monospace); font-size: 10px; text-transform: uppercase; cursor: pointer; padding: 6px 14px; transition: all 0.2s; letter-spacing: 0.1em; }
        .g-modal-close:hover { border-color: #8da5e3; color: #ECF0F9; background: rgba(141, 165, 227, 0.1); }
        .g-modal-full-wish { padding: 32px; font-family: var(--font-mono, monospace); font-size: 16px; line-height: 1.8; color: #ECF0F9; }
      `}} />

      <section className="landing" aria-label="Gallery">
        <BackgroundMotion />
        <div className="landing-aurora" aria-hidden="true" />
        <div className="landing-field" aria-hidden="true"><GridCells /></div>
        <TwinkleField />

        <header className="landing-header">
          <Link className="landing-brand" href="/" aria-label="GRAD '26 home"><BrandName /></Link>
          <nav className="landing-nav" aria-label="Main navigation">
            <Link href="/wishes">Guestbook</Link>
            <Link href="/polaroid">Disposable</Link>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
              <span style={{fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'monospace', color: '#8da5e3'}}>Gallery</span>
            </div>
          </nav>
        </header>

        <div className="g-wrapper">
          <div className="g-container">

            <div className="g-header">
              <div className="landing-event-meta mono" style={{justifyContent: 'center', marginBottom: '16px'}}>
                <p><DecodeText text="ARCHIVE / ALL MEMORIES" delay={80} /></p>
                <span className="landing-event-signal" aria-hidden="true" style={{background: '#8da5e3', boxShadow: '0 0 8px #8da5e3'}} />
              </div>
              <h1 className="g-title"><DecodeText text="Digital Locket." delay={200} duration={800} /></h1>
            </div>

            <div className="g-controls-row">
              <div className="g-filters">
                <button onClick={() => setFilter("ALL")} className={`g-tab ${filter === "ALL" ? "active" : ""}`}>All Entries</button>
                <button onClick={() => setFilter("WISHES")} className={`g-tab ${filter === "WISHES" ? "active" : ""}`}>Guestbook Wishes</button>
                <button onClick={() => setFilter("POLAROIDS")} className={`g-tab ${filter === "POLAROIDS" ? "active" : ""}`}>Polaroid Snaps</button>
              </div>

              <div className="g-view-controls">
                {viewMode === "GRID" && (
                  <div className="g-size-selector">
                    Size:
                    {["S", "M", "L"].map(size => (
                      <button
                        key={size}
                        onClick={() => setGridSize(size as "S"|"M"|"L")}
                        className={`g-size-btn ${gridSize === size ? "active" : ""}`}
                        title={size === "S" ? "Small (4 cols)" : size === "M" ? "Medium (3 cols)" : "Large (2 cols)"}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                )}

                <div className="g-view-toggles">
                  <button onClick={() => setViewMode("GRID")} className={`g-view-btn ${viewMode === "GRID" ? "active" : ""}`}>Grid</button>
                  <button onClick={() => setViewMode("CAROUSEL")} className={`g-view-btn ${viewMode === "CAROUSEL" ? "active" : ""}`}>Carousel</button>
                </div>
              </div>
            </div>

            {isPartial ? (
              <p role="status" style={{ textAlign: "center", color: "#d4b36b", fontFamily: "monospace" }}>
                Some memories could not be loaded. Showing the entries that are available.
              </p>
            ) : null}

            {isLoading ? (
              <p role="status" style={{ textAlign: "center", color: "#8790A7", fontFamily: "monospace" }}>
                Loading memories…
              </p>
            ) : loadError ? (
              <p role="alert" style={{ textAlign: "center", color: "#f0a3a3", fontFamily: "monospace" }}>
                {loadError}
              </p>
            ) : filteredItems.length === 0 ? (
              <p style={{ textAlign: "center", color: "#8790A7", fontFamily: "monospace" }}>No entries found.</p>
            ) : viewMode === "GRID" ? (

              <div className="g-masonry-flex">
                {masonryColumns.map((col, colIndex) => (
                  <div key={colIndex} className="g-masonry-col">
                    {col.map((item, itemIndex) => (
                      <GalleryCard
                        key={item.id}
                        item={item}
                        index={colIndex * 2 + itemIndex}
                        onView={() => setSelectedItem(item)}
                        formatDate={formatDate}
                      />
                    ))}
                  </div>
                ))}
              </div>

            ) : (

              <div
                className="g-carousel-container"
                onMouseEnter={() => setIsAutoPlaying(false)}
                onMouseLeave={() => setIsAutoPlaying(true)}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                <div className="g-carousel-nav hide-on-mobile" style={{ padding: "0 20px" }}>
                  <button className="g-carousel-nav-btn" onClick={handlePrev}>←</button>
                  <button className="g-carousel-nav-btn" onClick={handleNext}>→</button>
                </div>

                <div className="g-carousel-track">
                  {filteredItems.map((item, index) => {
                    const style = getCarouselCardStyle(index);
                    return (
                      <div
                        key={`carousel-${item.id}`}
                        className="g-carousel-card-wrapper"
                        style={style}
                        onClick={() => handleCardClick(index)}
                      >
                        <GalleryCard
                          item={item}
                          index={0}
                          onView={(e?: any) => {
                            if (e) e.stopPropagation();
                            handleCardClick(index);
                          }}
                          formatDate={formatDate}
                        />
                      </div>
                    );
                  })}
                </div>

                <p style={{ position: "absolute", bottom: "10px", color: "#8790A7", fontFamily: "monospace", fontSize: "12px", width: "100%", textAlign: "center" }}>
                  {displayIndex} / {filteredItems.length}
                </p>
              </div>

            )}
          </div>
        </div>

        {selectedItem && (
          <div className="g-modal-overlay" onClick={() => setSelectedItem(null)}>
            <div className="g-modal-content" onClick={(e) => e.stopPropagation()}>

              <div className="g-modal-top-bar">
                <button className="g-modal-close" onClick={() => setSelectedItem(null)}>Close</button>
              </div>

              <div className="g-meta" style={{ padding: '16px 32px' }}>
                <div className="g-meta-left">
                  <span className="g-meta-label">From: <span className="g-meta-value">{selectedItem.sender}</span></span>
                  <span className="g-meta-label">To: <span className="g-meta-value">{selectedItem.receivers.join(", ")}</span></span>
                </div>
                <span className="g-meta-time">{formatDate(selectedItem.timestamp)}</span>
              </div>

              {selectedItem.type === "WISH" ? (
                <div className="g-modal-full-wish">
                  <span className="g-quote-mark" style={{ fontSize: '32px' }}>&ldquo;</span><br />
                  {selectedItem.content}
                </div>
              ) : (
                <div className="g-polaroid-wrapper" style={{ padding: "30px 40px 40px 40px" }}>
                  <div className="g-polaroid-frame">
                    <img src={selectedItem.content} alt="Polaroid" className="g-polaroid-img-square" />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </section>
    </main>
  );
}

function GalleryCard({ item, index, onView, formatDate }: { item: GalleryItem; index: number; onView: (e?: any) => void; formatDate: (d: string) => string }) {
  return (
    <div className="g-card" style={{ animationDelay: `${index * 0.05}s` }}>
      <div className="g-corner g-corner-tl" />
      <div className="g-corner g-corner-tr" />
      <div className="g-corner g-corner-bl" />
      <div className="g-corner g-corner-br" />

      <div className="g-meta">
        <div className="g-meta-left">
          <span className="g-meta-label">From: <span className="g-meta-value">{item.sender}</span></span>
          <span className="g-meta-label">To: <span className="g-meta-value">{item.receivers.join(", ")}</span></span>
        </div>
        <span className="g-meta-time">{formatDate(item.timestamp)}</span>
      </div>

      {item.type === "WISH" ? (
        <div className="g-wish-content">
          <div className="g-wish-text-clamp">
            <span className="g-quote-mark">&ldquo;</span>{item.content}
          </div>
        </div>
      ) : (
        <div className="g-polaroid-wrapper">
          <div className="g-polaroid-frame">
            <img src={item.content} alt="Polaroid" className="g-polaroid-img-square" loading="lazy" />
          </div>
        </div>
      )}

      <div className="g-footer">
        <button className="g-footer-btn" onClick={onView}>View Details</button>
      </div>
    </div>
  );
}
