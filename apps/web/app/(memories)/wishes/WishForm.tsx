"use client";

import {useState} from "react";
import {Cta} from "@grad/ui";
import "./wishes.css";

export function WishForm() {
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
        const body: unknown = await response.json().catch(() => null);
        const detail = body && typeof body === "object" && "message" in body && typeof body.message === "string"
          ? body.message
          : "Your wish could not be saved. Please try again.";
        setSubmitError(detail);
      }
    } catch {
      setSubmitError("The wish service is unreachable. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="mem-panel mem-panel--center">
        <h2 className="mem-heading" role="status">Memory sealed.</h2>
        <p className="mem-help">Your wish is in the guestbook and the graduation archive.</p>
        <button type="button" onClick={() => setSuccess(false)} className="mem-button">
          Write another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mem-panel wishes-form">
      <div className="mem-field">
        <label className="mem-label" htmlFor="wish-alias">01 / Sending as</label>
        <input
          id="wish-alias"
          type="text"
          autoComplete="name"
          placeholder="Your invitation name"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          className="mem-input"
          aria-describedby="wish-alias-help"
        />
        <p id="wish-alias-help" className="mem-help">
          Leave blank to use the guest name from your invitation, or enter an alias.
        </p>
      </div>

      <div className="mem-field">
        <label className="mem-label" htmlFor="wish-message">02 / The message</label>
        <textarea
          id="wish-message"
          required
          maxLength={1000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Write your graduation wish..."
          className="mem-textarea"
          aria-describedby="wish-message-help"
        />
        <p id="wish-message-help" className="mem-help">
          Your message is public: it may be shown on the event display and gallery, and kept in the four-year
          graduation archive. Contact an organizer to have something removed.
        </p>
      </div>

      {submitError ? <p role="alert" className="mem-status mem-status--error">{submitError}</p> : null}

      <Cta tone="on-white" type="submit" disabled={isSubmitting || !message.trim()}>
        {isSubmitting ? "Sealing…" : "Seal wish"}
      </Cta>
    </form>
  );
}
