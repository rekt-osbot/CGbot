/**
 * MongoDB Database Connector
 * Provides persistent storage for stock alerts data
 */
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Define schemas
const AlertSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  alertPrice: { type: Number, required: true },
  scanName: { type: String, default: 'Unknown' },
  openPrice: { type: Number },
  highPrice: { type: Number },
  lowPrice: { type: Number },
  stopLoss: { type: Number },
  sma20: { type: Number },
  timestamp: { type: Date, default: Date.now },
  currentPrice: { type: Number },
  percentChange: { type: Number },
  hitStopLoss: { type: Boolean, default: false },
  notes: { type: String }
});

const SummarySchema = new mongoose.Schema({
  date: { type: Date, required: true, unique: true },
  totalAlerts: { type: Number, default: 0 },
  successfulAlerts: { type: Number, default: 0 },
  failedAlerts: { type: Number, default: 0 },
  stoppedOut: { type: Number, default: 0 },
  avgPerformance: { type: Number, default: 0 },
  bestPerformer: {
    symbol: String,
    performance: Number
  },
  worstPerformer: {
    symbol: String,
    performance: Number
  },
  topStocks: [{ 
    symbol: String, 
    performance: Number,
    alerts: Number
  }],
  summaryText: { type: String },
  createdAt: { type: Date, default: Date.now }
});

