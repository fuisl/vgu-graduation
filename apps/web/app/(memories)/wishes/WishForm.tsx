"use client";

import { forwardRef, type FormEvent } from "react";
import { Cta, PaperPlanePixel } from "@grad/ui";
import type { MessageKeys, SliceTranslator } from "../../../lib/i18n/format";
import "./wishes.css";

/**
 * The wish composer: one message field (named by the page heading), an optional name and
 * one Send. Controlled by WishesView, which posts optimistically and puts a wish that did
 * not go out back here on Edit.
 */
export const WishForm = forwardRef<HTMLTextAreaElement, {
  t: SliceTranslator<MessageKeys<"wishes.">>;
  labelledBy: string;
  message: string;
  alias: string;
  onMessage: (value: string) => void;
  onAlias: (value: string) => void;
  onSend: () => void;
}>(function WishForm({ t, labelledBy, message, alias, onMessage, onAlias, onSend }, ref) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (message.trim()) onSend();
  };

  return (
    <form onSubmit={submit} className="wish-composer">
      <textarea
        ref={ref}
        id="wish-message"
        required
        maxLength={1000}
        rows={3}
        value={message}
        onChange={(event) => onMessage(event.target.value)}
        placeholder={t("wishes.messagePlaceholder")}
        className="wish-input wish-input--message"
        aria-labelledby={labelledBy}
        aria-describedby="wish-public"
      />
      <div className="wish-composer__row">
        <label className="brand-sr-only" htmlFor="wish-alias">{t("wishes.alias")}</label>
        <input
          id="wish-alias"
          type="text"
          autoComplete="name"
          maxLength={80}
          placeholder={t("wishes.aliasPlaceholder")}
          value={alias}
          onChange={(event) => onAlias(event.target.value)}
          className="wish-input wish-input--alias"
        />
        <Cta tone="on-blue" type="submit" disabled={!message.trim()} icon={<PaperPlanePixel />}>
          {t("wishes.send")}
        </Cta>
      </div>
      <p id="wish-public" className="wish-public">{t("wishes.public")}</p>
    </form>
  );
});
