import type { CreateGraduateRequest, Graduate } from "@grad/contract";
import { asc, eq } from "drizzle-orm";
import { recordAudit } from "../../audit/audit.js";
import { db } from "../../db/index.js";
import { users } from "../../db/schema.js";

/** Thrown when a graduate with the same email already exists. */
export class DuplicateGraduateError extends Error {
  constructor() {
    super("A graduate with this email already exists");
    this.name = "DuplicateGraduateError";
  }
}

const columns = { id: users.id, name: users.name, email: users.email, createdAt: users.createdAt };

function toGraduate(row: { id: string; name: string; email: string; createdAt: Date }): Graduate {
  return { ...row, createdAt: row.createdAt.toISOString() };
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
        .values({ name: dto.name, email: dto.email, role: "graduate" })
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
}
