import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Container, Eyebrow, Rule } from "@grad/ui";
import { requireAdminSession } from "../../lib/admin/session";
import { AdminNav } from "./_components/AdminNav";
import "./admin.css";

export const metadata: Metadata = {
  title: "Admin · GRAD '26",
  robots: { index: false, follow: false },
  // Invite links shown here are bearer credentials: never leak the page URL or its contents onward.
  referrer: "no-referrer",
};

// Admin views are never cached (§4.1).
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Pages and actions verify again on their own; this guard only keeps the chrome private.
  const { handle } = await requireAdminSession();

  return (
    <div className="admin">
      <Container>
        <header className="admin-header">
          <div>
            <Eyebrow>GRAD &apos;26 / ADMIN</Eyebrow>
            <p className="admin-muted">Signed in as {handle}</p>
          </div>
          <AdminNav />
        </header>
        <Rule />
        <main id="admin-main">{children}</main>
      </Container>
    </div>
  );
}
