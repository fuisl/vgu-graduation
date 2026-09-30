"use client";

import { useState } from "react";
import Link from "next/link";
import { BackgroundMotion } from "../background/BackgroundMotion";
import { TwinkleField } from "../background/TwinkleField";
import { GridCells } from "../background/GridCells";
import { BrandName } from "../logo/BrandName";
import { DecodeText } from "../landing-title/DecodeText";
import { ArrowUpRight } from "../icons/ArrowUpRight";

const GROUP_MEMBERS = [
  { id: "member_1", name: "Duong", initial: "D" },
  { id: "member_2", name: "Nhien", initial: "N" },
  { id: "member_3", name: "Xuan", initial: "X" },
  { id: "member_4", name: "An", initial: "A" },
  { id: "member_5", name: "Tai", initial: "T" },
];

export default function WishesPage() {
  const sessionUser = { id: "usr_123", name: "Jane Doe" };

  const [alias, setAlias] = useState("");
  const [message, setMessage] = useState("");
  const [selectedReceivers, setSelectedReceivers] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const toggleReceiver = (id: string) => {
    setSelectedReceivers((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedReceivers.length === GROUP_MEMBERS.length) {
      setSelectedReceivers([]);
    } else {
      setSelectedReceivers(GROUP_MEMBERS.map((m) => m.id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/wishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: sessionUser.id,
          guestAlias: alias.trim() !== "" ? alias.trim() : sessionUser.name,
          receivers: selectedReceivers,
          message: message.trim(),
        }),
      });

      if (response.ok) {
        setSuccess(true);
        setAlias("");
        setMessage("");
        setSelectedReceivers([]);
      }
    } catch (error) {
      console.error("Submission failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="landing-page">
      {/*
        INJECTED CSS:
        Because the project uses raw CSS instead of Tailwind, these specific
        classes ensure the form is centered, the inputs take up full width,
        and the GitHub-style assignee grid works perfectly.
      */}
      <style dangerouslySetInnerHTML={{ __html: `
        .w-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 60px 20px;
          overflow-y: auto;
          width: 100%;
          box-sizing: border-box;
        }
        .w-container {
          width: 100%;
          max-width: 640px;
          margin: 0 auto;
        }
        .w-header {
          text-align: center;
          margin-bottom: 40px;
        }
        .w-title {
          font-size: clamp(2rem, 5vw, 3rem);
          font-weight: 500;
          color: #ECF0F9;
          margin: 16px 0 0 0;
          letter-spacing: -0.02em;
        }
        .w-form {
          background: rgba(7, 10, 18, 0.7);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(150, 168, 211, 0.14);
          padding: 40px;
          display: flex;
          flex-direction: column;
          gap: 32px;
        }
        .w-field {
          display: flex;
          flex-direction: column;
          width: 100%;
        }
        .w-label {
          font-family: var(--font-mono, monospace);
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #8790A7;
          margin-bottom: 12px;
        }
        .w-input, .w-textarea {
          width: 100%;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(150, 168, 211, 0.14);
          color: #ECF0F9;
          padding: 16px;
          font-family: var(--font-mono, monospace);
          font-size: 0.875rem;
          box-sizing: border-box;
          transition: border-color 0.2s ease;
        }
        .w-input:focus, .w-textarea:focus {
          outline: none;
          border-color: #8da5e3;
        }
        .w-textarea {
          resize: vertical;
          min-height: 140px;
        }
        .w-help-text {
          font-family: var(--font-mono, monospace);
          font-size: 11px;
          color: rgba(135, 144, 167, 0.6);
          margin-top: 8px;
        }
        .w-assign-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .w-btn-link {
          font-family: var(--font-mono, monospace);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #8da5e3;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          transition: color 0.2s ease;
        }
        .w-btn-link:hover {
          color: #fff;
        }
        .w-assign-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
        }
        .w-assign-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(150, 168, 211, 0.14);
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: left;
        }
        .w-assign-card:hover {
          background: rgba(0, 0, 0, 0.4);
          border-color: rgba(150, 168, 211, 0.3);
        }
        .w-assign-card.selected {
          background: rgba(141, 165, 227, 0.1);
          border-color: #8da5e3;
        }
        .w-avatar {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #27272a;
          color: #a1a1aa;
          font-size: 10px;
          font-weight: bold;
          flex-shrink: 0;
        }
        .w-assign-card.selected .w-avatar {
          background: #8da5e3;
          color: #070a12;
        }
        .w-name {
          font-family: var(--font-mono, monospace);
          font-size: 0.875rem;
          color: #8790A7;
        }
        .w-assign-card.selected .w-name {
          color: #ECF0F9;
        }
        .w-submit-btn {
          width: 100%;
          padding: 18px;
          margin-top: 16px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-weight: bold;
          font-size: 0.875rem;
          background: #7e96d7;
          color: #080c16;
          border: 1px solid #8da5e3;
          box-shadow: 4px 4px 0 rgba(31, 46, 82, 0.9);
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .w-submit-btn:hover:not(:disabled) {
          transform: translate(-2px, -2px);
          box-shadow: 6px 6px 0 rgba(31, 46, 82, 0.9);
        }
        .w-submit-btn:active:not(:disabled) {
          transform: translate(2px, 2px);
          box-shadow: 0px 0px 0 rgba(31, 46, 82, 0.9);
        }
        .w-submit-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }
        .w-success {
          text-align: center;
          padding: 60px 40px;
          background: rgba(7, 10, 18, 0.7);
          border: 1px solid rgba(150, 168, 211, 0.14);
        }
      `}} />

      <section className="landing" aria-label="Guestbook submission">
        <BackgroundMotion />
        <div className="landing-aurora" aria-hidden="true">
          <span className="landing-aurora-blob" />
          <span className="landing-aurora-blob" />
          <span className="landing-aurora-blob" />
        </div>
        <div className="landing-field" aria-hidden="true">
          <GridCells />
        </div>
        <TwinkleField />

        <header className="landing-header">
          <Link className="landing-brand" href="/" aria-label="GRAD '26 home">
            <BrandName />
          </Link>
          <nav className="landing-nav" aria-label="Main navigation">
            <Link href="/gallery">Gallery</Link>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5}}>
              <span style={{fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'monospace'}}>
                Memory Capsule
              </span>
            </div>
            <Link className="landing-signin" href="/guest/prototype">
              Guest Preview <ArrowUpRight />
            </Link>
          </nav>
        </header>

        <div className="w-wrapper">
          <div className="w-container">

            <div className="w-header">
              <div className="landing-event-meta mono" style={{justifyContent: 'center', marginBottom: '16px'}}>
                <p><DecodeText text="GUESTBOOK / DIGITAL LOCKET" delay={80} /></p>
                <span className="landing-event-signal" aria-hidden="true" />
              </div>
              <h1 className="w-title">
                <DecodeText text="Leave a memory." delay={200} duration={800} />
              </h1>
            </div>

            {success ? (
              <div className="w-success">
                <h2 className="w-title" style={{fontSize: '1.5rem'}}>Memory sealed securely.</h2>
                <p className="w-help-text" style={{fontSize: '14px', marginTop: '16px'}}>
                  Your wish has been permanently archived.
                </p>
                <button
                  onClick={() => setSuccess(false)}
                  className="w-btn-link"
                  style={{marginTop: '32px', fontSize: '13px', padding: '12px 24px', border: '1px solid #8da5e3'}}
                >
                  Create Another
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="w-form">

                {/* 01: SENDER */}
                <div className="w-field">
                  <label className="w-label">
                    <DecodeText text="01 / SENDING AS" delay={400} />
                  </label>
                  <input
                    type="text"
                    placeholder={sessionUser.name}
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                    className="w-input"
                  />
                  <p className="w-help-text">
                    Leave blank to use your registered name, or override with an alias.
                  </p>
                </div>

                {/* 02: RECIPIENTS (GitHub Assignment Style) */}
                <div className="w-field">
                  <div className="w-assign-header">
                    <label className="w-label" style={{margin: 0}}>
                      <DecodeText text="02 / TO WHOM?" delay={500} />
                    </label>
                    <button type="button" onClick={handleSelectAll} className="w-btn-link">
                      {selectedReceivers.length === GROUP_MEMBERS.length ? "Deselect All" : "Select All"}
                    </button>
                  </div>

                  <div className="w-assign-grid">
                    {GROUP_MEMBERS.map((member) => {
                      const isSelected = selectedReceivers.includes(member.id);
                      return (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => toggleReceiver(member.id)}
                          className={`w-assign-card ${isSelected ? 'selected' : ''}`}
                        >
                          <div className="w-avatar">{member.initial}</div>
                          <span className="w-name">{member.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 03: PAYLOAD */}
                <div className="w-field">
                  <label className="w-label">
                    <DecodeText text="03 / THE MESSAGE" delay={600} />
                  </label>
                  <textarea
                    required
                    maxLength={1000}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Write your graduation wish..."
                    className="w-textarea"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || selectedReceivers.length === 0 || !message.trim()}
                  className="w-submit-btn"
                >
                  {isSubmitting ? "SEALING..." : "SEAL WISH"}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}