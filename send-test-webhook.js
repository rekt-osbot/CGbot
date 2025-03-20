/**
 * Send a test webhook to the Railway server
 * This script simulates a webhook from your analytics platform
 */

const fetch = require('node-fetch');

// Target webhook URL
const webhookUrl = 'https://cgalerts-production.up.railway.app/webhook';

// Test payload matching the format your platform uses
const payload = {
  stocks: 'RELIANCE',  // Using 'stocks' field as a string (single stock symbol)
  trigger_prices: '2500.00',
  triggered_at: new Date().toLocaleTimeString(),
  scan_name: 'Test Webhook (Manually Sent)',
  alert_name: 'Manual Test Alert',
  webhook_url: webhookUrl
};

// Send the webhook
async function sendTestWebhook() {
  console.log('Sending test webhook to:', webhookUrl);
  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    const responseData = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', responseData);

    if (response.status === 200) {
      console.log('✅ Webhook sent successfully!');
      console.log('Check your Telegram for an alert.');
    } else {
      console.log('❌ Webhook returned an error status code.');
    }
  } catch (error) {
    console.error('❌ Error sending webhook:', error.message);
  }
}

// Run the test
sendTestWebhook(); 