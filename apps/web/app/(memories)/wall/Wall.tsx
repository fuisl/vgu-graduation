"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PillGroup, PillToggle, Section } from "@grad/ui";
import { sliceTranslator, type MessageSlice, type SliceTranslator } from "../../../lib/i18n/format";
import { CameraPanel } from "../gallery/CameraPanel";
import type { LocalItem, LocalPhoto, LocalWish } from "../gallery/local-items";
import { useShotQueue, type Shot, type ShotEvent } from "../gallery/use-shot-queue";
import { useVisitor } from "../gallery/use-access";
import { useWishQueue, type PendingWish, type WishEvent } from "./use-wish-queue";
import { WallFeed } from "./WallFeed";
import { WishComposer } from "./WishComposer";
import { draftProblem, shotCard, wallHref, wishCard, type DraftProblem, type WallMode, type WallShow, type WishFailure } from "./wall-logic";
import "./wall.css";

export type WallMessages = MessageSlice<"wall." | "wishes." | "camera." | "gallery." | "print.">;
type T = SliceTranslator<keyof WallMessages>;

const CONSENT_ID = "wall-consent";

/**
 * /wall (ADR-019): one public page for wishes and instant photos. A compact blue band holds the
 * title, one lead line and the composer (Write a wish | Take a photo); the white band below is
 * the one live feed. Anyone can post, with or without an invitation: there is no gate here.
 */
