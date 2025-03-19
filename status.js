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
    
    // Schedule periodic status saving
    setInterval(() => this.saveStatus(), 5 * 60 * 1000); // Save every 5 minutes
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
  }
  
  /**
   * Record an error that occurred
   * @param {string} context - Where the error occurred
   * @param {Error} error - The error object
   */
  recordError(context, error) {
    try {
      // Determine error type
      if (context.includes('Telegram')) {
        this.metrics.telegramErrors++;
      } else if (context.includes('data') || context.includes('fetch')) {
        this.metrics.dataFetchErrors++;
      }
      
      // Add to errors list
      this.errors.unshift({
        timestamp: new Date().toISOString(),
        context,
        message: error.message,
        stack: error.stack
      });
      
      // Keep only the last 50 errors
      if (this.errors.length > 50) {
        this.errors = this.errors.slice(0, 50);
      }
      
      // Always save when errors occur
      this.saveStatus();
      
      console.error(`${context}:`, error);
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
}

// Export as singleton
module.exports = new StatusMonitor(); 