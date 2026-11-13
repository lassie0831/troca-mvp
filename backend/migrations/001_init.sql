-- Initial schema for the P2P barter marketplace MVP.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------- users / auth
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text   NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  email         citext NOT NULL UNIQUE CHECK (char_length(email) <= 254),
  password_hash text   NOT NULL,
  neighborhood  text   NOT NULL CHECK (char_length(neighborhood) BETWEEN 2 AND 80),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,           -- sha256 of the opaque token; the token itself is never stored
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);

-- ---------------------------------------------------------------- locations (privacy layer)
-- The exact device position lives ONLY here and is never returned by the API.
-- `public_location` is a persisted, randomly displaced point (200 m – 1 km by default).
-- Items registered near an existing anchor of the same user reuse it, so publishing many
-- items from home does not allow averaging several independent fuzzes back to the real address.
CREATE TABLE user_locations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  exact_location   geography(Point, 4326) NOT NULL,
  public_location  geography(Point, 4326) NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_locations_user_idx ON user_locations (user_id);
CREATE INDEX user_locations_exact_gist ON user_locations USING GIST (exact_location);

-- ---------------------------------------------------------------- items
CREATE TYPE item_status AS ENUM ('active', 'reserved', 'traded', 'archived');

CREATE TABLE items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  location_id      uuid NOT NULL REFERENCES user_locations (id),
  title            text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 80),
  description      text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  price_cents      integer NOT NULL CHECK (price_cents BETWEEN 100 AND 100000000),
  category         text NOT NULL,
  status           item_status NOT NULL DEFAULT 'active',
  -- Copy of user_locations.public_location, denormalised so the feed query can use a GIST index.
  public_location  geography(Point, 4326) NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX items_owner_idx ON items (owner_id, created_at DESC);
CREATE INDEX items_active_public_location_gist ON items USING GIST (public_location) WHERE status = 'active';
CREATE INDEX items_active_price_idx ON items (price_cents) WHERE status = 'active';
CREATE INDEX items_location_idx ON items (location_id);

CREATE TABLE item_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      uuid NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  storage_key  text NOT NULL UNIQUE,   -- full-size object; thumbnail key = storage_key with "_thumb" suffix
  position     smallint NOT NULL,
  width        integer NOT NULL,
  height       integer NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX item_photos_item_idx ON item_photos (item_id, position);

-- ---------------------------------------------------------------- proposals
-- pending -> accepted | declined | cancelled | unavailable
-- accepted -> completed (trade done) | cancelled (trade fell through, items return to the feed)
CREATE TYPE proposal_status AS ENUM ('pending', 'accepted', 'declined', 'cancelled', 'unavailable', 'completed');

CREATE TABLE proposals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposer_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  recipient_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  offered_item_id    uuid NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  requested_item_id  uuid NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  status             proposal_status NOT NULL DEFAULT 'pending',
  message            text CHECK (char_length(message) <= 280),
  created_at         timestamptz NOT NULL DEFAULT now(),
  responded_at       timestamptz,
  closed_at          timestamptz,
  CHECK (proposer_id <> recipient_id),
  CHECK (offered_item_id <> requested_item_id)
);
-- At most one open proposal for the same pair of items.
CREATE UNIQUE INDEX proposals_one_pending_per_pair
  ON proposals (offered_item_id, requested_item_id) WHERE status = 'pending';
CREATE INDEX proposals_recipient_idx ON proposals (recipient_id, created_at DESC);
CREATE INDEX proposals_proposer_idx ON proposals (proposer_id, created_at DESC);
CREATE INDEX proposals_offered_idx ON proposals (offered_item_id) WHERE status IN ('pending', 'accepted');
CREATE INDEX proposals_requested_idx ON proposals (requested_item_id) WHERE status IN ('pending', 'accepted');
