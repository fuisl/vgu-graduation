import type { Metadata } from "next";
import { Container, Eyebrow, Rule } from "@grad/ui";
import "../admin.css";

export const metadata: Metadata = {
  title: "Admin sign-in · GRAD '26",
  robots: { index: false, follow: false },
};

// Messages for the ?status= and ?error= values set by auth/callback and lib/admin/session.ts.
const STATUS: Record<string, { title: string; body: string }> = {
  pending: {
    title: "Request sent",
    body: "Your GitHub account is waiting for an owner to approve it. Sign in again once they have.",
  },
  denied: {
    title: "No admin access",
    body: "This GitHub account doesn't have admin access. Ask an owner if you think that's a mistake.",
  },
};

const ERRORS: Record<string, string> = {
  state: "The sign-in link expired or was opened in another tab. Try again.",
  oauth: "GitHub sign-in didn't finish. Try again.",
  unavailable: "Couldn't check your access because the API is unreachable. Try again in a moment.",
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = typeof params.status === "string" ? STATUS[params.status] : undefined;
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;

  return (
    <div className="admin">
      <Container>
        <header className="admin-header">
          <Eyebrow>GRAD &apos;26 / ADMIN</Eyebrow>
        </header>
        <Rule />
        <main id="admin-main" className="admin-form">
          <h1>{status?.title ?? "Sign in"}</h1>
          {status ? (
            <div className="admin-notice" role="status">
              <p>{status.body}</p>
            </div>
          ) : null}
          {error ? (
            <div className="admin-notice admin-notice--error" role="alert">
              <p>{error}</p>
            </div>
          ) : null}
          {!status ? (
            <p>
              Admins sign in with GitHub. The first time you do, an owner has to approve your account before the dashboard
              opens.
            </p>
          ) : null}
          {/* A plain link: /admin/login/github is a route handler that sets the OAuth state cookie. */}
          <a className="admin-button" href="/admin/login/github">
            {status ? "Sign in again" : "Sign in with GitHub"}
          </a>
        </main>
      </Container>
    </div>
  );
}
