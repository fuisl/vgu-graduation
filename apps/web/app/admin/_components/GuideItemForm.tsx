"use client";

import type { AdminGuideItem } from "@grad/contract";
import { useActionState, useEffect, useState } from "react";
import { IDLE, type EditFormState } from "../../../lib/admin/action-state";
import { GUIDE_CATEGORIES, GUIDE_CATEGORY_LABELS, GUIDE_LIMITS } from "../../../lib/admin/labels";
import { saveGuideItemAction } from "../guide-actions";
import { Field, FormMessage, valueOf } from "./Field";
import { SubmitButton } from "./SubmitButton";

/**
 * Create (no `item`) or edit one guide-book entry (#140). Without an item the
 * form starts with the next sort order so a new entry lands at the end.
 */
export function GuideItemForm({ item, nextSortOrder = 0 }: { item?: AdminGuideItem; nextSortOrder?: number }) {
  const [state, formAction] = useActionState<EditFormState, FormData>(saveGuideItemAction, IDLE);
  // A successful create resets the uncontrolled fields; remount so the defaults (sort order, shown) come back too.
  const [resets, setResets] = useState(0);
  useEffect(() => {
    if (state.status === "saved" && !item) setResets((count) => count + 1);
  }, [state, item]);
  const errors = state.status === "error" ? state.errors : {};
  const values = state.status === "error" ? state.values : undefined;
  const prefix = item ? `guide-${item.id}` : "guide-new";
  const value = (name: string, stored: string | null | undefined) => valueOf(values, name) ?? stored ?? "";
  const categoryErrorId = errors.category ? `${prefix}-category-error` : undefined;
  const activeChecked = values ? values.active === "on" : (item?.active ?? true);

  return (
    <form
      key={resets}
      action={formAction}
      className="admin-form"
      noValidate
      aria-labelledby={item ? undefined : "guide-new-heading"}
      aria-label={item ? `Edit ${item.title}` : undefined}
    >
      {item ? null : <h2 id="guide-new-heading">Add a place or thing to do</h2>}
      {state.status === "error" && state.message ? <FormMessage kind="error">{state.message}</FormMessage> : null}
      {state.status === "saved" ? <FormMessage kind="success">{state.message}</FormMessage> : null}
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <Field
        id={`${prefix}-title`}
        name="title"
        label="Title"
        required
        autoComplete="off"
        maxLength={GUIDE_LIMITS.title}
        defaultValue={value("title", item?.title)}
        error={errors.title}
      />
      <div className="admin-field">
        <label htmlFor={`${prefix}-category`}>Category</label>
        <select
          id={`${prefix}-category`}
          name="category"
          className="admin-input"
          defaultValue={value("category", item?.category ?? "explore")}
          aria-invalid={errors.category ? true : undefined}
          aria-describedby={categoryErrorId}
        >
          {GUIDE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {GUIDE_CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
        {errors.category ? (
          <p id={categoryErrorId} className="admin-field-error">
            {errors.category}
          </p>
        ) : null}
      </div>
      <Field
        id={`${prefix}-description`}
        name="description"
        label="Description"
        type="textarea"
        maxLength={GUIDE_LIMITS.description}
        hint="One or two sentences guests read on their phone."
        defaultValue={value("description", item?.description)}
        error={errors.description}
      />
      <Field
        id={`${prefix}-map-url`}
        name="mapUrl"
        label="Map link"
        type="url"
        autoComplete="off"
        hint="Starts with https://"
        defaultValue={value("mapUrl", item?.mapUrl)}
        error={errors.mapUrl}
      />
      <Field
        id={`${prefix}-time-hint`}
        name="timeHint"
        label="Time hint"
        autoComplete="off"
        maxLength={GUIDE_LIMITS.timeHint}
        hint="e.g. “10 min walk” or “Best before noon”."
        defaultValue={value("timeHint", item?.timeHint)}
        error={errors.timeHint}
      />
      <Field
        id={`${prefix}-sort-order`}
        name="sortOrder"
        label="Sort order"
        type="number"
        min={-10000}
        max={10000}
        required
        hint="Lower numbers come first."
        defaultValue={value("sortOrder", String(item?.sortOrder ?? nextSortOrder))}
        error={errors.sortOrder}
      />
      <label className="admin-check">
        <input type="checkbox" name="active" defaultChecked={activeChecked} />
        <span>Shown to guests</span>
      </label>
      <SubmitButton pendingLabel="Saving…">{item ? "Save item" : "Add item"}</SubmitButton>
    </form>
  );
}
