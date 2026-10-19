"use client";

import { useMemo, useState } from "react";
import { Section } from "@grad/ui";
import { sliceTranslator, type MessageSlice, type SliceTranslator } from "../../../lib/i18n/format";
import { CameraPanel } from "./CameraPanel";
import { GalleryView } from "./GalleryView";
import type { LocalPhoto } from "./local-items";
import { useAccess } from "./use-access";
import { useShotQueue, type Shot, type ShotEvent } from "./use-shot-queue";

type LocketMessages = MessageSlice<"camera." | "gallery." | "print.">;

/**
 * The Digital Locket (/gallery, camera-first redesign): the camera on a blue band, open on
 * entry, and everyone's photos on the white band below. What this guest sends appears at the
 * top of the feed at once, with its state, before the gallery lists it.
 */
export function Locket({ messages, intl }: { messages: LocketMessages; intl: string }) {
  const t = useMemo(() => sliceTranslator(messages), [messages]);
  const [access, setAccess] = useAccess();
  const [shotsRemaining, setShotsRemaining] = useState<number | null>(null);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);

  const announce = (event: ShotEvent) => {
    if (event.type === "sending") setStatus({ text: t("camera.announce.sending"), error: false });
    if (event.type === "sent") setStatus({ text: t("camera.announce.sent"), error: false });
    if (event.type === "queued") setStatus({ text: t("camera.error.offline"), error: false });
    if (event.type === "failed") setStatus({ text: t(event.failure.message), error: true });
  };

  const queue = useShotQueue({
    onEvent: announce,
    onSignedOut: () => setAccess("signed-out"),
    onShotsRemaining: setShotsRemaining,
  });

  const local: LocalPhoto[] = queue.shots.map((shot) => toLocal(shot, t, queue));

  return (
    <>
      <Section tone="blue" density="compact" aria-labelledby="locket-title">
        <h1 id="locket-title" className="brand-sr-only">{t("gallery.title")}</h1>
        <CameraPanel t={t} access={access} shotsRemaining={shotsRemaining} onSend={queue.add} />
        <p className={`cam-status${status?.error ? " is-error" : ""}`} role="status">{status?.text}</p>
      </Section>
      <Section tone="white" density="compact" aria-labelledby="feed-photos-title">
        <GalleryView kind="photos" messages={messages} intl={intl} local={local} />
      </Section>
    </>
  );
}

function toLocal(
  shot: Shot,
  t: SliceTranslator<keyof LocketMessages>,
  queue: { retry: (key: string) => void; remove: (key: string) => void },
): LocalPhoto {
  const base = { kind: "photo" as const, key: shot.key, url: shot.url, alt: t("camera.mineAlt"), serverId: shot.publicId };
  const retry = { label: t("camera.action.retry"), onClick: () => queue.retry(shot.key) };
  const remove = { label: t("camera.action.remove"), onClick: () => queue.remove(shot.key) };
  switch (shot.status) {
    case "sending":
      return { ...base, status: t("camera.status.sending"), tone: "pending", actions: [] };
    case "queued":
      return { ...base, status: t("camera.status.queued"), tone: "pending", actions: [retry] };
    case "failed":
      return { ...base, status: t("camera.status.failed"), tone: "error", actions: [retry] };
    case "rejected":
      return { ...base, status: t("camera.status.failed"), tone: "error", actions: [remove] };
    case "sent":
      return { ...base, status: t("camera.status.sent"), tone: "done", actions: [] };
  }
}