export function Wall({ messages, intl, initialMode, initialShow }: { messages: WallMessages; intl: string; initialMode: WallMode; initialShow: WallShow }) {
  const t = useMemo(() => sliceTranslator(messages), [messages]);
  const visitor = useVisitor();
  const invited = visitor.access === "signed-in";

  const [mode, setMode] = useState<WallMode>(initialMode);
  const [show, setShow] = useState<WallShow>(initialShow);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [problem, setProblem] = useState<DraftProblem>(null);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [shotsRemaining, setShotsRemaining] = useState<number | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef(message);
  messageRef.current = message;

  // Prefill the name once /api/me knows the guest, unless the visitor has typed one already.
  useEffect(() => {
    if (visitor.givenName && !nameTouched) setName(visitor.givenName);
  }, [visitor.givenName, nameTouched]);

  // Keep the URL in step with the mode and filter, so a reload or a shared link opens the same view.
  useEffect(() => {
    try {
      const next = wallHref(mode, show);
      if (`${window.location.pathname}${window.location.search}` !== next) window.history.replaceState(window.history.state, "", next);
    } catch {
      // History blocked (sandboxed frame): the view still works, the URL just stays as it was.
    }
  }, [mode, show]);

  const failureText = (failure: WishFailure) => failure.text ?? t(failure.key);

  const wishes = useWishQueue({
    onEvent: (event: WishEvent) => {
      if (event.type === "sending") setStatus({ text: t("wishes.announce.sending"), error: false });
      if (event.type === "sent") setStatus({ text: t("wishes.announce.sent"), error: false });
      if (event.type === "queued") setStatus({ text: t("wishes.announce.queued"), error: false });
      if (event.type === "failed") setStatus({ text: failureText(event.failure), error: true });
      if (event.type === "rejected") {
        // Refused as it is (word filter, length): back into the composer to change, if it is free.
        setStatus({ text: failureText(event.failure), error: true });
        if (!messageRef.current.trim()) edit(event.key);
      }
    },
  });

  const shots = useShotQueue({
    onEvent: (event: ShotEvent) => {
      if (event.type === "sending") setStatus({ text: t("camera.announce.sending"), error: false });
      if (event.type === "sent") setStatus({ text: t(event.review === "pending" ? "wall.announce.waiting" : "camera.announce.sent"), error: false });
      if (event.type === "queued") setStatus({ text: t("camera.error.offline"), error: false });
      if (event.type === "failed") setStatus({ text: t(event.failure.message), error: true });
    },
    onShotsRemaining: setShotsRemaining,
  });

  const send = () => {
    const found = draftProblem(message, name, invited);
    setProblem(found);
    if (found === "name") {
      nameRef.current?.focus();
      return;
    }
    if (found) {
      fieldRef.current?.focus();
      return;
    }
    wishes.send(message.trim(), name.trim());
    setMessage("");
    // The Send button disables once the field is empty; keep the visitor in the field.
    fieldRef.current?.focus();
  };

  function edit(key: string) {
    const wish = wishes.take(key);
    if (!wish) return;
    setMode("wish");
    setMessage(wish.body);
    setName(wish.name);
    setNameTouched(true);
    setProblem(null);
    // In photo mode the field mounts on the next render.
    requestAnimationFrame(() => fieldRef.current?.focus());
  }

  const switchMode = (next: WallMode) => {
    setMode(next);
    setStatus(null);
  };

  const local: LocalItem[] = [
    ...shots.shots.map((shot) => photoCard(shot, t, shots)),
    ...wishes.wishes.map((wish) => wishLocal(wish, t, wishes.retry, edit)),
  ];

  return (
    <>
      <Section tone="blue" density="compact" narrow aria-labelledby="wall-title">
        <div className="wall-head">
          <h1 id="wall-title" className="wall-title">{t("wall.title")}</h1>
          <p className="wall-lead">{t("wall.lead")}</p>
          <PillGroup as="toggle" tone="on-blue" label={t("wall.mode.label")}>
            <PillToggle pressed={mode === "wish"} onClick={() => switchMode("wish")}>{t("wall.mode.wish")}</PillToggle>
            <PillToggle pressed={mode === "photo"} onClick={() => switchMode("photo")}>{t("wall.mode.photo")}</PillToggle>
          </PillGroup>
          <div className="wall-composer">
            {mode === "wish" ? (
              <WishComposer
                ref={fieldRef}
                t={t}
                message={message}
                name={name}
                invited={invited}
                problem={problem}
                nameRef={nameRef}
                describedBy={CONSENT_ID}
                onMessage={(value) => {
                  setMessage(value);
                  if (problem === "message") setProblem(null);
                }}
                onName={(value) => {
                  setName(value);
                  setNameTouched(true);
                  if (problem === "name") setProblem(null);
                }}
                onSend={send}
              />
            ) : (
              <CameraPanel t={t} ready={visitor.access !== "checking"} shotsRemaining={shotsRemaining} onSend={shots.add} describedBy={CONSENT_ID} />
            )}
          </div>
          <p className={`wall-status${status?.error ? " is-error" : ""}`} role="status">{status?.text}</p>
          <p id={CONSENT_ID} className="wall-consent">{t("wall.consent")}</p>
        </div>
      </Section>
      <Section tone="white" density="compact" aria-labelledby="wall-feed-title">
        <WallFeed messages={messages} intl={intl} show={show} mode={mode} onShow={setShow} local={local} />
      </Section>
    </>
  );
}

function wishLocal(wish: PendingWish, t: T, retry: (key: string) => void, edit: (key: string) => void): LocalWish {
  const card = wishCard(wish.status);
  const actions = { retry: { label: t("wishes.action.retry"), onClick: () => retry(wish.key) }, edit: { label: t("wishes.action.edit"), onClick: () => edit(wish.key) } };
  return {
    kind: "wish",
    key: wish.key,
    body: wish.body,
    author: wish.name || t("wishes.you"),
    serverId: wish.id,
    status: t(card.status),
    tone: card.tone,
    actions: card.actions.flatMap((action) => (action === "remove" ? [] : [actions[action]])),
  };
}

function photoCard(shot: Shot, t: T, queue: { retry: (key: string) => void; remove: (key: string) => void }): LocalPhoto {
  const card = shotCard(shot.status, shot.review);
  const actions = { retry: { label: t("camera.action.retry"), onClick: () => queue.retry(shot.key) }, remove: { label: t("camera.action.remove"), onClick: () => queue.remove(shot.key) } };
  return {
    kind: "photo",
    key: shot.key,
    url: shot.url,
    alt: t("camera.mineAlt"),
    serverId: shot.publicId,
    status: t(card.status),
    tone: card.tone,
    actions: card.actions.flatMap((action) => (action === "edit" ? [] : [actions[action]])),
  };
}
