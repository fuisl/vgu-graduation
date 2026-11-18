"use client";

import { forwardRef, type FormEvent, type RefObject } from "react";
import { Cta, PaperPlanePixel } from "@grad/ui";
import type { MessageKeys, SliceTranslator } from "../../../lib/i18n/format";
import { NAME_MAX, WISH_MAX, type DraftProblem } from "./wall-logic";

/**
 * The wall's wish composer (ADR-019): the message, a name and one Send, on the blue band.
 * Controlled by Wall, which validates (`draftProblem`), posts optimistically and puts a wish
 * that did not go out back here on Edit. The name is required without an invitation; for an
 * invited guest it is prefilled with their given name and may be left blank.
 */
export const WishComposer = forwardRef<HTMLTextAreaElement, {
  t: SliceTranslator<MessageKeys<"wall."> | MessageKeys<"wishes.">>;
  message: string;
  name: string;
  invited: boolean;
  problem: DraftProblem;
  nameRef: RefObject<HTMLInputElement | null>;
  /** The consent notice under the composer, read with the fields. */
  describedBy: string;
  onMessage: (value: string) => void;
  onName: (value: string) => void;
  onSend: () => void;
}>(function WishComposer({ t, message, name, invited, problem, nameRef, describedBy, onMessage, onName, onSend }, ref) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSend();
  };
  const nameInvalid = problem === "name";

  return (
    <form onSubmit={submit} className="wish-composer" noValidate>
      <label className="brand-sr-only" htmlFor="wall-message">{t("wall.wish.label")}</label>
      <textarea
        ref={ref}
        id="wall-message"
        required
        maxLength={WISH_MAX}
        rows={3}
        value={message}
        onChange={(event) => onMessage(event.target.value)}
        placeholder={t("wishes.messagePlaceholder")}
        className="wish-input wish-input--message"
        aria-describedby={describedBy}
      />
      <div className="wish-composer__row">
        <label className="brand-sr-only" htmlFor="wall-name">{t(invited ? "wall.name.labelOptional" : "wall.name.label")}</label>
        <input
          ref={nameRef}
          id="wall-name"
          type="text"
          autoComplete="name"
          maxLength={NAME_MAX}
          required={!invited}
          placeholder={t(invited ? "wall.name.placeholderOptional" : "wall.name.placeholder")}
          value={name}
          onChange={(event) => onName(event.target.value)}
          className="wish-input wish-input--alias"
          aria-invalid={nameInvalid || undefined}
          aria-describedby={nameInvalid ? "wall-name-error" : undefined}
        />
        <Cta tone="on-blue" type="submit" disabled={!message.trim()} icon={<PaperPlanePixel />}>
          {t("wishes.send")}
        </Cta>
      </div>
      {nameInvalid ? <p id="wall-name-error" className="wall-field-error">{t("wall.name.required")}</p> : null}
    </form>
  );
});
