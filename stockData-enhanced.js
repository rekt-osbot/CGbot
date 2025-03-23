/**
 * Enhanced Stock Data Service
 * Fetches real stock data from Yahoo Finance API and provides comprehensive information
 */
const axios = require('axios');
const https = require('https');
const statusMonitor = require('./status.js');

// Add stock data tracking method to statusMonitor if it doesn't exist
if (!statusMonitor.recordStockDataFetch) {
  /**
   * Record stock data fetch attempt
   * @param {string} symbol Stock symbol
   * @param {boolean} success Whether the fetch was successful
   * @param {Error|null} error Error object if fetch failed
   */
  statusMonitor.recordStockDataFetch = function(symbol, success, errorMessage = null) {
    try {
      // Initialize stockData tracking if it doesn't exist
      if (!this.statusData.stockData) {
        this.statusData.stockData = {
          total: 0,
          successful: 0,
          failed: 0,
          recent: []
        };
      }
      
      // Update counters
      this.statusData.stockData.total++;
      if (success) {
        this.statusData.stockData.successful++;
      } else {
        this.statusData.stockData.failed++;
      }
      
      // Record to recent list (max 10 items)
      this.statusData.stockData.recent.unshift({
        symbol,
        success,
        errorMessage,
        timestamp: new Date().toISOString()
      });
      
      // Trim list if needed
      if (this.statusData.stockData.recent.length > 10) {
        this.statusData.stockData.recent = this.statusData.stockData.recent.slice(0, 10);
      }
      
      // Save
      this._saveStatus();
    } catch (error) {
      console.error('Error recording stock data fetch:', error);
    }
  };
}

class EnhancedStockDataService {
  constructor() {
    // Create a reusable axios instance with proper configs
    this.yahooClient = axios.create({
      timeout: 10000,
      httpsAgent: new https.Agent({ keepAlive: true }),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
      }
    });
    
    // Cache to store API responses
    this.cache = {
      quotes: new Map(),
      summary: new Map(),
      history: new Map()
    };
    
    // Cache expiration time (15 minutes for regular market hours, 60 minutes outside)
    this.cacheExpiryMs = 15 * 60 * 1000;
    
