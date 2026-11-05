"use client";

import { useActionState } from "react";
import { Cta } from "@grad/ui";
import { sliceTranslator, type MessageSlice } from "../../../lib/i18n/format";
import { confirmGraduateSignIn, type GraduateSignInState } from "../actions";

/**
 * The button that spends the sign-in token (ADR-017). A real form, so it works before hydration and
 * without JavaScript. A link that can no longer be used swaps the button for a way to get a new one.
 */
export function SignInConfirm({ messages }: { messages: MessageSlice<"graduatePortal.signIn."> }) {
  const t = sliceTranslator(messages);
  const [state, action, pending] = useActionState<GraduateSignInState, FormData>(confirmGraduateSignIn, "idle");

  if (state === "invalid") {
    return (
      <div className="portal-actions" role="status">
        <p className="join-lead">{t("graduatePortal.signIn.invalidBody")}</p>
        <Cta tone="on-blue" href="/graduate">{t("graduatePortal.signIn.requestAgain")}</Cta>
      </div>
    );
  }

  return (
    <form action={action} className="portal-actions">
      <Cta tone="on-blue" type="submit" disabled={pending}>
        {pending ? t("graduatePortal.signIn.opening") : t("graduatePortal.signIn.submit")}
      </Cta>
      <p className="portal-status" role="status">{state === "failed" ? t("graduatePortal.signIn.failed") : null}</p>
    </form>
  );
}
