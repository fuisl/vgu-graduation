"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import type { GraduateGuest } from "@grad/contract";
import { Cta, PillGroup, PillToggle } from "@grad/ui";
import { filterGuests, type GuestFilter } from "../../../lib/graduate/guests";
import { sliceTranslator, type MessageSlice } from "../../../lib/i18n/format";
import { removeGuest } from "../actions";

/** The event's time zone, so an answered date reads the same on the server and every phone. */
const DATE_TIME_ZONE = "Asia/Ho_Chi_Minh";

const FILTERS: readonly GuestFilter[] = ["all", "attending", "declined", "pending"];

const FILTER_KEYS = {
  all: "graduatePortal.guests.filterAll",
  attending: "graduatePortal.guests.attending",
  declined: "graduatePortal.guests.declined",
  pending: "graduatePortal.guests.pending",
} as const;

type Notice = { tone: "ok" | "problem"; text: string };

/**
 * The guest list (ADR-017): search and filter run here on what the server sent, so they work on a
 * bad venue network. A stacked list at every width, never a wide table. Removing a guest asks first,
 * in the row itself, and says what will happen, which depends on whether anyone else invited them.
 */
export function GuestsPanel({ guests, intl, messages }: { guests: GraduateGuest[]; intl: string; messages: MessageSlice<"graduatePortal.guests."> }) {
  const t = sliceTranslator(messages);
  const id = useId();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<GuestFilter>("all");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [removing, startRemoving] = useTransition();
  const noticeRef = useRef<HTMLParagraphElement>(null);

  const dates = useMemo(() => new Intl.DateTimeFormat(intl, { day: "numeric", month: "short", year: "numeric", timeZone: DATE_TIME_ZONE }), [intl]);
  const shown = useMemo(() => filterGuests(guests, query, filter), [guests, query, filter]);

  function remove(guest: GraduateGuest) {
    startRemoving(async () => {
      let next: Notice;
      try {
        const outcome = await removeGuest(guest.id);
        switch (outcome) {
          case "revoked":
            next = { tone: "ok", text: t("graduatePortal.guests.removedRevoked", { name: guest.name }) };
            break;
          case "unlinked":
            next = { tone: "ok", text: t("graduatePortal.guests.removedUnlinked", { name: guest.name }) };
            break;
          case "not_found":
            next = { tone: "ok", text: t("graduatePortal.guests.removeNotFound") };
            break;
          case "limited":
            next = { tone: "problem", text: t("graduatePortal.guests.removeLimited") };
            break;
          default:
            next = { tone: "problem", text: t("graduatePortal.guests.removeFailed") };
        }
      } catch {
        next = { tone: "problem", text: t("graduatePortal.guests.removeFailed") };
      }
      setNotice(next);
      setConfirming(null);
      noticeRef.current?.focus();
    });
  }

  return (
    <div className="portal-guests">
      {/* Always in the DOM, so screen readers announce a removal even when the list is now empty. */}
      <p ref={noticeRef} tabIndex={-1} className={`portal-status${notice?.tone === "problem" ? " portal-status--problem" : ""}`} role="status">
        {notice?.text}
      </p>

      {guests.length === 0 ? (
        <div className="portal-empty">
          <p className="portal-empty__title">{t("graduatePortal.guests.emptyTitle")}</p>
          <p className="join-text">{t("graduatePortal.guests.emptyBody")}</p>
        </div>
      ) : (
        <>
          <div className="portal-controls">
            <div className="join-field">
              <label className="join-label" htmlFor={`${id}-search`}>{t("graduatePortal.guests.searchLabel")}</label>
              <input
                id={`${id}-search`}
                className="join-input"
                type="search"
                autoComplete="off"
                placeholder={t("graduatePortal.guests.searchPlaceholder")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <PillGroup as="toggle" tone="on-white" label={t("graduatePortal.guests.filterLabel")}>
              {FILTERS.map((option) => (
                <PillToggle key={option} pressed={filter === option} onClick={() => setFilter(option)}>
                  {t(FILTER_KEYS[option])}
                </PillToggle>
              ))}
            </PillGroup>
          </div>

          <p className="portal-count" role="status">{t.plural("graduatePortal.guests.count", shown.length)}</p>

          {shown.length === 0 ? (
            <p className="join-text">{t("graduatePortal.guests.noMatch")}</p>
          ) : (
            <ul className="portal-list" aria-labelledby="portal-guests-heading">
              {shown.map((guest) => (
                <GuestRow
                  key={guest.id}
                  guest={guest}
                  answered={guest.answeredAt ? t("graduatePortal.guests.answered", { date: dates.format(new Date(guest.answeredAt)) }) : t("graduatePortal.guests.notAnswered")}
                  confirming={confirming === guest.id}
                  removing={removing && confirming === guest.id}
                  onAsk={() => setConfirming(guest.id)}
                  onKeep={() => setConfirming(null)}
                  onRemove={() => remove(guest)}
                  t={t}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function GuestRow({
  guest,
  answered,
  confirming,
  removing,
  onAsk,
  onKeep,
  onRemove,
  t,
}: {
  guest: GraduateGuest;
  answered: string;
  confirming: boolean;
  removing: boolean;
  onAsk: () => void;
  onKeep: () => void;
  onRemove: () => void;
  t: ReturnType<typeof sliceTranslator<keyof MessageSlice<"graduatePortal.guests.">>>;
}) {
  const id = useId();
  const confirmRef = useRef<HTMLParagraphElement>(null);
  const askRef = useRef<HTMLDivElement>(null);
  const wasConfirming = useRef(false);

  // Move focus with the question, and back to Remove if they keep the guest.
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
    else if (wasConfirming.current) askRef.current?.querySelector("button")?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const statusKey = FILTER_KEYS[guest.status];

  return (
    <li className="portal-guest">
      <div className="portal-guest__who">
        <p className="portal-guest__name">{guest.name}</p>
        <p className="portal-guest__email">{guest.email ?? t("graduatePortal.guests.noEmail")}</p>
      </div>
      <div className="portal-guest__answer">
        <p className={`portal-guest__status portal-guest__status--${guest.status}`}>{t(statusKey)}</p>
        <p className="portal-guest__date">{answered}</p>
      </div>
      {confirming ? (
        <div className="portal-confirm" role="group" aria-labelledby={`${id}-question`}>
          <p id={`${id}-question`} ref={confirmRef} tabIndex={-1} className={`portal-confirm__question${guest.soleInviter ? " portal-confirm__question--warn" : ""}`}>
            {guest.soleInviter
              ? t("graduatePortal.guests.confirmSole", { name: guest.name })
              : t("graduatePortal.guests.confirmShared", { name: guest.name })}
          </p>
          <div className="portal-row">
            <Cta tone="on-white" variant="secondary" onClick={onRemove} disabled={removing}>
              {removing ? t("graduatePortal.guests.removing") : t("graduatePortal.guests.confirmRemove")}
            </Cta>
            <Cta tone="on-white" variant="secondary" onClick={onKeep} disabled={removing}>{t("graduatePortal.guests.keep")}</Cta>
          </div>
        </div>
      ) : (
        <div className="portal-guest__action" ref={askRef}>
          <Cta tone="on-white" variant="secondary" onClick={onAsk} aria-label={t("graduatePortal.guests.removeLabel", { name: guest.name })}>
            {t("graduatePortal.guests.remove")}
          </Cta>
        </div>
      )}
    </li>
  );
}
