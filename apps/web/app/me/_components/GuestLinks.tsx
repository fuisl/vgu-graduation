import { ArrowUpRightPixel } from "@grad/ui";
import { GUEST_LINKS } from "../../../lib/profile/state";

/**
 * The guest's quick links as large rows (one 44px+ target each, title and one line), on white.
 * `signedIn={false}` keeps only the public pages.
 */
export function GuestLinks({ signedIn, headingId }: { signedIn: boolean; headingId: string }) {
  const links = GUEST_LINKS.filter((link) => signedIn || link.public);
  return (
    <nav aria-labelledby={headingId}>
      <ul className="profile-links">
        {links.map((link) => (
          <li key={link.href}>
            <a className="profile-link" href={link.href}>
              <span className="profile-link__text">
                <span className="profile-link__title">{link.title}</span>
                <span className="profile-link__description">{link.description}</span>
              </span>
              <span className="profile-link__arrow"><ArrowUpRightPixel /></span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
