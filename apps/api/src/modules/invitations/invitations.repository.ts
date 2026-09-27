import { pool } from "../../db/index.js";
import type {
  CreateInvitationDTO,
  Guest,
  InvitationWithDetails,
  Inviter,
  RSVP,
} from "./invitations.types.js";

export class InvitationsRepository {
  async createInvitation(
    dto: CreateInvitationDTO,
    tokenHash: string
  ): Promise<{
    invitationId: string;
    guest: Guest;
    inviterUserIds: string[];
    maxPlusOnes: number;
  }> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Insert guest
      const guestResult = await client.query<Guest>(
        `INSERT INTO guests (name, email, phone)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [dto.guestName, dto.guestEmail || null, dto.guestPhone || null]
      );
      const guest = guestResult.rows[0];

      // 2. Insert invitation
      const maxPlusOnes = dto.maxPlusOnes ?? 0;
      const invitationResult = await client.query<{ id: string }>(
        `INSERT INTO invitations (guest_id, token_hash, max_plus_ones)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [guest.id, tokenHash, maxPlusOnes]
      );
      const invitationId = invitationResult.rows[0].id;

      // 3. Link inviters
      for (const userId of dto.inviterUserIds) {
        await client.query(
          `INSERT INTO invitation_inviters (invitation_id, user_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [invitationId, userId]
        );
      }

      await client.query("COMMIT");

      return {
        invitationId,
        guest,
        inviterUserIds: dto.inviterUserIds,
        maxPlusOnes,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findByTokenHash(
    tokenHash: string
  ): Promise<(InvitationWithDetails & { token_hash: string }) | null> {
    const query = `
      SELECT 
        i.id,
        i.token_hash,
        i.max_plus_ones,
        i.status,
        i.valid_from,
        i.valid_until,
        g.id as guest_id,
        g.name as guest_name,
        g.email as guest_email,
        g.phone as guest_phone,
        g.created_at as guest_created_at,
        g.updated_at as guest_updated_at,
        r.id as rsvp_id,
        r.attending as rsvp_attending,
        r.plus_ones_count as rsvp_plus_ones_count,
        r.dietary_requirements as rsvp_dietary_requirements,
        r.notes as rsvp_notes,
        r.updated_at as rsvp_updated_at
      FROM invitations i
      JOIN guests g ON g.id = i.guest_id
      LEFT JOIN rsvp r ON r.invitation_id = i.id
      WHERE i.token_hash = $1
    `;

    const result = await pool.query(query, [tokenHash]);
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    // Fetch linked inviters
    const invitersResult = await pool.query<Inviter>(
      `SELECT u.id, u.name, u.email
       FROM invitation_inviters ii
       JOIN users u ON u.id = ii.user_id
       WHERE ii.invitation_id = $1`,
      [row.id]
    );

    const rsvp: RSVP | null = row.rsvp_id
      ? {
          id: row.rsvp_id,
          attending: row.rsvp_attending,
          plus_ones_count: row.rsvp_plus_ones_count,
          dietary_requirements: row.rsvp_dietary_requirements,
          notes: row.rsvp_notes,
          updated_at: row.rsvp_updated_at,
        }
      : null;

    return {
      id: row.id,
      token_hash: row.token_hash,
      maxPlusOnes: row.max_plus_ones,
      status: row.status,
      validFrom: row.valid_from,
      validUntil: row.valid_until,
      guest: {
        id: row.guest_id,
        name: row.guest_name,
        email: row.guest_email,
        phone: row.guest_phone,
        created_at: row.guest_created_at,
        updated_at: row.guest_updated_at,
      },
      inviters: invitersResult.rows,
      rsvp,
    };
  }

  async rotateTokenHash(
    invitationId: string,
    newTokenHash: string
  ): Promise<boolean> {
    const result = await pool.query(
      `UPDATE invitations
       SET token_hash = $1, updated_at = NOW()
       WHERE id = $2 AND status = 'active'
       RETURNING id`,
      [newTokenHash, invitationId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }
}
