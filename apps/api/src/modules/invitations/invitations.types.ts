export interface Guest {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Inviter {
  id: string;
  name: string;
  email: string;
}

export interface RSVP {
  id: string;
  attending: boolean;
  plus_ones_count: number;
  dietary_requirements: string | null;
  notes: string | null;
  updated_at: Date;
}

export interface InvitationWithDetails {
  id: string;
  guest: Guest;
  maxPlusOnes: number;
  status: "active" | "revoked";
  validFrom: Date | null;
  validUntil: Date | null;
  inviters: Inviter[];
  rsvp: RSVP | null;
}

export interface CreateInvitationDTO {
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  inviterUserIds: string[];
  maxPlusOnes?: number;
}
