/**
 * Enhanced Dashboard Controller
 * 
 * This module provides the improved dashboard implementation
 * that can be imported into index.js
 */
const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const statusMonitor = require('./status');
const database = require('./database');
const Analytics = require('./analytics');

// Loading the dashboard template
const dashboardTemplate = fs.readFileSync(
  path.join(__dirname, 'dashboard.html'),
  'utf8'
);

// Compile the template
const template = Handlebars.compile(dashboardTemplate);

// Helper function to format time ago
function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  
  if (seconds < 60) return `${seconds} seconds ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

/**
 * Controller for the enhanced dashboard
 * @param {Object} req Express request object
 * @param {Object} res Express response object
 */
function enhancedDashboard(req, res) {
  try {
    // Get system status
    const status = statusMonitor.getStatus();
    
    // Check database connection (using the existing database instance)
    const dbConnected = database.isConnected;
    
    // Format uptime
    const uptime = Math.floor((Date.now() - status.startTime) / 1000); // seconds
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;
    
    let uptimeString = '';
    if (days > 0) uptimeString += `${days}d `;
    if (hours > 0 || days > 0) uptimeString += `${hours}h `;
    uptimeString += `${minutes}m ${seconds}s`;
    
    // Format recent alerts
    const recentAlerts = (status.alerts.recent || []).map(alert => ({
      ...alert,
      timeAgo: timeAgo(alert.timestamp)
    }));
    
    // Format recent errors
    const recentErrors = (status.errors || []).slice(0, 5).map(error => ({
      ...error,
      timeAgo: timeAgo(error.timestamp)
    }));
    
    // Format last alert time
    const lastAlertTime = recentAlerts.length > 0 
      ? timeAgo(recentAlerts[0].timestamp)
      : 'N/A';
    
    // Format Telegram status
    const telegramConnected = status.telegramStatus.connected;
    const messagesSent = status.telegramStatus.messagesSent;
    const lastMessageTime = status.telegramStatus.lastSent 
      ? timeAgo(status.telegramStatus.lastSent)
      : 'N/A';
    
    // Calculate memory usage percentages for progress bars
    const memoryPercentage = Math.min(status.performance.memoryUsage / 512 * 100, 100); // Assuming 512MB max
    
    // Calculate CPU percentage (0-100)
    const cpuLoad = Math.min(Math.round(status.performance.cpuUsage * 100) / 4, 100);
    const cpuPercentage = cpuLoad;
    
    // Response time percentage (50-150ms → 0-100%)
    const responseTime = status.performance.responseTime;
    const responsePercentage = Math.min(Math.max(responseTime - 50, 0) / 100 * 100, 100);
    
    // Render the dashboard template with all the data
    const html = template({
      dbConnected,
      uptimeString,
      startTime: new Date(status.startTime).toLocaleString(),
      todayAlertCount: status.alerts.today,
      totalAlerts: status.alerts.total,
      todayWebhooks: status.webhooks.today,
      totalWebhooks: status.webhooks.total,
      lastAlertTime,
      recentAlerts,
      recentErrors,
      telegramConnected,
      messagesSent,
      lastMessageTime,
      memoryUsage: status.performance.memoryUsage,
      memoryPercentage,
      cpuLoad,
      cpuPercentage,
      responseTime,
      responsePercentage,
      currentTime: new Date().toLocaleString()
    });
    
    res.send(html);
  } catch (error) {
    console.error('Error rendering enhanced dashboard:', error);
    res.status(500).send('Error generating enhanced dashboard: ' + error.message);
  }
}

/**
 * Controller for the API status endpoint
 * @param {Object} req Express request object
 * @param {Object} res Express response object
 */
function apiStatus(req, res) {
  try {
    // Get system status
    const status = statusMonitor.getStatus();
    
    // Add additional data for API
    status.api = {
      version: '1.0.0',
      timestamp: new Date().toISOString()
    };
    
    res.json(status);
  } catch (error) {
    console.error('Error generating API status:', error);
    res.status(500).json({
      error: 'Error generating API status',
      message: error.message
    });
  }
}

module.exports = {
  enhancedDashboard,
  apiStatus
}; 