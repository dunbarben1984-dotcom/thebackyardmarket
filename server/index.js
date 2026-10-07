require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const billingRoutes = require('./routes/billing');
const listingsRoutes = require('./routes/listings');
const messagesRoutes = require('./routes/messages');
const reservationsRoutes = require('./routes/reservations');
const vouchersRoutes = require('./routes/vouchers');
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

const app = express();

const allowedOrigins = [
  ...'https://thebackyardmarket.com,https://regal-zuccutto-1b3806.netlify.app'.split(','),
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

// Central error handler — keeps stack traces out of API responses
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong.' });
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`TheBackyardMarket.com API running on port ${PORT}`));
