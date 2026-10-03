const jwt = require('jsonwebtoken');
const db = require('../db');

// Verifies the JWT sent as "Authorization: Bearer <token>" and attaches req.user
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, email, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Your session expired. Please sign in again.' });
  }
}

// Blocks the route unless the signed-in user has an active subscription
// matching the role passed in (e.g. requireActiveSubscription('farmer')).
function requireActiveSubscription(role) {
  return async (req, res, next) => {
    try {
      const result = await db.query(
        `SELECT status FROM subscriptions WHERE user_id = $1 AND plan = $2 ORDER BY created_at DESC LIMIT 1`,
        [req.user.id, role]
      );
      const sub = result.rows[0];
      if (!sub || sub.status !== 'active') {
        return res.status(402).json({
          error: `An active ${role} subscription is required for this action.`,
          code: 'SUBSCRIPTION_REQUIRED',
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireAuth, requireActiveSubscription };
