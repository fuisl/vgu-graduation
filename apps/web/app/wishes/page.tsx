"use client";

import { useState } from "react";
import { DecodeText } from "../landing-title/DecodeText";
import { MemoriesShell } from "../memories/MemoriesShell";

export default function WishesPage() {
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

  return (
    <MemoriesShell current="wishes" label="Guestbook">
      <div className="memories-wrapper">
        <div className="memories-container">
          <div className="memories-heading">
            <div className="landing-event-meta mono">
              <p><DecodeText text="GUESTBOOK / DIGITAL LOCKET" delay={80} /></p>
              <span className="landing-event-signal" aria-hidden="true" />
            </div>
            <h1 className="memories-title">
              <DecodeText text="Leave a memory." delay={200} duration={800} />
            </h1>
          </div>

          {success ? (
            <div className="memories-panel memories-panel--center">
              <h2 className="memories-title memories-title--small" role="status">Memory sealed.</h2>
              <p className="memories-help">Your wish is in the guestbook and the graduation archive.</p>
              <button type="button" onClick={() => setSuccess(false)} className="memories-button">
                Write another
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="memories-panel">
              <div className="memories-field">
                <label className="memories-label" htmlFor="wish-alias">01 / Sending as</label>
                <input
                  id="wish-alias"
                  type="text"
                  autoComplete="name"
                  placeholder="Your invitation name"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  className="memories-input"
                  aria-describedby="wish-alias-help"
                />
                <p id="wish-alias-help" className="memories-help">
                  Leave blank to use the guest name from your invitation, or enter an alias.
                </p>
              </div>

              <div className="memories-field">
                <label className="memories-label" htmlFor="wish-message">02 / The message</label>
                <textarea
                  id="wish-message"
                  required
                  maxLength={1000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Write your graduation wish..."
                  className="memories-textarea"
                  aria-describedby="wish-message-help"
                />
                <p id="wish-message-help" className="memories-help">
                  Your message is public: it may be shown on the event display and gallery, and kept in the four-year
                  graduation archive. Contact an organizer to have something removed.
                </p>
              </div>

              {submitError ? <p role="alert" className="memories-status memories-status--error memories-status--left">{submitError}</p> : null}

              <button type="submit" disabled={isSubmitting || !message.trim()} className="memories-primary">
                {isSubmitting ? "Sealing…" : "Seal wish"}
              </button>
            </form>
          )}
        </div>
      </div>
    </MemoriesShell>
  );
}
