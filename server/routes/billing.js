const express = require('express');
const Stripe = require('stripe');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

const PRICE_IDS = {
  farmer: process.env.STRIPE_FARMER_PRICE_ID,
  buyer: process.env.STRIPE_BUYER_PRICE_ID,
};

// POST /api/billing/create-checkout-session
// Signed-in user pays for their own role's annual plan.
router.post('/create-checkout-session', requireAuth, async (req, res, next) => {
  try {
    const { role, email, id } = req.user;
    const priceId = PRICE_IDS[role];
    if (!priceId) return res.status(400).json({ error: 'Unknown plan for this account type.' });

    // Reuse an existing Stripe customer if this user already has one.
    const userRow = await db.query('SELECT stripe_customer_id FROM users WHERE id = $1', [id]);
    let customerId = userRow.rows[0]?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({ email, metadata: { userId: id } });
      customerId = customer.id;
      await db.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, id]);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: id,
      metadata: { userId: id, role },
      success_url: `${process.env.CLIENT_URL}/dashboard.html?checkout=success`,
      cancel_url: `${process.env.CLIENT_URL}/?checkout=canceled`,
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

// POST /api/billing/portal — lets a user manage/cancel their subscription via Stripe's hosted portal
router.post('/portal', requireAuth, async (req, res, next) => {
  try {
    const userRow = await db.query('SELECT stripe_customer_id FROM users WHERE id = $1', [req.user.id]);
    const customerId = userRow.rows[0]?.stripe_customer_id;
    if (!customerId) return res.status(400).json({ error: 'No billing account found yet.' });

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.CLIENT_URL}/dashboard.html`,
    });
    res.json({ url: portalSession.url });
  } catch (err) {
    next(err);
  }
});

// POST /api/billing/webhook
// IMPORTANT: this route must receive the *raw* request body (mounted with express.raw()
// in index.js) — Stripe's signature check fails on parsed JSON.
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id;
        const role = session.metadata.role;
        const subscriptionId = session.subscription;

        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        await upsertSubscription(userId, role, sub);
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userRow = await db.query('SELECT id FROM users WHERE stripe_customer_id = $1', [sub.customer]);
        const userId = userRow.rows[0]?.id;
        if (userId) {
          const role = sub.metadata?.role || (await currentPlanFor(userId));
          await upsertSubscription(userId, role, sub);
        }
        break;
      }
      default:
        break; // ignore other event types
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Error handling webhook event:', err);
    res.status(500).send('Webhook handler failed.');
  }
});

async function currentPlanFor(userId) {
  const r = await db.query('SELECT plan FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [userId]);
  return r.rows[0]?.plan || 'buyer';
}

async function upsertSubscription(userId, plan, stripeSub) {
  await db.query(
    `INSERT INTO subscriptions (user_id, stripe_subscription_id, plan, status, current_period_end)
     VALUES ($1, $2, $3, $4, to_timestamp($5))
     ON CONFLICT (stripe_subscription_id)
     DO UPDATE SET status = $4, current_period_end = to_timestamp($5), updated_at = now()`,
    [userId, stripeSub.id, plan, stripeSub.status, stripeSub.current_period_end]
  );
}

module.exports = router;
