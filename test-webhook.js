/**
 * Test script to simulate Chartink webhook requests
 * Run with: node test-webhook.js
 */
require('dotenv').config();
const axios = require('axios');

// Sample stock data to test
const testSymbols = [
  'RELIANCE.NS', // Reliance Industries (NSE)
  'TATAMOTORS.NS', // Tata Motors (NSE)
  'HDFCBANK.NS', // HDFC Bank (NSE)
  'TCS.NS', // Tata Consultancy Services (NSE)
  'INFY.NS' // Infosys (NSE)
];

// Get the webhook URL and secret from environment variables
const webhookUrl = `http://localhost:${process.env.PORT || 3000}/webhook`;
const webhookSecret = process.env.WEBHOOK_SECRET;

/**
 * Send a test webhook request
 * @param {string} symbol - Stock symbol to test
 * @param {object} customData - Optional custom data to override defaults
 */
async function sendTestWebhook(symbol, customData = {}) {
  try {
    console.log(`Sending test webhook for ${symbol}...`);
    
    // Sample webhook payload
    const payload = {
      symbol: symbol,
      timestamp: new Date().toISOString(),
      ...customData
    };
    
    // Headers with the webhook secret if available
    const headers = webhookSecret 
      ? { 'x-webhook-secret': webhookSecret } 
      : {};
    
    // Send the webhook request
    const response = await axios.post(webhookUrl, payload, { headers });
    
    console.log(`Response for ${symbol}:`, response.data);
    return response.data;
  } catch (error) {
    console.error(`Error testing webhook for ${symbol}:`, error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    return null;
  }
}

/**
 * Run the test for each symbol with a delay between requests
 */
async function runTests() {
  console.log('Starting webhook tests...');
  console.log(`Webhook URL: ${webhookUrl}`);
  console.log(`Using webhook secret: ${webhookSecret ? 'Yes' : 'No'}`);
  
  for (const symbol of testSymbols) {
    await sendTestWebhook(symbol);
    
    // Wait 2 seconds between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('Regular tests completed!');
  
  // Now let's simulate a stock with open price equal to low price
  console.log('\nTesting with simulated ideal conditions:');
  await sendTestWebhook('SIMULATED.TEST', {
    // Note: This custom data won't affect the real-time check in our application
    // since it fetches the actual data from Yahoo Finance
    customCondition: 'openEqualsLow'
  });
  
  console.log('All tests completed!');
}

// Run the tests
runTests().catch(console.error); 