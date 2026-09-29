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

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="Admin">
      <ul>
        {LINKS.map((link) => (
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
