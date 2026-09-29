"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import {
  createGraduate,
  createInvitation,
  revokeInvitation,
  rotateInvitation,
  updateEvent,
} from "../../lib/api/admin";
import type { ApiResult } from "../../lib/api/result";
import {
  formValues,
  type EventFormState,
  type GraduateFormState,
  type InvitationActionState,
  type InvitationFormState,
} from "../../lib/admin/action-state";
import { parseEventForm, parseGraduateForm, parseInvitationForm } from "../../lib/admin/forms";
import { redirectIfUnauthorized, requireAdminSession } from "../../lib/admin/session";

/*
 * Admin writes. Each action re-verifies the admin session (layouts do not
 * guard actions), forwards the session token to the API as a Bearer header via
 * lib/api/admin.ts, and revalidates every admin page. Nothing here logs.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failureMessage(result: ApiResult<unknown>): string {
  if (result.status !== "error") return "Something went wrong. Try again.";
  if (result.kind === "network") return "Could not reach the API. Check the connection and try again.";
  if (result.kind === "validation") return "The API sent an unexpected response. Reload the page to check what was saved.";
  return result.message;
}

function revalidateAdmin() {
  revalidatePath("/admin", "layout");
}

export async function addGraduateAction(_previous: GraduateFormState, form: FormData): Promise<GraduateFormState> {
  const { token } = await requireAdminSession();
  const values = formValues(form);
  const parsed = parseGraduateForm(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors, values };

  const result = await createGraduate(token, parsed.data);
  redirectIfUnauthorized(result);
  if (result.status === "error" && result.httpStatus === 409) {
    return { status: "error", errors: { email: "A graduate with this email already exists" }, values };
  }
  if (result.status !== "ok") return { status: "error", message: failureMessage(result), errors: {}, values };

  revalidateAdmin();
  return { status: "success", message: `Added ${result.data.name} (${result.data.email}).` };
}

export async function createInvitationAction(
  _previous: InvitationFormState,
  form: FormData
): Promise<InvitationFormState> {
  const { token } = await requireAdminSession();
  const values = formValues(form);
  const parsed = parseInvitationForm(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors, values };

  const result = await createInvitation(token, parsed.data);
  redirectIfUnauthorized(result);
  if (result.status === "error" && result.httpStatus === 400) {
    return { status: "error", errors: { inviterUserIds: result.message }, values };
  }
  if (result.status !== "ok") return { status: "error", message: failureMessage(result), errors: {}, values };

  revalidateAdmin();
  return { status: "created", guestName: result.data.guest.name, inviteUrl: result.data.inviteUrl };
}

function invitationId(form: FormData): string | null {
  const id = form.get("invitationId");
  return typeof id === "string" && UUID.test(id) ? id : null;
}

export async function rotateInvitationAction(
  _previous: InvitationActionState,
  form: FormData
): Promise<InvitationActionState> {
  const { token } = await requireAdminSession();
  const id = invitationId(form);
  if (!id) return { status: "error", message: "Unknown invitation." };

  const result = await rotateInvitation(token, id);
  redirectIfUnauthorized(result);
  if (result.status !== "ok") return { status: "error", message: failureMessage(result) };

  revalidateAdmin();
  return { status: "rotated", inviteUrl: result.data.inviteUrl };
}

export async function revokeInvitationAction(
  _previous: InvitationActionState,
  form: FormData
): Promise<InvitationActionState> {
  const { token } = await requireAdminSession();
  const id = invitationId(form);
  if (!id) return { status: "error", message: "Unknown invitation." };

  const result = await revokeInvitation(token, id);
  redirectIfUnauthorized(result);
  if (result.status !== "ok") return { status: "error", message: failureMessage(result) };

  revalidateAdmin();
  return { status: "revoked" };
}

export async function updateEventAction(_previous: EventFormState, form: FormData): Promise<EventFormState> {
  const { token } = await requireAdminSession();
  const values = formValues(form);
  const parsed = parseEventForm(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors, values };

  const result = await updateEvent(token, parsed.data);
  redirectIfUnauthorized(result);
  if (result.status !== "ok") return { status: "error", message: failureMessage(result), errors: {}, values };

  revalidateAdmin();
  // Guest pages cache GET /event under this tag (lib/api/event.ts).
  revalidateTag("event");
  return { status: "saved", event: result.data };
}
