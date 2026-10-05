require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const billingRoutes = require('./routes/billing');
const listingsRoutes = require('./routes/listings');
const messagesRoutes = require('./routes/messages');

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));

// The Stripe webhook route needs the *raw* body to verify the signature, so it's
// mounted BEFORE express.json() and given its own raw parser, matched by exact path.
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

// Every other route gets normal JSON parsing.
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/listings', listingsRoutes);
app.use('/api/messages', messagesRoutes);

// Central error handler — keeps stack traces out of API responses
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong.' });
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`TheBackyardMarket.com API running on port ${PORT}`));

// TEMPORARY DEBUG — remove before production
app.get('/api/debug/signup-test', async (req, res) => {
  const out = {};
  try {
    const bcrypt = require('bcrypt');
    const h = await bcrypt.hash('test123', 4);
    out.bcrypt = 'ok';
  } catch (e) { out.bcrypt = 'FAIL: ' + e.message; }
  try {
    const db = require('./db');
    const r = await db.query('SELECT 1 as x');
    out.db_select = 'ok';
  } catch (e) { out.db_select = 'FAIL: ' + e.message; }
  try {
    const db = require('./db');
    await db.query(`INSERT INTO users (email, password_hash, full_name, role, zip_code) VALUES ($1,$2,$3,$4,$5)`, ['debug_del_me@example.com','x','Debug','buyer','00000']);
    out.db_insert = 'ok';
    await db.query(`DELETE FROM users WHERE email='debug_del_me@example.com'`);
  } catch (e) { out.db_insert = 'FAIL: ' + e.message; }
  res.json(out);
});
