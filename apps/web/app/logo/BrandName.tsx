"use client";

import { useEffect, useRef, useState } from "react";

// Each segment's prefix is the acronym letter (V, G, U); "rest" is what grows out of it
// when expanded, so "VGU" reads as embedded inside "Vietnamese-German University" rather
// than being swapped for it.
const SEGMENTS = [
  { prefix: "V", rest: "ietnamese-" },
  { prefix: "G", rest: "erman " },
  { prefix: "U", rest: "niversity" },
];

export function BrandName() {
  const [expanded, setExpanded] = useState(false);
  const hovered = useRef(false);
  const scrolled = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      const next = window.scrollY > 8;
      if (next !== scrolled.current) {
        scrolled.current = next;
        setExpanded(hovered.current || scrolled.current);
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const setHovered = (value: boolean) => {
    hovered.current = value;
    setExpanded(value || scrolled.current);
  };

  let charIndex = 0;

  return (
    <span
      className={`brand-name${expanded ? " is-expanded" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span aria-hidden="true">
        {SEGMENTS.map((segment, si) => (
          <span className="brand-segment" key={si}>
            <span className="brand-prefix">{segment.prefix}</span>
            <span className="brand-rest">
              {[...segment.rest].map((ch) => {
                const delay = charIndex++;
                return <span className="brand-char" key={delay} style={{ transitionDelay: `${delay * 14}ms` }}>{ch}</span>;
              })}
            </span>
          </span>
        ))}
      </span>
      <span className="sr-only">Vietnamese-German University</span>
    </span>
  );
}
