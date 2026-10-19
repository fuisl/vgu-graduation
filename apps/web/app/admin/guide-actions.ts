"use server";

import { revalidatePath } from "next/cache";
import { createGuideItem, deleteGuideItem, putInvitationGuide, updateGuideItem } from "../../lib/api/admin";
import { failureMessage } from "../../lib/admin/action-result";
import { formValues, type EditFormState, type QuickActionState } from "../../lib/admin/action-state";
import { formId, parseGuideItemForm, parseGuidePicksForm } from "../../lib/admin/forms";
import { redirectIfUnauthorized, requireAdminSession } from "../../lib/admin/session";

/*
 * Guide-book catalogue and per-invitation picks (#140). Same rules as
 * actions.ts. Guests read their guide with `Cache-Control: private,
 * max-age=300`, so a change reaches an open guide within five minutes.
 */

function revalidateAdmin() {
  revalidatePath("/admin", "layout");
}

/** Create (no `id`) or edit (with `id`) one catalogue item. */
export async function saveGuideItemAction(_previous: EditFormState, form: FormData): Promise<EditFormState> {
  const { token } = await requireAdminSession();
  const values = formValues(form);
  const rawId = form.get("id");
  const id = formId(form);
  if (rawId !== null && !id) return { status: "error", message: "Unknown guide item.", errors: {}, values };

  const parsed = parseGuideItemForm(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors, values };

  const result = id ? await updateGuideItem(token, id, parsed.data) : await createGuideItem(token, parsed.data);
  redirectIfUnauthorized(result);
  if (result.status === "error" && result.httpStatus === 404) {
    return { status: "error", message: "This item no longer exists. Reload the page.", errors: {}, values };
  }
  if (result.status !== "ok") return { status: "error", message: failureMessage(result), errors: {}, values };

  revalidateAdmin();
  return { status: "saved", message: id ? `Saved “${result.data.title}”.` : `Added “${result.data.title}”.` };
}

/** One-tap show/hide: `active=true|false`. Hiding keeps the item and every pick of it. */
export async function setGuideItemActiveAction(_previous: QuickActionState, form: FormData): Promise<QuickActionState> {
  const { token } = await requireAdminSession();
  const id = formId(form);
  const active = form.get("active");
  if (!id || (active !== "true" && active !== "false")) return { status: "error", message: "Unknown guide item." };

  const result = await updateGuideItem(token, id, { active: active === "true" });
  redirectIfUnauthorized(result);
  if (result.status !== "ok") return { status: "error", message: failureMessage(result) };

  revalidateAdmin();
  return { status: "done", message: active === "true" ? "Shown to guests." : "Hidden from guests." };
}

/** Deletes an item and every pick of it, after the confirm step in the UI. */
export async function deleteGuideItemAction(_previous: QuickActionState, form: FormData): Promise<QuickActionState> {
  const { token } = await requireAdminSession();
  const id = formId(form);
  if (!id) return { status: "error", message: "Unknown guide item." };

  const result = await deleteGuideItem(token, id);
  redirectIfUnauthorized(result);
  // 204 is `empty`; a 404 means it is already gone, which is what the admin wanted.
  if (result.status !== "empty" && !(result.status === "error" && result.httpStatus === 404)) {
    return { status: "error", message: failureMessage(result) };
  }

  revalidateAdmin();
  return { status: "done", message: "Deleted." };
}

/** Replaces one invitation's picks; "Use the defaults" sends an empty list. */
export async function saveGuidePicksAction(_previous: QuickActionState, form: FormData): Promise<QuickActionState> {
  const { token } = await requireAdminSession();
  const parsed = parseGuidePicksForm(form);
  if (!parsed.ok) return { status: "error", message: parsed.errors.form ?? "Check the picks and try again." };

  const result = await putInvitationGuide(token, parsed.id, parsed.data.itemIds);
  redirectIfUnauthorized(result);
  if (result.status === "error" && result.httpStatus === 400) {
    return { status: "error", message: "Some of these items were deleted meanwhile. Reload the page and pick again." };
  }
  if (result.status !== "ok") return { status: "error", message: failureMessage(result) };

  revalidateAdmin();
  const count = result.data.effective.items.length;
  return {
    status: "done",
    message: result.data.effective.tailored
      ? `Saved. The guest sees ${count} picked item${count === 1 ? "" : "s"}.`
      : `Saved. The guest sees the defaults (${count} item${count === 1 ? "" : "s"}).`,
  };
}
