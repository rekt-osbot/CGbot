/**
 * Integration Guide
 * 
 * This file shows how to integrate the enhanced components
 * into the existing index.js file
 */

// 1. IMPORTS - Add these imports to the top of index.js
const telegramFormats = require('./telegramFormats');
const enhancedDashboard = require('./enhanced-dashboard');

// 2. DEPENDENCIES - Install Handlebars if not already installed
// npm install handlebars --save

// 3. UPDATE DASHBOARD ROUTES - Replace existing routes with enhanced versions

// Replace the existing /status route with this:
app.get('/status', enhancedDashboard.enhancedDashboard);

// Replace the existing /api/status route with this:
app.get('/api/status', enhancedDashboard.apiStatus);

// 4. REPLACE TELEGRAM MESSAGE FORMATTING FUNCTIONS
// Replace existing formatSingleStockAlert, formatAlertMessage,
// formatMultipleStocksMessage functions with their improved versions

// 5. UPDATE SENDTELEGRAMMESSAGE FUNCTION - Add status tracking to the function
async function sendTelegramMessage(message, options = {}) {
  if (!botToken || !chatId) {
    console.warn('Telegram bot token or chat ID not provided. Cannot send message.');
    return false;
  }
  
  try {
    const result = await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      ...options
    });
    
    // Record successful message in StatusMonitor
    StatusMonitor.recordTelegramMessageSent();
    
    return true;
  } catch (error) {
    console.error('Error sending Telegram message:', error.message);
    
    // Record error in status monitor
    StatusMonitor.recordError('telegram', error.message);
    
    // Update Telegram status
    StatusMonitor.recordTelegramStatus(false, error.message);
    
    return false;
  }
}

// 6. UPDATE WEBHOOK HANDLING - Record webhooks in status monitor
app.post('/webhook', async (req, res) => {
  // Verify webhook secret
  const providedSecret = req.headers['x-webhook-secret'] || req.query.secret;
  
  if (webhookSecret && providedSecret !== webhookSecret) {
    console.error('Invalid webhook secret provided');
    return res.status(401).json({ success: false, message: 'Invalid webhook secret' });
  }
  
  const webhookData = req.body;
  
  // Add this line to record webhook receipt
  StatusMonitor.recordWebhook();
  
  // Rest of existing webhook handling code...
});

// 7. INITIALIZE STATUS MONITOR - Add this to the startup section
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Initialize StatusMonitor with Telegram status
  try {
    const me = await bot.getMe();
    console.log(`Connected to Telegram as @${me.username}`);
    
    // Update Telegram status to connected
    StatusMonitor.recordTelegramStatus(true);
    
    // Rest of existing startup code...
  } catch (error) {
    console.error('Failed to connect to Telegram:', error);
    
    // Update Telegram status to disconnected with error
    StatusMonitor.recordTelegramStatus(false, error.message);
    
    // Rest of existing error handling...
  }
});

// 8. SET UP DAILY RESET FOR COUNTERS
// Add this to the schedule jobs section
schedule.scheduleJob('0 0 * * *', function() {
  console.log('Resetting daily counters');
  StatusMonitor.resetDailyCounters();
}); 