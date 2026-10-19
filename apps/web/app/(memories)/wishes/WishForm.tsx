"use client";

import {useState} from "react";
import {Cta} from "@grad/ui";
import {sliceTranslator, type MessageSlice} from "../../../lib/i18n/format";
import "./wishes.css";

/** What a failed POST /api/wishes means for the guest, by status, in their language (#9). Never echoes server detail. */
function wishErrorId(status: number) {
  if (status === 401) return "wishes.error.signedOut" as const;
  if (status === 404) return "wishes.error.invalid" as const;
  if (status === 410) return "wishes.error.expired" as const;
  if (status === 429) return "wishes.error.tooMany" as const;
  if (status === 400) return "wishes.error.length" as const;
  return "wishes.error.generic" as const;
}

export function WishForm({messages}: {messages: MessageSlice<"wishes.">}) {
  const t = sliceTranslator(messages);
  const [alias, setAlias] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError("");

    try {
      const response = await fetch("/api/wishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: message.trim(),
          ...(alias.trim() ? { authorName: alias.trim() } : {}),
        }),
      });

      if (response.ok) {
        setSuccess(true);
        setAlias("");
        setMessage("");
      } else {
        setSubmitError(t(wishErrorId(response.status)));
      }
    } catch {
      setSubmitError(t("wishes.error.network"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="mem-panel mem-panel--center">
        <h2 className="mem-heading" role="status">{t("wishes.sealed")}</h2>
        <p className="mem-help">{t("wishes.sealedBody")}</p>
        <Cta tone="on-white" variant="secondary" onClick={() => setSuccess(false)}>{t("wishes.another")}</Cta>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mem-panel wishes-form">
      <div className="mem-field">
        <label className="mem-label" htmlFor="wish-alias">{t("wishes.alias")}</label>
        <input
          id="wish-alias"
          type="text"
          autoComplete="name"
          placeholder={t("wishes.aliasPlaceholder")}
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          className="mem-input"
          aria-describedby="wish-alias-help"
        />
        <p id="wish-alias-help" className="mem-help">{t("wishes.aliasHelp")}</p>
      </div>

      <div className="mem-field">
        <label className="mem-label" htmlFor="wish-message">{t("wishes.message")}</label>
        <textarea
          id="wish-message"
          required
          maxLength={1000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("wishes.messagePlaceholder")}
          className="mem-textarea"
          aria-describedby="wish-message-help"
        />
        <p id="wish-message-help" className="mem-help">{t("wishes.public")}</p>
      </div>

      {submitError ? <p role="alert" className="mem-status mem-status--error">{submitError}</p> : null}

      <Cta tone="on-white" type="submit" disabled={isSubmitting || !message.trim()}>
        {isSubmitting ? t("wishes.sealing") : t("wishes.seal")}
      </Cta>
    </form>
  );
}
