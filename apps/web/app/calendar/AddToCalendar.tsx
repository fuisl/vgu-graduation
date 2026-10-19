"use client";

import { useEffect, useId, useState } from "react";
import { BrandEyebrow, Cta } from "@grad/ui";
import type { CalendarLinks } from "../../lib/calendar/links";
import { calendarPlatform, primaryCalendarLink, type CalendarPlatform } from "../../lib/calendar/platform";
import { sliceTranslator, type MessageSlice } from "../../lib/i18n/format";
import "./calendar.css";

type Props = {
  /** `buildCalendarLinks(localizedEvent, …)` from the server. */
  links: CalendarLinks;
  /** `pickMessages(locale, "calendar.")`. */
  messages: MessageSlice<"calendar.">;
  /** The surface the block sits on. */
  tone: "on-blue" | "on-white";
  /**
   * `all` (default): the "Add to calendar" action and every calendar option.
   * `action`: the action alone (the landing hero). `options`: the options alone, under a label.
   */
  show?: "all" | "action" | "options";
  /** The action's `Cta` variant: `primary` where it is the view's main action, else `secondary`. */
  emphasis?: "primary" | "secondary";
};

/**
 * Add to calendar (QA P1-3, #150): one action that opens the right calendar for this device
 * (`lib/calendar/platform.ts`: Google on Android, the subscribable feed on Apple, the .ics file
 * elsewhere), plus every option as a secondary `Cta`. The server render and the first client
 * render use the .ics file, so there is no hydration mismatch and it works before JavaScript.
 */
export function AddToCalendar({ links, messages, tone, show = "all", emphasis = "primary" }: Props) {
  const t = sliceTranslator(messages);
  const labelId = useId();
  const [platform, setPlatform] = useState<CalendarPlatform>("other");

  useEffect(() => {
    setPlatform(calendarPlatform(typeof navigator === "undefined" ? undefined : navigator));
  }, []);

  const primary = primaryCalendarLink(links, platform);
  const action = (
    <Cta tone={tone} variant={emphasis} href={primary.href} external={primary.external}>
      {t("calendar.add")}
    </Cta>
  );
  if (show === "action") return action;

  return (
    <div className={`calendar calendar--${tone}`}>
      {show === "all" ? <div className="calendar__action">{action}</div> : null}
      <div className="calendar__options" role="group" aria-labelledby={labelId}>
        <BrandEyebrow>
          <span id={labelId}>{show === "all" ? t("calendar.choose") : t("calendar.add")}</span>
        </BrandEyebrow>
        <ul className="calendar__list">
          <li>
            <Cta tone={tone} variant="secondary" href={links.google} external>{t("calendar.google")}</Cta>
          </li>
          <li>
            <Cta tone={tone} variant="secondary" href={links.webcal}>{t("calendar.apple")}</Cta>
          </li>
          <li>
            <Cta tone={tone} variant="secondary" href={links.outlook} external>{t("calendar.outlook")}</Cta>
          </li>
          <li>
            <Cta tone={tone} variant="secondary" href={links.ics}>{t("calendar.ics")}</Cta>
          </li>
        </ul>
      </div>
    </div>
  );
}
