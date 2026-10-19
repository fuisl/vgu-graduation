import { useEffect, useState } from "react";

/**
 * Whether this visitor may shoot or post: `/api/me` decides before the camera asks for
 * permission (QA P1-2) and before the guest types a wish. If `/api/me` cannot be reached the
 * result is "unknown" and the camera still starts; the upload's own answer decides then.
 */
export type Access = "checking" | "signed-in" | "signed-out" | "unknown";

export function useAccess(): [Access, (next: Access) => void] {
  const [access, setAccess] = useState<Access>("checking");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/me", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { signedIn?: boolean } | null) => {
        if (body && typeof body.signedIn === "boolean") setAccess(body.signedIn ? "signed-in" : "signed-out");
        else setAccess("unknown");
      })
      .catch(() => {
        if (!controller.signal.aborted) setAccess("unknown");
      });
    return () => controller.abort();
  }, []);
  return [access, setAccess];
}
