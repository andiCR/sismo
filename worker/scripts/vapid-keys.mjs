// Prints a new VAPID private key (JWK) for push notifications, straight into the Worker's secrets:
//   node scripts/vapid-keys.mjs | npx wrangler secret put VAPID_PRIVATE_JWK
// The public half is served by GET /push/key, so it's never copied by hand. Replacing the key
// invalidates every existing subscription.
const { privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const { kty, crv, x, y, d } = await crypto.subtle.exportKey('jwk', privateKey);
process.stdout.write(JSON.stringify({ kty, crv, x, y, d }));
