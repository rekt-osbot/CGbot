require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const schedule = require('node-schedule');
const StockDataService = require('./stockData');
const StockSummary = require('./stockSummary');
const path = require('path');
const fs = require('fs');
const StatusMonitor = require('./status');
const Analytics = require('./analytics');
const Database = require('./database');

// Initialize Express app
const app = express();
app.use(express.json());

// Initialize Telegram Bot
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
console.log(`Initializing Telegram Bot with token: ${botToken ? `${botToken.substring(0, 5)}...${botToken.substring(botToken.length - 5)}` : 'Not provided'}`);
console.log(`Chat ID: ${chatId || 'Not provided'}`);

const bot = new TelegramBot(botToken, { polling: false });
let telegramError = false;

// Constants
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('Created data directory:', dataDir);
  } catch (error) {
    console.error('Error creating data directory:', error);
  }
}

// Calculate the stop loss based on day low and 20SMA
function calculateStopLoss(dayLow, sma20) {
  if (!sma20) return dayLow;
  
  // If 20SMA is below day low and close to it (within 2%), use 20SMA as stop loss
  if (sma20 < dayLow && sma20 > dayLow * 0.98) {
    return sma20;
  }
  
  // Otherwise use day low
  return dayLow;
}

// Format message for a single stock alert
function formatSingleStockAlert(data, scanType = 'default') {
  const { symbol, open, low, high, close, volume, sma20 } = data;
  const stopLoss = calculateStopLoss(low, sma20);
  
  // Always calculate percent change from open price
  const priceChange = close - open;
  const percentChange = (priceChange / open * 100).toFixed(2);
  
  // Calculate stop loss distance as percentage
  const slDistance = ((close - stopLoss) / close * 100).toFixed(2);
  
  // Store calculated values for sorting
  data.percentChange = parseFloat(percentChange);
  data.slDistance = parseFloat(slDistance);
  
  // Format with up/down arrow based on change direction
  const changeEmoji = priceChange >= 0 ? '🔼' : '🔽';
  
  // Clean, minimal format
  let message = `📈 *${symbol}* ₹${close.toFixed(2)} ${changeEmoji} ${percentChange}%\n`;
  message += `📉 SL: ₹${stopLoss.toFixed(2)} (${slDistance}%)\n`;
  
  return message;
}

// Format message for Telegram based on scan type
function formatAlertMessage(data, scanType = 'default', isMultiple = false) {
  // If it's a single stock and not part of a multiple alert
  if (!isMultiple) {
    const { symbol, open, low, high, close, sma20 } = data;
    const stopLoss = calculateStopLoss(low, sma20);
    
    // Always calculate percent change from open price
    const priceChange = close - open;
    const percentChange = (priceChange / open * 100).toFixed(2);
    
    // Calculate stop loss distance as percentage
    const slDistance = ((close - stopLoss) / close * 100).toFixed(2);
    
    // Format with up/down arrow based on change direction
    const changeEmoji = priceChange >= 0 ? '🔼' : '🔽';
    
    // Base message format for a single stock
    let message = `🚨 *STOCK ALERT: ${symbol}* 🚨\n\n`;
    
    // Add scan type if provided
    if (data.scan_name) {
      message += `📊 *Scan*: ${data.scan_name}\n\n`;
    }
    
    // Simplified information
    message += `📈 *Price*: ₹${close.toFixed(2)} ${changeEmoji} ${percentChange}%\n`;
    message += `📉 *StopLoss*: ₹${stopLoss.toFixed(2)} (${slDistance}% away)\n`;
    message += `📊 *20-day SMA*: ₹${sma20 ? sma20.toFixed(2) : 'N/A'}\n\n`;
    
    // Scan-specific information
    if (scanType === 'open_equals_low') {
      message += `⚠️ This stock opened at its low and is trading above 20 SMA`;
    } else if (scanType === 'custom') {
      message += `⚠️ Custom scan alert triggered`;
    } else {
      message += `⚠️ Stock alert triggered`;
    }
    
    return message;
  } else {
    // It's a single stock but part of a multiple alert
    return formatSingleStockAlert(data, scanType);
  }
}

