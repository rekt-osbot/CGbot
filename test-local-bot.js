/**
 * Comprehensive Local Bot Testing Script
 * 
 * This script allows testing various functions of the stock alert bot locally.
 * It simulates webhook calls, tests Telegram message sending, and validates
 * stock data fetching without affecting production systems.
 */
require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const StockDataService = require('./stockData');
const StockSummary = require('./stockSummary');
const Database = require('./database');
const axios = require('axios');
const readline = require('readline');

// Initialize services
const stockData = new StockDataService();
const stockSummary = new StockSummary();
const database = new Database();

// Create readline interface for interactive testing
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Test Telegram bot
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const bot = new TelegramBot(botToken, { polling: false });

// Print test environment info
console.log('======================================');
console.log('Stock Alert Bot Local Testing Environment');
console.log('======================================');
console.log(`Bot Token: ${botToken ? `${botToken.substring(0, 5)}...${botToken.substring(botToken.length - 5)}` : 'Not provided'}`);
console.log(`Chat ID: ${chatId || 'Not provided'}`);
console.log('MongoDB: ' + (process.env.MONGODB_URI ? 'Configured' : 'Not configured'));
console.log('======================================\n');

// Test menu display
function showTestMenu() {
  console.log('\n===== TEST MENU =====');
  console.log('1. Test Telegram message sending');
  console.log('2. Test stock data fetching');
  console.log('3. Simulate webhook alert');
  console.log('4. Test database connection');
  console.log('5. Test daily summary generation');
  console.log('6. Exit');
  console.log('====================\n');
  
  rl.question('Select an option (1-6): ', handleMenuChoice);
}

// Handle menu selections
async function handleMenuChoice(choice) {
  switch(choice) {
    case '1':
      await testTelegramMessage();
      break;
    case '2':
      await testStockDataFetching();
      break;
    case '3':
      await simulateWebhookAlert();
      break;
    case '4':
      await testDatabaseConnection();
      break;
    case '5':
      await testSummaryGeneration();
      break;
    case '6':
      console.log('Exiting...');
      rl.close();
      process.exit(0);
      break;
    default:
      console.log('Invalid choice, please try again.');
      showTestMenu();
  }
}

// Test 1: Telegram message sending
async function testTelegramMessage() {
  rl.question('Enter a test message to send (or press Enter for default): ', async (message) => {
    const testMessage = message || '🧪 This is a test message from the Stock Alert Bot local testing environment!';
    
    try {
      console.log('Sending message to Telegram...');
      const result = await bot.sendMessage(chatId, testMessage, { parse_mode: 'Markdown' });
      console.log('Message sent successfully:', result.message_id);
    } catch (error) {
      console.error('Error sending Telegram message:', error.message);
    }
    
    showTestMenu();
  });
}

// Test 2: Stock data fetching
async function testStockDataFetching() {
  rl.question('Enter a stock symbol to test (or press Enter for SIMULATED.TEST): ', async (symbol) => {
    const testSymbol = symbol || 'SIMULATED.TEST';
    
    console.log(`Fetching data for ${testSymbol}...`);
    
    try {
      // Get current stock info
      const info = await stockData.getCurrentStockInfo(testSymbol);
      console.log('Current stock info:', info);
      
      // Get SMA data
      const sma = await stockData.get20DaySMA(testSymbol);
      console.log('20-day SMA:', sma);
      
    } catch (error) {
      console.error('Error fetching stock data:', error.message);
    }
    
    showTestMenu();
  });
}

