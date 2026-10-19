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

/**
 * Text size switch (#176): a toggle PillGroup that scales every brand page via the root font size.
 * The boot script in the root layout applies the stored choice before paint; this only reflects and
 * changes it. Server-rendered as "Default" and corrected on mount, so it never blocks the page.
 */
export function TextSizeControl({tone = "on-white", messages}: {tone?: "on-blue" | "on-white"; messages: MessageSlice<"textSize.">}) {
  const t = sliceTranslator(messages);
  const [size, setSize] = useState<TextSize>("default");

  useEffect(() => {
    setSize(parseTextSize(document.documentElement.getAttribute(TEXT_SIZE_ATTRIBUTE)));
    // Another tab changed it: follow along.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== TEXT_SIZE_STORAGE_KEY) return;
      const next = parseTextSize(event.newValue);
      applyTextSize(document.documentElement, next);
      setSize(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
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

  return (
    <PillGroup as="toggle" label={t("textSize.label")} tone={tone}>
      {TEXT_SIZES.map((option) => (
        <PillToggle key={option} pressed={size === option} onClick={() => choose(option)}>
          {t(`textSize.${option}`)}
        </PillToggle>
      ))}
    </PillGroup>
  );
}