    // Track API calls for rate limiting
    this.apiCalls = {
      count: 0,
      resetTime: Date.now() + 60000
    };
  }
  
  /**
   * Get current information for a stock symbol from Yahoo Finance
   * @param {string} symbol - The stock symbol to look up
   * @returns {Promise<Object>} Object with comprehensive stock data
   */
  async getCurrentStockInfo(symbol) {
    try {
      // For test symbols, return simulated data
      if (symbol === 'SIMULATED.TEST' || symbol === 'REAL.TEST') {
        return this.getSimulatedStockData(symbol);
      }
      
      // Add .NS suffix if it's an Indian stock without extension
      const formattedSymbol = this.formatSymbol(symbol);
      
      // Check cache first
      const cacheKey = formattedSymbol;
      const cachedData = this.cache.quotes.get(cacheKey);
      
      if (cachedData && (Date.now() - cachedData.timestamp) < this.cacheExpiryMs) {
        return cachedData.data;
      }
      
      // Respect rate limits (max 100 calls per minute to Yahoo Finance)
      await this.respectRateLimits();
      
      // Fetch from Yahoo Finance API
      const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${formattedSymbol}`;
      
      const response = await this.yahooClient.get(quoteUrl);
      
      if (!response.data || !response.data.quoteResponse || !response.data.quoteResponse.result || response.data.quoteResponse.result.length === 0) {
        throw new Error(`No data found for symbol: ${formattedSymbol}`);
      }
      
      const quoteData = response.data.quoteResponse.result[0];
      
      // Fetch summary data in parallel for additional information
      const summaryData = await this.getStockSummary(formattedSymbol);
      
      // Calculate SMA and other technical indicators from historical data
      const technicalData = await this.calculateTechnicalIndicators(formattedSymbol);
      
      // Format the response
      const stockInfo = {
        symbol: quoteData.symbol,
        shortName: quoteData.shortName || quoteData.longName || symbol,
        open: quoteData.regularMarketOpen,
        high: quoteData.regularMarketDayHigh,
        low: quoteData.regularMarketDayLow,
        close: quoteData.regularMarketPrice,
        previousClose: quoteData.regularMarketPreviousClose,
        volume: quoteData.regularMarketVolume,
        avgVolume: quoteData.averageDailyVolume10Day,
        marketCap: quoteData.marketCap,
        pe: quoteData.trailingPE,
        eps: quoteData.epsTrailingTwelveMonths,
        dividend: quoteData.dividendRate,
        yield: quoteData.dividendYield,
        exchange: quoteData.fullExchangeName,
        currency: quoteData.currency,
        timestamp: new Date(quoteData.regularMarketTime * 1000).toISOString(),
        change: quoteData.regularMarketChange,
        changePercent: quoteData.regularMarketChangePercent,
        dayRange: `${quoteData.regularMarketDayLow} - ${quoteData.regularMarketDayHigh}`,
        fiftyTwoWeekRange: `${quoteData.fiftyTwoWeekLow} - ${quoteData.fiftyTwoWeekHigh}`,
        fiftyTwoWeekHighChangePercent: quoteData.fiftyTwoWeekHighChangePercent,
        fiftyTwoWeekLowChangePercent: quoteData.fiftyTwoWeekLowChangePercent,
        
        // Additional data from summary endpoint
        beta: summaryData?.beta,
        sector: summaryData?.sector,
        industry: summaryData?.industry,
        
        // Technical indicators
        sma20: technicalData?.sma20,
        sma50: technicalData?.sma50,
        sma200: technicalData?.sma200,
        rsi14: technicalData?.rsi,
        volumeRatio: technicalData?.volumeRatio
      };
      
      // Cache the result
      this.cache.quotes.set(cacheKey, {
        data: stockInfo,
        timestamp: Date.now()
      });
      
      // Record to status monitor using the singleton instance
      statusMonitor.recordStockDataFetch(symbol, true);
      
      return stockInfo;
    } catch (error) {
      console.error(`Error fetching data for ${symbol}:`, error);
      statusMonitor.recordError('stock_data', `Failed to fetch data for ${symbol}: ${error.message}`);
      statusMonitor.recordStockDataFetch(symbol, false, error.message);
      return null;
    }
  }
  
  /**
   * Format symbol for Yahoo Finance API
   * @param {string} symbol - Input symbol
   * @returns {string} - Formatted symbol
   */
  formatSymbol(symbol) {
    // If the symbol already has an exchange suffix, return as is
    if (symbol.includes('.')) {
      return symbol;
    }
    
    // For Indian stocks, add .NS (NSE) suffix
    return `${symbol}.NS`;
  }
  
  /**
   * Get summary information for a stock
   * @param {string} symbol - The stock symbol
   * @returns {Promise<Object>} Summary data
   */
  async getStockSummary(symbol) {
    try {
      // Check cache first
      const cacheKey = symbol;
      const cachedData = this.cache.summary.get(cacheKey);
      
      if (cachedData && (Date.now() - cachedData.timestamp) < this.cacheExpiryMs) {
        return cachedData.data;
      }
      
      // Respect rate limits
      await this.respectRateLimits();
      
      const summaryUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=assetProfile,defaultKeyStatistics`;
      
      const response = await this.yahooClient.get(summaryUrl);
      
      if (!response.data || !response.data.quoteSummary || !response.data.quoteSummary.result || response.data.quoteSummary.result.length === 0) {
        return null;
      }
      
      const result = response.data.quoteSummary.result[0];
      const assetProfile = result.assetProfile || {};
      const keyStats = result.defaultKeyStatistics || {};
      
      const summaryData = {
        sector: assetProfile.sector,
        industry: assetProfile.industry,
        beta: keyStats.beta?.raw,
        forwardPE: keyStats.forwardPE?.raw,
        pegRatio: keyStats.pegRatio?.raw,
        bookValue: keyStats.bookValue?.raw,
        priceToBook: keyStats.priceToBook?.raw
      };
      
      // Cache the result
      this.cache.summary.set(cacheKey, {
        data: summaryData,
        timestamp: Date.now()
      });
      
      return summaryData;
    } catch (error) {
      console.error(`Error fetching summary for ${symbol}:`, error);
      return null;
    }
  }
  
  /**
   * Get historical price data for a stock
   * @param {string} symbol - The stock symbol
   * @param {string} interval - Data interval (1d, 1wk, 1mo)
   * @param {number} range - Data range in days
   * @returns {Promise<Array>} Historical price data
   */
  async getHistoricalData(symbol, interval = '1d', range = 60) {
    try {
      // Format symbol
      const formattedSymbol = this.formatSymbol(symbol);
      
      // Check cache first
      const cacheKey = `${formattedSymbol}_${interval}_${range}`;
      const cachedData = this.cache.history.get(cacheKey);
      
      if (cachedData && (Date.now() - cachedData.timestamp) < this.cacheExpiryMs) {
        return cachedData.data;
      }
      
      // Respect rate limits
      await this.respectRateLimits();
      
      // Convert range to Yahoo Finance format (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max)
      let yahooRange = '1mo';
      if (range <= 5) yahooRange = '5d';
      else if (range <= 30) yahooRange = '1mo';
      else if (range <= 90) yahooRange = '3mo';
      else if (range <= 180) yahooRange = '6mo';
      else if (range <= 365) yahooRange = '1y';
      else yahooRange = '2y';
      
      const historyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${formattedSymbol}?interval=${interval}&range=${yahooRange}`;
      
      const response = await this.yahooClient.get(historyUrl);
      
      if (!response.data || !response.data.chart || !response.data.chart.result || response.data.chart.result.length === 0) {
        throw new Error(`No historical data found for symbol: ${formattedSymbol}`);
      }
      
      const result = response.data.chart.result[0];
      const timestamps = result.timestamp;
      const ohlc = result.indicators.quote[0];
      const adjClose = result.indicators.adjclose ? result.indicators.adjclose[0].adjclose : null;
      
      // Format the response
      const historicalData = timestamps.map((timestamp, i) => {
        return {
          date: new Date(timestamp * 1000).toISOString(),
          open: ohlc.open[i],
          high: ohlc.high[i],
          low: ohlc.low[i],
          close: ohlc.close[i],
          adjClose: adjClose ? adjClose[i] : ohlc.close[i],
          volume: ohlc.volume[i]
        };
      });
      
      // Cache the result
      this.cache.history.set(cacheKey, {
        data: historicalData,
        timestamp: Date.now()
      });
      
      return historicalData;
    } catch (error) {
      console.error(`Error fetching historical data for ${symbol}:`, error);
      statusMonitor.recordError('stock_data', `Failed to fetch historical data for ${symbol}: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Calculate technical indicators from historical data
   * @param {string} symbol - Stock symbol
   * @returns {Promise<Object>} Technical indicators
   */
  async calculateTechnicalIndicators(symbol) {
    try {
      // Get historical data
      const historicalData = await this.getHistoricalData(symbol);
      
      if (!historicalData || historicalData.length === 0) {
        return null;
      }
      
      // Calculate SMAs
      const sma20 = this.calculateSMA(historicalData, 20);
      const sma50 = this.calculateSMA(historicalData, 50);
      const sma200 = this.calculateSMA(historicalData, 200);
      
      // Calculate RSI (14-day)
      const rsi = this.calculateRSI(historicalData, 14);
      
      // Calculate volume ratio (current volume / average volume)
      const currentVolume = historicalData[historicalData.length - 1].volume;
      const avgVolume = this.calculateAvgVolume(historicalData, 10);
      const volumeRatio = currentVolume / avgVolume;
      
      return {
        sma20,
        sma50,
        sma200,
        rsi,
        volumeRatio
      };
    } catch (error) {
      console.error(`Error calculating technical indicators for ${symbol}:`, error);
      return null;
    }
  }
  
  /**
   * Calculate Simple Moving Average
   * @param {Array} data - Historical price data
   * @param {number} period - SMA period
   * @returns {number} SMA value
   */
  calculateSMA(data, period) {
    if (data.length < period) {
      return null;
    }
    
    const prices = data.slice(-period).map(item => item.close);
    const sum = prices.reduce((total, price) => total + price, 0);
    return sum / period;
  }
  
  /**
   * Calculate Relative Strength Index
   * @param {Array} data - Historical price data
   * @param {number} period - RSI period
   * @returns {number} RSI value
   */
  calculateRSI(data, period) {
    if (data.length < period + 1) {
      return null;
    }
    
    const prices = data.map(item => item.close);
    let gains = 0;
    let losses = 0;
    
    // Calculate first average gain and loss
    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change >= 0) {
        gains += change;
      } else {
        losses -= change;
      }
    }
    
    let avgGain = gains / period;
    let avgLoss = losses / period;
    
    // Calculate RSI using Wilder's smoothing method
    for (let i = period + 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      let currentGain = 0;
      let currentLoss = 0;
      
      if (change >= 0) {
        currentGain = change;
      } else {
        currentLoss = -change;
      }
      
      avgGain = ((avgGain * (period - 1)) + currentGain) / period;
      avgLoss = ((avgLoss * (period - 1)) + currentLoss) / period;
    }
    
    if (avgLoss === 0) {
      return 100;
    }
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
  
  /**
   * Calculate average volume
   * @param {Array} data - Historical price data
   * @param {number} period - Period for avg volume
   * @returns {number} Average volume
   */
  calculateAvgVolume(data, period) {
    if (data.length < period) {
      return null;
    }
    
    const volumes = data.slice(-period).map(item => item.volume);
    const sum = volumes.reduce((total, volume) => total + volume, 0);
    return sum / period;
  }
  
  /**
   * Get 20-day Simple Moving Average for a stock
   * @param {string} symbol - Stock symbol to get SMA for
   * @returns {Promise<number>} The 20-day SMA value
   */
  async get20DaySMA(symbol) {
    try {
      if (symbol === 'SIMULATED.TEST') {
        return 95; // Lower than the current price for test symbol
      }
      
      // Get technical indicators which include SMA20
      const stockInfo = await this.getCurrentStockInfo(symbol);
      return stockInfo?.sma20 || null;
    } catch (error) {
      console.error(`Error calculating 20-day SMA for ${symbol}:`, error);
      return null;
    }
  }
  
  /**
   * Respect rate limits for Yahoo Finance API
   * @returns {Promise<void>}
   */
  async respectRateLimits() {
    // Reset counter if it's time
    if (Date.now() > this.apiCalls.resetTime) {
      this.apiCalls.count = 0;
      this.apiCalls.resetTime = Date.now() + 60000; // Reset every minute
    }
    
    // Increment counter
    this.apiCalls.count++;
    
    // If approaching rate limit (100 calls per minute), add delay
    if (this.apiCalls.count > 80) {
      // Calculate remaining time in current window
      const remainingMs = this.apiCalls.resetTime - Date.now();
      const delayMs = Math.max(remainingMs / (100 - this.apiCalls.count), 50);
      
      // Add delay
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  /**
   * Search for stocks by query
   * @param {string} query - Search query
   * @returns {Promise<Array>} Matching stocks
   */
  async searchStocks(query) {
    try {
      // Respect rate limits
      await this.respectRateLimits();
      
      const searchUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`;
      
      const response = await this.yahooClient.get(searchUrl);
      
      if (!response.data || !response.data.quotes) {
        return [];
      }
      
      return response.data.quotes.map(quote => ({
        symbol: quote.symbol,
        name: quote.shortname || quote.longname,
        exchange: quote.exchDisp,
        type: quote.quoteType
      }));
    } catch (error) {
      console.error(`Error searching for stocks with query: ${query}`, error);
      return [];
    }
  }
  
  /**
   * Get sector performance
   * @returns {Promise<Array>} Sector performance data
   */
  async getSectorPerformance() {
    try {
      // Use ETFs that track different sectors
      const sectorETFs = [
        { symbol: 'XLF', name: 'Financial' },
        { symbol: 'XLK', name: 'Technology' },
        { symbol: 'XLE', name: 'Energy' },
        { symbol: 'XLV', name: 'Healthcare' },
        { symbol: 'XLI', name: 'Industrial' },
        { symbol: 'XLP', name: 'Consumer Staples' },
        { symbol: 'XLY', name: 'Consumer Discretionary' },
        { symbol: 'XLB', name: 'Materials' },
        { symbol: 'XLU', name: 'Utilities' },
        { symbol: 'XLRE', name: 'Real Estate' }
      ];
      
      const sectorData = await Promise.all(
        sectorETFs.map(async (sector) => {
          const data = await this.getCurrentStockInfo(sector.symbol);
          return {
            sector: sector.name,
            change: data?.changePercent || 0
          };
        })
      );
      
      // Sort by performance
      return sectorData.sort((a, b) => b.change - a.change);
    } catch (error) {
      console.error('Error fetching sector performance:', error);
      return [];
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
        shortName: 'Simulated Test Stock',
        open: basePrice,
        low: basePrice, // Open equals low
        high: basePrice * 1.05,
        close: basePrice * 1.03, // Trading up from open
        previousClose: basePrice * 0.98,
        volume: 500000,
        avgVolume: 300000,
        marketCap: 5000000000,
        pe: 15.5,
        eps: 6.45,
        dividend: 1.2,
        yield: 0.012,
        sma20: 95,
        sma50: 92,
        sma200: 85,
        rsi14: 65,
        volumeRatio: 1.67,
        sector: 'Technology',
        industry: 'Software',
        change: 3,
        changePercent: 3,
        timestamp: new Date().toISOString(),
        dayRange: '100.00 - 105.00',
        fiftyTwoWeekRange: '80.00 - 120.00'
      };
    } else {
      // Regular test symbol with random data
      const basePrice = 500;
      const open = basePrice * (1 + (Math.random() * 0.02 - 0.01));
      
      return {
        symbol,
        shortName: 'Real Test Stock',
        open,
        low: open * 0.98,
        high: open * 1.03,
        close: open * 1.01,
        previousClose: open * 0.99,
        volume: 250000,
        avgVolume: 220000,
        marketCap: 10000000000,
        pe: 22.3,
        eps: 22.42,
        dividend: 0,
        yield: 0,
        sma20: open * 0.97,
        sma50: open * 0.95,
        sma200: open * 0.9,
        rsi14: 55,
        volumeRatio: 1.14,
        sector: 'Financial',
        industry: 'Banking',
        change: open * 0.01,
        changePercent: 1,
        timestamp: new Date().toISOString(),
        dayRange: `${(open * 0.98).toFixed(2)} - ${(open * 1.03).toFixed(2)}`,
        fiftyTwoWeekRange: `${(open * 0.8).toFixed(2)} - ${(open * 1.2).toFixed(2)}`
      };
    }
  }
}

// Export as singleton
module.exports = new EnhancedStockDataService(); 