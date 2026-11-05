"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { GraduateGuest } from "@grad/contract";
import { summarizeGuests } from "../../../lib/graduate/guests";
import { sliceTranslator, type MessageSlice } from "../../../lib/i18n/format";

type GuestsState = { guests: GraduateGuest[] | null; setGuests: (guests: GraduateGuest[]) => void };

const GuestsContext = createContext<GuestsState | null>(null);

/**
 * The dashboard's one copy of the guest list, shared by the summary, the list and the invite form,
 * so the counts and the rows can't disagree. A write's Server Action returns the fresh list and it
 * lands here directly. Don't replace this with revalidatePath or router.refresh(): in the production
 * build those sometimes never committed the new tree, leaving the list stale until a reload
 * (ADR-017). `null` means the first read failed; the first successful write fills it in.
 */
export function GuestsProvider({ initial, children }: { initial: GraduateGuest[] | null; children: ReactNode }) {
  const [guests, setGuests] = useState(initial);
  useEffect(() => setGuests(initial), [initial]);
  return <GuestsContext.Provider value={{ guests, setGuests }}>{children}</GuestsContext.Provider>;
}

export function useGuests(): GuestsState {
  const state = useContext(GuestsContext);
  if (!state) throw new Error("useGuests needs a GuestsProvider");
  return state;
}

/** The three counts in the greeting band. Nothing at all when the list failed: no count beats a wrong one. */
export function GuestSummary({ messages }: { messages: MessageSlice<"graduatePortal.summary."> }) {
  const t = sliceTranslator(messages);
  const { guests } = useGuests();
  if (!guests) return null;
  const summary = summarizeGuests(guests);
  return (
    <dl className="portal-summary" aria-label={t("graduatePortal.summary.label")}>
      <div>
        <dt>{t("graduatePortal.summary.attending")}</dt>
        <dd>{summary.attending}</dd>
      </div>
      <div>
        <dt>{t("graduatePortal.summary.declined")}</dt>
        <dd>{summary.declined}</dd>
      </div>
      <div>
        <dt>{t("graduatePortal.summary.pending")}</dt>
        <dd>{summary.pending}</dd>
      </div>
    </dl>
  );
}
