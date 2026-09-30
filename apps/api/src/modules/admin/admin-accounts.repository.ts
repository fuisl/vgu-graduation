import type { AdminAccessStatus, AdminAccountDecision } from "@grad/contract";
import { and, desc, eq, inArray } from "drizzle-orm";
import { recordAudit } from "../../audit/audit.js";
import { db } from "../../db/index.js";
import { adminAccounts } from "../../db/schema.js";

export interface StoredAdminAccount {
  githubHandle: string;
  status: AdminAccessStatus;
  requestedAt: Date;
  decidedBy: string | null;
  decidedAt: Date | null;
}

export type DecisionResult =
  | { status: "ok"; account: StoredAdminAccount }
  | { status: "not_found" }
  /** The account is not in a state this decision applies to (e.g. revoking a pending request). */
  | { status: "conflict"; current: AdminAccessStatus };

/** Storage seam so the guard and routes can be tested without a database. */
export interface AdminAccountStore {
  /** Current status, or null when the handle has never signed in. */
  getStatus(handle: string): Promise<AdminAccessStatus | null>;
  /** Files a pending request on first sign-in; later sign-ins return the stored status unchanged. */
  requestAccess(handle: string): Promise<AdminAccessStatus>;
  list(): Promise<StoredAdminAccount[]>;
  decide(handle: string, decision: AdminAccountDecision, actor: string): Promise<DecisionResult>;
}

/** Which states each decision may start from. Rejected or revoked accounts can be approved again. */
const FROM: Record<AdminAccountDecision, AdminAccessStatus[]> = {
  approve: ["pending", "rejected", "revoked"],
  reject: ["pending"],
  revoke: ["approved"],
};

const TO: Record<AdminAccountDecision, AdminAccessStatus> = {
  approve: "approved",
  reject: "rejected",
  revoke: "revoked",
};

const columns = {
  githubHandle: adminAccounts.githubHandle,
  status: adminAccounts.status,
  requestedAt: adminAccounts.requestedAt,
  decidedBy: adminAccounts.decidedBy,
  decidedAt: adminAccounts.decidedAt,
};

export class AdminAccountsRepository implements AdminAccountStore {
  constructor(private readonly database: typeof db = db) {}

  async getStatus(handle: string): Promise<AdminAccessStatus | null> {
    const [row] = await this.database
      .select({ status: adminAccounts.status })
      .from(adminAccounts)
      .where(eq(adminAccounts.githubHandle, handle));
    return row?.status ?? null;
  }

  async requestAccess(handle: string): Promise<AdminAccessStatus> {
    return this.database.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(adminAccounts)
        .values({ githubHandle: handle })
        .onConflictDoNothing({ target: adminAccounts.githubHandle })
        .returning({ status: adminAccounts.status });
      if (inserted) {
        await recordAudit(tx, { actor: handle, action: "admin.request", targetType: "admin", targetId: handle });
        return inserted.status;
      }
      const [row] = await tx
        .select({ status: adminAccounts.status })
        .from(adminAccounts)
        .where(eq(adminAccounts.githubHandle, handle));
      return row!.status;
    });
  }

  async list(): Promise<StoredAdminAccount[]> {
    return this.database
      .select(columns)
      .from(adminAccounts)
      .orderBy(desc(adminAccounts.requestedAt), adminAccounts.githubHandle);
  }

  async decide(handle: string, decision: AdminAccountDecision, actor: string): Promise<DecisionResult> {
    return this.database.transaction(async (tx) => {
      const now = new Date();
      const [account] = await tx
        .update(adminAccounts)
        .set({ status: TO[decision], decidedBy: actor, decidedAt: now, updatedAt: now })
        .where(and(eq(adminAccounts.githubHandle, handle), inArray(adminAccounts.status, FROM[decision])))
        .returning(columns);
      if (account) {
        await recordAudit(tx, { actor, action: `admin.${decision}`, targetType: "admin", targetId: handle });
        return { status: "ok", account };
      }
      const [current] = await tx
        .select({ status: adminAccounts.status })
        .from(adminAccounts)
        .where(eq(adminAccounts.githubHandle, handle));
      return current ? { status: "conflict", current: current.status } : { status: "not_found" };
    });
  }
}
