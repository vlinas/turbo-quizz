/**
 * Test script to trigger order sync manually
 * This will call the sync-orders API endpoint to attribute recent orders to quiz sessions
 */

const APP_URL = process.env.SHOPIFY_APP_URL || 'https://turbo-quizz-1660bbe41f52.herokuapp.com';

console.log('Testing order sync...');
console.log('This script simulates what would happen when the sync runs.');
console.log('You need to call the API endpoint from within the app with authentication.\n');

console.log('To test the order sync:');
console.log('1. Go to your Shopify admin');
console.log('2. Open the app');
console.log(`3. Open browser console and run:`);
console.log(`
fetch('/api/sync-orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  }
})
.then(r => r.json())
.then(data => console.log('Sync result:', data))
.catch(err => console.error('Sync error:', err));
`);

console.log('\nOr you can add a button to the dashboard to trigger this sync.');
