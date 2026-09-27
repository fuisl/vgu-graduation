-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users (graduates & admins)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'graduate' CHECK (role IN ('graduate', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Guests (invited individuals)
CREATE TABLE IF NOT EXISTS guests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Invitations (stores SHA-256 hash of the 128-bit bearer token)
CREATE TABLE IF NOT EXISTS invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    max_plus_ones INT NOT NULL DEFAULT 0 CHECK (max_plus_ones >= 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_token_hash ON invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_guest_id ON invitations(guest_id);

-- 4. InvitationInviters (many-to-many relation for joint invitations from multiple graduates)
CREATE TABLE IF NOT EXISTS invitation_inviters (
    invitation_id UUID NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (invitation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_invitation_inviters_user ON invitation_inviters(user_id);

-- 5. RSVP (attendance state tied to an invitation)
CREATE TABLE IF NOT EXISTS rsvp (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_id UUID UNIQUE NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
    attending BOOLEAN NOT NULL,
    plus_ones_count INT NOT NULL DEFAULT 0 CHECK (plus_ones_count >= 0),
    dietary_requirements TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rsvp_invitation ON rsvp(invitation_id);
