import Link from "next/link";
import { splitPersonName } from "@grad/contract";
import { Rule } from "@grad/ui";
import { getInvitationGuide, listGuideItems, listInvitations } from "../../../../../lib/api/admin";
import { describeRsvp } from "../../../../../lib/admin/overview";
import { redirectIfUnauthorized, requireAdminSession } from "../../../../../lib/admin/session";
import { ConfirmNameButton, NameSplit } from "../../../_components/ConfirmNameButton";
import { InvitationEditForm } from "../../../_components/EditForms";
import { GuidePicks } from "../../../_components/GuidePicks";
import { LoadError } from "../../../_components/LoadError";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One invitation: edit the guest (#170) and pick their guide-book (#140).
 * There is no single-invitation GET; the guest list is small. The invite link
 * is never shown here (rotate from the list to issue a new one).
 */
export default async function InvitationPage({ params }: { params: Promise<{ id: string }> }) {
  const { token } = await requireAdminSession();
  const { id } = await params;
  if (!UUID.test(id)) return <NotFound />;

  const [invitations, catalogue, guide] = await Promise.all([
    listInvitations(token),
    listGuideItems(token),
    getInvitationGuide(token, id),
  ]);
  redirectIfUnauthorized(invitations);
  redirectIfUnauthorized(catalogue);
  redirectIfUnauthorized(guide);

  if (invitations.status !== "ok") {
    return (
      <>
        <BackLink />
        <LoadError what="the invitation" result={invitations} />
      </>
    );
  }
  const invitation = invitations.data.items.find((item) => item.id === id);
  if (!invitation) return <NotFound />;
  const { guest } = invitation;

  return (
    <>
      <BackLink />
      <h1>{guest.name}</h1>
      <p className="admin-muted">
        {invitation.status === "active" ? "Active" : "Revoked"} · Invited by{" "}
        {invitation.inviters.map((inviter) => inviter.name).join(", ") || "—"} · RSVP:{" "}
        {describeRsvp(invitation.rsvp, invitation.maxPlusOnes)}
      </p>

      {guest.nameReviewed === false ? (
        <div className="admin-notice" role="note">
          <p>
            <strong>Check the name.</strong> The given and family name were guessed from the full name:{" "}
            <NameSplit givenName={guest.givenName} familyName={guest.familyName} />
          </p>
          <ConfirmNameButton kind="invitation" id={invitation.id} displayName={guest.name} />
        </div>
      ) : null}

      <InvitationEditForm
        invitation={{
          id: invitation.id,
          guestName: guest.name,
          // Always sent by the API; the fallback only covers clients older than #170.
          guestGivenName: guest.givenName ?? splitPersonName(guest.name).givenName,
          guestFamilyName: guest.familyName ?? null,
          guestEmail: guest.email,
          guestPhone: guest.phone,
          maxPlusOnes: invitation.maxPlusOnes,
          nameReviewed: guest.nameReviewed ?? true,
          // The API compares with the stored count whatever the answer, so do the same.
          confirmedPlusOnes: invitation.rsvp?.plusOnesCount ?? 0,
        }}
      />

      <Rule />

      {catalogue.status !== "ok" ? (
        <LoadError what="the guide-book catalogue" result={catalogue} />
      ) : guide.status !== "ok" ? (
        <LoadError what="this guest's guide-book picks" result={guide} />
      ) : (
        <GuidePicks
          invitationId={invitation.id}
          guestName={guest.givenName ?? guest.name}
          catalogue={catalogue.data.items}
          selectedItemIds={guide.data.selectedItemIds}
          effective={{
            tailored: guide.data.effective.tailored,
            itemIds: guide.data.effective.items.map((item) => item.id),
          }}
        />
      )}
    </>
  );
}

function BackLink() {
  return (
    <p>
      <Link href="/admin/invitations" prefetch={false}>
        ← Invitations
      </Link>
    </p>
  );
}

function NotFound() {
  return (
    <>
      <BackLink />
      <h1>Invitation not found</h1>
      <p>Check the link, or go back to the list and reload.</p>
    </>
  );
}
