import { ArrowUpRightPixel } from "@grad/ui";
import type { I18n } from "../../../lib/i18n/dictionary";
import { GUEST_LINKS } from "../../../lib/profile/state";

/**
 * The guest's quick links as large rows (one 44px+ target each, title and one line), on white.
 * `signedIn={false}` keeps only the public pages. Copy is `profile.link.<id>.*` (#9).
 */
export function GuestLinks({ signedIn, headingId, i18n }: { signedIn: boolean; headingId: string; i18n: I18n }) {
  const { t } = i18n;
  const links = GUEST_LINKS.filter((link) => signedIn || link.public);
  return (
    <nav aria-labelledby={headingId}>
      <ul className="profile-links">
        {links.map((link) => (
          <li key={link.href}>
            <a className="profile-link" href={link.href}>
              <span className="profile-link__text">
                <span className="profile-link__title">{t(`profile.link.${link.id}.title`)}</span>
                <span className="profile-link__description">{t(`profile.link.${link.id}.description`)}</span>
              </span>
              <span className="profile-link__arrow"><ArrowUpRightPixel /></span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
