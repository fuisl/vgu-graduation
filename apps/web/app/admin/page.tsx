import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAdminSession } from "../../lib/auth/session";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_session")?.value;
  const session = token ? await verifyAdminSession(token) : null;

  if (!session) {
    redirect("/admin/login");
  }

  return (
    <main style={{ padding: "3rem 1.5rem", fontFamily: "var(--font-mono)" }}>
      <p>Signed in as {session.handle}.</p>
      <form action="/admin/logout" method="post">
        <button type="submit">Log out</button>
      </form>
    </main>
  );
}
