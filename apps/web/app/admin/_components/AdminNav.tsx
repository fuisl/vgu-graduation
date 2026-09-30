"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/graduates", label: "Graduates" },
  { href: "/admin/invitations", label: "Invitations" },
  { href: "/admin/rsvps", label: "RSVPs" },
  { href: "/admin/event", label: "Event" },
] as const;

/** `owner` adds the Admins page, where owners approve access requests (#119). */
export function AdminNav({ owner }: { owner: boolean }) {
  const pathname = usePathname();
  const links = owner ? [...LINKS, { href: "/admin/admins", label: "Admins" }] : LINKS;
  return (
    <nav className="admin-nav" aria-label="Admin">
      <ul>
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} prefetch={false} aria-current={pathname === link.href ? "page" : undefined}>
              {link.label}
            </Link>
          </li>
        ))}
        <li>
          <form action="/admin/logout" method="post">
            <button type="submit">Sign out</button>
          </form>
        </li>
      </ul>
    </nav>
  );
}
