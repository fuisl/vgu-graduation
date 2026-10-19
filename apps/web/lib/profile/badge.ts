import type { EventConfig, Guest } from "@grad/contract";
import type { BadgeCard } from "../../app/guest/badge/card";
import type { ApiResult } from "../api/result";
import type { I18n } from "../i18n/dictionary";
import { guestGivenName } from "../invite/guest-name";

/*
 * What the name badge prints (`app/guest/badge`), built on the server in the page's language.
 * Only the guest's names and public event facts: never the token, an email or a phone number.
 */

type Copy = Pick<I18n, "t" | "intl">;

const upper = (text: string, intl: string) => text.toLocaleUpperCase(intl);

/** "21 NOV 2026" (en-GB) or "21 THG 11, 2026" (vi-VN), in the event's time zone. */
export function badgeDate(event: Pick<EventConfig, "startsAt" | "timeZone">, intl: string): string {
  const format = new Intl.DateTimeFormat(intl, { day: "numeric", month: "short", year: "numeric", timeZone: event.timeZone });
  return upper(format.format(new Date(event.startsAt)), intl);
}

function common({ t, intl }: Copy) {
  return {
    role: upper(t("badge.card.role"), intl),
    place: upper(t("badge.card.place"), intl),
    tagline: upper(t("badge.card.tagline"), intl),
  };
}

/** The signed-in guest's badge: the given name large, the full name below when it differs (#170). */
export function guestBadgeCard(guest: Pick<Guest, "name" | "givenName">, event: ApiResult<EventConfig>, copy: Copy): BadgeCard {
  const givenName = guestGivenName(guest);
  const fullName = guest.name.trim();
  return {
    givenName,
    fullName: fullName && fullName !== givenName ? upper(fullName, copy.intl) : null,
    date: event.status === "ok" ? badgeDate(event.data, copy.intl) : null,
    status: null,
    ...common(copy),
  };
}

/** The unnamed demo badge: /guest/prototype, and the guest portal before an invitation is opened. */
export function demoBadgeCard(copy: Copy): BadgeCard {
  const month = new Intl.DateTimeFormat(copy.intl, { month: "short", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
  return {
    givenName: copy.t("badge.demo.name"),
    fullName: null,
    date: upper(month.format(new Date("2026-11-15T12:00:00+07:00")), copy.intl),
    status: upper(copy.t("badge.card.preview"), copy.intl),
    ...common(copy),
  };
}

/** Accessible names for the guest's badge, interactive (3D) and static (CSS). */
export function guestBadgeLabels(name: string, { t }: Pick<I18n, "t">): { interactive: string; static: string } {
  return { interactive: t("badge.labelInteractive", { name }), static: t("badge.label", { name }) };
}

/** Accessible names for the demo badge. */
export function demoBadgeLabels({ t }: Pick<I18n, "t">): { interactive: string; static: string } {
  return { interactive: t("badge.interactive"), static: t("badge.static") };
}
