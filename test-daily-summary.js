require('dotenv').config();
const StockSummary = require('./stockSummary');
const TelegramBot = require('node-telegram-bot-api');

// Initialize Telegram Bot
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const bot = new TelegramBot(botToken, { polling: false });

async function testDailySummary() {
  try {
    console.log('Generating test daily summary report...');
    
    const summaryMessage = await StockSummary.generateDailySummary();
    console.log('Summary message generated:');
    console.log(summaryMessage);
    
    // Ask if user wants to send to Telegram
    console.log('\nDo you want to send this to Telegram? (Y/n)');
    
    // Wait for user input with a timeout
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    const waitForInput = new Promise((resolve) => {
      process.stdin.once('data', (data) => {
        const input = data.toString().trim().toLowerCase();
        resolve(input !== 'n');
      });
      
      // Auto-send after 10 seconds if no input
      setTimeout(() => {
        console.log('No input received. Auto-sending...');
        resolve(true);
      }, 10000);
    });
    
    const shouldSend = await waitForInput;
    
    if (shouldSend) {
      console.log(`Sending Telegram message to chat ID: ${chatId}`);
      try {
        const result = await bot.sendMessage(chatId, summaryMessage, { parse_mode: 'Markdown' });
        console.log('Telegram message sent successfully:', result.message_id);
      } catch (error) {
        console.error('Failed to send Telegram message:', error.message);
        
        // If it's a parsing error, try again without markdown
        if (error.message.includes('can\'t parse entities')) {
          console.log('Markdown parsing failed, trying without markdown...');
          try {
            const result = await bot.sendMessage(chatId, summaryMessage);
            console.log('Telegram message sent successfully without markdown:', result.message_id);
          } catch (plainError) {
            console.error('Also failed without markdown:', plainError.message);
          }
        }
      }
    } else {
      console.log('Not sending to Telegram.');
    }
    
    // Ask if the user wants to reset the tracked stocks
    console.log('\nDo you want to reset the tracked stocks? (y/N)');
    
    const waitForResetInput = new Promise((resolve) => {
      process.stdin.once('data', (data) => {
        const input = data.toString().trim().toLowerCase();
        resolve(input === 'y');
      });
      
      // Auto-decline after 10 seconds if no input
      setTimeout(() => {
        console.log('No input received. Not resetting tracked stocks.');
        resolve(false);
      }, 10000);
    });
    
    const shouldReset = await waitForResetInput;
    
    if (shouldReset) {
      console.log('Clearing tracked stocks data...');
      await StockSummary.clearData();
      console.log('Data cleared and backed up successfully.');
    } else {
      console.log('Keeping existing tracked stocks data.');
    }
    
  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    // Clean up
    process.stdin.pause();
    process.exit(0);
  }
}

// Run the test
testDailySummary(); 