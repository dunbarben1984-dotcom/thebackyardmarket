-- TheBackyardMarket.com — database schema (PostgreSQL)
-- Run with: psql $DATABASE_URL -f database/schema.sql

CREATE TYPE user_role AS ENUM ('farmer', 'buyer');
CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'canceled', 'incomplete', 'trialing');
CREATE TYPE listing_status AS ENUM ('available', 'pre_order', 'sold_out');
CREATE TYPE reservation_status AS ENUM ('requested', 'confirmed', 'completed', 'canceled');

-- ---------- USERS ----------
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  role            user_role NOT NULL,
  zip_code        TEXT NOT NULL,
  stripe_customer_id TEXT UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- SUBSCRIPTIONS ----------
-- One row per user's billing state. Farmers can't create listings, and buyers
-- can't message/reserve, unless status = 'active' (checked in middleware).
CREATE TABLE subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id  TEXT UNIQUE,
  plan                    user_role NOT NULL,           -- 'farmer' ($29.99/yr) or 'buyer' ($9.99/yr)
  status                  subscription_status NOT NULL DEFAULT 'incomplete',
  current_period_end      TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);

-- ---------- FARMS ----------
CREATE TABLE farms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  farm_name       TEXT NOT NULL,
  description     TEXT,
  zip_code        TEXT NOT NULL,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  certification   TEXT,              -- e.g. 'USDA Organic', 'Certified Naturally Grown'
  certified       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_farms_user ON farms(user_id);

-- ---------- LISTINGS ----------
CREATE TABLE listings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id         UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,     -- 'Vegetables', 'Beef & Meat', etc.
  organic         BOOLEAN NOT NULL DEFAULT false,
  price_cents     INTEGER NOT NULL,
  unit            TEXT NOT NULL,     -- 'lb', 'dozen', 'bunch', 'each'...
  description     TEXT,
  status          listing_status NOT NULL DEFAULT 'available',
  quantity_available INTEGER,        -- nullable = unlimited
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_listings_farm ON listings(farm_id);
CREATE INDEX idx_listings_category ON listings(category);
CREATE INDEX idx_listings_status ON listings(status);

-- ---------- CSA / SUBSCRIPTION BOXES (feature from the pitch) ----------
CREATE TABLE csa_boxes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id         UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  price_cents     INTEGER NOT NULL,
  frequency       TEXT NOT NULL,     -- 'weekly', 'biweekly', 'monthly'
  description     TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- MARKET / POP-UP EVENTS ----------
CREATE TABLE market_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id         UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  location        TEXT NOT NULL,
  event_date      DATE NOT NULL,
  start_time      TIME,
  end_time        TIME,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_market_events_farm ON market_events(farm_id);

-- ---------- RESERVATIONS (buyer reserving a listing for pickup) ----------
CREATE TABLE reservations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quantity        INTEGER NOT NULL DEFAULT 1,
  status          reservation_status NOT NULL DEFAULT 'requested',
  pickup_time     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reservations_buyer ON reservations(buyer_id);
CREATE INDEX idx_reservations_listing ON reservations(listing_id);

-- ---------- MESSAGES ----------
CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID REFERENCES listings(id) ON DELETE SET NULL,
  sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_recipient ON messages(recipient_id);
CREATE INDEX idx_messages_thread ON messages(sender_id, recipient_id);

-- ---------- REVIEWS ----------
CREATE TABLE reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id         UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  buyer_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(farm_id, buyer_id)
);

-- ---------- SAVED FARMS / RESTOCK ALERTS ----------
CREATE TABLE saved_farms (
  buyer_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  farm_id         UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (buyer_id, farm_id)
);

CREATE TABLE restock_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id      UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  notified        BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(buyer_id, listing_id)
);
