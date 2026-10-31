import Link from "next/link";
import { splitPersonName } from "@grad/contract";
import { listGraduates } from "../../../../../lib/api/admin";
import { redirectIfUnauthorized, requireAdminSession } from "../../../../../lib/admin/session";
import { ConfirmNameButton, NameSplit } from "../../../_components/ConfirmNameButton";
import { GraduateEditForm } from "../../../_components/EditForms";
import { JoinLinkPanel } from "../../../_components/JoinLinkPanel";
import { LoadError } from "../../../_components/LoadError";

/** Edit one graduate (#170). There is no single-graduate GET; the cohort list is small. */
export default async function GraduatePage({ params }: { params: Promise<{ id: string }> }) {
  const { token } = await requireAdminSession();
  const { id } = await params;
  const graduates = await listGraduates(token);
  redirectIfUnauthorized(graduates);
  const graduate = graduates.status === "ok" ? graduates.data.items.find((item) => item.id === id) : undefined;

  return (
    <>
      <p>
        <Link href="/admin/graduates" prefetch={false}>
          ← Graduates
        </Link>
      </p>
      {graduates.status !== "ok" ? (
        <LoadError what="the graduate" result={graduates} />
      ) : !graduate ? (
        <>
          <h1>Graduate not found</h1>
          <p>It may have been removed. Go back to the list and reload.</p>
        </>
      ) : (
        <>
          <h1>{graduate.name}</h1>
          {graduate.nameReviewed === false ? (
            <div className="admin-notice" role="note">
              <p>
                <strong>Check the name.</strong> The given and family name were guessed from the full name:{" "}
                <NameSplit givenName={graduate.givenName} familyName={graduate.familyName} reviewed={undefined} />
              </p>
              <ConfirmNameButton kind="graduate" id={graduate.id} displayName={graduate.name} />
            </div>
          ) : null}
          <GraduateEditForm
            graduate={{
              id: graduate.id,
              name: graduate.name,
              // Always sent by the API; the fallback only covers clients older than #170.
              givenName: graduate.givenName ?? splitPersonName(graduate.name).givenName,
              familyName: graduate.familyName ?? null,
              email: graduate.email,
              nameReviewed: graduate.nameReviewed ?? true,
            }}
          />
          <JoinLinkPanel graduateId={graduate.id} graduateName={graduate.givenName ?? graduate.name} joinUrl={graduate.joinUrl ?? null} />
        </>
      )}
    </>
  );
}
