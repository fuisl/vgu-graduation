import type { AdminAccessStatus, AdminAccountDecision } from "@grad/contract";
import type { AdminAccountStore, DecisionResult, StoredAdminAccount } from "./admin-accounts.repository.js";

const FROM: Record<AdminAccountDecision, AdminAccessStatus[]> = {
  approve: ["pending", "rejected", "revoked"],
  reject: ["pending"],
  revoke: ["approved"],
};
const TO: Record<AdminAccountDecision, AdminAccessStatus> = { approve: "approved", reject: "rejected", revoke: "revoked" };

/** In-memory AdminAccountStore for route tests, with the same transitions as the repository. */
export function fakeAdminAccounts(initial: Record<string, AdminAccessStatus> = {}) {
  const accounts = new Map<string, StoredAdminAccount>(
    Object.entries(initial).map(([githubHandle, status]) => [
      githubHandle,
      { githubHandle, status, requestedAt: new Date("2026-09-30T00:00:00Z"), decidedBy: null, decidedAt: null },
    ]),
  );
  const decisions: [string, AdminAccountDecision, string][] = [];

  const store: AdminAccountStore = {
    async getStatus(handle) {
      return accounts.get(handle)?.status ?? null;
    },
    async requestAccess(handle) {
      if (!accounts.has(handle)) {
        accounts.set(handle, { githubHandle: handle, status: "pending", requestedAt: new Date(), decidedBy: null, decidedAt: null });
      }
      return accounts.get(handle)!.status;
    },
    async list() {
      return [...accounts.values()];
    },
    async decide(handle, decision, actor): Promise<DecisionResult> {
      const account = accounts.get(handle);
      if (!account) return { status: "not_found" };
      if (!FROM[decision].includes(account.status)) return { status: "conflict", current: account.status };
      decisions.push([handle, decision, actor]);
      const updated = { ...account, status: TO[decision], decidedBy: actor, decidedAt: new Date() };
      accounts.set(handle, updated);
      return { status: "ok", account: updated };
    },
  };
  return { store, accounts, decisions };
}

/** Store where the "tester" handle used by route tests is an approved admin. */
export function approvedTester(): AdminAccountStore {
  return fakeAdminAccounts({ tester: "approved" }).store;
}
