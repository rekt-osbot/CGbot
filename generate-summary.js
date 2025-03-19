/**
 * Generate a daily summary report
 * Can be run manually or via scheduler
 */
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const StockSummary = require('./stockSummary');
const Analytics = require('./analytics');
const Database = require('./database');
const fs = require('fs');
const path = require('path');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize Telegram Bot
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const bot = new TelegramBot(botToken, { polling: false });

// Send message to Telegram
async function sendMessage(message) {
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
    return false;
  }
}

async function generateAndSendDailySummary() {
  console.log('Generating daily summary...');
  
  try {
    // Connect to database if configured
    await Database.connect();
    
    // Generate the summary
    const summaryMessage = await StockSummary.generateDailySummary();
    
    if (!summaryMessage) {
      console.log('No summary generated. Skipping.');
      return false;
    }
    
    // Store summary in database
    const summaryData = {
      totalAlerts: Object.keys(StockSummary.alertedStocks || {}).length,
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
    const sent = await sendMessage(summaryMessage);
    
    if (sent) {
      console.log('Daily summary sent successfully');
      return true;
    } else {
      console.error('Failed to send daily summary to Telegram');
      return false;
    }
  } catch (error) {
    console.error('Error generating daily summary:', error);
    return false;
  }
}

// Execute immediately when script is run directly
if (require.main === module) {
  generateAndSendDailySummary()
    .then(() => {
      console.log('Summary generation complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('Error in generate-summary script:', err);
      process.exit(1);
    });
}

module.exports = { generateAndSendDailySummary }; 