// Format message for multiple stocks
function formatMultipleStocksMessage(stocksData, scanName) {
  // Start with header
  let message = `🔔 *MULTIPLE STOCK ALERTS* 🔔\n\n`;
  
  // Add scan name if available
  if (scanName) {
    message += `📊 *Scan*: ${scanName}\n`;
  }
  
  // Add timestamp
  message += `⏰ *Time*: ${new Date().toLocaleTimeString()}\n\n`;
  
  // Sort stocks by stop loss distance (smallest first)
  // This prioritizes stocks closest to their stop loss
  const sortedStocks = [...stocksData].sort((a, b) => {
    // First, make sure slDistance is calculated
    if (a.slDistance === undefined) {
      const aStopLoss = calculateStopLoss(a.low, a.sma20);
      a.slDistance = ((a.close - aStopLoss) / a.close * 100);
    }
    
    if (b.slDistance === undefined) {
      const bStopLoss = calculateStopLoss(b.low, b.sma20);
      b.slDistance = ((b.close - bStopLoss) / b.close * 100);
    }
    
    // Sort by stop loss distance (ascending)
    return a.slDistance - b.slDistance;
  });
  
  // Add each stock
  sortedStocks.forEach((stock, index) => {
    message += `${index + 1}. ${formatSingleStockAlert(stock, stock.scanType)}`;
  });
  
  // Add footer
  if (scanName && scanName.toLowerCase().includes('open=low')) {
    message += `\n⚠️ All stocks opened at their low and are trading above 20 SMA`;
  } else {
    message += `\n⚠️ ${stocksData.length} stocks sorted by smallest stop loss %`;
  }
  
  return message;
}

// Send to Telegram with error handling
async function sendTelegramMessage(message) {
  // If we've already had a Telegram error, just log it
  if (telegramError) {
    console.log('Would send to Telegram:', message);
    console.log('(Telegram messages disabled due to previous error)');
    return false; // Return false to indicate message wasn't sent
  }
  
  try {
    console.log(`Sending Telegram message to chat ID: ${chatId}`);
    console.log(`Message preview: ${message.substring(0, 50)}...`);
    
    // Use markdown formatting
    const result = await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    console.log('Telegram message sent successfully:', result.message_id);
    return true;
  } catch (error) {
    console.error('Failed to send Telegram message:', error.message);
    
    // If it's a parsing error, try again without markdown
    if (error.message.includes('can\'t parse entities')) {
      console.log('Markdown parsing failed, trying without markdown...');
      try {
        const result = await bot.sendMessage(chatId, message);
        console.log('Telegram message sent successfully without markdown:', result.message_id);
        return true;
      } catch (plainError) {
        console.error('Also failed without markdown:', plainError.message);
      }
    }
    
    console.error('Error details:', JSON.stringify(error.response?.body || {}, null, 2));
    
    if (error.message.includes('chat not found')) {
      console.log('Please verify the TELEGRAM_CHAT_ID in your .env file');
      console.log('You can get your chat ID by:');
      console.log('1. Adding your bot to your group/channel');
      console.log('2. Sending a message in the group/channel');
      console.log(`3. Visiting: https://api.telegram.org/bot${botToken}/getUpdates`);
      console.log('4. Looking for the "chat":{"id":XXXXXXXX} value');
      console.log('Current chat ID:', chatId);
      telegramError = true;
    } else if (error.message.includes('Unauthorized') || error.message.includes('bot was blocked')) {
      console.log('Please verify the TELEGRAM_BOT_TOKEN in your .env file');
      console.log('There may be an issue with your bot token or the bot might have been blocked');
      telegramError = true;
    } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      console.log('Network error when connecting to Telegram API. This might be temporary.');
      // Don't set telegramError flag for temporary network issues
    }
    
    return false;
  }
}

// Test Telegram connection
async function testTelegramConnection() {
  try {
    console.log('Testing Telegram connection...');
    const result = await bot.getMe();
    console.log(`Connected to Telegram as @${result.username}`);
    return true;
  } catch (error) {
    console.error('Telegram connection test failed:', error.message);
    return false;
  }
}

// Process a single stock alert
async function processSingleStock(symbol, scanName) {
  // Get current stock information
  const stockInfo = await StockDataService.getCurrentStockInfo(symbol);
  if (!stockInfo) {
    console.error(`Failed to get stock information for ${symbol}`);
    return null;
  }
  
  // Get 20-day SMA for this stock
  const sma20 = await StockDataService.get20DaySMA(symbol);
  console.log(`${symbol} - Open: ${stockInfo.open}, Low: ${stockInfo.low}, Close: ${stockInfo.close}, SMA20: ${sma20}`);
  
  // Determine scan type based on scan_name or conditions
  let scanType = 'default';
  let shouldInclude = true;
  
  // Check if the scan name indicates an open=low scan
  if (scanName && scanName.toLowerCase().includes('open=low')) {
    scanType = 'open_equals_low';
    
    // For open=low scans, check if open equals low (with small tolerance for API precision)
    if (Math.abs(stockInfo.open - stockInfo.low) > 0.01) {
      console.log(`${symbol} ignored: Open price does not equal low price (required for ${scanName})`);
      return null;
    }
    
    // Also check if stock is trading above 20SMA for open=low scans
    if (sma20 && stockInfo.close <= sma20) {
      console.log(`${symbol} ignored: Not trading above 20-day SMA (required for ${scanName})`);
      return null;
    }
  } else if (symbol === 'SIMULATED.TEST' || symbol === 'REAL.TEST') {
    // Special handling for test symbols
    scanType = 'custom';
  } else {
    // For other scans, just proceed with the alert
    scanType = 'custom';
  }
  
  // Calculate stop loss
  const stopLoss = calculateStopLoss(stockInfo.low, sma20);
  
  // Enrich the stock data with 20SMA and scan info
  const enrichedData = { 
    ...stockInfo, 
    sma20,
    scanType,
    scan_name: scanName || 'Stock Alert',
    stopLoss
  };
  
  // Track this stock for daily summary (except test symbols)
  if (symbol !== 'SIMULATED.TEST' && symbol !== 'REAL.TEST') {
    StockSummary.trackStock(enrichedData);
  }
  
  return enrichedData;
}

