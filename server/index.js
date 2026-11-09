require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const billingRoutes = require('./routes/billing');
const listingsRoutes = require('./routes/listings');
const messagesRoutes = require('./routes/messages');
const reservationsRoutes = require('./routes/reservations');
const vouchersRoutes = require('./routes/vouchers');
const seededFarmsRoutes = require('./routes/seeded-farms');
const seededFarmsData = require('./data/seeded-farms');
const db = require('./db');

// Lightweight startup migration: add columns that may not exist yet.
db.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS image_url TEXT`).catch(e =>
  console.error('Migration warning (image_url):', e.message)
);

// Voucher system tables
db.query(`
  CREATE TABLE IF NOT EXISTS vouchers (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    plan_type VARCHAR(20) NOT NULL CHECK (plan_type IN ('farmer', 'buyer')),
    max_uses INTEGER NOT NULL DEFAULT 1,
    uses_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS voucher_redemptions (
    id SERIAL PRIMARY KEY,
    voucher_id INTEGER NOT NULL REFERENCES vouchers(id),
    user_id INTEGER NOT NULL,
    redeemed_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id)
  );
`).catch(e =>
  console.error('Migration warning (vouchers):', e.message)
);

// Voucher redemption user_id type fix: the original migration created
// voucher_redemptions.user_id as INTEGER, but users.id is UUID, so the
// redeem insert fails. Fix the column type (safe when the table is empty,
// which it is while no redemption has ever succeeded).
db.query(`ALTER TABLE voucher_redemptions ALTER COLUMN user_id TYPE UUID USING user_id::text::uuid`).catch(e =>
  console.error('Migration warning (voucher_redemptions user_id):', e.message)
);

// Seeded farm profiles: real farms from public directories, shown unclaimed
// until a farm claims its page. Idempotent — re-running changes nothing.
db.query(`
  CREATE TABLE IF NOT EXISTS seeded_farms (
    id UUID PRIMARY KEY,
    farm_name TEXT NOT NULL,
    town TEXT,
    county TEXT NOT NULL,
    zip_code TEXT,
    products TEXT,
    website_url TEXT,
    source_url TEXT,
    status TEXT NOT NULL DEFAULT 'unclaimed' CHECK (status IN ('unclaimed', 'claimed')),
    claimed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_seeded_farms_status ON seeded_farms(status);
`).then(() => {
  const values = [];
  const params = [];
  seededFarmsData.forEach((f) => {
    params.push(f.id, f.farm_name, f.town, f.county, f.zip_code, f.products, f.website_url, f.source_url);
    const base = params.length - 8;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`);
  });
  return db.query(
    `INSERT INTO seeded_farms (id, farm_name, town, county, zip_code, products, website_url, source_url)
     VALUES ${values.join(', ')} ON CONFLICT (id) DO NOTHING`,
    params
  );
}).catch(e =>
  console.error('Migration warning (seeded_farms):', e.message)
);

const app = express();

const allowedOrigins = [
  ...'https://thebackyardmarket.com'.split(','),
  ...(process.env.CLIENT_URL || '').split(','),
].map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin/non-browser requests and any configured client URL
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS blocked'));
  },
  credentials: true
}));

// The Stripe webhook route needs the *raw* body to verify the signature, so it's
// mounted BEFORE express.json() and given its own raw parser, matched by exact path.
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

// Every other route gets normal JSON parsing (10mb to allow listing photos).
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/listings', listingsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/vouchers', vouchersRoutes);
app.use('/api/seeded-farms', seededFarmsRoutes);

// Central error handler — keeps stack traces out of API responses
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong.' });
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`TheBackyardMarket.com API running on port ${PORT}`));
