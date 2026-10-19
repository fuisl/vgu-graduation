"use client";

import { useMemo, useRef, useState } from "react";
import { Cta, Section } from "@grad/ui";
import { sliceTranslator, type MessageSlice, type SliceTranslator } from "../../../lib/i18n/format";
import { GalleryView } from "../gallery/GalleryView";
import type { LocalWish } from "../gallery/local-items";
import { useAccess } from "../gallery/use-access";
import { WishForm } from "./WishForm";
import { useWishQueue, type PendingWish, type WishEvent } from "./use-wish-queue";

type WishesMessages = MessageSlice<"wishes." | "gallery." | "print.">;
type T = SliceTranslator<keyof WishesMessages>;

/**
 * /wishes (camera-first redesign): the composer on a blue band, the wishes on the white band
 * below. A sent wish appears on top of the feed at once with its state.
 */
export function WishesView({ messages, intl }: { messages: WishesMessages; intl: string }) {
  const t = useMemo(() => sliceTranslator(messages), [messages]);
  const [access, setAccess] = useAccess();
  const [message, setMessage] = useState("");
  const [alias, setAlias] = useState("");
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  const announce = (event: WishEvent) => {
    if (event.type === "sending") setStatus({ text: t("wishes.announce.sending"), error: false });
    if (event.type === "sent") setStatus({ text: t("wishes.announce.sent"), error: false });
    if (event.type === "queued") setStatus({ text: t("wishes.announce.queued"), error: false });
    if (event.type === "failed") setStatus({ text: t(event.error), error: true });
  };

  const queue = useWishQueue({ onEvent: announce, onSignedOut: () => setAccess("signed-out") });

  const send = () => {
    queue.send(message.trim(), alias.trim());
    setMessage("");
    // The Send button disables once the field is empty; keep the guest in the field.
    fieldRef.current?.focus();
  };

  const edit = (key: string) => {
    const wish = queue.take(key);
    if (!wish) return;
    setMessage(wish.body);
    setAlias(wish.alias);
    setStatus(null);
    fieldRef.current?.focus();
  };

  const local = queue.wishes.map((wish) => toLocal(wish, t, queue.retry, edit));

  return (
    <>
      <Section tone="blue" density="compact" narrow aria-labelledby="wishes-title">
        <div className="wish-head">
          <h1 id="wishes-title" className="wish-title">{t(access === "signed-out" ? "wishes.signedOut.title" : "wishes.title")}</h1>
          {access === "signed-out" ? (
            <>
              <p className="wish-signed-out">{t("wishes.signedOut.body")}</p>
              <Cta tone="on-blue" href="/me">{t("wishes.signedOut.link")}</Cta>
            </>
          ) : (
            <WishForm
              ref={fieldRef}
              t={t}
              labelledBy="wishes-title"
              message={message}
              alias={alias}
              onMessage={setMessage}
              onAlias={setAlias}
              onSend={send}
            />
          )}
          <p className={`wish-status${status?.error ? " is-error" : ""}`} role="status">{status?.text}</p>
        </div>
      </Section>
      <Section tone="white" density="compact" narrow aria-labelledby="feed-wishes-title">
        <GalleryView kind="wishes" messages={messages} intl={intl} local={local} />
      </Section>
    </>
  );
}

function toLocal(wish: PendingWish, t: T, retry: (key: string) => void, edit: (key: string) => void): LocalWish {
  const base = { kind: "wish" as const, key: wish.key, body: wish.body, author: wish.alias || t("wishes.you"), serverId: wish.id };
  const retryAction = { label: t("wishes.action.retry"), onClick: () => retry(wish.key) };
  const editAction = { label: t("wishes.action.edit"), onClick: () => edit(wish.key) };
  switch (wish.status) {
    case "sending":
      return { ...base, status: t("wishes.status.sending"), tone: "pending", actions: [] };
    case "queued":
      return { ...base, status: t("wishes.status.queued"), tone: "pending", actions: [retryAction, editAction] };
    case "failed":
      return { ...base, status: t("wishes.status.failed"), tone: "error", actions: [retryAction, editAction] };
    case "rejected":
      return { ...base, status: t("wishes.status.failed"), tone: "error", actions: [editAction] };
    case "sent":
      return { ...base, status: t("wishes.status.sent"), tone: "done", actions: [] };
  }
}
