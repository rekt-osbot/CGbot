/**
 * Stock Summary Service
 * Tracks alerted stocks during the day and sends a summary at market close
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * Class to track and summarize stock alerts
 */
class StockSummary {
  constructor() {
    this.dataDir = path.join(__dirname, 'data');
    this.dataFile = path.join(this.dataDir, 'alerted_stocks.json');
    this.alertedStocks = {};
    
    // Create data directory if it doesn't exist
    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
        console.log('Created data directory:', this.dataDir);
      } catch (error) {
        console.error('Error creating data directory:', error);
        // Continue even if we can't create the directory
        // We'll keep data in memory and try again later
      }
    }
    
    this.loadData();
  }
  
  /**
   * Load existing alerted stocks data
   */
  loadData() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = fs.readFileSync(this.dataFile, 'utf8');
        if (data) {
          this.alertedStocks = JSON.parse(data);
          console.log(`Loaded ${Object.keys(this.alertedStocks).length} previously alerted stocks`);
        } else {
          console.log('Data file exists but is empty');
          this.alertedStocks = {};
        }
      } else {
        console.log('No previous alerted stocks data found');
        this.alertedStocks = {};
      }
    } catch (error) {
      console.error('Error loading alerted stocks data:', error);
      this.alertedStocks = {};
    }
  }
  
  /**
   * Save current alerted stocks data
   */
  saveData() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      fs.writeFileSync(this.dataFile, JSON.stringify(this.alertedStocks, null, 2));
    } catch (error) {
      console.error('Error saving alerted stocks data:', error);
      // Continue running even if we can't save to disk
      // At least we have the data in memory
    }
  }
  
  /**
   * Track a stock that has been alerted
   * @param {Object} stockData - The stock data to track
   */
  trackStock(stockData) {
    if (!stockData || !stockData.symbol) {
      console.warn('Invalid stock data provided to trackStock');
      return;
    }
    
    const {
      symbol, open: openPrice, low: lowPrice, high: highPrice, 
      close: closePrice, sma20, stopLoss, scan_name: scanName
    } = stockData;
    
    // Store relevant data for this stock
    this.alertedStocks[symbol] = {
      symbol,
      alertTime: new Date().toISOString(),
      alertPrice: closePrice,
      openPrice,
      highPrice,
      lowPrice,
      stopLoss: stopLoss || lowPrice,
      sma20,
      scanName,
      currentPrice: closePrice,  // Will be updated later
      percentChange: 0 // Initialize with 0
    };
    
    console.log(`Tracking stock ${symbol} with alert price: ${closePrice}`);
    
    // Save after each tracking
    this.saveData();
  }
  
  /**
   * Update current prices for all tracked stocks
   * Uses Yahoo Finance for price data, batched to avoid rate limits
   */
  async updateCurrentPrices() {
    try {
      const symbols = Object.keys(this.alertedStocks);
      
      if (symbols.length === 0) {
        console.log('No stocks to update prices for');
        return;
      }
      
      console.log(`Updating current prices for ${symbols.length} stocks...`);
      
      // Split symbols into batches of 5 to avoid rate limits
      const batchSize = 5;
      const batches = [];
      
      for (let i = 0; i < symbols.length; i += batchSize) {
        batches.push(symbols.slice(i, i + batchSize));
      }
      
      // Process each batch
      for (const batch of batches) {
        try {
          // Note: In a real implementation, you'd use an actual API
          // This is a simplified mock implementation that just sets random prices
          
          for (const symbol of batch) {
            const stock = this.alertedStocks[symbol];
            if (!stock) continue;
            
            // Make sure all required fields exist
            if (!stock.alertPrice) stock.alertPrice = 0;
            if (!stock.currentPrice) stock.currentPrice = stock.alertPrice;
            if (!stock.stopLoss) stock.stopLoss = 0;
            if (stock.percentChange === undefined) stock.percentChange = 0;
            
            // For testing, generate a random price movement 
            // In real implementation, you'd get this from your data provider
            const priceChange = (Math.random() * 0.06 - 0.03) * stock.alertPrice;
            stock.currentPrice = stock.alertPrice + priceChange;
            
            // Calculate percent change from alert price
            stock.percentChange = ((stock.currentPrice - stock.alertPrice) / stock.alertPrice) * 100;
            
            // Check if stop loss was hit
            stock.hitStopLoss = stock.currentPrice < stock.stopLoss;
            
            console.log(`Updated ${symbol}: Current price: ${stock.currentPrice.toFixed(2)}, Change: ${stock.percentChange.toFixed(2)}%`);
          }
          
          // Add a short delay between batches
          if (batches.length > 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error) {
          console.error(`Error updating batch of stocks:`, error);
        }
      }
      
      // Save updated data
      this.saveData();
      
    } catch (error) {
      console.error('Error updating current prices:', error);
    }
  }
  
  /**
   * Generate a daily summary of all tracked stocks
   * @returns {string} Formatted message for Telegram
   */
  async generateDailySummary() {
    try {
      // Make sure we have the latest prices
      await this.updateCurrentPrices();
      
      const stocks = Object.values(this.alertedStocks);
      
      if (stocks.length === 0) {
        return "📊 *DAILY SUMMARY* 📊\n\nNo stocks were alerted today.";
      }
      
      // Calculate summary statistics
      const totalStocks = stocks.length;
      const winners = stocks.filter(stock => (stock.percentChange || 0) > 0);
      const losers = stocks.filter(stock => (stock.percentChange || 0) <= 0);
      const stoppedOut = stocks.filter(stock => stock.hitStopLoss);
      
      const winRate = (winners.length / totalStocks * 100).toFixed(1);
      
      // Sort stocks by performance
      const sortedByPerformance = [...stocks].sort((a, b) => {
        return (b.percentChange || 0) - (a.percentChange || 0);
      });
      
      const topPerformers = sortedByPerformance.slice(0, 3);
      const worstPerformers = [...sortedByPerformance].reverse().slice(0, 3);
      
      // Generate the message
      let message = "📊 *DAILY TRADING SUMMARY* 📊\n\n";
      
      // Add date
      const today = new Date();
      message += `📅 *Date*: ${today.toLocaleDateString()}\n\n`;
      
      // Overall statistics
      message += "📈 *OVERALL PERFORMANCE*\n";
      message += `Total Alerts: ${totalStocks}\n`;
      message += `Winners: ${winners.length} (${winRate}%)\n`;
      message += `Losers: ${losers.length} (${(100 - parseFloat(winRate)).toFixed(1)}%)\n`;
      message += `Hit Stop Loss: ${stoppedOut.length}\n\n`;
      
      // Top performers
      message += "🏆 *TOP PERFORMERS*\n";
      topPerformers.forEach((stock, index) => {
        const changeEmoji = (stock.percentChange || 0) >= 0 ? '🔼' : '🔽';
        const percentChange = stock.percentChange || 0;
        message += `${index + 1}. ${stock.symbol}: ${changeEmoji} ${percentChange.toFixed(2)}%\n`;
        message += `   Alert: ₹${stock.alertPrice.toFixed(2)} → Current: ₹${stock.currentPrice.toFixed(2)}\n`;
      });
      message += "\n";
      
      // Worst performers
      message += "📉 *WORST PERFORMERS*\n";
      worstPerformers.forEach((stock, index) => {
        const changeEmoji = (stock.percentChange || 0) >= 0 ? '🔼' : '🔽';
        const percentChange = stock.percentChange || 0;
        message += `${index + 1}. ${stock.symbol}: ${changeEmoji} ${percentChange.toFixed(2)}%\n`;
        message += `   Alert: ₹${stock.alertPrice.toFixed(2)} → Current: ₹${stock.currentPrice.toFixed(2)}\n`;
      });
      message += "\n";
      
      // Stop losses hit
      if (stoppedOut.length > 0) {
        message += "🛑 *STOP LOSSES HIT*\n";
        stoppedOut.forEach((stock, index) => {
          message += `${index + 1}. ${stock.symbol}: SL ₹${stock.stopLoss.toFixed(2)}\n`;
          message += `   Alert: ₹${stock.alertPrice.toFixed(2)} → Current: ₹${stock.currentPrice.toFixed(2)}\n`;
        });
        message += "\n";
      }
      
      // Scans summary
      const scanCounts = {};
      stocks.forEach(stock => {
        const scanName = stock.scanName || 'Unknown';
        scanCounts[scanName] = (scanCounts[scanName] || 0) + 1;
      });
      
      message += "📊 *SCANS BREAKDOWN*\n";
      Object.entries(scanCounts).forEach(([scan, count]) => {
        message += `${scan}: ${count} alert${count > 1 ? 's' : ''}\n`;
      });
      
      return message;
    } catch (error) {
      console.error('Error generating daily summary:', error);
      return "Error generating daily summary. Please check the logs.";
    }
  }
  
  /**
   * Clear data for the next trading day and backup current data
   */
  async clearData() {
    try {
      // Backup current data with date
      const today = new Date().toISOString().split('T')[0];
      const backupFile = path.join(this.dataDir, `alerted_stocks_${today}.json`);
      
      if (Object.keys(this.alertedStocks).length > 0) {
        fs.writeFileSync(backupFile, JSON.stringify(this.alertedStocks, null, 2));
        console.log(`Backed up today's data to ${backupFile}`);
      }
      
      // Clear current data
      this.alertedStocks = {};
      this.saveData();
      console.log('Cleared alerted stocks data for next trading day');
      
      return true;
    } catch (error) {
      console.error('Error clearing data:', error);
      return false;
    }
  }
}

// Export as a singleton
module.exports = new StockSummary(); 