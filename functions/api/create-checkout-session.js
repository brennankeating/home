export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const { items } = body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return json({ error: 'Cart is empty' }, 400);
  }

  const secretKey = env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return json({ error: 'Payment service not configured' }, 500);
  }

  const origin = new URL(request.url).origin;
  const params = new URLSearchParams();

  params.append('mode', 'payment');
  params.append('success_url', `${origin}/thankyou/?bk=1`);
  params.append('cancel_url', `${origin}/products/`);
  params.append('metadata[item_ids]', items.map(i => i.id).join(','));

  items.forEach((item, i) => {
    params.append(`line_items[${i}][price_data][currency]`, 'usd');
    params.append(`line_items[${i}][price_data][product_data][name]`, String(item.name));
    params.append(`line_items[${i}][price_data][unit_amount]`, String(item.price));
    params.append(`line_items[${i}][quantity]`, '1');
  });

  // Flat $5 shipping for the whole order
  const si = items.length;
  params.append(`line_items[${si}][price_data][currency]`, 'usd');
  params.append(`line_items[${si}][price_data][product_data][name]`, 'Shipping & Handling');
  params.append(`line_items[${si}][price_data][unit_amount]`, '500');
  params.append(`line_items[${si}][quantity]`, '1');

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const session = await stripeRes.json();

  if (!stripeRes.ok) {
    return json({ error: session.error?.message || 'Payment error' }, 500);
  }

  return json({ url: session.url });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
