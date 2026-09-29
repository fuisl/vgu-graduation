import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Container } from "@grad/ui";
import { getEvent } from "../../lib/api/event";
import { getInvitation } from "../../lib/api/invitations";
import { INVITATION_COOKIE } from "../../lib/invite/cookie";
import { selectInvitePageState } from "../../lib/invite/state";
import { InviteNotice } from "./_components/InviteNotice";
import { PersonalInvitation } from "./_components/PersonalInvitation";

// Personal page behind a bearer credential: keep it out of search and never leak the URL.
export const metadata: Metadata = {
  title: "Your invitation · GRAD '26",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function InvitePage() {
  const token = (await cookies()).get(INVITATION_COOKIE)?.value;

  // Independent calls: run together. No cookie means the API is never asked about an invitation.
  const [invitation, event] = await Promise.all([token ? getInvitation(token) : null, getEvent()]);
  const state = selectInvitePageState(invitation);

  return (
    <main style={{ minHeight: "100svh", padding: "var(--space-6) 0" }}>
      <Container narrow>
        <div style={{ display: "grid", gap: "var(--space-6)" }}>
          {state.kind === "personal" ? (
            <PersonalInvitation invitation={state.invitation} event={event} />
          ) : (
            <InviteNotice kind={state.kind} event={event} />
          )}
        </div>
      </Container>
    </main>
  );
}
