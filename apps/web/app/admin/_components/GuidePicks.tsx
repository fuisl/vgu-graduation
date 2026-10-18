"use client";

import type { AdminGuideItem } from "@grad/contract";
import Link from "next/link";
import { useActionState, useState } from "react";
import { IDLE, type QuickActionState } from "../../../lib/admin/action-state";
import { GUIDE_CATEGORY_LABELS } from "../../../lib/admin/labels";
import { saveGuidePicksAction } from "../guide-actions";
import { FormMessage } from "./Field";
import { SubmitButton } from "./SubmitButton";

interface GuidePicksProps {
  invitationId: string;
  guestName: string;
  /** The whole catalogue in sort order. */
  catalogue: AdminGuideItem[];
  selectedItemIds: string[];
  /** What the guest sees right now: their picks that are still shown, or every shown item. */
  effective: { tailored: boolean; itemIds: string[] };
}

/**
 * Guide-book picks for one invitation (#140): select-item cards. Nothing
 * picked means the guest gets the defaults (every item shown to guests).
 * Each card marks whether the guest sees it now, from the saved state.
 */
export function GuidePicks({ invitationId, guestName, catalogue, selectedItemIds, effective }: GuidePicksProps) {
  const [state, action] = useActionState<QuickActionState, FormData>(saveGuidePicksAction, IDLE);
  const [checked, setChecked] = useState(() => new Set(selectedItemIds));
  // After a save the page re-renders with the stored picks: follow them (keeping the action's message).
  const storedKey = selectedItemIds.join();
  const [syncedKey, setSyncedKey] = useState(storedKey);
  if (syncedKey !== storedKey) {
    setSyncedKey(storedKey);
    setChecked(new Set(selectedItemIds));
  }
  const seen = new Set(effective.itemIds);
  // Hidden items are only listed when picked, so the admin can see and drop the pick.
  const cards = catalogue.filter((item) => item.active || selectedItemIds.includes(item.id));
  const hiddenCount = catalogue.length - cards.length;

  function toggle(id: string, on: boolean) {
    setChecked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <form action={action} aria-labelledby="guide-picks-heading">
      <h2 id="guide-picks-heading">Guide-book picks</h2>
      <p className="admin-muted">
        Places and things to do while the graduates are busy. Pick what suits {guestName}, or leave it to the
        defaults.
      </p>
      <p>
        <strong>Now:</strong>{" "}
        {effective.tailored
          ? `${guestName} sees ${effective.itemIds.length} picked item${effective.itemIds.length === 1 ? "" : "s"}.`
          : `${guestName} sees the defaults: every item shown to guests (${effective.itemIds.length}).`}
      </p>
      {state.status === "error" ? <FormMessage kind="error">{state.message}</FormMessage> : null}
      {state.status === "done" ? <FormMessage kind="success">{state.message}</FormMessage> : null}
      <input type="hidden" name="invitationId" value={invitationId} />

      {cards.length === 0 ? (
        <p>
          The guide-book is empty.{" "}
          <Link href="/admin/guide" prefetch={false}>
            Add places to the catalogue
          </Link>{" "}
          first.
        </p>
      ) : (
        <fieldset className="admin-fieldset">
          <legend>Choose items ({checked.size} picked{checked.size === 0 ? ": the guest gets the defaults" : ""})</legend>
          <ul className="admin-card-grid">
            {cards.map((item) => (
              <li key={item.id}>
                <label className="admin-select-card">
                  <input
                    type="checkbox"
                    name="itemIds"
                    value={item.id}
                    checked={checked.has(item.id)}
                    onChange={(event) => toggle(item.id, event.currentTarget.checked)}
                  />
                  <span className="admin-select-card__body">
                    <span className="admin-select-card__title">{item.title}</span>
                    <span className="admin-muted admin-select-card__meta">
                      {GUIDE_CATEGORY_LABELS[item.category]}
                      {item.timeHint ? ` · ${item.timeHint}` : ""}
                    </span>
                    {item.description ? <span className="admin-select-card__text">{item.description}</span> : null}
                    <span className="admin-select-card__status">
                      {!item.active ? (
                        <span className="admin-badge">Hidden from guests</span>
                      ) : seen.has(item.id) ? (
                        <span className="admin-badge admin-badge--quiet">
                          {effective.tailored ? "Guest sees this" : "Guest sees this (default)"}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {hiddenCount > 0 ? (
            <p className="admin-hint">
              {hiddenCount} hidden item{hiddenCount === 1 ? " is" : "s are"} not listed. Show {hiddenCount === 1 ? "it" : "them"} on
              the guide-book page to pick {hiddenCount === 1 ? "it" : "them"}.
            </p>
          ) : null}
        </fieldset>
      )}

      <div className="admin-actions admin-sticky-actions">
        {cards.length > 0 ? <SubmitButton pendingLabel="Saving…" name="intent" value="save">Save picks</SubmitButton> : null}
        {selectedItemIds.length > 0 ? (
          <SubmitButton pendingLabel="Saving…" name="intent" value="defaults" variant="outline">
            Use the defaults
          </SubmitButton>
        ) : null}
      </div>
    </form>
  );
}