// Webhook endpoint to receive alerts from Chartink
app.post('/webhook', async (req, res) => {
  try {
    // Verify webhook secret (if provided)
    const providedSecret = req.headers['x-webhook-secret'];
    if (WEBHOOK_SECRET && providedSecret !== WEBHOOK_SECRET) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Record webhook received in status monitor
    StatusMonitor.recordWebhook();
    
    const alertData = req.body;
    console.log('Received alert:', alertData);
    
    // Check if we received an array of symbols or a single symbol
    let symbols = [];
    let scanName = null;
    
    if (Array.isArray(alertData)) {
      // It's an array of alerts
      console.log(`Received ${alertData.length} alerts in an array`);
      
      // Extract symbols and scan name from the first item if available
      symbols = alertData.map(item => item.symbol).filter(Boolean);
      
      // Try to get a common scan name
      const firstItemWithScanName = alertData.find(item => item.scan_name);
      scanName = firstItemWithScanName ? firstItemWithScanName.scan_name : null;
    } else if (alertData.symbols && Array.isArray(alertData.symbols)) {
      // Format where multiple symbols are in a 'symbols' array property
      console.log(`Received ${alertData.symbols.length} symbols in the 'symbols' property`);
      symbols = alertData.symbols;
      scanName = alertData.scan_name;
    } else if (alertData.symbol) {
      // Single alert
      symbols = [alertData.symbol];
      scanName = alertData.scan_name;
    } else if (alertData.stocks) {
      // Handle 'stocks' field which might be a string for a single stock
      console.log(`Received alert with 'stocks' field: ${alertData.stocks}`);
      
      if (typeof alertData.stocks === 'string') {
        // Single stock as a string
        symbols = [alertData.stocks];
      } else if (Array.isArray(alertData.stocks)) {
        // Multiple stocks as an array
        symbols = alertData.stocks;
      }
      
      // Get scan name from scan_name or alert_name
      scanName = alertData.scan_name || alertData.alert_name;
      
      console.log(`Processed 'stocks' field into symbols: ${symbols.join(', ')}`);
      console.log(`Using scan name: ${scanName}`);
    } else {
      return res.status(400).json({ error: 'Invalid alert format - no symbols found' });
    }
    
    if (symbols.length === 0) {
      return res.status(400).json({ error: 'No valid symbols in the alert data' });
    }
    
    // Process each stock
    const validStocksData = [];
    
    for (const symbol of symbols) {
      // Skip empty symbols
      if (!symbol) continue;
      
      // Special case for test symbol
      if (symbol === 'SIMULATED.TEST') {
        console.log('Processing test symbol with simulated data');
      }
      
      const stockData = await processSingleStock(symbol, scanName);
      if (stockData) {
        validStocksData.push(stockData);
      }
    }
    
    if (validStocksData.length === 0) {
      return res.status(200).json({ 
        status: 'ignored', 
        reason: 'No stocks matched the criteria'
      });
    }
    
    // Determine if we should send a single stock alert or multiple stocks alert
    let message;
    let messageSent = false;
    
    if (validStocksData.length === 1 && symbols.length === 1) {
      // Single stock alert
      message = formatAlertMessage(validStocksData[0], validStocksData[0].scanType);
      
      // For simulated test symbol, we don't actually send to Telegram but simulate success
      if (validStocksData[0].symbol === 'SIMULATED.TEST') {
        console.log('This is a test symbol - not sending actual Telegram message');
        return res.status(200).json({ status: 'success', message: 'Test alert processed successfully' });
      }
      
      // Store in database if it's not a test symbol
      await Database.storeAlert(validStocksData[0]);
      
      // Record alert in status monitor
      StatusMonitor.recordAlert(validStocksData[0]);
      
      // Track in analytics
      Analytics.trackAlert(validStocksData[0]);
      
      messageSent = await sendTelegramMessage(message);
    } else {
      // Multiple stocks alert
      message = formatMultipleStocksMessage(validStocksData, scanName);
      
      // Store each stock in database
      for (const stockData of validStocksData) {
        await Database.storeAlert(stockData);
        Analytics.trackAlert(stockData);
      }
      
      // Record multiple alerts in status monitor
      StatusMonitor.recordAlert(validStocksData);
      
      messageSent = await sendTelegramMessage(message);
    }
    
    if (messageSent) {
      res.status(200).json({ 
        status: 'success', 
        message: `Alert sent to Telegram for ${validStocksData.length} stock(s)`,
        stocks: validStocksData.map(s => s.symbol)
      });
    } else {
      res.status(500).json({ 
        status: 'error', 
        message: 'Failed to send to Telegram, but alert was processed',
        stocks: validStocksData.map(s => s.symbol)
      });
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    StatusMonitor.recordError('Webhook processing', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Manual check endpoint for testing
app.get('/check/:symbol', async (req, res) => {
  try {
    const symbol = req.symbol ? req.symbol : req.params.symbol;
    
    // Get current stock information
    const stockInfo = await StockDataService.getCurrentStockInfo(symbol);
    if (!stockInfo) {
      return res.status(500).json({ error: 'Failed to get stock information' });
    }
    
    // Get 20-day SMA
    const sma20 = await StockDataService.get20DaySMA(symbol);
    
    // Calculate stop loss
    const stopLoss = calculateStopLoss(stockInfo.low, sma20);
    
    // Check our criteria
    const openEqualsLow = Math.abs(stockInfo.open - stockInfo.low) <= 0.01;
    const aboveSMA = sma20 ? stockInfo.close > sma20 : false;
    
    // Return all the data
    res.status(200).json({
      symbol,
      data: {
        ...stockInfo,
        sma20,
        stopLoss,
        criteria: {
          openEqualsLow,
          aboveSMA,
          matches: openEqualsLow && aboveSMA
        }
      }
    });
  } catch (error) {
    console.error(`Error checking symbol ${req.params.symbol}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate and send daily summary
async function generateAndSendDailySummary() {
  try {
    console.log('Generating daily summary report...');
    const summaryMessage = await StockSummary.generateDailySummary();
    
    // Store summary in database
    const summaryData = {
      totalAlerts: Object.keys(StockSummary.alertedStocks).length,
      summaryText: summaryMessage
    };
    
    // Get performance metrics from analytics
    const analyticsSummary = Analytics.getSummary('day');
    
    if (!analyticsSummary.error) {
      summaryData.successfulAlerts = analyticsSummary.topStocks ? analyticsSummary.topStocks.length : 0;
      summaryData.avgPerformance = analyticsSummary.avgGain || 0;
      summaryData.bestPerformer = analyticsSummary.bestPerformer;
      summaryData.worstPerformer = analyticsSummary.worstPerformer;
      summaryData.topStocks = analyticsSummary.topStocks;
    }
    
    // Store in database
    await Database.storeSummary(summaryData);
    
    // Send to Telegram
    const sent = await sendTelegramMessage(summaryMessage);
    
    if (sent) {
      console.log('Daily summary sent successfully');
      return true;
    } else {
      console.error('Failed to send daily summary to Telegram');
      return false;
    }
  } catch (error) {
    console.error('Error generating daily summary:', error);
    StatusMonitor.recordError('Daily summary generation', error);
    return false;
  }
}

// Manually trigger daily summary report
app.get('/daily-summary', async (req, res) => {
  try {
    const result = await generateAndSendDailySummary();
    
    if (result) {
      res.status(200).json({ 
        status: 'success', 
        message: 'Daily summary generated and sent to Telegram'
      });
    } else {
      res.status(500).json({ 
        status: 'error', 
        message: 'Failed to send daily summary to Telegram'
      });
    }
  } catch (error) {
    console.error('Error generating daily summary:', error);
    StatusMonitor.recordError('Manual daily summary', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Schedule daily summary at market close (3:30 PM IST)
function scheduleDailySummary() {
  try {
    // Create a lockfile path
    const lockFilePath = path.join(dataDir, 'summary_lock.txt');
    
    // The job that runs at 3:30 PM IST (10:00 UTC)
    const summaryJob = schedule.scheduleJob('0 10 * * 1-5', async () => {
      // Check if another instance is already running by testing for a lockfile
      if (fs.existsSync(lockFilePath)) {
        console.log('Daily summary already running (lockfile exists)');
        return;
      }
      
      try {
        // Create lockfile
        fs.writeFileSync(lockFilePath, new Date().toISOString());
        
        console.log('Running daily summary job');
        StatusMonitor.recordEvent('scheduledTask', 'Daily summary started');
        
        await generateAndSendDailySummary();
        
        // Remove lockfile when done
        if (fs.existsSync(lockFilePath)) {
          fs.unlinkSync(lockFilePath);
        }
      } catch (error) {
        console.error('Error in scheduled summary job:', error);
        StatusMonitor.recordError('dailySummaryJob', error.message);
        
        // Remove lockfile on error too
        if (fs.existsSync(lockFilePath)) {
          fs.unlinkSync(lockFilePath);
        }
      }
    });
    
    console.log('Scheduled daily summary job for 3:30 PM IST (10:00 UTC) on weekdays');
    return summaryJob;
  } catch (error) {
    console.error('Error scheduling jobs:', error);
    StatusMonitor.recordError('scheduling', error.message);
    return null;
  }
}

// Test Telegram endpoint
app.get('/test-telegram', async (req, res) => {
  try {
    const result = await sendTelegramMessage('🧪 Test message from Stock Alerts Service');
    if (result) {
      res.status(200).json({ status: 'success', message: 'Test message sent to Telegram' });
    } else {
      res.status(500).json({ status: 'error', message: 'Failed to send test message to Telegram' });
    }
  } catch (error) {
    console.error('Error sending test message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test multiple stocks endpoint
app.get('/test-multiple', async (req, res) => {
  try {
    // Get symbols from query string or use defaults
    const symbolsParam = req.query.symbols || 'RELIANCE,TATAMOTORS,HDFCBANK,TCS,INFY';
    const symbols = symbolsParam.split(',').map(s => s.trim());
    const scanName = req.query.scan || 'Test Multiple Stocks';
    
    console.log(`Testing multiple stocks alert with: ${symbols.join(', ')}`);
    
    // Process each stock
    const validStocksData = [];
    
    for (const symbol of symbols) {
      if (!symbol) continue;
      const stockData = await processSingleStock(symbol, scanName);
      if (stockData) {
        validStocksData.push(stockData);
      }
    }
    
    if (validStocksData.length === 0) {
      return res.status(200).json({ 
        status: 'ignored', 
        reason: 'No stocks matched the criteria'
      });
    }
    
    // Format and send message
    const message = formatMultipleStocksMessage(validStocksData, scanName);
    const messageSent = await sendTelegramMessage(message);
    
    if (messageSent) {
      res.status(200).json({ 
        status: 'success', 
        message: `Multiple stocks alert sent to Telegram (${validStocksData.length} stocks)`,
        stocks: validStocksData.map(s => s.symbol)
      });
    } else {
      res.status(500).json({ 
        status: 'error', 
        message: 'Failed to send multiple stocks alert to Telegram' 
      });
    }
  } catch (error) {
    console.error('Error processing multiple stocks test:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  // Collect system health information
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: {
      isRailway: process.env.RAILWAY_ENVIRONMENT === 'true',
      node: process.version
    }
  };
  
  res.status(200).json(health);
});

// Status API endpoint (JSON)
app.get('/api/status', (req, res) => {
  StatusMonitor.recordHealthCheck();
  res.json(StatusMonitor.getStatus());
});

// Analytics API endpoint (JSON)
app.get('/api/analytics', (req, res) => {
  const period = req.query.period || 'all';
  res.json(Analytics.getSummary(period));
});

// Status page endpoint (HTML UI)
app.get('/status', (req, res) => {
  // Record health check
  StatusMonitor.recordHealthCheck();
  
  // Get status data
  const statusData = StatusMonitor.getStatus();
  
  // Return HTML page
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Stock Alerts System Status</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }
        h1, h2, h3 {
          color: #0066cc;
        }
        .status-card {
          background-color: #f9f9f9;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .metrics {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 15px;
          margin: 15px 0;
        }
        .metric {
          background-color: #fff;
          padding: 15px;
          border-radius: 6px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }
        .metric h3 {
          margin-top: 0;
          font-size: 14px;
          color: #666;
          text-transform: uppercase;
        }
        .metric p {
          margin-bottom: 0;
          font-size: 24px;
          font-weight: 600;
          color: #0066cc;
        }
        .status-indicator {
          display: inline-block;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          margin-right: 8px;
        }
        .operational {
          background-color: #4caf50;
        }
        .degraded {
          background-color: #ff9800;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 15px 0;
        }
        th, td {
          text-align: left;
          padding: 12px 15px;
          border-bottom: 1px solid #ddd;
        }
        th {
          background-color: #f2f2f2;
          font-weight: 600;
        }
        tr:hover {
          background-color: #f5f5f5;
        }
        .footer {
          margin-top: 30px;
          font-size: 14px;
          color: #666;
          text-align: center;
        }
        .refresh-button {
          display: inline-block;
          padding: 8px 16px;
          background-color: #0066cc;
          color: white;
          border-radius: 4px;
          text-decoration: none;
          font-weight: 500;
        }
      </style>
    </head>
    <body>
      <h1>Stock Alerts System Status</h1>
      
      <div class="status-card">
        <h2>
          <span class="status-indicator ${statusData.status === 'operational' ? 'operational' : 'degraded'}"></span>
          System Status: ${statusData.status === 'operational' ? 'Operational' : 'Degraded'}
        </h2>
        <p>Uptime: ${statusData.uptime}</p>
        <p>Last updated: ${new Date(statusData.currentTime).toLocaleString()}</p>
        <a href="/status" class="refresh-button">Refresh Status</a>
      </div>
      
      <div class="status-card">
        <h2>System Metrics</h2>
        <div class="metrics">
          <div class="metric">
            <h3>Alerts Sent</h3>
            <p>${statusData.metrics.alertsSent}</p>
          </div>
          <div class="metric">
            <h3>Webhooks Received</h3>
            <p>${statusData.metrics.webhooksReceived}</p>
          </div>
          <div class="metric">
            <h3>Telegram Errors</h3>
            <p>${statusData.metrics.telegramErrors}</p>
          </div>
          <div class="metric">
            <h3>Data Fetch Errors</h3>
            <p>${statusData.metrics.dataFetchErrors}</p>
          </div>
          <div class="metric">
            <h3>Memory Usage</h3>
            <p>${statusData.system.memoryUsage.heapUsed}</p>
          </div>
          <div class="metric">
            <h3>CPU Load (1m)</h3>
            <p>${statusData.system.cpuLoad['1m']}</p>
          </div>
        </div>
      </div>
      
      <div class="status-card">
        <h2>Recent Alerts</h2>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Symbols</th>
              <th>Scan</th>
            </tr>
          </thead>
          <tbody>
            ${statusData.recentAlerts.map(alert => `
              <tr>
                <td>${new Date(alert.timestamp).toLocaleString()}</td>
                <td>${Array.isArray(alert.symbols) ? alert.symbols.join(', ') : alert.symbols}</td>
                <td>${alert.scanName}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      ${statusData.recentErrors.length > 0 ? `
        <div class="status-card">
          <h2>Recent Errors</h2>
          ${statusData.recentErrors.map(error => `
            <div class="error">
              <strong>${new Date(error.timestamp).toLocaleString()}</strong>
              <p>${error.context}: ${error.message}</p>
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      <div class="status-card">
        <h2>System Information</h2>
        <table>
          <tr>
            <td>Platform</td>
            <td>${statusData.system.platform}</td>
          </tr>
          <tr>
            <td>Node.js Version</td>
            <td>${statusData.system.nodeVersion}</td>
          </tr>
          <tr>
            <td>Memory</td>
            <td>${statusData.system.freeMemory} free of ${statusData.system.totalMemory}</td>
          </tr>
          <tr>
            <td>Start Time</td>
            <td>${new Date(statusData.startTime).toLocaleString()}</td>
          </tr>
        </table>
      </div>
      
      <div class="footer">
        <p>Stock Alerts System - <a href="/analytics">View Analytics</a> | <a href="/health">Health Check</a></p>
      </div>
    </body>
    </html>
  `);
});

// Analytics dashboard endpoint (HTML UI)
app.get('/analytics', async (req, res) => {
  // Get the period from query param (default to 'all')
  const period = req.query.period || 'all';
  
  // Get analytics summary
  const analytics = Analytics.getSummary(period);
  
  // Return HTML page
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Stock Alerts Analytics</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }
        h1, h2, h3 {
          color: #0066cc;
        }
        .card {
          background-color: #f9f9f9;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .metrics {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 15px;
          margin: 15px 0;
        }
        .metric {
          background-color: #fff;
          padding: 15px;
          border-radius: 6px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }
        .metric h3 {
          margin-top: 0;
          font-size: 14px;
          color: #666;
          text-transform: uppercase;
        }
        .metric p {
          margin-bottom: 0;
          font-size: 24px;
          font-weight: 600;
          color: #0066cc;
        }
        .metric p.positive {
          color: #4caf50;
        }
        .metric p.negative {
          color: #f44336;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 15px 0;
        }
        th, td {
          text-align: left;
          padding: 12px 15px;
          border-bottom: 1px solid #ddd;
        }
        th {
          background-color: #f2f2f2;
          font-weight: 600;
        }
        tr:hover {
          background-color: #f5f5f5;
        }
        .period-selector {
          margin-bottom: 20px;
        }
        .period-selector a {
          display: inline-block;
          padding: 8px 16px;
          margin-right: 10px;
          background-color: #f2f2f2;
          color: #333;
          border-radius: 4px;
          text-decoration: none;
          font-weight: 500;
          transition: background-color 0.3s;
        }
        .period-selector a.active {
          background-color: #0066cc;
          color: white;
        }
        .period-selector a:hover {
          background-color: #e0e0e0;
        }
        .period-selector a.active:hover {
          background-color: #0055aa;
        }
        .footer {
          margin-top: 30px;
          font-size: 14px;
          color: #666;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <h1>Stock Alerts Analytics</h1>
      
      <div class="period-selector">
        <a href="/analytics?period=day" class="${period === 'day' ? 'active' : ''}">Today</a>
        <a href="/analytics?period=week" class="${period === 'week' ? 'active' : ''}">This Week</a>
        <a href="/analytics?period=month" class="${period === 'month' ? 'active' : ''}">This Month</a>
        <a href="/analytics?period=all" class="${period === 'all' ? 'active' : ''}">All Time</a>
      </div>
      
      <div class="card">
        <h2>Performance Summary</h2>
        <div class="metrics">
          <div class="metric">
            <h3>Total Alerts</h3>
            <p>${analytics.totalAlerts || 0}</p>
          </div>
          <div class="metric">
            <h3>Success Rate</h3>
            <p>${analytics.successRate ? analytics.successRate.toFixed(1) + '%' : 'N/A'}</p>
          </div>
          <div class="metric">
            <h3>Avg. Gain</h3>
            <p class="positive">${analytics.avgGain ? '+' + analytics.avgGain.toFixed(2) + '%' : 'N/A'}</p>
          </div>
          <div class="metric">
            <h3>Avg. Loss</h3>
            <p class="negative">${analytics.avgLoss ? analytics.avgLoss.toFixed(2) + '%' : 'N/A'}</p>
          </div>
        </div>
      </div>
      
      ${analytics.topStocks && analytics.topStocks.length > 0 ? `
        <div class="card">
          <h2>Top Performing Stocks</h2>
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Performance</th>
                <th>Success Rate</th>
                <th>Alerts</th>
              </tr>
            </thead>
            <tbody>
              ${analytics.topStocks.map(stock => `
                <tr>
                  <td>${stock.symbol}</td>
                  <td>${stock.performance > 0 ? '+' : ''}${stock.performance.toFixed(2)}%</td>
                  <td>${stock.successRate.toFixed(1)}%</td>
                  <td>${stock.alerts}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
      
      ${analytics.topScans && analytics.topScans.length > 0 ? `
        <div class="card">
          <h2>Top Performing Scans</h2>
          <table>
            <thead>
              <tr>
                <th>Scan</th>
                <th>Performance</th>
                <th>Success Rate</th>
                <th>Alerts</th>
              </tr>
            </thead>
            <tbody>
              ${analytics.topScans.map(scan => `
                <tr>
                  <td>${scan.name}</td>
                  <td>${scan.performance > 0 ? '+' : ''}${scan.performance.toFixed(2)}%</td>
                  <td>${scan.successRate.toFixed(1)}%</td>
                  <td>${scan.alerts}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
      
      ${analytics.bestPerformer ? `
        <div class="card">
          <h2>Best & Worst Performers</h2>
          <div class="metrics">
            <div class="metric">
              <h3>Best Performer</h3>
              <p class="positive">${analytics.bestPerformer.symbol}: ${analytics.bestPerformer.performance.toFixed(2)}%</p>
            </div>
            ${analytics.worstPerformer ? `
              <div class="metric">
                <h3>Worst Performer</h3>
                <p class="negative">${analytics.worstPerformer.symbol}: ${analytics.worstPerformer.performance.toFixed(2)}%</p>
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}
      
      <div class="footer">
        <p>Last updated: ${analytics.lastUpdated ? new Date(analytics.lastUpdated).toLocaleString() : 'N/A'}</p>
        <p><a href="/status">System Status</a> | <a href="/health">Health Check</a></p>
      </div>
    </body>
    </html>
  `);
});

// Graceful shutdown handler
const gracefulShutdown = () => {
  console.log('Received shutdown signal');
  
  try {
    // Only call StatusMonitor.recordEvent if it exists
    if (StatusMonitor && typeof StatusMonitor.recordEvent === 'function') {
      StatusMonitor.recordEvent('shutdown', 'Graceful shutdown initiated');
    } else if (StatusMonitor && typeof StatusMonitor.recordError === 'function') {
      // Fallback to recordError if recordEvent doesn't exist
      StatusMonitor.recordError('shutdown', 'Graceful shutdown initiated');
    }
  } catch (error) {
    console.error('Error recording shutdown event:', error);
  }
  
  // Set a flag to indicate planned shutdown - prevents duplicate notifications
  global.isShuttingDown = true;
  
  // Check current IST time
  const now = new Date();
  const istOffset = 330; // IST is UTC+5:30 (330 minutes)
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const istMinutes = (utcMinutes + istOffset) % (24 * 60);
  const istHour = Math.floor(istMinutes / 60);
  const istMinute = istMinutes % 60;
  const istDay = now.getUTCDay(); // 0 is Sunday, 1 is Monday, etc.
  
  // Check if it's around market close time (3:45-4:15 PM IST on weekdays)
  const marketEndMinutes = 15 * 60 + 45; // 3:45 PM in minutes
  const marketPostCloseMinutes = marketEndMinutes + 30; // 30 min buffer after market close
  
  const isAroundMarketClose = 
    istDay >= 1 && istDay <= 5 && // Monday-Friday
    istMinutes >= marketEndMinutes && 
    istMinutes <= marketPostCloseMinutes;
  
  // Check if it's weekend
  const isWeekend = istDay === 0 || istDay === 6; // Sunday or Saturday
  
  // Check if it's Friday after market close (special message)
  const isFridayAfterClose = 
    istDay === 5 && // Friday
    istMinutes > marketEndMinutes;
  
  // Check if it's a stable runner market close (set by run-stable.js)
  const isMarketClose = isAroundMarketClose || process.env.MARKET_CLOSE_SHUTDOWN === 'true';
  
  // Don't send notification if on Railway or if it's a market close shutdown
  const isRailway = process.env.RAILWAY_ENVIRONMENT !== undefined;
  
  try {
    // Only send notification if this is NOT a market close shutdown or error restart
    if (!telegramError && !global.shuttingDownForError && !isMarketClose && !isRailway) {
      sendTelegramMessage('⚠️ Stock Alerts Service is shutting down for maintenance. Will be back shortly!')
        .then(() => {
          server.close(() => {
            console.log('Server closed');
            process.exit(0);
          });
        })
        .catch(() => {
          server.close(() => {
            console.log('Server closed');
            process.exit(0);
          });
        });
    } else {
      // If it's due to market close, send special message
      if (!telegramError && isMarketClose && !isRailway) {
        // Select the appropriate message based on day of week
        let shutdownMessage = '📈 Stock Alerts Service shutting down after market close. Will restart tomorrow before market open.';
        
        if (isFridayAfterClose) {
          shutdownMessage = '📈 Stock Alerts Service shutting down for the weekend. Will restart on Monday before market open.';
        } else if (isWeekend) {
          shutdownMessage = '📈 Stock Alerts Service is in weekend mode. Will restart on next trading day.';
        }
        
        sendTelegramMessage(shutdownMessage)
          .then(() => {
            server.close(() => {
              console.log('Server closed after market hours');
              process.exit(0);
            });
          })
          .catch(() => {
            server.close(() => {
              console.log('Server closed after market hours');
              process.exit(0);
            });
          });
      } else {
        server.close(() => {
          console.log('Server closed');
          process.exit(0);
        });
      }
    }

    // Force close after 10 seconds
    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Set up signal handlers
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Add these global error handlers before app.listen
process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error);
  StatusMonitor.recordError('uncaughtException', error.message);
  // Don't exit the process, just log the error
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  StatusMonitor.recordError('unhandledRejection', reason);
  // Don't exit the process, just log the error
});

// Start the server
const server = app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Telegram bot token: ${botToken ? `${botToken.substring(0, 5)}...${botToken.substring(botToken.length - 5)}` : 'Not provided'}`);
  console.log(`Telegram chat ID: ${chatId || 'Not provided'}`);
  
  // Test Telegram connection
  console.log('Testing Telegram connection...');
  try {
    const me = await bot.getMe();
    console.log(`Connected to Telegram as @${me.username}`);
    
    // Reset telegramError flag if we successfully connected
    telegramError = false;
    
    // Schedule daily summary
    const summaryJob = scheduleDailySummary();
    
    // Only send startup message if not restarted by the stable runner
    // and if not running on Railway in production mode
    const isStableRunner = process.env.STABLE_RUNNER === 'true';
    const isRailwayProduction = process.env.RAILWAY_ENVIRONMENT === 'production';
    
    if (!isStableRunner && !global.startupMessageSent && !isRailwayProduction) {
      try {
        const messageSent = await sendTelegramMessage('🚀 Stock Alerts Service is now running!');
        if (messageSent) {
          console.log('Startup notification sent to Telegram');
          global.startupMessageSent = true;
        } else {
          console.error('Failed to send startup notification');
        }
      } catch (err) {
        console.error('Error sending startup notification:', err);
      }
    } else {
      console.log('Skipping startup notification (stable runner or Railway production environment)');
      global.startupMessageSent = true;
    }
  } catch (error) {
    console.error('Failed to connect to Telegram:', error);
    telegramError = true;
    console.log('WARNING: Telegram connection failed, but webhook server is still running.');
    console.log('Alerts will be processed but not sent to Telegram until the connection issue is resolved.');
  }
}); 