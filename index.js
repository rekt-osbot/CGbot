require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const schedule = require('node-schedule');
const stockData = require('./stockData-enhanced.js');
const StockSummary = require('./stockSummary');
const path = require('path');
const fs = require('fs');
const statusMonitor = require('./status');
const Analytics = require('./analytics');
const Database = require('./database');
const { enhancedDashboard, apiStatus } = require('./enhanced-dashboard');

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
  
  // Handle cases where stock data isn't fully populated
  if (!open || !close) {
    // Basic format for webhook data without full stock info
    const stockSymbol = data.symbol || data.stocks;
    let message = `📈 *${stockSymbol}*`;
    
    if (data.trigger_price || data.trigger_prices) {
      message += ` ₹${data.trigger_price || data.trigger_prices}`;
    }
    
    if (data.triggered_at) {
      message += `\n⏰ ${data.triggered_at}`;
    }
    
    return message;
  }
  
  // For fully populated stock data
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
    // Handle cases where stock data might not have been enriched yet
    const { symbol, open, low, high, close, sma20 } = data;
    
    // If we only have basic data (like from webhook trigger), show limited info
    if (!open || !close) {
      // Simple format for webhook triggers without full data
      let message = `🚨 *STOCK ALERT: ${data.symbol || data.stocks}* 🚨\n\n`;
      
      // Add scan type if provided
      if (data.scan_name) {
        message += `📊 *Scan*: ${data.scan_name}\n\n`;
      }
      
      // Add trigger price if available
      if (data.trigger_price || data.trigger_prices) {
        message += `📈 *Trigger Price*: ₹${data.trigger_price || data.trigger_prices}\n\n`;
      }
      
      // Add triggered time if available
      if (data.triggered_at) {
        message += `⏰ *Triggered at*: ${data.triggered_at}\n\n`;
      }
      
      message += `⚠️ Stock alert triggered`;
      
      return message;
    }
    
    // For fully enriched data with price info
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
  
  // Check if we have stocks with complete data or just webhook data
  const hasFullData = stocksData.some(stock => stock.open && stock.close);
  
  if (hasFullData) {
    // Sort stocks by stop loss distance (smallest first) when we have full data
    // This prioritizes stocks closest to their stop loss
    const sortedStocks = [...stocksData].sort((a, b) => {
      // First, make sure slDistance is calculated
      if (a.slDistance === undefined && a.low && a.close) {
        const aStopLoss = calculateStopLoss(a.low, a.sma20);
        a.slDistance = ((a.close - aStopLoss) / a.close * 100);
      }
      
      if (b.slDistance === undefined && b.low && b.close) {
        const bStopLoss = calculateStopLoss(b.low, b.sma20);
        b.slDistance = ((b.close - bStopLoss) / b.close * 100);
      }
      
      // If we can't calculate for either stock, use default order
      if (a.slDistance === undefined || b.slDistance === undefined) {
        return 0;
      }
      
      return a.slDistance - b.slDistance;
    });
    
    // Add each stock to the message
    sortedStocks.forEach((stock, index) => {
      message += formatSingleStockAlert(stock, scanName);
      
      // Add separator between stocks
      if (index < sortedStocks.length - 1) {
        message += '\n\n' + '─'.repeat(20) + '\n\n';
      }
    });
  } else {
    // Simplified format for webhook data without full stock info
    stocksData.forEach((stock, index) => {
      const symbol = stock.symbol || stock.stocks;
      message += `*${index + 1}. ${symbol}*\n`;
      
      if (stock.trigger_price || stock.trigger_prices) {
        message += `Price: ₹${stock.trigger_price || stock.trigger_prices}\n`;
      }
      
      if (stock.triggered_at) {
        message += `Time: ${stock.triggered_at}\n`;
      }
      
      // Add separator between stocks
      if (index < stocksData.length - 1) {
        message += '\n';
      }
    });
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
  const stockInfo = await stockData.getCurrentStockInfo(symbol);
  if (!stockInfo) {
    console.error(`Failed to get stock information for ${symbol}`);
    return null;
  }
  
  // Get 20-day SMA for this stock
  const sma20 = await stockData.get20DaySMA(symbol);
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

/**
 * Handle Chartink webhook data
 * @param {Object} data - Webhook data from Chartink
 * @returns {Object} - Normalized data for processing
 */
function processChartinkWebhook(data) {
  // Normalize the stock data to make sure it has both symbol and scan_name
  let normalizedData = { ...data };
  
  // Handle symbol field variants
  normalizedData.symbol = normalizedData.symbol || normalizedData.ticker || normalizedData.stocks;
  
  // For Chartink data that doesn't include the .NS suffix
  // The stockData-enhanced service will add it when needed
  
  // Make sure scan_name is set
  normalizedData.scan_name = normalizedData.scan_name || normalizedData.scanName || 'Chartink Alert';
  
  // Add timestamp if missing
  if (!normalizedData.triggered_at) {
    normalizedData.triggered_at = new Date().toLocaleString();
  }
  
  return normalizedData;
}

// Process incoming webhooks
app.post('/webhook', async (req, res) => {
  console.log('Received webhook:', req.body);
  
  try {
    // Record webhook reception in status monitor
    statusMonitor.recordWebhook();
    
    let stocksData = [];
    const data = req.body;
    
    // Process the webhook data based on its format
    if (data.stocks && Array.isArray(data.stocks)) {
      // Multiple stocks in array format
      stocksData = data.stocks.map(stock => processChartinkWebhook(stock));
    } else if (data.stocks && typeof data.stocks === 'string') {
      // Format with 'stocks' field containing a single stock symbol as string
      stocksData = [{
        symbol: data.stocks,
        scan_name: data.scan_name || 'Stock Alert',
        triggered_at: data.triggered_at || new Date().toLocaleString()
      }];
    } else if (data.symbol || data.ticker) {
      // Single stock format
      stocksData = [processChartinkWebhook(data)];
    } else {
      // Unknown format
      console.error('Unknown webhook format:', data);
      return res.status(400).json({ error: 'Invalid webhook format' });
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
      statusMonitor.recordError('database', dbError);
      // Continue processing even if database fails
    }
    
    // Process alerts
    if (stocksData.length === 1) {
      // For a single stock, process to get full information including SL
      const symbol = stocksData[0].symbol || stocksData[0].stocks;
      if (symbol) {
        // Process the stock to get full data with SMA and stop loss
        const enrichedData = await processSingleStock(symbol, scanName);
        if (enrichedData) {
          // The processSingleStock function already calls StockSummary.trackStock()
          // Send detailed alert with stop loss
          const message = formatAlertMessage(enrichedData, scanName);
          await sendTelegramMessage(message);
          console.log('Sent enriched single stock alert to Telegram');
        } else {
          // Fall back to basic alert if processing fails
          // Create minimal enriched data for tracking
          const basicData = {
            symbol: symbol,
            open: stocksData[0].trigger_price || stocksData[0].price || 100,
            close: stocksData[0].trigger_price || stocksData[0].price || 100,
            low: stocksData[0].trigger_price || stocksData[0].price || 95,
            high: stocksData[0].trigger_price || stocksData[0].price || 105,
            scan_name: scanName
          };
          // Manually track this stock
          StockSummary.trackStock(basicData);
          
          const message = formatAlertMessage(stocksData[0], scanName);
          await sendTelegramMessage(message);
          console.log('Sent basic single stock alert to Telegram');
        }
      } else {
        // No symbol found, send basic alert
        const message = formatAlertMessage(stocksData[0], scanName);
        await sendTelegramMessage(message);
        console.log('Sent single stock alert to Telegram');
      }
    } else {
      // For multiple stocks, process each to get full information
      const enrichedStocksData = [];
      
      // Try to enrich each stock with full data
      for (const stock of stocksData) {
        const symbol = stock.symbol || stock.stocks;
        if (symbol) {
          // Process the stock to get full data with SMA and stop loss
          const enrichedData = await processSingleStock(symbol, scanName);
          if (enrichedData) {
            // processSingleStock already calls StockSummary.trackStock()
            enrichedStocksData.push(enrichedData);
          } else {
            // If processing fails, track with basic data
            const basicData = {
              symbol: symbol,
              open: stock.trigger_price || stock.price || 100,
              close: stock.trigger_price || stock.price || 100,
              low: stock.trigger_price || stock.price || 95,
              high: stock.trigger_price || stock.price || 105,
              scan_name: scanName
            };
            // Manually track this stock
            StockSummary.trackStock(basicData);
            
            // Use original data in message
            enrichedStocksData.push(stock);
          }
        } else {
          // No symbol, use original data
          enrichedStocksData.push(stock);
        }
      }
      
      // Send consolidated message with all stocks
      const message = formatMultipleStocksMessage(enrichedStocksData.length > 0 ? enrichedStocksData : stocksData, scanName);
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
    statusMonitor.recordError('webhook', error);
    
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
    const stockInfo = await stockData.getCurrentStockInfo(symbol);
    if (!stockInfo) {
      return res.status(500).json({ error: 'Failed to get stock information' });
    }
    
    // Get 20-day SMA
    const sma20 = await stockData.get20DaySMA(symbol);
    
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
      
      // Clear the tracked stocks for a fresh start tomorrow
      await StockSummary.clearData();
      console.log('Cleared tracked stocks data for the next day');
      
      return true;
    } else {
      console.error('Failed to send daily summary to Telegram');
      return false;
    }
  } catch (error) {
    console.error('Error generating daily summary:', error);
    statusMonitor.recordError('Daily summary generation', error);
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
    statusMonitor.recordError('Manual daily summary', error);
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
        statusMonitor.recordEvent('scheduledTask', 'Daily summary started');
        
        await generateAndSendDailySummary();
        
        // Remove lockfile when done
        if (fs.existsSync(lockFilePath)) {
          fs.unlinkSync(lockFilePath);
        }
      } catch (error) {
        console.error('Error in scheduled summary job:', error);
        statusMonitor.recordError('dailySummaryJob', error.message);
        
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
    statusMonitor.recordError('scheduling', error.message);
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
  
  // Format uptime
  const uptime = process.uptime();
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;
  
  // Format memory
  const formatMemory = (bytes) => {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  };
  
  // Check if JSON response is requested
  if (req.query.format === 'json') {
    return res.status(200).json(health);
  }
  
  // Render HTML response
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>System Health Dashboard</title>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
      <style>
        :root {
          --primary: #4361ee;
          --success: #2ecc71;
          --warning: #f39c12;
          --danger: #e74c3c;
          --light: #f8f9fa;
          --dark: #343a40;
        }
        
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: var(--dark);
          background-color: #f5f7fb;
          padding: 0;
          margin: 0;
        }
        
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
        }
        
        header {
          background-color: white;
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
          padding: 1.5rem 0;
          margin-bottom: 2rem;
        }
        
        .header-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 2rem;
        }
        
        h1 {
          font-size: 1.8rem;
          color: var(--primary);
          margin-bottom: 0.5rem;
        }
        
        h2 {
          font-size: 1.4rem;
          margin-bottom: 1rem;
          color: var(--dark);
        }
        
        .status-badge {
          display: inline-block;
          padding: 0.4rem 1rem;
          border-radius: 50px;
          font-weight: 600;
          font-size: 0.9rem;
        }
        
        .status-badge.healthy {
          background-color: rgba(46, 204, 113, 0.2);
          color: var(--success);
        }
        
        .status-badge.warning {
          background-color: rgba(243, 156, 18, 0.2);
          color: var(--warning);
        }
        
        .status-badge.critical {
          background-color: rgba(231, 76, 60, 0.2);
          color: var(--danger);
        }
        
        .panel {
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
          padding: 1.5rem;
          margin-bottom: 1.5rem;
        }
        
        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.2rem;
          padding-bottom: 0.8rem;
          border-bottom: 1px solid rgba(0,0,0,0.05);
        }
        
        .panel-title {
          font-size: 1.2rem;
          font-weight: 600;
          color: var(--primary);
          display: flex;
          align-items: center;
        }
        
        .panel-title i {
          margin-right: 0.5rem;
        }
        
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 1.5rem;
        }
        
        .stat-card {
          background-color: #f8f9fa;
          border-radius: 8px;
          padding: 1.2rem;
          transition: all 0.3s ease;
        }
        
        .stat-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        
        .stat-title {
          font-size: 0.9rem;
          color: #6c757d;
          margin-bottom: 0.5rem;
        }
        
        .stat-value {
          font-size: 1.8rem;
          font-weight: 700;
          color: var(--primary);
        }
        
        .stat-subtitle {
          font-size: 0.85rem;
          color: #6c757d;
          margin-top: 0.5rem;
        }
        
        .memory-bars {
          margin-top: 1rem;
        }
        
        .memory-bar {
          margin-bottom: 1rem;
        }
        
        .memory-bar-label {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.3rem;
          font-size: 0.9rem;
        }
        
        .memory-bar-track {
          height: 8px;
          width: 100%;
          background-color: rgba(67, 97, 238, 0.1);
          border-radius: 4px;
          overflow: hidden;
        }
        
        .memory-bar-fill {
          height: 100%;
          background-color: var(--primary);
          border-radius: 4px;
        }
        
        .nav-links {
          display: flex;
          gap: 1.5rem;
        }
        
        .nav-link {
          color: var(--dark);
          text-decoration: none;
          font-weight: 500;
          transition: color 0.2s;
          display: flex;
          align-items: center;
        }
        
        .nav-link i {
          margin-right: 0.5rem;
        }
        
        .nav-link:hover {
          color: var(--primary);
        }
        
        .current-time {
          font-size: 0.9rem;
          color: #6c757d;
          text-align: center;
          margin-top: 2rem;
        }
        
        .refresh-button {
          background-color: var(--primary);
          color: white;
          border: none;
          border-radius: 4px;
          padding: 0.5rem 1rem;
          font-size: 0.9rem;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        .refresh-button:hover {
          background-color: #2c49c7;
        }
        
        .api-link {
          display: inline-block;
          font-size: 0.85rem;
          color: var(--primary);
          text-decoration: none;
          margin-top: 1rem;
        }
        
        .api-link:hover {
          text-decoration: underline;
        }
        
        @media (max-width: 768px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }
          
          .header-container {
            flex-direction: column;
            text-align: center;
          }
          
          .nav-links {
            margin-top: 1rem;
          }
        }
      </style>
    </head>
    <body>
      <header>
        <div class="header-container">
          <div>
            <h1>CGNSEAlert System Health</h1>
            <span class="status-badge healthy">
              <i class="fas fa-check-circle"></i> System Operational
            </span>
          </div>
          <div class="nav-links">
            <a href="/status" class="nav-link"><i class="fas fa-chart-line"></i> Dashboard</a>
            <a href="/analytics" class="nav-link"><i class="fas fa-chart-pie"></i> Analytics</a>
            <a href="/test-webhook-dashboard" class="nav-link"><i class="fas fa-paper-plane"></i> Test</a>
          </div>
        </div>
      </header>
      
      <div class="container">
        <div class="panel">
          <div class="panel-header">
            <div class="panel-title">
              <i class="fas fa-server"></i> System Overview
            </div>
            <button class="refresh-button" onclick="window.location.reload()">
              <i class="fas fa-sync-alt"></i> Refresh
            </button>
          </div>
          
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-title">UPTIME</div>
              <div class="stat-value">${uptimeString}</div>
              <div class="stat-subtitle">Since ${new Date(Date.now() - (uptime * 1000)).toLocaleString()}</div>
            </div>
            
            <div class="stat-card">
              <div class="stat-title">ENVIRONMENT</div>
              <div class="stat-value">${health.environment.isRailway ? 'Railway' : 'Local'}</div>
              <div class="stat-subtitle">Node ${health.environment.node}</div>
            </div>
            
            <div class="stat-card">
              <div class="stat-title">STATUS</div>
              <div class="stat-value" style="color: var(--success);">Healthy</div>
              <div class="stat-subtitle">All systems operational</div>
            </div>
          </div>
        </div>
        
        <div class="panel">
          <div class="panel-header">
            <div class="panel-title">
              <i class="fas fa-memory"></i> Memory Usage
            </div>
          </div>
          
          <div class="memory-bars">
            <div class="memory-bar">
              <div class="memory-bar-label">
                <span>Heap Used</span>
                <span>${formatMemory(health.memory.heapUsed)}</span>
              </div>
              <div class="memory-bar-track">
                <div class="memory-bar-fill" style="width: ${(health.memory.heapUsed / health.memory.heapTotal * 100).toFixed(1)}%"></div>
              </div>
            </div>
            
            <div class="memory-bar">
              <div class="memory-bar-label">
                <span>Heap Allocated</span>
                <span>${formatMemory(health.memory.heapTotal)}</span>
              </div>
              <div class="memory-bar-track">
                <div class="memory-bar-fill" style="width: 100%"></div>
              </div>
            </div>
            
            <div class="memory-bar">
              <div class="memory-bar-label">
                <span>RSS Memory</span>
                <span>${formatMemory(health.memory.rss)}</span>
              </div>
              <div class="memory-bar-track">
                <div class="memory-bar-fill" style="width: ${(health.memory.rss / (health.memory.heapTotal * 2) * 100).toFixed(1)}%"></div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="current-time">
          Last updated: ${new Date().toLocaleString()}
        </div>
        
        <a href="/health?format=json" class="api-link">View JSON API response →</a>
      </div>
    </body>
    </html>
  `);
});

// Status API endpoint (JSON)
app.get('/api/status', (req, res) => {
  statusMonitor.recordHealthCheck();
  res.json(statusMonitor.getStatus());
});

// Analytics API endpoint (JSON)
app.get('/api/analytics', (req, res) => {
  const period = req.query.period || 'all';
  res.json(Analytics.getSummary(period));
});

// Status page endpoint (HTML UI)
app.get('/status', enhancedDashboard);

// API status endpoint (JSON) if not already defined
app.get('/api/status', apiStatus);

// Legacy status page (for backward compatibility)
app.get('/status-legacy', async (req, res) => {
  try {
    const uptime = process.uptime();
    // ... existing code ...
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
  
  // Format period name for display
  const periodName = {
    'day': 'Today',
    'week': 'This Week',
    'month': 'This Month',
    'all': 'All Time'
  }[period] || 'All Time';
  
  // Return HTML page
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>CGNSEAlert Analytics</title>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
      <style>
        :root {
          --primary: #4361ee;
          --success: #2ecc71;
          --warning: #f39c12;
          --danger: #e74c3c;
          --info: #3498db;
          --light: #f8f9fa;
          --dark: #343a40;
          --gray: #6c757d;
          --border: #e9ecef;
        }
        
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: var(--dark);
          background-color: #f5f7fb;
          padding: 0;
          margin: 0;
        }
        
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
        }
        
        header {
          background-color: white;
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
          padding: 1.5rem 0;
          margin-bottom: 2rem;
        }
        
        .header-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 2rem;
        }
        
        h1 {
          font-size: 1.8rem;
          color: var(--primary);
          margin-bottom: 0.5rem;
        }
        
        h2 {
          font-size: 1.4rem;
          margin-bottom: 1rem;
          color: var(--dark);
        }
        
        .panel {
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
          padding: 1.5rem;
          margin-bottom: 1.5rem;
        }
        
        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.2rem;
          padding-bottom: 0.8rem;
          border-bottom: 1px solid rgba(0,0,0,0.05);
        }
        
        .panel-title {
          font-size: 1.2rem;
          font-weight: 600;
          color: var(--primary);
          display: flex;
          align-items: center;
        }
        
        .panel-title i {
          margin-right: 0.5rem;
        }
        
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 1.2rem;
          margin-bottom: 1.5rem;
        }
        
        .stat-card {
          background-color: #f8f9fa;
          border-radius: 8px;
          padding: 1.2rem;
          transition: all 0.3s ease;
        }
        
        .stat-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        
        .stat-title {
          font-size: 0.85rem;
          color: var(--gray);
          margin-bottom: 0.5rem;
          display: flex;
          align-items: center;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .stat-title i {
          margin-right: 0.5rem;
          color: var(--primary);
        }
        
        .stat-value {
          font-size: 1.8rem;
          font-weight: 700;
          color: var(--primary);
        }
        
        .stat-value.positive {
          color: var(--success);
        }
        
        .stat-value.negative {
          color: var(--danger);
        }
        
        .table-responsive {
          overflow-x: auto;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          background-color: white;
        }
        
        th, td {
          text-align: left;
          padding: 1rem;
          border-bottom: 1px solid var(--border);
        }
        
        th {
          background-color: rgba(67, 97, 238, 0.05);
          font-weight: 600;
          color: var(--primary);
          position: sticky;
          top: 0;
        }
        
        tr:last-child td {
          border-bottom: none;
        }
        
        tr:hover td {
          background-color: rgba(67, 97, 238, 0.02);
        }
        
        .performance-cell {
          font-weight: 600;
        }
        
        .positive-value {
          color: var(--success);
        }
        
        .negative-value {
          color: var(--danger);
        }
        
        .neutral-value {
          color: var(--gray);
        }
        
        .period-tabs {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 2rem;
          flex-wrap: wrap;
        }
        
        .period-tab {
          padding: 0.6rem 1.2rem;
          border-radius: 6px;
          background-color: white;
          color: var(--dark);
          font-weight: 500;
          text-decoration: none;
          transition: all 0.2s;
          box-shadow: 0 2px 5px rgba(0,0,0,0.05);
          display: flex;
          align-items: center;
        }
        
        .period-tab i {
          margin-right: 0.5rem;
          font-size: 0.9rem;
        }
        
        .period-tab:hover {
          background-color: #f8f9fa;
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.08);
        }
        
        .period-tab.active {
          background-color: var(--primary);
          color: white;
        }
        
        .period-tab.active:hover {
          background-color: #3651cf;
        }
        
        .nav-links {
          display: flex;
          gap: 1.5rem;
        }
        
        .nav-link {
          color: var(--dark);
          text-decoration: none;
          font-weight: 500;
          transition: color 0.2s;
          display: flex;
          align-items: center;
        }
        
        .nav-link i {
          margin-right: 0.5rem;
        }
        
        .nav-link:hover {
          color: var(--primary);
        }
        
        .nav-link.active {
          color: var(--primary);
          font-weight: 600;
        }
        
        .current-time {
          font-size: 0.9rem;
          color: var(--gray);
          text-align: center;
          margin-top: 2rem;
        }
        
        .no-data {
          text-align: center;
          padding: 2rem;
          color: var(--gray);
          font-style: italic;
        }
        
        .no-data i {
          display: block;
          font-size: 2.5rem;
          margin-bottom: 1rem;
          color: #dee2e6;
        }
        
        @media (max-width: 768px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          
          .header-container {
            flex-direction: column;
            text-align: center;
          }
          
          .nav-links {
            margin-top: 1rem;
            flex-wrap: wrap;
            justify-content: center;
          }
          
          .period-tabs {
            justify-content: center;
          }
        }
        
        @media (max-width: 576px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }
          
          th, td {
            padding: 0.75rem;
          }
          
          .period-tab {
            flex: 1;
            text-align: center;
            padding: 0.6rem 0.5rem;
            justify-content: center;
          }
        }
      </style>
    </head>
    <body>
      <header>
        <div class="header-container">
          <div>
            <h1>CGNSEAlert Analytics</h1>
            <span class="period-label">${periodName} Performance</span>
          </div>
          <div class="nav-links">
            <a href="/status" class="nav-link"><i class="fas fa-tachometer-alt"></i> Dashboard</a>
            <a href="/analytics" class="nav-link active"><i class="fas fa-chart-pie"></i> Analytics</a>
            <a href="/test-webhook-dashboard" class="nav-link"><i class="fas fa-paper-plane"></i> Test Webhook</a>
            <a href="/resend-alerts" class="nav-link"><i class="fas fa-redo"></i> Resend Alerts</a>
            <a href="/health" class="nav-link"><i class="fas fa-heartbeat"></i> Health</a>
          </div>
        </div>
      </header>
      
      <div class="container">
        <div class="period-tabs">
          <a href="/analytics?period=day" class="period-tab ${period === 'day' ? 'active' : ''}">
            <i class="fas fa-calendar-day"></i> Today
          </a>
          <a href="/analytics?period=week" class="period-tab ${period === 'week' ? 'active' : ''}">
            <i class="fas fa-calendar-week"></i> This Week
          </a>
          <a href="/analytics?period=month" class="period-tab ${period === 'month' ? 'active' : ''}">
            <i class="fas fa-calendar-alt"></i> This Month
          </a>
          <a href="/analytics?period=all" class="period-tab ${period === 'all' ? 'active' : ''}">
            <i class="fas fa-infinity"></i> All Time
          </a>
        </div>
        
        <div class="panel">
          <div class="panel-header">
            <div class="panel-title">
              <i class="fas fa-chart-line"></i> Performance Summary
            </div>
          </div>
          
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-title"><i class="fas fa-bell"></i> Total Alerts</div>
              <div class="stat-value">${analytics.totalAlerts || 0}</div>
            </div>
            
            <div class="stat-card">
              <div class="stat-title"><i class="fas fa-check-circle"></i> Success Rate</div>
              <div class="stat-value ${analytics.successRate && analytics.successRate > 50 ? 'positive' : ''}">${analytics.successRate ? analytics.successRate.toFixed(1) + '%' : 'N/A'}</div>
            </div>
            
            <div class="stat-card">
              <div class="stat-title"><i class="fas fa-arrow-up"></i> Avg. Gain</div>
              <div class="stat-value positive">${analytics.avgGain ? '+' + analytics.avgGain.toFixed(2) + '%' : 'N/A'}</div>
            </div>
            
            <div class="stat-card">
              <div class="stat-title"><i class="fas fa-arrow-down"></i> Avg. Loss</div>
              <div class="stat-value negative">${analytics.avgLoss ? analytics.avgLoss.toFixed(2) + '%' : 'N/A'}</div>
            </div>
          </div>
          
          ${analytics.bestPerformer ? `
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-title"><i class="fas fa-trophy"></i> Best Performer</div>
                <div class="stat-value positive">${analytics.bestPerformer.symbol}</div>
                <div style="font-weight: 600; color: var(--success); margin-top: 0.5rem;">+${analytics.bestPerformer.performance.toFixed(2)}%</div>
              </div>
              
              ${analytics.worstPerformer ? `
                <div class="stat-card">
                  <div class="stat-title"><i class="fas fa-exclamation-triangle"></i> Worst Performer</div>
                  <div class="stat-value negative">${analytics.worstPerformer.symbol}</div>
                  <div style="font-weight: 600; color: var(--danger); margin-top: 0.5rem;">${analytics.worstPerformer.performance.toFixed(2)}%</div>
                </div>
              ` : ''}
            </div>
          ` : ''}
        </div>
        
        ${analytics.topStocks && analytics.topStocks.length > 0 ? `
          <div class="panel">
            <div class="panel-header">
              <div class="panel-title">
                <i class="fas fa-star"></i> Top Performing Stocks
              </div>
            </div>
            
            <div class="table-responsive">
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
                      <td><strong>${stock.symbol}</strong></td>
                      <td class="performance-cell ${stock.performance > 0 ? 'positive-value' : 'negative-value'}">${stock.performance > 0 ? '+' : ''}${stock.performance.toFixed(2)}%</td>
                      <td class="${stock.successRate > 70 ? 'positive-value' : stock.successRate < 30 ? 'negative-value' : 'neutral-value'}">${stock.successRate.toFixed(1)}%</td>
                      <td>${stock.alerts}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : `
          <div class="panel">
            <div class="panel-header">
              <div class="panel-title">
                <i class="fas fa-star"></i> Top Performing Stocks
              </div>
            </div>
            <div class="no-data">
              <i class="fas fa-chart-bar"></i>
              No stock performance data available for this period
            </div>
          </div>
        `}
        
        ${analytics.topScans && analytics.topScans.length > 0 ? `
          <div class="panel">
            <div class="panel-header">
              <div class="panel-title">
                <i class="fas fa-search"></i> Top Performing Scans
              </div>
            </div>
            
            <div class="table-responsive">
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
                      <td><strong>${scan.name}</strong></td>
                      <td class="performance-cell ${scan.performance > 0 ? 'positive-value' : 'negative-value'}">${scan.performance > 0 ? '+' : ''}${scan.performance.toFixed(2)}%</td>
                      <td class="${scan.successRate > 70 ? 'positive-value' : scan.successRate < 30 ? 'negative-value' : 'neutral-value'}">${scan.successRate.toFixed(1)}%</td>
                      <td>${scan.alerts}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : `
          <div class="panel">
            <div class="panel-header">
              <div class="panel-title">
                <i class="fas fa-search"></i> Top Performing Scans
              </div>
            </div>
            <div class="no-data">
              <i class="fas fa-chart-line"></i>
              No scan performance data available for this period
            </div>
          </div>
        `}
        
        <div class="current-time">
          Last updated: ${analytics.lastUpdated ? new Date(analytics.lastUpdated).toLocaleString() : new Date().toLocaleString()}
        </div>
      </div>
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
      statusMonitor.recordError('database', error);
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
    // Only call statusMonitor.recordEvent if it exists
    if (statusMonitor && typeof statusMonitor.recordEvent === 'function') {
      statusMonitor.recordEvent('shutdown', 'Graceful shutdown initiated');
    } else if (statusMonitor && typeof statusMonitor.recordError === 'function') {
      // Fallback to recordError if recordEvent doesn't exist
      statusMonitor.recordError('shutdown', 'Graceful shutdown initiated');
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
  statusMonitor.recordError('uncaughtException', error.message);
  // Don't exit the process, just log the error
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  statusMonitor.recordError('unhandledRejection', reason);
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

// Add handler for test-webhook-dashboard route
app.get('/test-webhook-dashboard', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Test Webhook - Stock Alerts Dashboard</title>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        :root {
          --primary: #4361ee;
          --primary-light: #eef1ff;
          --primary-dark: #3651cf;
          --success: #10b981;
          --success-light: #ecfdf5;
          --warning: #f59e0b;
          --warning-light: #fffbeb;
          --danger: #ef4444;
          --danger-light: #fef2f2;
          --info: #3b82f6;
          --info-light: #eff6ff;
          --gray: #6b7280;
          --gray-light: #f3f4f6;
          --dark: #1f2937;
          --border: #e5e7eb;
          --text: #374151;
          --text-light: #6b7280;
          --bg: #f9fafb;
          --white: #ffffff;
          --radius: 0.5rem;
          --shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
        }
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        
        body {
          background-color: var(--bg);
          color: var(--text);
          line-height: 1.5;
          padding: 2rem;
        }
        
        .container {
          max-width: 800px;
          margin: 0 auto;
        }
        
        h1 {
          margin-bottom: 1.5rem;
          color: var(--dark);
        }
        
        .card {
          background-color: var(--white);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
          padding: 1.5rem;
          margin-bottom: 1.5rem;
        }
        
        .form-group {
          margin-bottom: 1.5rem;
        }
        
        label {
          display: block;
          font-weight: 500;
          margin-bottom: 0.5rem;
          color: var(--dark);
        }
        
        input, textarea, select {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          font-size: 1rem;
          transition: border-color 0.2s;
        }
        
        input:focus, textarea:focus, select:focus {
          outline: none;
          border-color: var(--primary);
        }
        
        textarea {
          min-height: 150px;
          resize: vertical;
        }
        
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
          font-weight: 500;
          padding: 0.75rem 1.5rem;
          border-radius: var(--radius);
          border: none;
          cursor: pointer;
          transition: all 0.2s;
          text-decoration: none;
        }
        
        .btn i {
          margin-right: 0.5rem;
        }
        
        .btn-primary {
          background-color: var(--primary);
          color: var(--white);
        }
        
        .btn-primary:hover {
          background-color: var(--primary-dark);
        }
        
        .btn-outline {
          background-color: transparent;
          border: 1px solid var(--border);
          color: var(--text);
        }
        
        .btn-outline:hover {
          background-color: var(--gray-light);
        }
        
        .template-selector {
          margin-bottom: 1rem;
        }
        
        .back-link {
          display: inline-flex;
          align-items: center;
          color: var(--primary);
          text-decoration: none;
          font-weight: 500;
          margin-bottom: 1rem;
        }
        
        .back-link i {
          margin-right: 0.5rem;
        }
        
        .back-link:hover {
          text-decoration: underline;
        }
        
        .response {
          margin-top: 1.5rem;
          padding: 1rem;
          background-color: var(--dark);
          color: var(--white);
          border-radius: var(--radius);
          font-family: monospace;
          white-space: pre-wrap;
          max-height: 300px;
          overflow-y: auto;
        }
        
        .alert {
          padding: 0.75rem 1rem;
          border-radius: var(--radius);
          margin-bottom: 1rem;
        }
        
        .alert-success {
          background-color: var(--success-light);
          color: var(--success);
        }
        
        .alert-error {
          background-color: var(--danger-light);
          color: var(--danger);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <a href="/status" class="back-link">
          <i class="fas fa-arrow-left"></i> Back to Dashboard
        </a>
        
        <h1>Test Webhook</h1>
        
        <div class="card">
          <form id="webhookForm">
            <div class="form-group template-selector">
              <label for="template">Select Webhook Template</label>
              <select id="template" name="template" class="form-control">
                <option value="single">Single Stock Alert</option>
                <option value="multiple">Multiple Stocks Alert</option>
                <option value="chartink">Chartink Format</option>
                <option value="custom">Custom JSON</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="webhook-data">Webhook Payload (JSON)</label>
              <textarea id="webhook-data" name="webhook-data" class="form-control"></textarea>
            </div>
            
            <button type="submit" class="btn btn-primary">
              <i class="fas fa-paper-plane"></i> Send Test Webhook
            </button>
          </form>
          
          <div id="responseSection" style="display: none;">
            <h3 style="margin-top: 1.5rem;">Response</h3>
            <div id="responseData" class="response"></div>
          </div>
        </div>
      </div>
      
      <script>
        // Template data
        const templates = {
          single: {
            symbol: "SBIN",
            scan_name: "Breakout Scan",
            trigger_price: 624.50,
            triggered_at: new Date().toLocaleString()
          },
          multiple: {
            scan_name: "Multiple Stocks Scan",
            triggered_at: new Date().toLocaleString(),
            stocks: [
              { symbol: "RELIANCE", trigger_price: 2840.75 },
              { symbol: "INFY", trigger_price: 1670.25 },
              { symbol: "HDFCBANK", trigger_price: 1580.60 }
            ]
          },
          chartink: {
            alert_name: "Chartink Breakout",
            scan_name: "Volume Breakout",
            scan_url: "https://chartink.com/screener/volume-breakout",
            stocks: "TATAMOTORS",
            trigger_prices: 950.25,
            triggered_at: new Date().toLocaleString()
          },
          custom: {
            // Empty for custom input
          }
        };
        
        // Populate textarea based on selected template
        document.getElementById('template').addEventListener('change', function() {
          const selected = this.value;
          const data = templates[selected];
          
          if (selected === 'custom') {
            document.getElementById('webhook-data').value = '{\n  "symbol": "YOURSTOCK",\n  "scan_name": "Your Scan",\n  "trigger_price": 100.50\n}';
          } else {
            document.getElementById('webhook-data').value = JSON.stringify(data, null, 2);
          }
        });
        
        // Trigger change event to populate initial template
        document.getElementById('template').dispatchEvent(new Event('change'));
        
        // Form submission
        document.getElementById('webhookForm').addEventListener('submit', async function(e) {
          e.preventDefault();
          
          const webhookData = document.getElementById('webhook-data').value;
          
          try {
            // Parse the JSON to validate it
            const jsonData = JSON.parse(webhookData);
            
            // Show a loading state
            const submitBtn = this.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
            submitBtn.disabled = true;
            
            // Send the webhook
            const response = await fetch('/webhook', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: webhookData
            });
            
            // Parse the response
            const responseData = await response.json();
            
            // Show the response
            document.getElementById('responseSection').style.display = 'block';
            document.getElementById('responseData').textContent = JSON.stringify(responseData, null, 2);
            
            // Reset button state
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
            
            // Scroll to response
            document.getElementById('responseSection').scrollIntoView({ behavior: 'smooth' });
            
          } catch (error) {
            alert('Invalid JSON payload. Please check your input and try again.');
            console.error('Error:', error);
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Add handler for viewing all alerts
app.get('/alerts', async (req, res) => {
  try {
    // Connect to database
    await database.connect();
    
    // Get alerts from database (most recent first)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Default to showing today's alerts or all alerts from past week if no date parameter
    const startDate = req.query.date ? new Date(req.query.date) : new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    let alerts = [];
    
    if (database.isConnected) {
      alerts = await database.getAlertsAfterDate(startDate);
    } else {
      // If database not connected, use alerts from status monitor
      alerts = statusMonitor.getStatus().alerts.recent || [];
    }
    
    // Format date for display
    const startDateFormatted = startDate.toLocaleDateString();
    
    // Send HTML response
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>All Alerts - Stock Alerts Dashboard</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
          :root {
            --primary: #4361ee;
            --primary-light: #eef1ff;
            --primary-dark: #3651cf;
            --success: #10b981;
            --success-light: #ecfdf5;
            --warning: #f59e0b;
            --warning-light: #fffbeb;
            --danger: #ef4444;
            --danger-light: #fef2f2;
            --info: #3b82f6;
            --info-light: #eff6ff;
            --gray: #6b7280;
            --gray-light: #f3f4f6;
            --dark: #1f2937;
            --border: #e5e7eb;
            --text: #374151;
            --text-light: #6b7280;
            --bg: #f9fafb;
            --white: #ffffff;
            --radius: 0.5rem;
            --shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
          }
          
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          }
          
          body {
            background-color: var(--bg);
            color: var(--text);
            line-height: 1.5;
            padding-bottom: 2rem;
          }
          
          .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem 1rem;
          }
          
          h1 {
            margin-bottom: 1.5rem;
            color: var(--dark);
          }
          
          .card {
            background-color: var(--white);
            border-radius: var(--radius);
            box-shadow: var(--shadow);
            margin-bottom: 1.5rem;
            overflow: hidden;
          }
          
          .card-header {
            padding: 1rem 1.5rem;
            border-bottom: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          
          .card-title {
            font-weight: 600;
            font-size: 1.125rem;
            color: var(--dark);
            display: flex;
            align-items: center;
          }
          
          .card-title i {
            margin-right: 0.5rem;
            color: var(--primary);
          }
          
          .filter-form {
            display: flex;
            gap: 0.5rem;
            align-items: center;
          }
          
          .filter-form label {
            font-weight: 500;
            font-size: 0.875rem;
          }
          
          .filter-form input {
            padding: 0.5rem;
            border: 1px solid var(--border);
            border-radius: var(--radius);
          }
          
          .filter-form button {
            padding: 0.5rem 1rem;
            background-color: var(--primary);
            color: var(--white);
            border: none;
            border-radius: var(--radius);
            cursor: pointer;
            transition: background-color 0.2s;
          }
          
          .filter-form button:hover {
            background-color: var(--primary-dark);
          }
          
          .table {
            width: 100%;
            border-collapse: collapse;
          }
          
          .table th, .table td {
            padding: 0.75rem 1rem;
            text-align: left;
            border-bottom: 1px solid var(--border);
          }
          
          .table th {
            font-weight: 600;
            color: var(--text);
            background-color: var(--gray-light);
          }
          
          .table tr:last-child td {
            border-bottom: none;
          }
          
          .empty-state {
            padding: 2rem;
            text-align: center;
            color: var(--text-light);
          }
          
          .empty-state i {
            font-size: 2.5rem;
            margin-bottom: 1rem;
            color: var(--gray);
          }
          
          .empty-state-title {
            font-weight: 600;
            font-size: 1.125rem;
            margin-bottom: 0.5rem;
            color: var(--text);
          }
          
          .back-link {
            display: inline-flex;
            align-items: center;
            color: var(--primary);
            text-decoration: none;
            font-weight: 500;
            margin-bottom: 1rem;
          }
          
          .back-link i {
            margin-right: 0.5rem;
          }
          
          .back-link:hover {
            text-decoration: underline;
          }
          
          .positive {
            color: var(--success);
          }
          
          .negative {
            color: var(--danger);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <a href="/status" class="back-link">
            <i class="fas fa-arrow-left"></i> Back to Dashboard
          </a>
          
          <h1>All Alerts</h1>
          
          <div class="card">
            <div class="card-header">
              <div class="card-title">
                <i class="fas fa-bell"></i> Stock Alerts
              </div>
              
              <form class="filter-form" method="GET">
                <label for="date">From Date:</label>
                <input type="date" id="date" name="date" value="${startDate.toISOString().split('T')[0]}">
                <button type="submit">Filter</button>
              </form>
            </div>
            
            ${alerts.length > 0 ? `
              <table class="table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Scan</th>
                    <th>Price</th>
                    <th>% Change</th>
                    <th>SMA20</th>
                    <th>Date/Time</th>
                  </tr>
                </thead>
                <tbody>
                  ${alerts.map(alert => `
                    <tr>
                      <td><strong>${alert.symbol}</strong></td>
                      <td>${alert.scanName || alert.scan_name || 'N/A'}</td>
                      <td>${alert.alertPrice || alert.trigger_price || alert.price || 'N/A'}</td>
                      <td class="${(alert.percentChange || 0) >= 0 ? 'positive' : 'negative'}">${alert.percentChange ? alert.percentChange.toFixed(2) + '%' : 'N/A'}</td>
                      <td>${alert.sma20 ? alert.sma20.toFixed(2) : 'N/A'}</td>
                      <td>${new Date(alert.timestamp || alert.triggered_at || alert.createdAt).toLocaleString()}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : `
              <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <div class="empty-state-title">No Alerts Found</div>
                <p>No stock alerts were found for the selected time period.</p>
              </div>
            `}
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error generating alerts page:', error);
    res.status(500).send(`
      <h1>Error</h1>
      <p>Error generating alerts page: ${error.message}</p>
      <a href="/status">Back to Dashboard</a>
    `);
  }
});

// ... existing code ... 