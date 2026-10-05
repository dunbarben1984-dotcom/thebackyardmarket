require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const billingRoutes = require('./routes/billing');
const listingsRoutes = require('./routes/listings');
const messagesRoutes = require('./routes/messages');
const reservationsRoutes = require('./routes/reservations');

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
app.use('/api/reservations', reservationsRoutes);

// Central error handler — keeps stack traces out of API responses
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong.' });
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`TheBackyardMarket.com API running on port ${PORT}`));
