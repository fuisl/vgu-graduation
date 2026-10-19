"use server";

import { revalidatePath } from "next/cache";
import { updateGraduate, updateInvitation } from "../../lib/api/admin";
import { failureMessage } from "../../lib/admin/action-result";
import { formValues, type EditFormState, type QuickActionState } from "../../lib/admin/action-state";
import { formId, parseGraduateEditForm, parseInvitationEditForm } from "../../lib/admin/forms";
import { redirectIfUnauthorized, requireAdminSession } from "../../lib/admin/session";

/*
 * Edits to existing graduates and invitations, and the one-tap name check
 * (#170). Same rules as actions.ts: re-verify the session, forward it as a
 * Bearer header, revalidate the admin pages, never log (names, emails and
 * phone numbers are guest PII).
 */

function revalidateAdmin() {
  revalidatePath("/admin", "layout");
}

export async function updateGraduateAction(_previous: EditFormState, form: FormData): Promise<EditFormState> {
  const { token } = await requireAdminSession();
  const values = formValues(form);
  const parsed = parseGraduateEditForm(form);
  if (!parsed.ok) {
    const { form: message, ...errors } = parsed.errors;
    return { status: "error", message, errors, values };
  }

  const result = await updateGraduate(token, parsed.id, parsed.data);
  redirectIfUnauthorized(result);
  if (result.status === "error" && result.httpStatus === 409) {
    return { status: "error", errors: { email: "A graduate with this email already exists" }, values };
  }
  if (result.status === "error" && result.httpStatus === 404) {
    return { status: "error", message: "This graduate no longer exists.", errors: {}, values };
  }
  if (result.status !== "ok") return { status: "error", message: failureMessage(result), errors: {}, values };

  revalidateAdmin();
  return { status: "saved", message: `Saved ${result.data.name}.` };
}

export async function updateInvitationAction(_previous: EditFormState, form: FormData): Promise<EditFormState> {
  const { token } = await requireAdminSession();
  const values = formValues(form);
  const parsed = parseInvitationEditForm(form);
  if (!parsed.ok) {
    const { form: message, ...errors } = parsed.errors;
    return { status: "error", message, errors, values };
  }

  const result = await updateInvitation(token, parsed.id, parsed.data);
  redirectIfUnauthorized(result);
  if (result.status === "error" && result.httpStatus === 409) {
    // "The guest already confirmed N plus-ones": no PII in it.
    return { status: "error", errors: { maxPlusOnes: `${result.message}. Ask them to change their RSVP first.` }, values };
  }
  if (result.status === "error" && result.httpStatus === 404) {
    return { status: "error", message: "This invitation no longer exists.", errors: {}, values };
  }
  if (result.status !== "ok") return { status: "error", message: failureMessage(result), errors: {}, values };

  revalidateAdmin();
  return { status: "saved", message: `Saved ${result.data.guest.name}.` };
}

/** "Looks right": confirms the stored given/family split of a graduate or a guest. */
export async function confirmNameAction(_previous: QuickActionState, form: FormData): Promise<QuickActionState> {
  const { token } = await requireAdminSession();
  const id = formId(form);
  const kind = form.get("kind");
  if (!id || (kind !== "graduate" && kind !== "invitation")) return { status: "error", message: "Unknown name." };

  const result =
    kind === "graduate"
      ? await updateGraduate(token, id, { nameReviewed: true })
      : await updateInvitation(token, id, { nameReviewed: true });
  redirectIfUnauthorized(result);
  if (result.status !== "ok") return { status: "error", message: failureMessage(result) };

  revalidateAdmin();
  return { status: "done", message: "Name confirmed." };
}
