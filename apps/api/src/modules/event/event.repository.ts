import type { UpdateEventRequest } from "@grad/contract";
import { eq, sql } from "drizzle-orm";
import { recordAudit } from "../../audit/audit.js";
import { db } from "../../db/index.js";
import { eventConfig } from "../../db/schema.js";

/** The event_config row (single row, id = 1). */
export interface StoredEvent {
  name: string;
  startsAt: Date;
  endsAt: Date | null;
  timeZone: string;
  timeConfirmed: boolean;
  venueName: string;
  venueAddress: string;
  venueMapUrl: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  arrivalInfo: string | null;
  sequence: number;
  updatedAt: Date;
}

/** Storage seam so routes can be tested without a database. */
export interface EventStore {
  get(): Promise<StoredEvent | null>;
  /** Replaces the row, bumps `sequence`, and audits, atomically. Null when the row is missing. */
  update(input: UpdateEventRequest, actor: string): Promise<StoredEvent | null>;
}

export class EventRepository implements EventStore {
  constructor(private readonly database: typeof db = db) {}

  async get(): Promise<StoredEvent | null> {
    const [row] = await this.database.select().from(eventConfig).where(eq(eventConfig.id, 1));
    return row ?? null;
  }

  async update(input: UpdateEventRequest, actor: string): Promise<StoredEvent | null> {
    return this.database.transaction(async (tx) => {
      const [row] = await tx
        .update(eventConfig)
        .set({
          name: input.name,
          startsAt: new Date(input.startsAt),
          endsAt: input.endsAt === null ? null : new Date(input.endsAt),
          timeZone: input.timeZone,
          timeConfirmed: input.timeConfirmed,
          venueName: input.venue.name,
          venueAddress: input.venue.address,
          venueMapUrl: input.venue.mapUrl,
          contactName: input.contact?.name ?? null,
          contactEmail: input.contact?.email ?? null,
          contactPhone: input.contact?.phone ?? null,
          arrivalInfo: input.arrivalInfo,
          sequence: sql`${eventConfig.sequence} + 1`,
          updatedAt: sql`now()`,
        })
        .where(eq(eventConfig.id, 1))
        .returning();
      if (!row) return null;

      await recordAudit(tx, {
        actor,
        action: "event.update",
        targetType: "event_config",
        targetId: "1",
        metadata: { sequence: row.sequence, timeConfirmed: row.timeConfirmed },
      });
      return row;
    });
  }
}
