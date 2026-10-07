const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/vouchers/redeem
// Body: { code: "FARM-XXXX" }
// Validates the voucher and grants a 6-month free subscription for the voucher's plan.
router.post('/redeem', requireAuth, async (req, res, next) => {
  try {
    const { code } = req.body;
    const { id: userId, role } = req.user;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Voucher code is required.' });
    }

    const normalized = code.trim().toUpperCase();

    // Look up the voucher
    const vResult = await db.query(
      'SELECT * FROM vouchers WHERE code = $1',
      [normalized]
    );
    const voucher = vResult.rows[0];

    if (!voucher) {
      return res.status(404).json({ error: 'Invalid voucher code.' });
    }

    // Check expiry
    if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This voucher has expired.' });
    }

    // Check max uses
    if (voucher.uses_count >= voucher.max_uses) {
      return res.status(400).json({ error: 'This voucher has already been fully redeemed.' });
    }

    // Check plan matches user's role
    if (voucher.plan_type !== role) {
      return res.status(400).json({
        error: `This voucher is for ${voucher.plan_type} accounts, but you're signed in as a ${role}.`
      });
    }

    // Check if this user already redeemed a voucher
    const existing = await db.query(
      'SELECT id FROM voucher_redemptions WHERE user_id = $1',
      [userId]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'You have already redeemed a voucher.' });
    }

    // Check if user already has an active subscription (don't double-grant)
    const subCheck = await db.query(
      `SELECT id FROM subscriptions WHERE user_id = $1 AND plan = $2 AND status = 'active'
       AND current_period_end > now() ORDER BY created_at DESC LIMIT 1`,
      [userId, role]
    );
    if (subCheck.rows.length > 0) {
      return res.status(400).json({ error: 'You already have an active subscription.' });
    }

    // All checks passed — grant 6 months free
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 6);

    const voucherSubId = `voucher_${normalized}_${Date.now()}`;

    await db.query('BEGIN');
    try {
      // Create the subscription record
      await db.query(
        `INSERT INTO subscriptions (user_id, stripe_subscription_id, plan, status, current_period_end)
         VALUES ($1, $2, $3, 'active', $4)`,
        [userId, voucherSubId, role, periodEnd]
      );

      // Record the redemption
      await db.query(
        'INSERT INTO voucher_redemptions (voucher_id, user_id) VALUES ($1, $2)',
        [voucher.id, userId]
      );

      // Increment uses
      await db.query(
        'UPDATE vouchers SET uses_count = uses_count + 1 WHERE id = $1',
        [voucher.id]
      );

      await db.query('COMMIT');
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    }

    res.json({
      success: true,
      message: `Voucher redeemed! You have 6 months of free ${role} access.`,
      valid_until: periodEnd.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/vouchers/status — check voucher availability (public, for display)
router.get('/status', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT plan_type,
              SUM(max_uses) as total,
              SUM(uses_count) as used
       FROM vouchers
       WHERE (expires_at IS NULL OR expires_at > now())
       GROUP BY plan_type`
    );
    const status = {};
    for (const row of result.rows) {
      status[row.plan_type] = {
        total: parseInt(row.total),
        used: parseInt(row.used),
        remaining: parseInt(row.total) - parseInt(row.used),
      };
    }
    res.json(status);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
