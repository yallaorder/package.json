require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

app.use(cors());

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send('Webhook Error: ' + err.message);
  }
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    await supabase.from('orders')
      .update({ payment_status: 'paid', status: 'new' })
      .eq('stripe_payment_intent', pi.id);
  }
  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object;
    await supabase.from('orders')
      .update({ payment_status: 'failed', status: 'cancelled' })
      .eq('stripe_payment_intent', pi.id);
  }
  res.json({ received: true });
});

app.use(express.json());

app.post('/create-payment-intent', async (req, res) => {
  const { orderId, amountUsd } = req.body;
  if (!orderId || !amountUsd) return res.status(400).json({ error: 'orderId and amountUsd required' });
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amountUsd * 100),
    currency: 'usd',
    automatic_payment_methods: { enabled: true },
    metadata: { order_id: orderId },
  });
  await supabase.from('orders')
    .update({ stripe_payment_intent: paymentIntent.id })
    .eq('id', orderId);
  res.json({ clientSecret: paymentIntent.client_secret });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('YallaOrder server on port ' + PORT));
