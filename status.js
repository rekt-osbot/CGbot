/**
 * Status Monitoring Module
 * Tracks system health and performance metrics
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

class StatusMonitor {
  constructor() {
    this.startTime = new Date();
    this.dataDir = path.join(__dirname, 'data');
    this.statusFile = path.join(this.dataDir, 'system_status.json');
    this.lastAlerts = [];
    this.errors = [];
    this.metrics = {
      alertsSent: 0,
      telegramErrors: 0,
      dataFetchErrors: 0,
      webhooksReceived: 0,
      webhooksToday: 0,
      lastWebhookTime: null,
      lastHealthCheck: null
    };
    
    // Create data directory if it doesn't exist
    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch (error) {
        console.error('Error creating data directory:', error);
      }
    }
    
    this.loadStatus();
    
    // Reset daily counts if it's a new day
    this.resetDailyCounts();
    
    // Schedule periodic status saving
    setInterval(() => this.saveStatus(), 5 * 60 * 1000); // Save every 5 minutes
    
    // Schedule daily reset at midnight
    setInterval(() => this.resetDailyCounts(), 60 * 60 * 1000); // Check every hour
  }
  
  /**
   * Reset daily counts if it's a new day
   */
  resetDailyCounts() {
    try {
      const now = new Date();
      const lastReset = this.metrics.lastDailyReset ? new Date(this.metrics.lastDailyReset) : null;
      
      // If we've never reset or it's a new day
      if (!lastReset || now.getDate() !== lastReset.getDate() || 
          now.getMonth() !== lastReset.getMonth() || 
          now.getFullYear() !== lastReset.getFullYear()) {
        
        // Reset daily counts
        this.metrics.webhooksToday = 0;
        this.metrics.lastDailyReset = now.toISOString();
        
        console.log('Daily metrics reset', now.toISOString());
        this.saveStatus();
      }
    } catch (error) {
      console.error('Error resetting daily counts:', error);
    }
  }
  
  /**
   * Load status data from disk
   */
  loadStatus() {
    try {
      if (fs.existsSync(this.statusFile)) {
        const data = fs.readFileSync(this.statusFile, 'utf8');
        if (data) {
          const savedStatus = JSON.parse(data);
          // Only restore certain metrics, keep the start time from this session
          this.metrics = { ...this.metrics, ...savedStatus.metrics };
          this.lastAlerts = savedStatus.lastAlerts || [];
          this.errors = savedStatus.errors || [];
          
          // Trim arrays to prevent unlimited growth
          if (this.lastAlerts.length > 20) this.lastAlerts = this.lastAlerts.slice(-20);
          if (this.errors.length > 50) this.errors = this.errors.slice(-50);
          
          console.log('Status data loaded from disk');
        }
      }
    } catch (error) {
      console.error('Error loading status data:', error);
    }
  }
  
  /**
   * Save status data to disk
   */
  saveStatus() {
    try {
      const statusData = {
        metrics: this.metrics,
        lastAlerts: this.lastAlerts,
        errors: this.errors,
        savedAt: new Date().toISOString()
      };
      
      fs.writeFileSync(this.statusFile, JSON.stringify(statusData, null, 2));
    } catch (error) {
      console.error('Error saving status data:', error);
    }
  }
  
  /**
   * Record a new alert being sent
   * @param {Object} alertData - Information about the alert
   */
  recordAlert(alertData) {
    try {
      this.metrics.alertsSent++;
      
      // Add to recent alerts list
      this.lastAlerts.unshift({
        timestamp: new Date().toISOString(),
        symbols: Array.isArray(alertData) 
          ? alertData.map(a => a.symbol)
          : [alertData.symbol],
        scanName: alertData.scan_name || 'Unknown'
      });
      
      // Keep only the last 20 alerts
      if (this.lastAlerts.length > 20) {
        this.lastAlerts = this.lastAlerts.slice(0, 20);
      }
      
      // Save status periodically, not on every alert to reduce I/O
      if (this.metrics.alertsSent % 10 === 0) {
        this.saveStatus();
      }
    } catch (error) {
      this.recordError('Error recording alert', error);
    }
  }
  
  /**
   * Record an incoming webhook
   */
  recordWebhook() {
    this.metrics.webhooksReceived++;
    this.metrics.webhooksToday++;
    this.metrics.lastWebhookTime = new Date().toISOString();
    
    // Save status occasionally to reduce I/O
    if (this.metrics.webhooksReceived % 10 === 0) {
      this.saveStatus();
    }
  }
  
  /**
   * Record an error that occurred
   * @param {string} type - Type of error (e.g., 'telegram', 'database')
   * @param {Error} error - The error object
   */
  recordError(type, error) {
    try {
      // Determine error type
      if (type.includes('telegram') || type === 'telegram') {
        this.metrics.telegramErrors++;
      } else if (type.includes('data') || type.includes('fetch')) {
        this.metrics.dataFetchErrors++;
      }
      
      // Add to errors list
      this.errors.unshift({
        timestamp: new Date().toISOString(),
        type: type || 'unknown',
        message: error.message || error.toString(),
        stack: error.stack
      });
      
      // Keep only the last 50 errors
      if (this.errors.length > 50) {
        this.errors = this.errors.slice(0, 50);
      }
      
      // Always save when errors occur
      this.saveStatus();
      
      console.error(`${type} error:`, error);
    } catch (err) {
      console.error('Error while recording error:', err);
    }
  }
  
  /**
   * Update health check timestamp
   */
  recordHealthCheck() {
    this.metrics.lastHealthCheck = new Date().toISOString();
  }
  
  /**
   * Get system status information
   * @returns {Object} Status information
   */
  getStatus() {
    const uptime = this.getUptime();
    const systemLoad = os.loadavg();
    const memoryUsage = process.memoryUsage();
    
    return {
      status: 'operational',
      uptime,
      startTime: this.startTime.toISOString(),
      currentTime: new Date().toISOString(),
      metrics: this.metrics,
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        memoryUsage: {
          rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`
        },
        cpuLoad: {
          '1m': systemLoad[0].toFixed(2),
          '5m': systemLoad[1].toFixed(2),
          '15m': systemLoad[2].toFixed(2)
        },
        freeMemory: `${Math.round(os.freemem() / 1024 / 1024)} MB`,
        totalMemory: `${Math.round(os.totalmem() / 1024 / 1024)} MB`
      },
      recentAlerts: this.lastAlerts.slice(0, 5),
      recentErrors: this.errors.slice(0, 5)
    };
  }
  
  /**
   * Get formatted uptime
   * @returns {string} Formatted uptime string
   */
  getUptime() {
    const now = new Date();
    const uptimeMs = now - this.startTime;
    
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
  }
  
  /**
   * Get the total number of webhooks received
   * @returns {number} Total webhooks
   */
  getTotalWebhooks() {
    return this.metrics.webhooksReceived || 0;
  }
  
  /**
   * Get the number of webhooks received today
   * @returns {number} Today's webhooks
   */
  getTodayWebhooks() {
    return this.metrics.webhooksToday || 0;
  }
  
  /**
   * Get recent errors
   * @param {number} limit - Maximum number of errors to return
   * @returns {Array} Recent errors
   */
  getRecentErrors(limit = 10) {
    return this.errors.slice(0, limit);
  }
}

// Export as singleton
module.exports = new StatusMonitor(); 