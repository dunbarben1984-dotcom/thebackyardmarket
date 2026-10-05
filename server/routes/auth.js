const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '365d',
  });
}

// POST /api/auth/signup
// body: { email, password, fullName, role: 'farmer'|'buyer', zipCode, farmName? }
router.post('/signup', async (req, res, next) => {
  try {
    const { email, password, fullName, role, zipCode, farmName } = req.body;

    if (!email || !password || !fullName || !role || !zipCode) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }
    if (!['farmer', 'buyer'].includes(role)) {
      return res.status(400).json({ error: 'Role must be farmer or buyer.' });
    }
    if (role === 'farmer' && !farmName) {
      return res.status(400).json({ error: 'Farm name is required for a farmer account.' });
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const userResult = await db.query(
      `INSERT INTO users (email, password_hash, full_name, role, zip_code)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, email, full_name, role, zip_code`,
      [email.toLowerCase(), passwordHash, fullName, role, zipCode]
    );
    const user = userResult.rows[0];

    // Farmers get a farm profile created immediately (unpublished until subscription is active —
    // the listings routes enforce that, not this table).
    if (role === 'farmer') {
      await db.query(
        `INSERT INTO farms (user_id, farm_name, zip_code) VALUES ($1, $2, $3)`,
        [user.id, farmName, zipCode]
      );
    }

    // Placeholder subscription row so the dashboard has something to show pre-checkout.
    await db.query(
      `INSERT INTO subscriptions (user_id, plan, status) VALUES ($1, $2, 'incomplete')`,
      [user.id, role]
    );

    const token = signToken(user);
    res.status(201).json({ token, user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const result = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Incorrect email or password.' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Incorrect email or password.' });

    const token = signToken(user);
    delete user.password_hash;
    res.json({ token, user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
