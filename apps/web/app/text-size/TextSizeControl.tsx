"use client";

import {useEffect, useState} from "react";
import {PillGroup, PillToggle} from "@grad/ui";
import {
  TEXT_SIZES,
  TEXT_SIZE_ATTRIBUTE,
  TEXT_SIZE_STORAGE_KEY,
  applyTextSize,
  parseTextSize,
  type TextSize,
} from "../../lib/a11y/text-size";
import {sliceTranslator, type MessageSlice} from "../../lib/i18n/format";

type Props = {
  tone?: "on-blue" | "on-white";
  messages: MessageSlice<"textSize.">;
  /**
   * `full` (default): a toggle PillGroup with the words Default, Large, Largest.
   * `compact`: three "A"s in rising sizes, styled like the EN | VI switch beside it in the menubar;
   * each option is still named by its word.
   */
  variant?: "full" | "compact";
};

/**
 * Text size switch (#176): scales every brand page via the root font size. It lives in the
 * menubar (desktop action row and mobile sheet). The boot script in the root layout applies the
 * stored choice before paint; this only reflects and changes it. Until mount the full variant
 * shows "Default" and the compact one shows no option pressed (the server cannot know the stored
 * choice), so it never blocks the page. Several copies on one page stay in step by watching the
 * attribute on <html>.
 */
export function TextSizeControl({tone = "on-white", messages, variant = "full"}: Props) {
  const t = sliceTranslator(messages);
  // Unknown until mount: the boot script may already have applied a stored size.
  const [size, setSize] = useState<TextSize | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setSize(parseTextSize(root.getAttribute(TEXT_SIZE_ATTRIBUTE)));
    read();
    // Another copy on this page changed it.
    const observer = new MutationObserver(read);
    observer.observe(root, {attributes: true, attributeFilter: [TEXT_SIZE_ATTRIBUTE]});
    // Another tab changed it: follow along.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== TEXT_SIZE_STORAGE_KEY) return;
      applyTextSize(root, parseTextSize(event.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => {
      observer.disconnect();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function choose(next: TextSize) {
    applyTextSize(document.documentElement, next);
    setSize(next);
    try {
      if (next === "default") localStorage.removeItem(TEXT_SIZE_STORAGE_KEY);
      else localStorage.setItem(TEXT_SIZE_STORAGE_KEY, next);
    } catch {
      // Storage blocked (private mode): the size still applies until the page is left.
    }
  }

  if (variant === "compact") {
    return (
      <div className="brand-lang brand-text-size">
        <div className="brand-lang__group" role="group" aria-label={t("textSize.label")}>
          {TEXT_SIZES.map((option) => (
            <button
              key={option}
              type="button"
              className={`brand-lang__option brand-text-size__option brand-text-size__option--${option}`}
              aria-label={t(`textSize.${option}`)}
              title={t(`textSize.${option}`)}
              aria-pressed={size === option}
              onClick={() => choose(option)}
            >
              <span aria-hidden="true">A</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <PillGroup as="toggle" label={t("textSize.label")} tone={tone}>
      {TEXT_SIZES.map((option) => (
        <PillToggle key={option} pressed={(size ?? "default") === option} onClick={() => choose(option)}>
          {t(`textSize.${option}`)}
        </PillToggle>
      ))}
    </PillGroup>
  );
}
