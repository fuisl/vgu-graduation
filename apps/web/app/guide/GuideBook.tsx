"use client";

import type { GuideItem } from "@grad/contract";
import { BrandEyebrow, Cta, PillGroup, PillToggle } from "@grad/ui";
import { useState } from "react";
import { GUIDE_CATEGORY_LABELS, filterGuide, guideCategories, type GuideFilter } from "../../lib/guide/format";

/**
 * The guide-book list (#140): category pills and one card per place. Everything is in the page
 * already, so filtering needs no network: once loaded it keeps working on a dead venue connection.
 */
export function GuideBook({ items }: { items: GuideItem[] }) {
  const [filter, setFilter] = useState<GuideFilter>("all");
  const categories = guideCategories(items);
  const shown = filterGuide(items, filter);

  return (
    <div className="guide-book">
      {categories.length > 1 ? (
        <PillGroup as="toggle" label="Show" tone="on-white">
          <PillToggle pressed={filter === "all"} onClick={() => setFilter("all")}>All</PillToggle>
          {categories.map((category) => (
            <PillToggle key={category} pressed={filter === category} onClick={() => setFilter(category)}>
              {GUIDE_CATEGORY_LABELS[category]}
            </PillToggle>
          ))}
        </PillGroup>
      ) : null}
      <p className="guide-count" role="status" aria-live="polite">
        {shown.length === 1 ? "1 place" : `${shown.length} places`}
        {filter === "all" ? "" : ` in ${GUIDE_CATEGORY_LABELS[filter].toLowerCase()}`}
      </p>
      <ul className="guide-list">
        {shown.map((item) => (
          <li key={item.id} className="guide-card">
            <article aria-labelledby={`guide-${item.id}`} className="guide-card__body">
              <BrandEyebrow>{GUIDE_CATEGORY_LABELS[item.category]}</BrandEyebrow>
              <h3 id={`guide-${item.id}`} className="guide-card__title">{item.title}</h3>
              {item.description ? <p className="guide-card__description">{item.description}</p> : null}
              {item.timeHint || item.mapUrl ? (
                <div className="guide-card__foot">
                  {item.timeHint ? (
                    <p className="guide-card__time">
                      <span className="guide-card__time-label">Time</span> {item.timeHint}
                    </p>
                  ) : null}
                  {item.mapUrl ? (
                    <Cta tone="on-white" variant="secondary" href={item.mapUrl} external>
                      Open in Maps<span className="brand-sr-only">: {item.title}</span>
                    </Cta>
                  ) : null}
                </div>
              ) : null}
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
