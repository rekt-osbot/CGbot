/**
 * Test script to simulate multiple stocks in a single webhook
 * Run with: node test-multiple-stocks.js
 */
require('dotenv').config();
const axios = require('axios');

async function testWebhook(format = 'symbols') {
  try {
    const baseURL = process.env.BASE_URL || 'http://localhost:3000';
    let url, data;
    
    console.log(`Testing webhook with ${format} format...`);
    
    if (format === 'single') {
      // Test with a single stock
      url = `${baseURL}/webhook`;
      data = {
        symbol: 'AMIORG',
        scan_name: 'Test Single Stock'
      };
      
      console.log('Sending test webhook with single stock:', data);
    } else {
      // Test with multiple stocks
      url = `${baseURL}/webhook`;
      data = {
        symbols: ['RELIANCE', 'TATAMOTORS', 'HDFCBANK', 'TCS', 'INFY'],
        scan_name: 'Test Multiple Stocks'
      };
      
      console.log('Sending test webhook with multiple stocks:', data);
    }
    
    // Add webhook secret if defined
    const headers = {};
    if (process.env.WEBHOOK_SECRET) {
      headers['x-webhook-secret'] = process.env.WEBHOOK_SECRET;
    }
    
    // Send the webhook
    const response = await axios.post(url, data, { headers });
    
    console.log('Webhook response:', response.data);
    console.log(`Test webhook sent with ${format} format. Check your Telegram for the alert.`);
  } catch (error) {
    console.error('Error sending test webhook:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Get format from command line arguments
const format = process.argv[2] || 'symbols';
testWebhook(format); 