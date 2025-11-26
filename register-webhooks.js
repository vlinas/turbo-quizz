/**
 * Manual webhook registration script
 * Run this from the app admin context to re-register webhooks
 */

console.log('To manually register webhooks:');
console.log('1. Go to your Shopify admin');
console.log('2. Open the app');
console.log('3. Open browser console and run:');
console.log(`
fetch('/api/register-webhooks', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  }
})
.then(r => r.json())
.then(data => console.log('Webhook registration result:', data))
.catch(err => console.error('Webhook registration error:', err));
`);

console.log('\nOr simply uninstall and reinstall the app to trigger fresh webhook registration.');
