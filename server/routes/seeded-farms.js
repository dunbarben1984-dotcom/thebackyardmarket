const express = require('express');
const db = require('../db');
const { requireAuth, isAdminEmail } = require('../middleware/auth');

const router = express.Router();

// Public fields only — seeded farms carry no contact emails/phones in the DB.
const PUBLIC_FIELDS = `id, farm_name, town, county, zip_code, products,
  website_url, source_url, status, created_at, claimed_at`;

// GET /api/seeded-farms — public directory of unclaimed farm profiles.
router.get('/', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT ${PUBLIC_FIELDS} FROM seeded_farms
       WHERE status = 'unclaimed'
       ORDER BY county, farm_name`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/seeded-farms/:id — public single profile (for the claim page).
router.get('/:id', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT ${PUBLIC_FIELDS} FROM seeded_farms WHERE id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Farm not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Normalize a farm name for matching: lowercase, drop parentheticals
// ("(S.E.F.F.)"), punctuation, and legal suffixes ("LLC").
function normalizeName(s) {
  return (s || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(llc|inc|co|company)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesMatch(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

// POST /api/seeded-farms/:id/claim — signed-in farmer claims their seeded profile.
// The farmer's account farm name must match the seeded farm name (the proof
// they are that farm). A successful claim also grants the 6-month founding
// period from the existing farmer voucher pool when a slot remains — no code
// for the farmer to type.
router.post('/:id/claim', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'farmer') {
      return res.status(403).json({ error: 'Only farmer accounts can claim a farm profile.' });
    }

    const farmResult = await db.query('SELECT * FROM seeded_farms WHERE id = $1', [req.params.id]);
    const seeded = farmResult.rows[0];
    if (!seeded) return res.status(404).json({ error: 'Farm not found.' });
    if (seeded.status !== 'unclaimed') {
      return res.status(400).json({ error: 'This farm profile has already been claimed.' });
    }

    const alreadyClaimed = await db.query(
      'SELECT id FROM seeded_farms WHERE claimed_by_user_id = $1',
      [req.user.id]
    );
    if (alreadyClaimed.rows.length) {
      return res.status(400).json({ error: 'Your account has already claimed a farm profile.' });
    }

    const farmRow = await db.query('SELECT * FROM farms WHERE user_id = $1', [req.user.id]);
    const farm = farmRow.rows[0];
    if (!farm) return res.status(400).json({ error: 'No farm profile found for this account.' });
    if (!namesMatch(farm.farm_name, seeded.farm_name)) {
      return res.status(400).json({
        error: `Your farm profile is named "${farm.farm_name}", which doesn't match "${seeded.farm_name}". Sign up with the farm name shown on the listing to claim it.`,
      });
    }

    // Already active (paid or voucher)? Then claim the profile without granting again.
    const activeSub = await db.query(
      `SELECT id FROM subscriptions WHERE user_id = $1 AND plan = 'farmer'
       AND status = 'active' AND current_period_end > now()
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );

    // A remaining founding slot: one farmer voucher row with uses left.
    const voucherResult = await db.query(
      `SELECT * FROM vouchers WHERE plan_type = 'farmer'
       AND uses_count < max_uses
       AND (expires_at IS NULL OR expires_at > now())
       ORDER BY id ASC LIMIT 1`
    );
    const voucher = voucherResult.rows[0];

    const grantFree = !activeSub.rows.length && !!voucher;
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 6);

    await db.query('BEGIN');
    try {
      // Fill the farmer's own farm profile with the seeded details.
      await db.query(
        `UPDATE farms SET
           description = COALESCE(NULLIF(description, ''), $1),
           zip_code = CASE WHEN zip_code IS NULL OR zip_code = '' THEN COALESCE($2, zip_code) ELSE zip_code END
         WHERE id = $3`,
        [seeded.products, seeded.zip_code, farm.id]
      );

      if (grantFree) {
        // Mirror the voucher redeem's subscription grant. Deliberately no
        // voucher_redemptions insert: that table's user_id column is INTEGER
        // while users.id is UUID, so the insert fails. uses_count is the cap.
        await db.query(
          `INSERT INTO subscriptions (user_id, stripe_subscription_id, plan, status, current_period_end)
           VALUES ($1, $2, 'farmer', 'active', $3)`,
          [req.user.id, `claim_${seeded.id}`, periodEnd]
        );
        await db.query('UPDATE vouchers SET uses_count = uses_count + 1 WHERE id = $1', [voucher.id]);
      }

      await db.query(
        `UPDATE seeded_farms SET status = 'claimed', claimed_by_user_id = $1, claimed_at = now()
         WHERE id = $2`,
        [req.user.id, seeded.id]
      );

      await db.query('COMMIT');
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    }

    res.json({
      success: true,
      claimed: seeded.farm_name,
      foundingGranted: grantFree,
      validUntil: grantFree ? periodEnd.toISOString() : null,
      foundingExhausted: !activeSub.rows.length && !voucher,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/seeded-farms/:id/unclaim — admin only, undoes a bad claim.
// (Does not revoke a granted free period; that's a billing matter.)
router.post('/:id/unclaim', requireAuth, async (req, res, next) => {
  try {
    if (!isAdminEmail(req.user.email)) {
      return res.status(403).json({ error: 'Admin only.' });
    }
    const result = await db.query(
      `UPDATE seeded_farms SET status = 'unclaimed', claimed_by_user_id = NULL, claimed_at = NULL
       WHERE id = $1 RETURNING farm_name`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Farm not found.' });
    res.json({ success: true, unclaimed: result.rows[0].farm_name });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
