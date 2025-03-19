/**
 * Analytics Module
 * Tracks and analyzes stock alert performance over time
 */
const fs = require('fs');
const path = require('path');

class Analytics {
  constructor() {
    this.dataDir = path.join(__dirname, 'data');
    this.analyticsFile = path.join(this.dataDir, 'performance_analytics.json');
    
    // Performance data structure
    this.data = {
      scanPerformance: {}, // Performance by scan type
      symbolPerformance: {}, // Performance by stock symbol
      dailyPerformance: {}, // Performance by date
      totalAlerts: 0,
      successRate: 0,
      avgGain: 0,
      avgLoss: 0,
      bestPerformer: null,
      worstPerformer: null,
      lastUpdated: null
    };
    
    // Create data directory if it doesn't exist
    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch (error) {
        console.error('Error creating data directory:', error);
      }
    }
    
    this.loadData();
  }
  
  /**
   * Load analytics data from disk
   */
  loadData() {
    try {
      if (fs.existsSync(this.analyticsFile)) {
        const fileData = fs.readFileSync(this.analyticsFile, 'utf8');
        if (fileData) {
          this.data = JSON.parse(fileData);
          console.log(`Loaded analytics data: ${this.data.totalAlerts} alerts tracked`);
        }
      } else {
        console.log('No previous analytics data found');
      }
    } catch (error) {
      console.error('Error loading analytics data:', error);
    }
  }
  
  /**
   * Save analytics data to disk
   */
  saveData() {
    try {
      fs.writeFileSync(this.analyticsFile, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('Error saving analytics data:', error);
    }
  }
  
  /**
   * Track a new stock alert
   * @param {Object} stockData Stock data to track
   */
  trackAlert(stockData) {
    try {
      const { 
        symbol, 
        alertPrice, 
        currentPrice, 
        scanName = 'Unknown',
        stopLoss,
        openPrice
      } = stockData;
      
      if (!symbol || !alertPrice) {
        console.warn('Invalid stock data for analytics tracking:', stockData);
        return;
      }
      
      const today = new Date().toISOString().split('T')[0];
      const stockKey = symbol.toUpperCase();
      const scanKey = (scanName || 'Unknown').trim();
      
      // Initialize structures if needed
      if (!this.data.symbolPerformance[stockKey]) {
        this.data.symbolPerformance[stockKey] = {
          totalAlerts: 0,
          wins: 0,
          losses: 0,
          stoppedOut: 0,
          avgPerformance: 0,
          bestGain: 0,
          worstLoss: 0,
          lastAlertDate: today,
          lastPerformance: 0
        };
      }
      
      if (!this.data.scanPerformance[scanKey]) {
        this.data.scanPerformance[scanKey] = {
          totalAlerts: 0,
          wins: 0,
          losses: 0,
          stoppedOut: 0,
          avgPerformance: 0,
          bestGain: 0,
          worstLoss: 0
        };
      }
      
      if (!this.data.dailyPerformance[today]) {
        this.data.dailyPerformance[today] = {
          totalAlerts: 0,
          wins: 0,
          losses: 0,
          stoppedOut: 0,
          avgPerformance: 0
        };
      }
      
      // Calculate performance
      const percentChange = ((currentPrice - alertPrice) / alertPrice) * 100;
      const hitStopLoss = stopLoss && currentPrice <= stopLoss;
      
      // Update symbol performance
      const symbolData = this.data.symbolPerformance[stockKey];
      symbolData.totalAlerts++;
      symbolData.lastAlertDate = today;
      symbolData.lastPerformance = percentChange;
      
      if (hitStopLoss) {
        symbolData.stoppedOut++;
      } else if (percentChange > 0) {
        symbolData.wins++;
        if (percentChange > symbolData.bestGain) {
          symbolData.bestGain = percentChange;
        }
      } else {
        symbolData.losses++;
        if (percentChange < symbolData.worstLoss) {
          symbolData.worstLoss = percentChange;
        }
      }
      
      // Recalculate average
      symbolData.avgPerformance = ((symbolData.avgPerformance * (symbolData.totalAlerts - 1)) + percentChange) / symbolData.totalAlerts;
      
      // Update scan performance
      const scanData = this.data.scanPerformance[scanKey];
      scanData.totalAlerts++;
      
      if (hitStopLoss) {
        scanData.stoppedOut++;
      } else if (percentChange > 0) {
        scanData.wins++;
        if (percentChange > scanData.bestGain) {
          scanData.bestGain = percentChange;
        }
      } else {
        scanData.losses++;
        if (percentChange < scanData.worstLoss) {
          scanData.worstLoss = percentChange;
        }
      }
      
      // Recalculate average
      scanData.avgPerformance = ((scanData.avgPerformance * (scanData.totalAlerts - 1)) + percentChange) / scanData.totalAlerts;
      
      // Update daily performance
      const dailyData = this.data.dailyPerformance[today];
      dailyData.totalAlerts++;
      
      if (hitStopLoss) {
        dailyData.stoppedOut++;
      } else if (percentChange > 0) {
        dailyData.wins++;
      } else {
        dailyData.losses++;
      }
      
      // Recalculate daily average
      dailyData.avgPerformance = ((dailyData.avgPerformance * (dailyData.totalAlerts - 1)) + percentChange) / dailyData.totalAlerts;
      
      // Update overall metrics
      this.data.totalAlerts++;
      this.data.lastUpdated = new Date().toISOString();
      
      // Only save periodically to reduce I/O
      if (this.data.totalAlerts % 5 === 0) {
        this.recalculateOverallMetrics();
        this.saveData();
      }
    } catch (error) {
      console.error('Error tracking alert for analytics:', error);
    }
  }
  
  /**
   * Update multiple stocks with their current performance
   * @param {Object} stocksData - Object containing tracked stocks data
   */
  updatePerformance(stocksData) {
    try {
      if (!stocksData || typeof stocksData !== 'object') {
        console.warn('Invalid stocks data for analytics update');
        return;
      }
      
      // Track each stock's current performance
      Object.values(stocksData).forEach(stock => {
        this.trackAlert(stock);
      });
      
      // Recalculate overall metrics and save
      this.recalculateOverallMetrics();
      this.saveData();
    } catch (error) {
      console.error('Error updating performance:', error);
    }
  }
  
  /**
   * Recalculate overall metrics
   */
  recalculateOverallMetrics() {
    try {
      // Calculate total wins and losses
      let totalWins = 0;
      let totalLosses = 0;
      let sumGains = 0;
      let sumLosses = 0;
      let gainCount = 0;
      let lossCount = 0;
      
      // Find best and worst performers
      let bestPerformer = { symbol: null, performance: -Infinity };
      let worstPerformer = { symbol: null, performance: Infinity };
      
      // Analyze symbol performance
      Object.entries(this.data.symbolPerformance).forEach(([symbol, data]) => {
        totalWins += data.wins;
        totalLosses += data.losses;
        
        if (data.avgPerformance > 0) {
          sumGains += data.avgPerformance;
          gainCount++;
        } else {
          sumLosses += data.avgPerformance;
          lossCount++;
        }
        
        // Check if this is the best performer
        if (data.avgPerformance > bestPerformer.performance) {
          bestPerformer = {
            symbol,
            performance: data.avgPerformance,
            wins: data.wins,
            losses: data.losses,
            alerts: data.totalAlerts
          };
        }
        
        // Check if this is the worst performer
        if (data.avgPerformance < worstPerformer.performance) {
          worstPerformer = {
            symbol,
            performance: data.avgPerformance,
            wins: data.wins,
            losses: data.losses,
            alerts: data.totalAlerts
          };
        }
      });
      
      // Update overall metrics
      this.data.successRate = totalWins / (totalWins + totalLosses) * 100;
      this.data.avgGain = gainCount > 0 ? sumGains / gainCount : 0;
      this.data.avgLoss = lossCount > 0 ? sumLosses / lossCount : 0;
      this.data.bestPerformer = bestPerformer.symbol ? bestPerformer : null;
      this.data.worstPerformer = worstPerformer.symbol ? worstPerformer : null;
    } catch (error) {
      console.error('Error recalculating metrics:', error);
    }
  }
  
  /**
   * Get analytics data for a specific period
   * @param {string} period - 'day', 'week', 'month', or 'all'
   * @returns {Object} Performance analytics
   */
  getAnalytics(period = 'all') {
    try {
      // For specific periods, filter the data
      if (period !== 'all') {
        const today = new Date();
        const filteredData = { ...this.data };
        
        // Filter daily performance
        const filteredDailyPerformance = {};
        let cutoffDate;
        
        if (period === 'day') {
          cutoffDate = new Date(today);
        } else if (period === 'week') {
          cutoffDate = new Date(today);
          cutoffDate.setDate(cutoffDate.getDate() - 7);
        } else if (period === 'month') {
          cutoffDate = new Date(today);
          cutoffDate.setMonth(cutoffDate.getMonth() - 1);
        }
        
        const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
        
        // Filter daily data
        Object.entries(this.data.dailyPerformance).forEach(([date, data]) => {
          if (date >= cutoffDateStr) {
            filteredDailyPerformance[date] = data;
          }
        });
        
        filteredData.dailyPerformance = filteredDailyPerformance;
        return filteredData;
      }
      
      // Return all data
      return this.data;
    } catch (error) {
      console.error('Error getting analytics:', error);
      return { error: 'Failed to retrieve analytics data' };
    }
  }
  
  /**
   * Get a summary of analytics for display
   * @param {string} period - 'day', 'week', 'month', or 'all'
   * @returns {Object} Summarized analytics
   */
  getSummary(period = 'all') {
    try {
      const analytics = this.getAnalytics(period);
      
      // Get top 5 performing scans
      const topScans = Object.entries(analytics.scanPerformance)
        .filter(([_, data]) => data.totalAlerts >= 3) // At least 3 alerts to be significant
        .sort((a, b) => b[1].avgPerformance - a[1].avgPerformance)
        .slice(0, 5)
        .map(([name, data]) => ({
          name,
          performance: data.avgPerformance,
          successRate: (data.wins / (data.wins + data.losses)) * 100,
          alerts: data.totalAlerts
        }));
      
      // Get top 5 performing stocks
      const topStocks = Object.entries(analytics.symbolPerformance)
        .filter(([_, data]) => data.totalAlerts >= 2) // At least 2 alerts to be significant
        .sort((a, b) => b[1].avgPerformance - a[1].avgPerformance)
        .slice(0, 5)
        .map(([symbol, data]) => ({
          symbol,
          performance: data.avgPerformance,
          successRate: (data.wins / (data.wins + data.losses)) * 100,
          alerts: data.totalAlerts
        }));
      
      // Chart data for daily performance
      const dailyData = Object.entries(analytics.dailyPerformance)
        .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
        .map(([date, data]) => ({
          date,
          performance: data.avgPerformance,
          alerts: data.totalAlerts,
          successRate: (data.wins / (data.totalAlerts - data.stoppedOut)) * 100
        }));
      
      return {
        period,
        totalAlerts: analytics.totalAlerts,
        successRate: analytics.successRate,
        avgGain: analytics.avgGain,
        avgLoss: analytics.avgLoss,
        bestPerformer: analytics.bestPerformer,
        worstPerformer: analytics.worstPerformer,
        topScans,
        topStocks,
        dailyData,
        lastUpdated: analytics.lastUpdated
      };
    } catch (error) {
      console.error('Error getting analytics summary:', error);
      return { error: 'Failed to generate analytics summary' };
    }
  }
}

// Export as singleton
module.exports = new Analytics(); 