// Test 3: Simulate webhook alert
async function simulateWebhookAlert() {
  const testAlerts = [
    {
      symbol: 'INFY',
      scan_name: 'Intraday Breakout',
      trigger_price: 1825.50
    },
    {
      symbol: 'TATAMOTORS',
      scan_name: 'Volume Spike',
      trigger_price: 950.25
    },
    {
      symbol: 'SIMULATED.TEST',
      scan_name: 'Testing Scan',
      trigger_price: 100.00
    }
  ];
  
  console.log('Available test alerts:');
  testAlerts.forEach((alert, index) => {
    console.log(`${index + 1}. ${alert.symbol} - ${alert.scan_name} (₹${alert.trigger_price})`);
  });
  
  rl.question('Select an alert to simulate (1-3): ', async (choice) => {
    const index = parseInt(choice) - 1;
    
    if (index >= 0 && index < testAlerts.length) {
      const alert = testAlerts[index];
      console.log(`Simulating webhook alert for ${alert.symbol}...`);
      
      try {
        // Enrich with current data
        const stockInfo = await stockData.getCurrentStockInfo(alert.symbol);
        const sma20 = await stockData.get20DaySMA(alert.symbol);
        
        const enrichedAlert = {
          ...alert,
          ...stockInfo,
          sma20,
          triggered_at: new Date().toLocaleTimeString()
        };
        
        // Format message similar to how index.js would
        let message = `🚨 *STOCK ALERT: ${enrichedAlert.symbol}* 🚨\n\n`;
        message += `📊 *Scan*: ${enrichedAlert.scan_name}\n\n`;
        message += `📈 *Price*: ₹${enrichedAlert.close.toFixed(2)}\n`;
        message += `⏰ *Triggered at*: ${enrichedAlert.triggered_at}\n\n`;
        message += `⚠️ This is a test alert from local environment`;
        
        console.log('Sending test alert to Telegram...');
        const result = await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        console.log('Alert sent successfully:', result.message_id);
        
        // Store in database if connected
        if (database.isConnected) {
          await database.saveAlert({
            symbol: enrichedAlert.symbol,
            alertPrice: enrichedAlert.trigger_price,
            scanName: enrichedAlert.scan_name,
            openPrice: enrichedAlert.open,
            highPrice: enrichedAlert.high,
            lowPrice: enrichedAlert.low,
            currentPrice: enrichedAlert.close,
            stopLoss: enrichedAlert.low * 0.99, // Simple calculation for test
            sma20: enrichedAlert.sma20
          });
          console.log('Alert saved to database');
        }
        
      } catch (error) {
        console.error('Error simulating webhook alert:', error.message);
      }
    } else {
      console.log('Invalid choice');
    }
    
    showTestMenu();
  });
}

// Test 4: Database connection
async function testDatabaseConnection() {
  console.log('Testing database connection...');
  
  try {
    const connected = await database.connect();
    
    if (connected) {
      console.log('Successfully connected to MongoDB');
      console.log('Testing retrieval of recent alerts...');
      
      const recentAlerts = await database.getRecentAlerts(5);
      console.log(`Found ${recentAlerts.length} recent alerts:`);
      recentAlerts.forEach(alert => {
        console.log(`- ${alert.symbol}: ₹${alert.alertPrice} (${new Date(alert.timestamp).toLocaleString()})`);
      });
    } else {
      console.log('Failed to connect to MongoDB. Check your connection string.');
    }
  } catch (error) {
    console.error('Database error:', error.message);
  }
  
  showTestMenu();
}

// Test 5: Test summary generation
async function testSummaryGeneration() {
  console.log('Generating test daily summary...');
  
  try {
    // Get sample alerts
    let sampleAlerts = [];
    
    if (database.isConnected) {
      // Try to get real alerts from DB
      sampleAlerts = await database.getRecentAlerts(10);
    }
    
    // If no alerts in DB, create sample ones
    if (sampleAlerts.length === 0) {
      console.log('No alerts found in database, using simulated alerts');
      sampleAlerts = [
        {
          symbol: 'INFY',
          alertPrice: 1825.50,
          currentPrice: 1850.75,
          percentChange: 1.38,
          stopLoss: 1800.00,
          timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000)
        },
        {
          symbol: 'TATAMOTORS',
          alertPrice: 950.25,
          currentPrice: 970.80,
          percentChange: 2.16,
          stopLoss: 935.50,
          timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000)
        },
        {
          symbol: 'HDFCBANK',
          alertPrice: 1650.00,
          currentPrice: 1645.30,
          percentChange: -0.28,
          stopLoss: 1630.00,
          timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000)
        }
      ];
    }
    
    // Generate summary
    const summary = stockSummary.generateDailySummary(sampleAlerts);
    console.log('Summary generated:');
    console.log(summary);
    
    // Send to Telegram
    rl.question('Send this summary to Telegram? (y/n): ', async (answer) => {
      if (answer.toLowerCase() === 'y') {
        try {
          const result = await bot.sendMessage(chatId, summary, { parse_mode: 'Markdown' });
          console.log('Summary sent successfully:', result.message_id);
        } catch (error) {
          console.error('Error sending summary to Telegram:', error.message);
        }
      }
      
      showTestMenu();
    });
  } catch (error) {
    console.error('Error generating summary:', error.message);
    showTestMenu();
  }
}

// Start the test environment
async function startTestEnvironment() {
  // Try to connect to database
  if (process.env.MONGODB_URI) {
    try {
      await database.connect();
    } catch (error) {
      console.log('Database connection error, continuing without DB');
    }
  }
  
  showTestMenu();
}

// Start the test environment
startTestEnvironment(); 