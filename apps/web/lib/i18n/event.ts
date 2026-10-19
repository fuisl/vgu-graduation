import type { EventConfig } from "@grad/contract";
import type { ApiResult } from "../api/result";
import type { Locale } from "./config";

function pick(vi: string | null | undefined, en: string): string;
function pick(vi: string | null | undefined, en: string | null): string | null;
function pick(vi: string | null | undefined, en: string | null): string | null {
  return vi?.trim() ? vi : en;
}

/**
 * GET /event in the guest's language (#9, ADR-010): in Vietnamese the optional `nameVi`,
 * `venue.addressVi` and `arrivalInfoVi` replace their English fields when set; anything not
 * translated stays English. The venue name, contact and times are the same in both. Pure.
 */
export function localizeEvent<E extends EventConfig>(event: E, locale: Locale): E {
  if (locale !== "vi") return event;
  return {
    ...event,
    name: pick(event.nameVi, event.name),
    venue: { ...event.venue, address: pick(event.venue.addressVi, event.venue.address) },
    arrivalInfo: pick(event.arrivalInfoVi, event.arrivalInfo),
  };
}

/** localizeEvent over an API result; errors pass through unchanged. */
export function localizeEventResult(result: ApiResult<EventConfig>, locale: Locale): ApiResult<EventConfig> {
  return result.status === "ok" ? { ...result, data: localizeEvent(result.data, locale) } : result;
}
