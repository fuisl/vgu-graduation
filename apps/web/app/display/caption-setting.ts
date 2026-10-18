import type { SourceLanguage, TargetLanguage } from "@grad/contract";

/**
 * Which caption line the display shows. `auto` (default) shows the other hall
 * language: Vietnamese while English is spoken and English while Vietnamese is
 * spoken. German readers use /live on their phones.
 */
export type CaptionSetting = "auto" | "off" | TargetLanguage;

export function parseCaptionSetting(value: string | string[] | undefined): CaptionSetting {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "off" || v === "en" || v === "vi" || v === "de" ? v : "auto";
}

export function captionLanguage(setting: Exclude<CaptionSetting, "off">, spoken: SourceLanguage): TargetLanguage {
  if (setting !== "auto") return setting;
  return spoken === "en" ? "vi" : "en";
}
