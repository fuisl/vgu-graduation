"use client";

import type { GuideItem } from "@grad/contract";
import { BrandEyebrow, Cta, PillGroup, PillToggle } from "@grad/ui";
import { useState } from "react";
import { filterGuide, guideCategories, type GuideFilter } from "../../lib/guide/format";
import { sliceTranslator, type MessageSlice } from "../../lib/i18n/format";

/**
 * The guide-book list (#140): category pills and one card per place. Everything is in the page
 * already, so filtering needs no network: once loaded it keeps working on a dead venue connection.
 */
export function GuideBook({ items, messages }: { items: GuideItem[]; messages: MessageSlice<"guide.book." | "guide.category."> }) {
  const t = sliceTranslator(messages);
  const label = (category: GuideItem["category"]) => t(`guide.category.${category}`);
  const [filter, setFilter] = useState<GuideFilter>("all");
  const categories = guideCategories(items);
  const shown = filterGuide(items, filter);

  return (
    <div className="guide-book">
      {categories.length > 1 ? (
        <PillGroup as="toggle" label={t("guide.book.filter")} tone="on-white">
          <PillToggle pressed={filter === "all"} onClick={() => setFilter("all")}>{t("guide.book.all")}</PillToggle>
          {categories.map((category) => (
            <PillToggle key={category} pressed={filter === category} onClick={() => setFilter(category)}>
              {label(category)}
            </PillToggle>
          ))}
        </PillGroup>
      ) : null}
      <p className="guide-count" role="status" aria-live="polite">
        {filter === "all"
          ? t.plural("guide.book.count", shown.length)
          : t.plural("guide.book.countIn", shown.length, { category: label(filter).toLowerCase() })}
      </p>
      <ul className="guide-list">
        {shown.map((item) => (
          <li key={item.id} className="guide-card">
            <article aria-labelledby={`guide-${item.id}`} className="guide-card__body">
              <BrandEyebrow>{label(item.category)}</BrandEyebrow>
              <h3 id={`guide-${item.id}`} className="guide-card__title">{item.title}</h3>
              {item.description ? <p className="guide-card__description">{item.description}</p> : null}
              {item.timeHint || item.mapUrl ? (
                <div className="guide-card__foot">
                  {item.timeHint ? (
                    <p className="guide-card__time">
                      <span className="guide-card__time-label">{t("guide.book.time")}</span> {item.timeHint}
                    </p>
                  ) : null}
                  {item.mapUrl ? (
                    <Cta tone="on-white" variant="secondary" href={item.mapUrl} external>
                      {t("guide.book.maps")}<span className="brand-sr-only">: {item.title}</span>
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
