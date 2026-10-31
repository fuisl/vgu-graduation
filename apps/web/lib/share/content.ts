import type { EventConfig, Inviter } from "@grad/contract";
import type { I18n } from "../i18n/dictionary";
import { formatEventWhen } from "../invite/format";
import { joinNames, type StoryContent } from "./story";

/**
 * The story card's text, in the guest's language (the event already localized). Public facts
 * and the inviting graduates' names only: no guest name, no invitation link, and the site line is
 * the public origin's host.
 */
export function buildStoryContent(event: EventConfig, inviters: readonly Pick<Inviter, "name">[], siteOrigin: string, i18n: I18n): StoryContent {
  const { t } = i18n;
  const when = formatEventWhen(event, i18n);
  const names = joinNames(inviters.map((inviter) => inviter.name), t("story.and"));
  const facts: StoryContent["facts"] = [
    { label: t("story.when"), value: when.date, detail: when.time },
    { label: t("story.where"), value: event.venue.name, detail: event.venue.address },
  ];
  if (names) facts.push({ label: t("story.invitedBy"), value: names });
  return {
    mark: "GRAD '26",
    eyebrow: t("story.eyebrow"),
    title: t("story.title"),
    facts,
    site: new URL(siteOrigin).host,
    description: t("story.description", { when: `${when.date}, ${when.time}`, where: event.venue.name, names: names || "—" }),
  };
}
