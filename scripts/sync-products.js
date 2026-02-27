#!/usr/bin/env node
// Fetches products from Polar.sh and generates products/polar-products.json
// Usage: POLAR_API_KEY=your_key node scripts/sync-products.js

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.POLAR_API_KEY;
const BASE_URL = 'https://api.polar.sh/v1';

if (!API_KEY) {
  console.error('Error: POLAR_API_KEY environment variable is required');
  console.error('Usage: POLAR_API_KEY=your_key node scripts/sync-products.js');
  process.exit(1);
}

async function api(endpoint, options = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Polar API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function getOrCreateCheckoutLink(product) {
  const price = product.prices?.find(p => p.type === 'one_time') || product.prices?.[0];
  if (!price) return null;

  // Check for an existing checkout link first
  try {
    const { items } = await api(`/checkout-links?product_id=${product.id}&limit=1`);
    if (items?.length > 0) {
      console.log(`  [existing] ${product.name}`);
      return items[0].url;
    }
  } catch {
    // endpoint may not support that query, fall through to create
  }

  // Create a new checkout link
  const link = await api('/checkout-links', {
    method: 'POST',
    body: JSON.stringify({ product_price_id: price.id, payment_processor: 'stripe' }),
  });
  console.log(`  [created]  ${product.name}`);
  return link.url;
}

async function main() {
  console.log('Fetching products from Polar...\n');

  const { items: products } = await api('/products?limit=100&is_archived=false');
  console.log(`Found ${products.length} product(s)\n`);

  const output = [];

  for (const product of products) {
    const price = product.prices?.find(p => p.type === 'one_time') || product.prices?.[0];
    if (!price) {
      console.warn(`  [skipped]  "${product.name}" — no price found`);
      continue;
    }

    let checkoutUrl = null;
    try {
      checkoutUrl = await getOrCreateCheckoutLink(product);
    } catch (err) {
      console.warn(`  [warning]  checkout link failed for "${product.name}": ${err.message}`);
    }

    output.push({
      id: product.id,
      name: product.name,
      description: product.description || '',
      category: 'Font',
      price: price.price_amount,
      currency: (price.price_currency || 'usd').toUpperCase(),
      image: product.medias?.[0]?.public_url || null,
      checkoutUrl,
    });
  }

  const outPath = path.join(__dirname, '../products/polar-products.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nDone — wrote ${output.length} product(s) to products/polar-products.json`);
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
