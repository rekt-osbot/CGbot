/**
 * Stock Data Service
 * Handles fetching stock data from various sources
 */
const axios = require('axios');

class StockDataService {
  /**
   * Get current information for a stock symbol
   * @param {string} symbol - The stock symbol to look up
   * @returns {Promise<Object>} Object with stock data
   */
  async getCurrentStockInfo(symbol) {
    try {
      // For test symbols, return simulated data
      if (symbol === 'SIMULATED.TEST' || symbol === 'REAL.TEST') {
        return this.getSimulatedStockData(symbol);
      }
      
      // In a real implementation, you'd connect to an API here
      // For this version, we'll generate some semi-random data
      const basePrice = this.generateBasePriceFromSymbol(symbol);
      
      // Generate open, high, low, close prices that make sense
      const open = basePrice * (1 + (Math.random() * 0.02 - 0.01));
      const high = open * (1 + Math.random() * 0.03);
      const low = open * (1 - Math.random() * 0.02);
      const close = low + Math.random() * (high - low);
      const volume = Math.floor(Math.random() * 1000000) + 100000;
      
      return {
        symbol,
        open,
        high, 
        low,
        close,
        volume,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Error fetching data for ${symbol}:`, error);
      return null;
    }
  }
  
  /**
   * Generate a base price from a stock symbol
   * Just for demo purposes
   */
  generateBasePriceFromSymbol(symbol) {
    // Sum the character codes in the symbol to get a consistent base
    let base = 0;
    for (let i = 0; i < symbol.length; i++) {
      base += symbol.charCodeAt(i);
    }
    
    // Scale to a reasonable price range (₹100 - ₹5000)
    return 100 + (base % 49) * 100;
  }
  
  /**
   * Get 20-day Simple Moving Average for a stock
   * @param {string} symbol - Stock symbol to get SMA for
   * @returns {Promise<number>} The 20-day SMA value
   */
  async get20DaySMA(symbol) {
    try {
      // In a real implementation, you'd fetch historical data
      // For this version, we'll simulate it based on the current price
      
      if (symbol === 'SIMULATED.TEST') {
        return 95; // Lower than the current price for test symbol
      }
      
      // Get current info to calculate a somewhat realistic SMA
      const stockInfo = await this.getCurrentStockInfo(symbol);
      if (!stockInfo) return null;
      
      // SMA is typically a bit lower than the current price in an uptrend
      // or higher in a downtrend, but for simulation we'll make it
      // slightly lower than the low price
      const sma20 = stockInfo.low * (0.97 + Math.random() * 0.05);
      
      return sma20;
    } catch (error) {
      console.error(`Error calculating 20-day SMA for ${symbol}:`, error);
      return null;
    }
  }
  
  /**
   * Simulate stock data for testing
   */
  getSimulatedStockData(symbol) {
    if (symbol === 'SIMULATED.TEST') {
      // This is our test symbol that always meets our criteria
      const basePrice = 100;
      
      return {
        symbol,
        open: basePrice,
        low: basePrice, // Open equals low
        high: basePrice * 1.05,
        close: basePrice * 1.03, // Trading up from open
        volume: 500000,
        timestamp: new Date().toISOString()
      };
    } else {
      // Regular test symbol with random data
      const basePrice = 500;
      const open = basePrice * (1 + (Math.random() * 0.02 - 0.01));
      
      return {
        symbol,
        open,
        low: open * 0.98,
        high: open * 1.03,
        close: open * 1.01,
        volume: 250000,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Export as singleton
module.exports = new StockDataService(); 