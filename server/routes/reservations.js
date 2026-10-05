const express = require('express');
const db = require('../db');
const { requireAuth, requireActiveSubscription } = require('../middleware/auth');

const router = express.Router();

// Buyer creates a reservation for a listing
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { listingId, quantity } = req.body;
    if (!listingId) return res.status(400).json({ error: 'listingId is required.' });
    const qty = parseInt(quantity, 10) || 1;
    if (qty < 1) return res.status(400).json({ error: 'Quantity must be at least 1.' });

    // Verify listing exists and is active
    const listingResult = await db.query(
      'SELECT id, user_id, quantity_available FROM listings WHERE id = $1',
      [listingId]
    );
    const listing = listingResult.rows[0];
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });
    if (listing.user_id === req.user.id) {
      return res.status(400).json({ error: 'You cannot reserve your own listing.' });
    }

    const result = await db.query(
      `INSERT INTO reservations (listing_id, buyer_id, quantity, status)
       VALUES ($1, $2, $3, 'requested') RETURNING *`,
      [listingId, req.user.id, qty]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Buyer's own reservations
router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT r.*, l.name as listing_name, l.price_cents, l.unit, u.full_name as farmer_name
       FROM reservations r
       JOIN listings l ON l.id = r.listing_id
       JOIN users u ON u.id = l.user_id
       WHERE r.buyer_id = $1 ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// Farmer's incoming reservations (for their listings)
router.get('/for-farmer', requireAuth, requireActiveSubscription('farmer'), async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT r.*, l.name as listing_name, l.price_cents, l.unit, u.full_name as buyer_name, u.email as buyer_email
       FROM reservations r
       JOIN listings l ON l.id = r.listing_id
       JOIN users u ON u.id = r.buyer_id
       WHERE l.user_id = $1 ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// Update reservation status (farmer confirms/completes/cancels, buyer can cancel)
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.body;
    const valid = ['confirmed', 'completed', 'cancelled'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: 'Status must be confirmed, completed, or cancelled.' });
    }

    // Check if user owns the reservation (buyer) or the listing (farmer)
    const check = await db.query(
      `SELECT r.*, l.user_id as farmer_id FROM reservations r
       JOIN listings l ON l.id = r.listing_id WHERE r.id = $1`,
      [req.params.id]
    );
    const res_row = check.rows[0];
    if (!res_row) return res.status(404).json({ error: 'Reservation not found.' });

    const isBuyer = res_row.buyer_id === req.user.id;
    const isFarmer = res_row.farmer_id === req.user.id;
    if (!isBuyer && !isFarmer) return res.status(403).json({ error: 'Not authorized.' });
    if (isBuyer && status !== 'cancelled') {
      return res.status(403).json({ error: 'Buyers can only cancel reservations.' });
    }

    const result = await db.query(
      'UPDATE reservations SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
