import { listPrintJobs } from "../../../../lib/api/admin";
import { parsePrintStatus, PRINT_PAGE_SIZE } from "../../../../lib/admin/print-queue";
import { redirectIfUnauthorized, requireAdminSession } from "../../../../lib/admin/session";
import { LoadError } from "../../_components/LoadError";
import { PrintQueue } from "../../_components/PrintQueue";

/**
 * Print queue (#74, experimental). Jobs are queued from Moderation ("Print…"
 * on a visible photo) and wait durably in the API until the venue printer
 * daemon claims them. The list refreshes itself while this page is open.
 */
export default async function PrintPage({ searchParams }: { searchParams: Promise<{ status?: string | string[] }> }) {
  const { token } = await requireAdminSession();
  const status = parsePrintStatus((await searchParams).status);
  const page = await listPrintJobs(token, { status, limit: PRINT_PAGE_SIZE });
  redirectIfUnauthorized(page);

  return (
    <>
      <h1>Print queue</h1>
      <p className="admin-muted admin-lead">
        Queue prints from Moderation with Print on a visible photo. The venue printer takes the oldest job first; if
        it is away, jobs wait here and print when it is back.
      </p>
      {page.status !== "ok" ? (
        <LoadError what="the print queue" result={page} />
      ) : (
        <PrintQueue key={status ?? "all"} status={status} initial={page.data} renderedAt={Date.now()} />
      )}
    </>
  );
}
