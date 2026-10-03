const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/messages/threads — list of distinct conversations for the signed-in user
router.get('/threads', requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT ON (other_id)
         other_id,
         u.full_name AS other_name,
         m.body AS last_message,
         m.created_at
       FROM (
         SELECT CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other_id,
                body, created_at
         FROM messages
         WHERE sender_id = $1 OR recipient_id = $1
       ) m
       JOIN users u ON u.id = m.other_id
       ORDER BY other_id, created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/messages/thread/:otherUserId — full conversation with one other user
router.get('/thread/:otherUserId', requireAuth, async (req, res, next) => {
  try {
    const { otherUserId } = req.params;
    const result = await db.query(
      `SELECT * FROM messages
       WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
       ORDER BY created_at ASC`,
      [req.user.id, otherUserId]
    );
    await db.query(
      `UPDATE messages SET read_at = now() WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL`,
      [req.user.id, otherUserId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/messages — send a message, optionally attached to a listing
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { recipientId, body, listingId } = req.body;
    if (!recipientId || !body) return res.status(400).json({ error: 'recipientId and body are required.' });

    const result = await db.query(
      `INSERT INTO messages (sender_id, recipient_id, body, listing_id) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.id, recipientId, body, listingId || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
