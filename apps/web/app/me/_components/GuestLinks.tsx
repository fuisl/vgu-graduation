import { Suspense } from "react";
import type { I18n } from "../../../lib/i18n/dictionary";
import { GUEST_LINKS } from "../../../lib/profile/state";
import type { PassArt } from "../../guest/badge/card";
import { LinkRowItem, LinkRows } from "../../invite/_components/LinkRows";

/**
 * The signed-in guest's own utilities as compact rows (`GUEST_LINKS`), plus "Save badge" (the pass
 * QR as an SVG file) once the pass has loaded; without a pass that row is simply absent.
 */
export function GuestLinks({ headingId, art, i18n }: { headingId: string; art: Promise<PassArt | null> | null; i18n: I18n }) {
  const { t } = i18n;
  const rows = GUEST_LINKS.map((link) => ({ href: link.href, label: t(`profile.link.${link.id}.title`) }));
  return (
    <LinkRows rows={rows} labelledBy={headingId}>
      {art ? (
        <Suspense fallback={null}>
          <SaveBadgeRow art={art} label={t("pass.save")} />
        </Suspense>
      ) : null}
    </LinkRows>
  );
}

async function SaveBadgeRow({ art, label }: { art: Promise<PassArt | null>; label: string }) {
  const pass = await art;
  if (!pass) return null;
  const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pass.svg)}`;
  return <LinkRowItem row={{ href, label, download: "grad26-badge.svg" }} />;
}
