"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const IMAGES = [
  { src: "/recap/recap-1.jpeg", alt: "" },
  { src: "/recap/recap-2.jpeg", alt: "" },
  { src: "/recap/recap-3.jpeg", alt: "" },
];
const INTERVAL_MS = 5000;

export function RecapCarousel() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches || IMAGES.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % IMAGES.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  return IMAGES.map((image, i) => (
    <Image
      key={image.src}
      src={image.src}
      alt={image.alt}
      fill
      sizes="(max-width: 960px) 100vw, 50vw"
      priority={i === 0}
      className={`landing-recap-photo${i === index ? " is-active" : ""}`}
    />
  ));
}
