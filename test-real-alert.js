/**
 * Test script to simulate a real stock alert that should trigger a Telegram message
 * Run with: node test-real-alert.js
 */
require('dotenv').config();
const axios = require('axios');

async function sendRealAlert() {
  try {
    console.log('Sending a real test alert that should trigger a Telegram message...');
    
    // Get the webhook URL and secret from environment variables
    const webhookUrl = `http://localhost:${process.env.PORT || 3000}/webhook`;
    const webhookSecret = process.env.WEBHOOK_SECRET;
    
    // Use AMIORG as the test symbol
    const symbol = 'AMIORG';
    
    // Sample webhook payload similar to what Chartink would send
    const payload = {
      symbol: symbol,
      timestamp: new Date().toISOString(),
      // We can include custom fields if needed
      scan_name: "Open=Low Test",
      // We don't need to include other fields since our backend fetches
      // the actual stock data using the symbol
    };
    
    // Headers with the webhook secret if available
    const headers = webhookSecret 
      ? { 'x-webhook-secret': webhookSecret } 
      : {};
    
    // Send the webhook request
    console.log(`Sending alert for symbol: ${symbol}`);
    console.log(`Webhook URL: ${webhookUrl}`);
    
    const response = await axios.post(webhookUrl, payload, { headers });
    
    console.log('Response:', response.data);
    console.log('Check your Telegram group for the alert message!');
    
  } catch (error) {
    console.error('Error sending test alert:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
sendRealAlert().catch(console.error); 