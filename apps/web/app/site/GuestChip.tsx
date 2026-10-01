"use client";

import Link from "next/link";
import {useEffect, useState} from "react";
import {ArrowUpRightPixel} from "@grad/ui";
import {GuestAvatar} from "../guest-avatar/GuestAvatar";
import {SignedOutChip} from "./SiteAction";

export type GuestIdentity = {firstName: string; avatarSeed: string};

/** Presentational signed-in pill. Same height and shape as the on-blue Cta. */
export function SignedInChip({firstName, avatarSeed}: GuestIdentity) {
  return (
    <Link className="brand-guest-chip" href="/invite">
      <GuestAvatar seed={avatarSeed} size={28} />
      <span className="brand-guest-chip__name">{firstName}</span>
      <span className="brand-guest-chip__tile"><ArrowUpRightPixel /></span>
    </Link>
  );
}

/**
 * Right-hand header chip (#146). Renders the signed-out chip on the server and until /api/me
 * answers, so there is no layout shift for signed-out guests and the page never waits on it.
 * The invitation cookie is HttpOnly: the name and avatar seed come from the BFF, never the token.
 */
export function GuestChip() {
  const [guest, setGuest] = useState<GuestIdentity | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/me", {cache: "no-store", credentials: "same-origin", signal: controller.signal})
      .then((r) => (r.ok ? r.json() : null))
      .then((body: {signedIn?: boolean; firstName?: string; avatarSeed?: string} | null) => {
        if (body?.signedIn && body.firstName && body.avatarSeed) {
          setGuest({firstName: body.firstName, avatarSeed: body.avatarSeed});
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return guest ? <SignedInChip {...guest} /> : <SignedOutChip />;
}
