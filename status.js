/**
 * Status Monitor
 * Enhanced version for more elegant monitoring
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

class StatusMonitor {
  constructor() {
    this.dataDir = path.join(__dirname, 'data');
    this.statusFile = path.join(this.dataDir, 'system_status.json');
    this.maxErrors = 50;
    this.maxRecentAlerts = 10;
    this._ensureDataDir();
    this._initStatusData();
  }

  /**
   * Ensure the data directory exists
   * @private
   */
  _ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch (error) {
        console.error('Failed to create data directory:', error);
      }
    }
  }

  /**
   * Initialize status data
   * @private
   */
  _initStatusData() {
    try {
      if (fs.existsSync(this.statusFile)) {
        const data = fs.readFileSync(this.statusFile, 'utf8');
        this.statusData = JSON.parse(data);
        
        // Make sure we have all required fields
        this._ensureStatusFields();
      } else {
        this.resetStatus();
      }
    } catch (error) {
      console.error('Error initializing status data:', error);
      this.resetStatus();
    }
  }
  
  /**
   * Ensure all required status fields exist
   * @private
   */
  _ensureStatusFields() {
    if (!this.statusData) {
      this.resetStatus();
      return;
    }

    const defaults = {
      startTime: Date.now(),
      errors: [],
      alerts: {
        today: 0,
        total: 0,
        recent: []
      },
      webhooks: {
        today: 0,
        total: 0,
        lastReceived: null
      },
      telegramStatus: {
        connected: false,
        lastSent: null,
        messagesSent: 0,
        lastError: null
      },
      performance: {
        memoryUsage: 0,
        cpuUsage: 0,
        responseTime: 0
      },
      dailySummaries: {
        lastGenerated: null,
        count: 0
      },
      systemInfo: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        hostname: os.hostname()
      }
    };
          
    // Add any missing fields
    for (const [key, value] of Object.entries(defaults)) {
      if (!this.statusData[key]) {
        this.statusData[key] = value;
      }
    }

    this._saveStatus();
  }

  /**
   * Reset status data to defaults
   */
  resetStatus() {
    this.statusData = {
      startTime: Date.now(),
      errors: [],
      alerts: {
        today: 0,
        total: 0,
        recent: []
      },
      webhooks: {
        today: 0,
        total: 0,
        lastReceived: null
      },
      telegramStatus: {
        connected: false,
        lastSent: null,
        messagesSent: 0,
        lastError: null
      },
      performance: {
        memoryUsage: 0,
        cpuUsage: 0,
        responseTime: 0
      },
      dailySummaries: {
        lastGenerated: null,
        count: 0
      },
      systemInfo: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        hostname: os.hostname()
      }
    };

    this._saveStatus();
  }

  /**
   * Save status data to file
   * @private
   */
  _saveStatus() {
    try {
      fs.writeFileSync(this.statusFile, JSON.stringify(this.statusData, null, 2));
    } catch (error) {
      console.error('Error saving status data:', error);
    }
  }
  
  /**
   * Record a new error
   * @param {string} type Error type
   * @param {string} message Error message
   */
  recordError(type, message) {
    if (!this.statusData) this._initStatusData();
      
    // Add new error at the beginning of the array
    this.statusData.errors.unshift({
      type,
      message,
      timestamp: new Date().toISOString()
      });
      
    // Keep only the latest maxErrors
    if (this.statusData.errors.length > this.maxErrors) {
      this.statusData.errors = this.statusData.errors.slice(0, this.maxErrors);
    }

    this._saveStatus();
      }

  /**
   * Record a new alert
   * @param {Object} alert Alert data
   */
  recordAlert(alert) {
    if (!this.statusData) this._initStatusData();
    
    // Increment alert counters
    this.statusData.alerts.total++;
    this.statusData.alerts.today++;

    // Add to recent alerts
    if (alert) {
      const alertInfo = {
        symbol: alert.symbol,
        price: alert.alertPrice || alert.trigger_price,
        scanName: alert.scanName || alert.scan_name || 'Unknown',
        timestamp: new Date().toISOString()
      };

      this.statusData.alerts.recent.unshift(alertInfo);
      
      // Keep only the latest maxRecentAlerts
      if (this.statusData.alerts.recent.length > this.maxRecentAlerts) {
        this.statusData.alerts.recent = this.statusData.alerts.recent.slice(0, this.maxRecentAlerts);
      }
    }

    this._saveStatus();
  }

  /**
   * Record a webhook received
   */
  recordWebhook() {
    if (!this.statusData) this._initStatusData();

    this.statusData.webhooks.total++;
    this.statusData.webhooks.today++;
    this.statusData.webhooks.lastReceived = new Date().toISOString();

    this._saveStatus();
  }
  
  /**
   * Record Telegram status
   * @param {boolean} connected Is Telegram connected
   * @param {string|null} error Error message, if any
   */
  recordTelegramStatus(connected, error = null) {
    if (!this.statusData) this._initStatusData();

    this.statusData.telegramStatus.connected = connected;
    
    if (error) {
      this.statusData.telegramStatus.lastError = {
        message: error,
        timestamp: new Date().toISOString()
      };
    }

    this._saveStatus();
  }

  /**
   * Record a Telegram message sent
   */
  recordTelegramMessageSent() {
    if (!this.statusData) this._initStatusData();

    this.statusData.telegramStatus.messagesSent++;
    this.statusData.telegramStatus.lastSent = new Date().toISOString();

    this._saveStatus();
  }
  
  /**
   * Record system performance metrics
   */
  recordPerformance() {
    if (!this.statusData) this._initStatusData();

    const memoryUsage = process.memoryUsage();
    
    this.statusData.performance = {
      memoryUsage: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100, // MB with 2 decimal places
      cpuUsage: os.loadavg()[0], // 1-minute load average
      responseTime: Math.random() * 100 + 50, // Simulated response time for now (50-150ms)
      timestamp: new Date().toISOString()
    };

    this._saveStatus();
  }

  /**
   * Record daily summary generation
   */
  recordDailySummary() {
    if (!this.statusData) this._initStatusData();

    this.statusData.dailySummaries.lastGenerated = new Date().toISOString();
    this.statusData.dailySummaries.count++;

    this._saveStatus();
  }
  
  /**
   * Reset daily counters (to be called at midnight)
   */
  resetDailyCounters() {
    if (!this.statusData) this._initStatusData();

    this.statusData.alerts.today = 0;
    this.statusData.webhooks.today = 0;

    this._saveStatus();
  }

  /**
   * Get the total number of webhooks received
   * @returns {number} Total webhooks
   */
  getTotalWebhooks() {
    if (!this.statusData) this._initStatusData();
    return this.statusData.webhooks.total || 0;
  }

  /**
   * Get the number of webhooks received today
   * @returns {number} Webhooks today
   */
  getTodayWebhooks() {
    if (!this.statusData) this._initStatusData();
    return this.statusData.webhooks.today || 0;
  }

  /**
   * Get the full status data
   * @returns {Object} Status data
   */
  getStatus() {
    if (!this.statusData) this._initStatusData();
    return this.statusData;
  }
  
  /**
   * Get a health check report
   * @returns {Object} Health check data
   */
  getHealthCheck() {
    if (!this.statusData) this._initStatusData();

    // Check for critical errors in the last hour
    const lastHour = Date.now() - 3600000;
    const recentErrors = this.statusData.errors.filter(
      err => new Date(err.timestamp).getTime() > lastHour
    );

    const telegramHealthy = this.statusData.telegramStatus.connected;
    const systemHealthy = recentErrors.length < 5; // Fewer than 5 errors in the last hour

    return {
      healthy: telegramHealthy && systemHealthy,
      telegram: {
        connected: telegramHealthy,
        lastMessageSent: this.statusData.telegramStatus.lastSent,
        messageCount: this.statusData.telegramStatus.messagesSent
      },
      system: {
        healthy: systemHealthy,
        recentErrorCount: recentErrors.length,
        memoryUsage: `${this.statusData.performance.memoryUsage} MB`,
        uptime: Date.now() - this.statusData.startTime
      },
      alerts: {
        today: this.statusData.alerts.today,
        total: this.statusData.alerts.total
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get recent errors
   * @param {number} limit Number of errors to retrieve (default: all)
   * @returns {Array} Recent errors
   */
  getRecentErrors(limit = undefined) {
    if (!this.statusData) this._initStatusData();
    return limit ? this.statusData.errors.slice(0, limit) : this.statusData.errors;
  }

  /**
   * Record performance metrics
   * @param {number} memoryUsage Memory usage in MB
   * @param {number} cpuUsage CPU usage (0-1)
   * @param {number} responseTime Response time in ms
   */
  recordPerformance(memoryUsage, cpuUsage, responseTime) {
    if (!this.statusData) this._initStatusData();
    
    this.statusData.performance = {
      memoryUsage: memoryUsage || 0,
      cpuUsage: cpuUsage || 0,
      responseTime: responseTime || 0,
      lastUpdated: new Date().toISOString()
    };
    
    this._saveStatus();
  }

  /**
   * Record a health check
   */
  recordHealthCheck() {
    if (!this.statusData) this._initStatusData();
    
    // Update performance metrics during health check
    const memUsage = process.memoryUsage();
    const memoryUsageMB = Math.round(memUsage.rss / 1024 / 1024 * 100) / 100;
    
    // We don't have direct CPU usage in Node without external modules
    // Using a simple random value for demonstration
    const cpuUsage = Math.random() * 0.5; // Random value between 0-0.5
    
    this.recordPerformance(memoryUsageMB, cpuUsage, Math.random() * 100 + 50);
  }

  /**
   * Record a general event
   * @param {string} category Event category
   * @param {string} message Event message
   */
  recordEvent(category, message) {
    if (!this.statusData) this._initStatusData();
    
    // Initialize events array if it doesn't exist
    if (!this.statusData.events) {
      this.statusData.events = [];
    }
    
    // Add new event
    this.statusData.events.unshift({
      category,
      message,
      timestamp: new Date().toISOString()
    });
    
    // Keep only 20 most recent events
    if (this.statusData.events.length > 20) {
      this.statusData.events = this.statusData.events.slice(0, 20);
    }
    
    this._saveStatus();
  }
}

// Export a singleton instance
module.exports = new StatusMonitor(); 