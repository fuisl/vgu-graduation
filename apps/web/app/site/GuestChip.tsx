"use client";

import Link from "next/link";
import {useEffect, useState} from "react";
import {ArrowUpRightPixel} from "@grad/ui";
import {formatMessage} from "../../lib/i18n/format";
import {GuestAvatar} from "../guest-avatar/GuestAvatar";
import {SignedOutChip} from "./SiteAction";

export type GuestIdentity = {givenName: string; avatarSeed: string};

/** `header.guestPortal` and `header.profile` ("{name}, your profile"), resolved on the server. */
export type GuestChipLabels = {portal: string; profile: string};

/** Presentational signed-in pill, linking to the guest's profile (#139). Same height and shape as the on-blue Cta. */
export function SignedInChip({givenName, avatarSeed, profileLabel}: GuestIdentity & {profileLabel: string}) {
  return (
    <Link className="brand-guest-chip" href="/me" aria-label={formatMessage(profileLabel, {name: givenName})}>
      <GuestAvatar seed={avatarSeed} size={28} />
      <span className="brand-guest-chip__name">{givenName}</span>
      <span className="brand-guest-chip__tile"><ArrowUpRightPixel /></span>
    </Link>
  );
}

/**
 * Right-hand header chip (#146). Renders the signed-out chip on the server and until /api/me
 * answers, so there is no layout shift for signed-out guests and the page never waits on it.
 * The invitation cookie is HttpOnly: the name and avatar seed come from the BFF, never the token.
 */
export function GuestChip({labels}: {labels: GuestChipLabels}) {
  const [guest, setGuest] = useState<GuestIdentity | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/me", {cache: "no-store", credentials: "same-origin", signal: controller.signal})
      .then((r) => (r.ok ? r.json() : null))
      .then((body: {signedIn?: boolean; givenName?: string; avatarSeed?: string} | null) => {
        if (body?.signedIn && body.givenName && body.avatarSeed) {
          setGuest({givenName: body.givenName, avatarSeed: body.avatarSeed});
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return guest ? <SignedInChip {...guest} profileLabel={labels.profile} /> : <SignedOutChip label={labels.portal} />;
}