class Database {
  constructor() {
    this.isConnected = false;
    this.connectionString = process.env.MONGODB_URI || null;
    this.models = {
      Alert: null,
      Summary: null
    };
    this.dataDir = path.join(__dirname, 'data');
    this.backupFile = path.join(this.dataDir, 'mongodb_backup.json');
    
    // Create data directory if it doesn't exist
    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch (error) {
        console.error('Error creating data directory:', error);
      }
    }
  }
  
  /**
   * Initialize the database connection
   */
  async connect() {
    if (this.isConnected) return true;
    
    try {
      // Check if we have a MongoDB URI
      if (!this.connectionString) {
        console.warn('MongoDB URI not provided. Running without database persistence.');
        return false;
      }
      
      // Connect to MongoDB
      await mongoose.connect(this.connectionString, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      
      console.log('Connected to MongoDB');
      
      // Initialize models
      this.models.Alert = mongoose.model('Alert', AlertSchema);
      this.models.Summary = mongoose.model('Summary', SummarySchema);
      
      this.isConnected = true;
      return true;
    } catch (error) {
      console.error('MongoDB connection error:', error);
      this.isConnected = false;
      return false;
    }
  }
  
  /**
   * Store an alert in the database
   * @param {Object} alertData - Alert data to store
   * @returns {Promise<Object|null>} - Stored alert or null if error
   */
  async storeAlert(alertData) {
    try {
      // Try to connect or continue if connection failed
      await this.connect();
      
      // If we're connected to MongoDB, store in database
      if (this.isConnected) {
        const alert = new this.models.Alert({
          symbol: alertData.symbol,
          alertPrice: alertData.alertPrice || alertData.close,
          scanName: alertData.scanName || alertData.scan_name || 'Unknown',
          openPrice: alertData.openPrice || alertData.open,
          highPrice: alertData.highPrice || alertData.high,
          lowPrice: alertData.lowPrice || alertData.low,
          stopLoss: alertData.stopLoss,
          sma20: alertData.sma20,
          timestamp: alertData.timestamp || alertData.alertTime || new Date(),
          currentPrice: alertData.currentPrice || alertData.close,
          percentChange: alertData.percentChange,
          hitStopLoss: alertData.hitStopLoss || false
        });
        
        const result = await alert.save();
        return result;
      } else {
        // If MongoDB is not available, backup to local file
        this.backupToFile('alert', alertData);
        return alertData;
      }
    } catch (error) {
      console.error('Error storing alert:', error);
      // Still try to backup to file in case of error
      this.backupToFile('alert', alertData);
      return null;
    }
  }
  
  /**
   * Store a daily summary in the database
   * @param {Object} summaryData - Summary data to store
   * @returns {Promise<Object|null>} - Stored summary or null if error
   */
  async storeSummary(summaryData) {
    try {
      // Try to connect or continue if connection failed
      await this.connect();
      
      // Get today's date without time
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // If we're connected to MongoDB, store in database
      if (this.isConnected) {
        // Check if we already have a summary for today
        let summary = await this.models.Summary.findOne({ 
          date: {
            $gte: today,
            $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
          }
        });
        
        // Create new or update existing
        if (!summary) {
          summary = new this.models.Summary({
            date: today,
            ...summaryData,
            createdAt: new Date()
          });
        } else {
          // Update existing summary
          Object.assign(summary, summaryData);
          summary.createdAt = new Date();
        }
        
        const result = await summary.save();
        return result;
      } else {
        // If MongoDB is not available, backup to local file
        this.backupToFile('summary', {
          date: today.toISOString(),
          ...summaryData
        });
        return summaryData;
      }
    } catch (error) {
      console.error('Error storing summary:', error);
      // Still try to backup to file in case of error
      this.backupToFile('summary', summaryData);
      return null;
    }
  }
  
  /**
   * Get alerts for a specific day
   * @param {Date} date - Date to get alerts for (defaults to today)
   * @returns {Promise<Array>} - Array of alerts
   */
  async getAlertsByDate(date = new Date()) {
    try {
      // Try to connect
      await this.connect();
      
      if (!this.isConnected) {
        console.warn('MongoDB not connected, cannot retrieve alerts by date');
        return [];
      }
      
      // Set up date range (start of day to end of day)
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      // Query the database
      const alerts = await this.models.Alert.find({
        timestamp: {
          $gte: startOfDay,
          $lte: endOfDay
        }
      }).sort({ timestamp: 1 });
      
      return alerts;
    } catch (error) {
      console.error('Error getting alerts by date:', error);
      return [];
    }
  }
  
  /**
   * Get all summaries for a date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date (defaults to today)
   * @returns {Promise<Array>} - Array of summaries
   */
  async getSummaries(startDate, endDate = new Date()) {
    try {
      // Try to connect
      await this.connect();
      
      if (!this.isConnected) {
        console.warn('MongoDB not connected, cannot retrieve summaries');
        return [];
      }
      
      // Query the database
      const summaries = await this.models.Summary.find({
        date: {
          $gte: startDate,
          $lte: endDate
        }
      }).sort({ date: -1 });
      
      return summaries;
    } catch (error) {
      console.error('Error getting summaries:', error);
      return [];
    }
  }
  
  /**
   * Backup data to local file as fallback
   * @param {string} type - Type of data ('alert' or 'summary')
   * @param {Object} data - Data to backup
   */
  backupToFile(type, data) {
    try {
      let backupData = { alerts: [], summaries: [] };
      
      // Load existing backup if available
      if (fs.existsSync(this.backupFile)) {
        const fileContent = fs.readFileSync(this.backupFile, 'utf8');
        if (fileContent) {
          backupData = JSON.parse(fileContent);
        }
      }
      
      // Add new data
      if (type === 'alert') {
        backupData.alerts.push({
          ...data,
          _backupDate: new Date().toISOString()
        });
        
        // Limit to 1000 alerts to prevent the file from getting too large
        if (backupData.alerts.length > 1000) {
          backupData.alerts = backupData.alerts.slice(-1000);
        }
      } else if (type === 'summary') {
        backupData.summaries.push({
          ...data,
          _backupDate: new Date().toISOString()
        });
        
        // Limit to 100 summaries
        if (backupData.summaries.length > 100) {
          backupData.summaries = backupData.summaries.slice(-100);
        }
      }
      
      // Save the updated backup
      fs.writeFileSync(this.backupFile, JSON.stringify(backupData, null, 2));
    } catch (error) {
      console.error('Error backing up data to file:', error);
    }
  }

  /**
   * Get alert by ID
   * @param {string} alertId - The ID of the alert to retrieve
   * @returns {Promise<Object>} - The alert object
   */
  async getAlertById(alertId) {
    try {
      if (!this.client) {
        await this.connect();
      }
      
      const db = this.client.db(this.dbName);
      const collection = db.collection('alerts');
      
      // Convert string ID to ObjectId if needed
      let objectId;
      try {
        objectId = new this.mongodb.ObjectId(alertId);
      } catch (error) {
        console.error('Invalid ObjectId format:', error);
        return null;
      }
      
      const alert = await collection.findOne({ _id: objectId });
      return alert;
    } catch (error) {
      console.error('Error getting alert by ID:', error);
      return null;
    }
  }

  /**
   * Get alerts by scan name after a specific date
   * @param {string} scanName - The scan name to filter by
   * @param {Date} afterDate - Date to filter alerts after
   * @returns {Promise<Array>} - Array of alert objects
   */
  async getAlertsByScan(scanName, afterDate) {
    try {
      if (!this.client) {
        await this.connect();
      }
      
      const db = this.client.db(this.dbName);
      const collection = db.collection('alerts');
      
      const query = { 
        scan_name: scanName 
      };
      
      // Add date filter if provided
      if (afterDate) {
        query.createdAt = { $gte: afterDate };
      }
      
      const alerts = await collection.find(query).toArray();
      return alerts;
    } catch (error) {
      console.error('Error getting alerts by scan:', error);
      return [];
    }
  }

  /**
   * Get alerts created after a specific date
   * @param {Date} afterDate - Date to filter alerts after
   * @returns {Promise<Array>} - Array of alert objects
   */
  async getAlertsAfterDate(afterDate) {
    try {
      if (!this.client) {
        await this.connect();
      }
      
      const db = this.client.db(this.dbName);
      const collection = db.collection('alerts');
      
      const query = {};
      
      // Add date filter if provided
      if (afterDate) {
        query.$or = [
          { createdAt: { $gte: afterDate } },
          { timestamp: { $gte: afterDate } }
        ];
      }
      
      const alerts = await collection.find(query).sort({ timestamp: -1 }).toArray();
      return alerts;
    } catch (error) {
      console.error('Error getting alerts after date:', error);
      return [];
    }
  }
}

// Export as singleton
module.exports = new Database(); 