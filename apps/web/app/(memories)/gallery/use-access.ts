import { useEffect, useState } from "react";

/**
 * Who is posting on /wall: `/api/me` answers whether this browser holds an invitation and, if
 * so, the guest's given name (to prefill the wish's name field). Nobody is turned away: a
 * visitor without an invitation posts too (ADR-019). "unknown" when `/api/me` cannot be
 * reached; the API's own answer decides then. The camera waits for "checking" to end, so the
 * browser's permission prompt never races the page's first paint.
 */
export type Access = "checking" | "signed-in" | "signed-out" | "unknown";

export type Visitor = { access: Access; givenName: string | null };

export function useVisitor(): Visitor {
  const [visitor, setVisitor] = useState<Visitor>({ access: "checking", givenName: null });
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/me", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { signedIn?: boolean; givenName?: unknown } | null) => {
        if (!body || typeof body.signedIn !== "boolean") {
          setVisitor({ access: "unknown", givenName: null });
          return;
        }
        const givenName = body.signedIn && typeof body.givenName === "string" && body.givenName.trim() ? body.givenName.trim() : null;
        setVisitor({ access: body.signedIn ? "signed-in" : "signed-out", givenName });
      })
      .catch(() => {
        if (!controller.signal.aborted) setVisitor({ access: "unknown", givenName: null });
      });
    return () => controller.abort();
  }, []);
  return visitor;
}
