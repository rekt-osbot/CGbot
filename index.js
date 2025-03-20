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

// Process incoming webhooks
app.post('/webhook', async (req, res) => {
  try {
    console.log('Webhook received:', JSON.stringify(req.body));
    
    // Record webhook reception in status monitor
    StatusMonitor.recordWebhook();
    
    const data = req.body;
    
    // Check for required fields
    if (!data) {
      throw new Error('No data received in webhook');
    }
    
    // For backward compatibility, handle both single stock and array of stocks
    let stocksData = [];
    
    if (data.stocks && Array.isArray(data.stocks)) {
      // New format with 'stocks' field containing array
      stocksData = data.stocks;
      console.log(`Processing ${stocksData.length} stocks from webhook`);
    } else if (data.symbol || data.ticker) {
      // Legacy format with a single stock in the main object
      stocksData = [data];
      console.log('Processing single stock from webhook');
    } else {
      throw new Error('No valid stock data found in webhook payload');
    }
    
    // Check if we have any valid data
    if (stocksData.length === 0) {
      throw new Error('No stocks to process');
    }
    
    // Normalize scan name field 
    const scanName = data.scan_name || 
                    (data.scanName) || 
                    (stocksData[0].scan_name) || 
                    'Unknown';
                    
    // Store data in database
    try {
      for (const stock of stocksData) {
        // Normalize the stock data to make sure it has both symbol and scan_name
        stock.symbol = stock.symbol || stock.ticker;
        stock.scan_name = scanName;
        
        await Database.storeAlert(stock);
      }
      console.log(`Stored ${stocksData.length} alerts in database`);
    } catch (dbError) {
      console.error('Database error while storing alerts:', dbError);
      StatusMonitor.recordError('database', dbError);
      // Continue processing even if database fails
    }
    
    // Process alerts
    if (stocksData.length === 1) {
      // For a single stock, send detailed alert
      const stock = stocksData[0];
      const message = formatAlertMessage(stock, scanName);
      
      await sendTelegramMessage(message);
      console.log('Sent single stock alert to Telegram');
    } else {
      // For multiple stocks, send a consolidated message
      const message = formatMultipleStocksMessage(stocksData, scanName);
      
      await sendTelegramMessage(message);
      console.log(`Sent consolidated alert for ${stocksData.length} stocks to Telegram`);
    }
    
    // Send success response
    res.status(200).json({
      success: true,
      message: `Processed ${stocksData.length} stocks`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    StatusMonitor.recordError('webhook', error);
    
    res.status(400).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
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
app.get('/status', async (req, res) => {
  try {
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    
    // Get MongoDB connection status
    const dbConnected = Database.isConnected;
    const systemStatus = dbConnected ? 'healthy' : 'database disconnected';
    
    // Get today's date (start of day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get alerts from database
    let todayAlerts = [];
    let todayWebhooks = 0;
    let lastAlert = null;
    let totalAlerts = 0;
    let totalWebhooks = StatusMonitor.getTotalWebhooks() || 0;
    let dbError = null;
    
    try {
      // Try to get alerts and counts, but don't fail if database is down
      if (dbConnected) {
        todayAlerts = await Database.getAlertsAfterDate(today);
        
        // Count total alerts in DB (approximation)
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const allAlerts = await Database.getAlertsAfterDate(oneYearAgo);
        totalAlerts = allAlerts ? allAlerts.length : 0;
        
        // Get most recent alert
        if (todayAlerts && todayAlerts.length > 0) {
          lastAlert = todayAlerts[0]; // Assuming they're already sorted by timestamp desc
        }
      }
    } catch (error) {
      console.error('Error retrieving database metrics:', error);
      dbError = error.message;
      StatusMonitor.recordError('database', error);
    }
    
    // Calculate stats
    const todayAlertCount = todayAlerts ? todayAlerts.length : 0;
    
    // Get today's webhook count and total count from StatusMonitor
    todayWebhooks = StatusMonitor.getTodayWebhooks() || 0;
    
    // Get recent errors
    const recentErrors = StatusMonitor.getRecentErrors();
    let errorLog = '';
    
    if (recentErrors && recentErrors.length > 0) {
      recentErrors.forEach(err => {
        errorLog += `<div class="error-item">
          <span class="error-time">${new Date(err.timestamp).toLocaleTimeString()}</span>
          <span class="error-type">${err.type}</span>
          <span class="error-message">${err.message}</span>
        </div>`;
      });
    } else {
      errorLog = '<p class="no-errors">No errors recorded recently</p>';
    }
    
    // Format last alert time
    let lastAlertTime = 'No alerts today';
    if (lastAlert) {
      lastAlertTime = `${lastAlert.symbol} at ${new Date(lastAlert.timestamp || lastAlert.createdAt).toLocaleTimeString()}`;
    }
    
    // Prepare status HTML
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>System Status</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta http-equiv="refresh" content="30">
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          .status-container {
            background-color: #f8f9fa;
            border-radius: 5px;
            padding: 20px;
            margin-bottom: 20px;
          }
          .status-container h2 {
            margin-top: 0;
            border-bottom: 1px solid #ddd;
            padding-bottom: 10px;
          }
          .status-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding: 5px 0;
            border-bottom: 1px solid #eee;
          }
          .status-label {
            font-weight: bold;
          }
          .status-value {
            text-align: right;
          }
          .healthy {
            color: #28a745;
          }
          .warning {
            color: #ffc107;
          }
          .error {
            color: #dc3545;
          }
          .nav {
            margin-bottom: 20px;
          }
          .nav a {
            margin-right: 15px;
            text-decoration: none;
            color: #2196F3;
          }
          .error-log {
            background-color: #f8f9fa;
            border-radius: 5px;
            padding: 10px;
            max-height: 200px;
            overflow-y: auto;
          }
          .error-item {
            margin-bottom: 5px;
            border-bottom: 1px solid #eee;
            padding-bottom: 5px;
          }
          .error-time {
            color: #6c757d;
            margin-right: 10px;
          }
          .error-type {
            font-weight: bold;
            margin-right: 10px;
          }
          .error-message {
            color: #dc3545;
          }
          .no-errors {
            color: #28a745;
          }
          .db-error {
            background-color: #fff3cd;
            border: 1px solid #ffeeba;
            color: #856404;
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 20px;
          }
        </style>
      </head>
      <body>
        <div class="nav">
          <a href="/status">Status</a>
          <a href="/analytics">Analytics</a>
          <a href="/test-webhook-dashboard">Test Webhook</a>
          <a href="/resend-alerts">Resend Alerts</a>
        </div>
        
        <h1>System Status</h1>
        
        ${dbError ? `<div class="db-error">
          <strong>Database Connection Error:</strong> ${dbError}
          <p>Some features may be limited. Please check your MongoDB connection settings.</p>
        </div>` : ''}
        
        <div class="status-container">
          <h2>System Status</h2>
          <div class="status-row">
            <span class="status-label">Uptime</span>
            <span class="status-value">${uptimeString}</span>
          </div>
          <div class="status-row">
            <span class="status-label">System Status</span>
            <span class="status-value ${dbConnected ? 'healthy' : 'warning'}">${systemStatus}</span>
          </div>
          <div class="status-row">
            <span class="status-label">Last Restarted</span>
            <span class="status-value">${new Date(Date.now() - uptime * 1000).toISOString()}</span>
          </div>
        </div>
        
        <div class="status-container">
          <h2>Stock Alerts</h2>
          <div class="status-row">
            <span class="status-label">Alerts Received Today</span>
            <span class="status-value">${todayAlertCount}</span>
          </div>
          <div class="status-row">
            <span class="status-label">Total Alerts</span>
            <span class="status-value">${totalAlerts}${!dbConnected ? ' (estimate)' : ''}</span>
          </div>
          <div class="status-row">
            <span class="status-label">Webhooks Received Today</span>
            <span class="status-value">${todayWebhooks}</span>
          </div>
          <div class="status-row">
            <span class="status-label">Total Webhooks</span>
            <span class="status-value">${totalWebhooks}</span>
          </div>
          <div class="status-row">
            <span class="status-label">Last Alert</span>
            <span class="status-value">${lastAlertTime}</span>
          </div>
        </div>
        
        <div class="status-container">
          <h2>Error Log</h2>
          <div class="error-log">
            ${errorLog}
          </div>
        </div>
        
        <div class="status-container">
          <h2>Quick Actions</h2>
          <div style="display: flex; gap: 10px;">
            <button onclick="window.location.href='/test-webhook-dashboard'">Test Webhook</button>
            <button onclick="window.location.href='/test-telegram'">Test Telegram</button>
            <button onclick="window.location.href='/resend-alerts'">Resend Alerts</button>
          </div>
        </div>
        
        <p><small>This page auto-refreshes every 30 seconds. Last updated: ${new Date().toLocaleTimeString()}</small></p>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error rendering status page:', error);
    res.status(500).send('Error generating status page: ' + error.message);
  }
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

// Test webhook dashboard
app.get('/test-webhook-dashboard', (req, res) => {
  // Check database connection
  const dbConnected = Database.isConnected;
  const dbConnectMessage = dbConnected ? 
    '<div class="alert alert-success">MongoDB connected - Webhooks will be stored in the database</div>' :
    '<div class="alert alert-warning">MongoDB not connected - Webhooks will still work but won\'t be stored in the database. See <a href="/MONGODB-CONNECTION-FIX.md">connection fix guide</a></div>';
    
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Test Webhook Dashboard</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        .nav {
          margin-bottom: 20px;
        }
        .nav a {
          margin-right: 15px;
          text-decoration: none;
          color: #2196F3;
        }
        .form-group {
          margin-bottom: 15px;
        }
        label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        input, textarea, select {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          box-sizing: border-box;
        }
        button {
          background-color: #4CAF50;
          color: white;
          padding: 10px 15px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        button:hover {
          background-color: #45a049;
        }
        .response {
          margin-top: 20px;
          padding: 15px;
          border: 1px solid #ddd;
          border-radius: 4px;
          background-color: #f9f9f9;
          white-space: pre-wrap;
          max-height: 300px;
          overflow-y: auto;
        }
        .templates {
          margin-top: 20px;
          padding: 15px;
          border: 1px solid #ddd;
          border-radius: 4px;
          background-color: #f9f9f9;
        }
        .alert {
          padding: 12px;
          margin-bottom: 15px;
          border-radius: 4px;
        }
        .alert-success {
          background-color: #dff0d8;
          color: #3c763d;
          border: 1px solid #d6e9c6;
        }
        .alert-warning {
          background-color: #fcf8e3;
          color: #8a6d3b;
          border: 1px solid #faebcc;
        }
      </style>
    </head>
    <body>
      <div class="nav">
        <a href="/status">Status</a>
        <a href="/analytics">Analytics</a>
        <a href="/test-webhook-dashboard">Test Webhook</a>
        <a href="/resend-alerts">Resend Alerts</a>
      </div>
      
      <h1>Test Webhook Dashboard</h1>
      
      ${dbConnectMessage}
      
      <p>Use this form to test sending webhooks to your bot without needing external tools.</p>
      
      <form id="webhook-form">
        <div class="form-group">
          <label for="symbol">Stock Symbol:</label>
          <input type="text" id="symbol" name="symbol" value="RELIANCE" required>
        </div>
        
        <div class="form-group">
          <label for="price">Trigger Price:</label>
          <input type="number" id="price" name="price" value="2500" step="0.01" required>
        </div>
        
        <div class="form-group">
          <label for="scan_name">Scan Name:</label>
          <input type="text" id="scan_name" name="scan_name" value="Test Scan" required>
        </div>
        
        <div class="form-group">
          <label for="format">Webhook Format:</label>
          <select id="format" name="format">
            <option value="single">Single Stock</option>
            <option value="stocks_array">Stocks Array</option>
          </select>
        </div>
        
        <button type="submit">Send Webhook</button>
      </form>
      
      <div class="response" id="response" style="display: none;"></div>
      
      <div class="templates">
        <h3>Available Templates</h3>
        <p><strong>Single Stock:</strong> Sends a webhook with a single stock</p>
        <p><strong>Stocks Array:</strong> Sends a webhook with an array of stocks in the "stocks" field</p>
      </div>
      
      <script>
        document.getElementById('webhook-form').addEventListener('submit', async (event) => {
          event.preventDefault();
          
          // Get form values
          const symbol = document.getElementById('symbol').value;
          const price = document.getElementById('price').value;
          const scanName = document.getElementById('scan_name').value;
          const format = document.getElementById('format').value;
          
          // Prepare payload based on format
          let payload;
          
          if (format === 'single') {
            payload = {
              symbol: symbol,
              close: parseFloat(price),
              scan_name: scanName,
              timestamp: new Date().toISOString()
            };
          } else if (format === 'stocks_array') {
            payload = {
              scan_name: scanName,
              stocks: [
                {
                  symbol: symbol,
                  close: parseFloat(price),
                  timestamp: new Date().toISOString()
                }
              ]
            };
          }
          
          // Show loading state
          const responseDiv = document.getElementById('response');
          responseDiv.style.display = 'block';
          responseDiv.textContent = 'Sending webhook...';
          
          try {
            // Send webhook
            const response = await fetch('/webhook', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(payload)
            });
            
            // Parse response
            const data = await response.json();
            
            // Display response
            responseDiv.textContent = JSON.stringify(data, null, 2);
          } catch (error) {
            responseDiv.textContent = 'Error: ' + error.message;
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Endpoint to view and resend alerts from today
app.get('/resend-alerts', async (req, res) => {
  try {
    // Get today's date (start of day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get alerts from database
    let todayAlerts = [];
    let dbError = null;
    
    try {
      todayAlerts = await Database.getAlertsAfterDate(today);
    } catch (error) {
      console.error('Error retrieving alerts from database:', error);
      dbError = error.message || 'Database connection error';
      StatusMonitor.recordError('database', error);
    }
    
    // Prepare HTML content
    let alertsHtml = '';
    
    if (dbError) {
      alertsHtml = `
        <div class="error-message">
          <h3>Database Error</h3>
          <p>Could not connect to MongoDB to retrieve alerts. Error: ${dbError}</p>
          <p>Please check your MongoDB connection settings and make sure your IP is whitelisted in MongoDB Atlas.</p>
          <p>The webhook testing feature will still work even without database connectivity.</p>
        </div>
      `;
    } else if (!todayAlerts || todayAlerts.length === 0) {
      alertsHtml = '<p>No alerts found for today.</p>';
    } else {
      // Group alerts by scan name
      const alertsByScan = {};
      
      todayAlerts.forEach(alert => {
        const scanName = alert.scanName || alert.scan_name || 'Unknown';
        if (!alertsByScan[scanName]) {
          alertsByScan[scanName] = [];
        }
        alertsByScan[scanName].push(alert);
      });
      
      // Generate HTML for each group
      for (const [scanName, alerts] of Object.entries(alertsByScan)) {
        alertsHtml += `
          <div class="alert-group">
            <h3>${scanName} (${alerts.length} alerts)</h3>
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Price</th>
                  <th>Time</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
        `;
        
        for (const alert of alerts) {
          alertsHtml += `
            <tr data-id="${alert._id}">
              <td>${alert.symbol}</td>
              <td>₹${alert.currentPrice ? alert.currentPrice.toFixed(2) : alert.close ? alert.close.toFixed(2) : alert.price ? alert.price.toFixed(2) : 'N/A'}</td>
              <td>${new Date(alert.timestamp || alert.createdAt).toLocaleTimeString()}</td>
              <td>
                <button class="resend-btn" data-id="${alert._id}">Resend</button>
              </td>
            </tr>
          `;
        }
        
        alertsHtml += `
              </tbody>
            </table>
            <button class="resend-group-btn" data-scan="${scanName}">Resend All ${alerts.length} Alerts</button>
          </div>
        `;
      }
    }
    
    // Render HTML page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Today's Alerts</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
          }
          h1, h2, h3 {
            color: #333;
          }
          .nav {
            margin-bottom: 20px;
          }
          .nav a {
            margin-right: 15px;
            text-decoration: none;
            color: #2196F3;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
          }
          th {
            background-color: #f2f2f2;
          }
          tr:nth-child(even) {
            background-color: #f9f9f9;
          }
          .alert-group {
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 15px;
            margin-bottom: 20px;
            background-color: #f9f9f9;
          }
          button {
            background-color: #4CAF50;
            color: white;
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          }
          button:hover {
            background-color: #45a049;
          }
          .resend-group-btn {
            margin-bottom: 10px;
            background-color: #2196F3;
          }
          .resend-group-btn:hover {
            background-color: #0b7dda;
          }
          .status {
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
          }
          .success {
            background-color: #dff0d8;
            color: #3c763d;
          }
          .error {
            background-color: #f2dede;
            color: #a94442;
          }
          .error-message {
            padding: 15px;
            margin-bottom: 20px;
            border-left: 4px solid #f44336;
            background-color: #ffebee;
          }
        </style>
      </head>
      <body>
        <div class="nav">
          <a href="/status">Status</a>
          <a href="/analytics">Analytics</a>
          <a href="/test-webhook-dashboard">Test Webhook</a>
          <a href="/resend-alerts">Resend Alerts</a>
        </div>
        
        <h1>Today's Alerts</h1>
        <p>Found ${todayAlerts ? todayAlerts.length : 0} alerts from today. You can resend alerts that might have failed to deliver to Telegram.</p>
        
        <div id="status" class="status" style="display: none;"></div>
        
        ${alertsHtml}
        
        <script>
          // Function to show status messages
          function showStatus(message, isSuccess) {
            const statusDiv = document.getElementById('status');
            statusDiv.className = isSuccess ? 'status success' : 'status error';
            statusDiv.textContent = message;
            statusDiv.style.display = 'block';
            
            // Scroll to top to see message
            window.scrollTo(0, 0);
            
            // Hide message after 5 seconds
            setTimeout(() => {
              statusDiv.style.display = 'none';
            }, 5000);
          }
          
          // Add event listeners for individual resend buttons
          document.querySelectorAll('.resend-btn').forEach(button => {
            button.addEventListener('click', async () => {
              const alertId = button.getAttribute('data-id');
              button.disabled = true;
              button.textContent = 'Sending...';
              
              try {
                const response = await fetch('/api/resend-alert', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ alertId })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                  showStatus('Alert resent successfully!', true);
                  button.textContent = 'Sent ✓';
                } else {
                  showStatus('Failed to resend alert: ' + data.error, false);
                  button.textContent = 'Failed';
                }
              } catch (error) {
                showStatus('Error: ' + error.message, false);
                button.textContent = 'Failed';
              }
            });
          });
          
          // Add event listeners for group resend buttons
          document.querySelectorAll('.resend-group-btn').forEach(button => {
            button.addEventListener('click', async () => {
              const scanName = button.getAttribute('data-scan');
              button.disabled = true;
              button.textContent = 'Sending...';
              
              try {
                const response = await fetch('/api/resend-alerts-by-scan', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ scanName })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                  showStatus(\`\${data.count} alerts from "\${scanName}" resent successfully!\`, true);
                  button.textContent = 'All Sent ✓';
                } else {
                  showStatus('Failed to resend alerts: ' + data.error, false);
                  button.textContent = 'Failed';
                }
              } catch (error) {
                showStatus('Error: ' + error.message, false);
                button.textContent = 'Failed';
              }
            });
          });
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error rendering resend alerts page:', error);
    res.status(500).send('Internal Server Error');
  }
});

// API endpoint to resend a single alert
app.post('/api/resend-alert', async (req, res) => {
  try {
    const { alertId } = req.body;
    
    if (!alertId) {
      return res.status(400).json({ error: 'Alert ID is required' });
    }
    
    // Get alert from database
    let alert;
    try {
      alert = await Database.getAlertById(alertId);
    } catch (error) {
      console.error('Database error when retrieving alert:', error);
      return res.status(500).json({ error: 'Database connection error: ' + error.message });
    }
    
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    // Format and send the alert
    let message;
    
    // Format the message using the existing formatAlertMessage function
    message = formatAlertMessage(alert, alert.scanType || alert.scan_name);
    
    // Send to Telegram
    const messageSent = await sendTelegramMessage(message);
    
    if (messageSent) {
      res.status(200).json({ success: true, message: 'Alert sent to Telegram' });
    } else {
      res.status(500).json({ error: 'Failed to send to Telegram' });
    }
  } catch (error) {
    console.error('Error resending alert:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// API endpoint to resend alerts by scan name
app.post('/api/resend-alerts-by-scan', async (req, res) => {
  try {
    const { scanName } = req.body;
    
    if (!scanName) {
      return res.status(400).json({ error: 'Scan name is required' });
    }
    
    // Get today's date (start of day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get alerts for the scan
    let alerts;
    try {
      alerts = await Database.getAlertsByScan(scanName, today);
    } catch (error) {
      console.error('Database error when retrieving alerts by scan:', error);
      return res.status(500).json({ error: 'Database connection error: ' + error.message });
    }
    
    if (!alerts || alerts.length === 0) {
      return res.status(404).json({ error: 'No alerts found for this scan' });
    }
    
    // If there's only one alert, send it individually
    if (alerts.length === 1) {
      const message = formatAlertMessage(alerts[0], alerts[0].scanType || alerts[0].scan_name);
      const messageSent = await sendTelegramMessage(message);
      
      if (messageSent) {
        return res.status(200).json({ success: true, count: 1 });
      } else {
        return res.status(500).json({ error: 'Failed to send to Telegram' });
      }
    }
    
    // For multiple alerts, format as a group
    const message = formatMultipleStocksMessage(alerts, scanName);
    const messageSent = await sendTelegramMessage(message);
    
    if (messageSent) {
      res.status(200).json({ success: true, count: alerts.length });
    } else {
      res.status(500).json({ error: 'Failed to send to Telegram' });
    }
  } catch (error) {
    console.error('Error resending alerts by scan:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Serve the MongoDB connection fix guide
app.get('/MONGODB-CONNECTION-FIX.md', (req, res) => {
  res.sendFile(path.join(__dirname, 'MONGODB-CONNECTION-FIX.md'));
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