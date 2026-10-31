import type { CreateGraduateRequest, Graduate, UpdateGraduateRequest } from "@grad/contract";
import { and, asc, eq, ne } from "drizzle-orm";
import { recordAudit } from "../../audit/audit.js";
import { db } from "../../db/index.js";
import { users } from "../../db/schema.js";
import { namesForCreate, namesForUpdate } from "../invitations/person-name.js";
import { joinUrlFor } from "../join/join.service.js";

/** Thrown when a graduate with the same email already exists. */
export class DuplicateGraduateError extends Error {
  constructor() {
    super("A graduate with this email already exists");
    this.name = "DuplicateGraduateError";
  }
}

const columns = {
  id: users.id,
  name: users.name,
  givenName: users.givenName,
  familyName: users.familyName,
  nameReviewed: users.nameReviewed,
  email: users.email,
  joinCode: users.joinCode,
  createdAt: users.createdAt,
};

type Row = Omit<Graduate, "createdAt" | "joinUrl"> & { joinCode: string | null; createdAt: Date };

function toGraduate({ joinCode, ...row }: Row): Graduate {
  return { ...row, joinUrl: joinCode ? joinUrlFor(joinCode) : null, createdAt: row.createdAt.toISOString() };
}

export class GraduatesRepository {
  async list(): Promise<Graduate[]> {
    const rows = await db
      .select(columns)
      .from(users)
      .where(eq(users.role, "graduate"))
      .orderBy(asc(users.name), asc(users.email));
    return rows.map(toGraduate);
  }

  async create(dto: CreateGraduateRequest, actor: string): Promise<Graduate> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(users)
        .values({
          name: dto.name,
          ...namesForCreate(dto.name, dto.givenName, dto.familyName),
          email: dto.email,
          role: "graduate",
        })
        .onConflictDoNothing({ target: users.email })
        .returning(columns);
      if (!row) throw new DuplicateGraduateError();

      // Email is PII: the audit row carries the id only.
      await recordAudit(tx, {
        actor,
        action: "graduate.create",
        targetType: "graduate",
        targetId: row.id,
      });
      return toGraduate(row);
    });
  }

  /**
   * PATCH /admin/graduates/{id}; null for an unknown id. Throws
   * DuplicateGraduateError when the new email belongs to someone else.
   * Audited with the changed field names only.
   */
  async update(id: string, dto: UpdateGraduateRequest, actor: string): Promise<Graduate | null> {
    return db.transaction(async (tx) => {
      if (dto.email !== undefined) {
        const [taken] = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, dto.email), ne(users.id, id)));
        if (taken) throw new DuplicateGraduateError();
      }
      const set: Partial<typeof users.$inferInsert> = namesForUpdate(dto);
      if (dto.email !== undefined) set.email = dto.email;
      const [row] = await tx
        .update(users)
        .set({ ...set, updatedAt: new Date() })
        .where(and(eq(users.id, id), eq(users.role, "graduate")))
        .returning(columns);
      if (!row) return null;

      await recordAudit(tx, {
        actor,
        action: "graduate.update",
        targetType: "graduate",
        targetId: id,
        metadata: { fields: Object.keys(dto).sort() },
      });
      return toGraduate(row);
    });
  }
}
