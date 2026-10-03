const express = require('express');
const db = require('../db');
const { requireAuth, requireActiveSubscription } = require('../middleware/auth');

const router = express.Router();

// GET /api/listings?category=Organic&search=tomato&zip=97205
// Public — no auth required, so the homepage can browse without signing in.
router.get('/', async (req, res, next) => {
  try {
    const { category, search, farmId } = req.query;
    const conditions = [];
    const params = [];

    if (category && category !== 'All') {
      params.push(category);
      conditions.push(`l.category = $${params.length}`);
    }
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      conditions.push(`(LOWER(l.name) LIKE $${params.length} OR LOWER(f.farm_name) LIKE $${params.length})`);
    }
    if (farmId) {
      params.push(farmId);
      conditions.push(`f.id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.query(
      `SELECT l.id, l.name, l.category, l.organic, l.price_cents, l.unit, l.description,
              l.status, l.quantity_available, l.created_at,
              f.id AS farm_id, f.farm_name, f.zip_code, f.certified, f.certification
       FROM listings l
       JOIN farms f ON f.id = l.farm_id
       ${where}
       ORDER BY l.created_at DESC
       LIMIT 100`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/listings — farmer only, and only with an active farmer subscription
router.post('/', requireAuth, requireActiveSubscription('farmer'), async (req, res, next) => {
  try {
    const { name, category, organic, priceCents, unit, description, quantityAvailable } = req.body;
    if (!name || !category || !priceCents || !unit) {
      return res.status(400).json({ error: 'name, category, priceCents, and unit are required.' });
    }

    const farmRow = await db.query('SELECT id FROM farms WHERE user_id = $1', [req.user.id]);
    const farm = farmRow.rows[0];
    if (!farm) return res.status(400).json({ error: 'No farm profile found for this account.' });

    const result = await db.query(
      `INSERT INTO listings (farm_id, name, category, organic, price_cents, unit, description, quantity_available)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [farm.id, name, category, !!organic, priceCents, unit, description || null, quantityAvailable || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/listings/:id — farmer can only edit their own listings
router.put('/:id', requireAuth, requireActiveSubscription('farmer'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, category, organic, priceCents, unit, description, status, quantityAvailable } = req.body;

    const ownsListing = await db.query(
      `SELECT l.id FROM listings l JOIN farms f ON f.id = l.farm_id WHERE l.id = $1 AND f.user_id = $2`,
      [id, req.user.id]
    );
    if (!ownsListing.rows.length) return res.status(404).json({ error: 'Listing not found.' });

    const result = await db.query(
      `UPDATE listings SET
         name = COALESCE($1, name),
         category = COALESCE($2, category),
         organic = COALESCE($3, organic),
         price_cents = COALESCE($4, price_cents),
         unit = COALESCE($5, unit),
         description = COALESCE($6, description),
         status = COALESCE($7, status),
         quantity_available = COALESCE($8, quantity_available),
         updated_at = now()
       WHERE id = $9 RETURNING *`,
      [name, category, organic, priceCents, unit, description, status, quantityAvailable, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/listings/:id
router.delete('/:id', requireAuth, requireActiveSubscription('farmer'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `DELETE FROM listings l USING farms f
       WHERE l.farm_id = f.id AND l.id = $1 AND f.user_id = $2 RETURNING l.id`,
      [id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Listing not found.' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/listings/mine — farmer's own listings for the dashboard (any subscription status,
// so a lapsed farmer can still see and reactivate rather than losing their data)
router.get('/mine/all', requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT l.* FROM listings l JOIN farms f ON f.id = l.farm_id WHERE f.user_id = $1 ORDER BY l.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
