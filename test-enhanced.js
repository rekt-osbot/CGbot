/**
 * Comprehensive Test Script for Enhanced Stock Alert System
 * 
 * This script tests all components of the enhanced Stock Alert System:
 * 1. Status Monitoring
 * 2. Telegram Formatting
 * 3. Dashboard Rendering
 * 
 * Run with: node test-enhanced.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert').strict;
const StatusMonitor = require('./status');
const telegramFormats = require('./telegramFormats');

// Mock data for testing
const mockStockData = {
  symbol: 'INFY',
  open: 1500.50,
  close: 1545.75,
  high: 1560.80,
  low: 1498.25,
  volume: 1250000,
  sma20: 1510.30
};

const mockErrorMessage = 'Connection timeout';
const mockAlertData = {
  symbol: 'INFY',
  alertPrice: 1545.75,
  scanName: 'Volume Breakout',
  timestamp: new Date().toISOString()
};

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Test results counter
let passedTests = 0;
let failedTests = 0;

// Test suite starts
console.log(`${colors.bright}${colors.blue}=== ENHANCED STOCK ALERT SYSTEM TEST SUITE ===${colors.reset}\n`);

// Helper function for test reporting
function runTest(testName, testFunction) {
  process.stdout.write(`${colors.cyan}Testing ${testName}...${colors.reset} `);
  
  try {
    testFunction();
    console.log(`${colors.green}✓ PASSED${colors.reset}`);
    passedTests++;
    return true;
  } catch (error) {
    console.log(`${colors.red}✗ FAILED${colors.reset}`);
    console.log(`${colors.red}  ${error.message}${colors.reset}`);
    failedTests++;
    return false;
  }
}

// Check if all required files exist
console.log(`${colors.bright}${colors.yellow}[1] CHECKING REQUIRED FILES${colors.reset}`);

const requiredFiles = [
  'status.js',
  'telegramFormats.js',
  'dashboard.html',
  'enhanced-dashboard.js'
];

requiredFiles.forEach(file => {
  runTest(`existence of ${file}`, () => {
    const exists = fs.existsSync(path.join(__dirname, file));
    assert.equal(exists, true, `${file} does not exist`);
  });
});

// Test Status Monitor functionality
console.log(`\n${colors.bright}${colors.yellow}[2] TESTING STATUS MONITOR${colors.reset}`);

runTest('StatusMonitor initialization', () => {
  assert.ok(StatusMonitor, 'StatusMonitor should be initialized');
  assert.ok(StatusMonitor.getStatus, 'StatusMonitor should have getStatus method');
});

runTest('StatusMonitor data structure', () => {
  const status = StatusMonitor.getStatus();
  assert.ok(status.startTime, 'Status should have startTime');
  assert.ok(status.errors !== undefined, 'Status should have errors array');
  assert.ok(status.alerts !== undefined, 'Status should have alerts object');
  assert.ok(status.webhooks !== undefined, 'Status should have webhooks object');
  assert.ok(status.telegramStatus !== undefined, 'Status should have telegramStatus object');
  assert.ok(status.performance !== undefined, 'Status should have performance metrics');
});

runTest('StatusMonitor error recording', () => {
  const initialErrors = StatusMonitor.getStatus().errors.length;
  StatusMonitor.recordError('test', 'Test error message');
  const newErrors = StatusMonitor.getStatus().errors.length;
  assert.equal(newErrors, initialErrors + 1, 'Error count should increase by 1');
  assert.equal(StatusMonitor.getStatus().errors[0].type, 'test', 'Error type should match');
  assert.equal(StatusMonitor.getStatus().errors[0].message, 'Test error message', 'Error message should match');
});

runTest('StatusMonitor alert recording', () => {
  const initialAlerts = StatusMonitor.getStatus().alerts.total;
  StatusMonitor.recordAlert(mockAlertData);
  const newAlerts = StatusMonitor.getStatus().alerts.total;
  assert.equal(newAlerts, initialAlerts + 1, 'Alert count should increase by 1');
  assert.equal(StatusMonitor.getStatus().alerts.recent[0].symbol, mockAlertData.symbol, 'Alert symbol should match');
});

runTest('StatusMonitor webhook recording', () => {
  const initialWebhooks = StatusMonitor.getStatus().webhooks.total;
  StatusMonitor.recordWebhook();
  const newWebhooks = StatusMonitor.getStatus().webhooks.total;
  assert.equal(newWebhooks, initialWebhooks + 1, 'Webhook count should increase by 1');
});

runTest('StatusMonitor Telegram status recording', () => {
  StatusMonitor.recordTelegramStatus(true);
  assert.equal(StatusMonitor.getStatus().telegramStatus.connected, true, 'Telegram should be marked as connected');
  
  StatusMonitor.recordTelegramStatus(false, mockErrorMessage);
  assert.equal(StatusMonitor.getStatus().telegramStatus.connected, false, 'Telegram should be marked as disconnected');
  assert.equal(StatusMonitor.getStatus().telegramStatus.lastError.message, mockErrorMessage, 'Error message should match');
});

runTest('StatusMonitor performance recording', () => {
  StatusMonitor.recordPerformance();
  const performance = StatusMonitor.getStatus().performance;
  assert.ok(performance.memoryUsage > 0, 'Memory usage should be > 0');
  assert.ok(performance.cpuUsage !== undefined, 'CPU usage should be defined');
  assert.ok(performance.responseTime > 0, 'Response time should be > 0');
});

runTest('StatusMonitor health check', () => {
  const health = StatusMonitor.getHealthCheck();
  assert.ok(typeof health.healthy === 'boolean', 'Health check should have healthy status');
  assert.ok(health.telegram, 'Health check should have telegram status');
  assert.ok(health.system, 'Health check should have system status');
  assert.ok(health.alerts, 'Health check should have alerts status');
});

runTest('StatusMonitor daily counter reset', () => {
  StatusMonitor.resetStatus(); // Start with fresh state
  StatusMonitor.recordAlert(mockAlertData);
  StatusMonitor.recordWebhook();
  assert.equal(StatusMonitor.getStatus().alerts.today, 1, 'Today alert count should be 1');
  assert.equal(StatusMonitor.getStatus().webhooks.today, 1, 'Today webhook count should be 1');
  
  StatusMonitor.resetDailyCounters();
  assert.equal(StatusMonitor.getStatus().alerts.today, 0, 'Today alert count should be reset to 0');
  assert.equal(StatusMonitor.getStatus().webhooks.today, 0, 'Today webhook count should be reset to 0');
});

// Test Telegram Formatting functionality
console.log(`\n${colors.bright}${colors.yellow}[3] TESTING TELEGRAM FORMATTING${colors.reset}`);

runTest('Telegram module exports', () => {
  assert.ok(telegramFormats.formatSingleStockAlert, 'Should export formatSingleStockAlert');
  assert.ok(telegramFormats.formatAlertMessage, 'Should export formatAlertMessage');
  assert.ok(telegramFormats.formatMultipleStocksMessage, 'Should export formatMultipleStocksMessage');
  assert.ok(telegramFormats.formatDailySummary, 'Should export formatDailySummary');
  assert.ok(telegramFormats.calculateStopLoss, 'Should export calculateStopLoss');
});

runTest('formatSingleStockAlert with full data', () => {
  const message = telegramFormats.formatSingleStockAlert(mockStockData);
  assert.ok(message.includes(mockStockData.symbol), 'Message should include stock symbol');
  assert.ok(message.includes(mockStockData.close.toFixed(2)), 'Message should include closing price');
  assert.ok(message.includes('SL:'), 'Message should include stop loss');
});

runTest('formatSingleStockAlert with partial data', () => {
  const partialData = { symbol: 'HDFC', trigger_price: 1200 };
  const message = telegramFormats.formatSingleStockAlert(partialData);
  assert.ok(message.includes(partialData.symbol), 'Message should include stock symbol');
  assert.ok(message.includes(partialData.trigger_price.toString()), 'Message should include trigger price');
});

runTest('formatAlertMessage with full data', () => {
  const message = telegramFormats.formatAlertMessage(mockStockData, 'volume_breakout');
  assert.ok(message.includes(mockStockData.symbol), 'Message should include stock symbol');
  assert.ok(message.includes('Technical Indicators'), 'Message should include technical indicators section');
  assert.ok(message.includes('Insight'), 'Message should include insights section');
  assert.ok(message.includes('high volume'), 'Message should include scan-specific insights');
});

runTest('formatMultipleStocksMessage', () => {
  const stocksArray = [mockStockData, {...mockStockData, symbol: 'HDFC'}];
  const message = telegramFormats.formatMultipleStocksMessage(stocksArray, 'Volume Breakout');
  assert.ok(message.includes('Multiple Stock Alerts'), 'Message should have multiple alerts header');
  assert.ok(message.includes('Volume Breakout'), 'Message should include scan name');
  assert.ok(message.includes('INFY'), 'Message should include first stock symbol');
  assert.ok(message.includes('HDFC'), 'Message should include second stock symbol');
});

runTest('formatDailySummary', () => {
  const alerts = [
    { symbol: 'INFY', percentChange: 3.2, scanName: 'Volume Breakout' },
    { symbol: 'HDFC', percentChange: -1.5, scanName: 'Support Bounce' },
    { symbol: 'TCS', percentChange: 2.1, scanName: 'Volume Breakout' }
  ];
  const message = telegramFormats.formatDailySummary(alerts);
  assert.ok(message.includes('Daily Summary'), 'Message should have daily summary header');
  assert.ok(message.includes('Success Rate'), 'Message should include success rate');
  assert.ok(message.includes('Top Performers'), 'Message should include top performers section');
  assert.ok(message.includes('INFY'), 'Message should include best performer');
});

runTest('calculateStopLoss', () => {
  const stopLoss = telegramFormats.calculateStopLoss(mockStockData.low, mockStockData.sma20);
  assert.ok(stopLoss <= mockStockData.low, 'Stop loss should be at most the day low');
  
  // Test when SMA is below day low but close to it
  const smaCloseToLow = mockStockData.low * 0.99;
  const stopLoss2 = telegramFormats.calculateStopLoss(mockStockData.low, smaCloseToLow);
  assert.equal(stopLoss2, smaCloseToLow, 'Stop loss should use SMA when it is close to day low');
});

// Test Dashboard functionality (requires HTTP, so we'll check template rendering)
console.log(`\n${colors.bright}${colors.yellow}[4] TESTING DASHBOARD TEMPLATE${colors.reset}`);

runTest('Dashboard HTML exists and is valid', () => {
  const dashboardHtml = fs.readFileSync(path.join(__dirname, 'dashboard.html'), 'utf8');
  assert.ok(dashboardHtml.includes('<!DOCTYPE html>'), 'Should be a valid HTML file');
  assert.ok(dashboardHtml.includes('<title>CGNSEAlert'), 'Should have proper title');
  assert.ok(dashboardHtml.includes('{{uptimeString}}'), 'Should have Handlebars template variables');
});

// If Handlebars is installed, we can test template compilation
let handlebarsAvailable = false;
try {
  const Handlebars = require('handlebars');
  handlebarsAvailable = true;
  
  runTest('Dashboard template compiles with Handlebars', () => {
    const dashboardHtml = fs.readFileSync(path.join(__dirname, 'dashboard.html'), 'utf8');
    const template = Handlebars.compile(dashboardHtml);
    assert.ok(typeof template === 'function', 'Template should compile successfully');
    
    // Test with sample data
    const html = template({
      uptimeString: '1d 2h 3m',
      startTime: new Date().toLocaleString(),
      todayAlertCount: 5,
      totalAlerts: 100,
      recentAlerts: [mockAlertData],
      recentErrors: []
    });
    
    assert.ok(html.includes('1d 2h 3m'), 'Rendered HTML should include uptime string');
    assert.ok(html.includes('5'), 'Rendered HTML should include today alert count');
  });
} catch (e) {
  console.log(`${colors.yellow}Skipping Handlebars tests - Handlebars not installed. Run npm install handlebars to enable.${colors.reset}`);
}

// Test Enhanced Dashboard controller if available
try {
  const enhancedDashboard = require('./enhanced-dashboard');
  
  runTest('Enhanced Dashboard controller exports', () => {
    assert.ok(enhancedDashboard.enhancedDashboard, 'Should export enhancedDashboard function');
    assert.ok(enhancedDashboard.apiStatus, 'Should export apiStatus function');
  });
} catch (e) {
  console.log(`${colors.yellow}Skipping Enhanced Dashboard controller tests - Module not available or dependencies missing.${colors.reset}`);
}

// Test results summary
console.log(`\n${colors.bright}${colors.blue}=== TEST RESULTS ===${colors.reset}`);
console.log(`${colors.green}Tests passed: ${passedTests}${colors.reset}`);
console.log(`${colors.red}Tests failed: ${failedTests}${colors.reset}`);

if (failedTests === 0) {
  console.log(`\n${colors.bright}${colors.green}All tests passed! The enhanced system is working correctly.${colors.reset}`);
} else {
  console.log(`\n${colors.bright}${colors.red}Some tests failed. Please fix the issues above.${colors.reset}`);
}

// Environment check
console.log(`\n${colors.bright}${colors.yellow}[5] ENVIRONMENT CHECK${colors.reset}`);

// Check Node.js version
console.log(`Node.js version: ${process.version}`);

// Check dependencies
try {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  console.log('Dependencies:');
  for (const [dep, version] of Object.entries(packageJson.dependencies || {})) {
    let installed = false;
    try {
      require(dep);
      installed = true;
    } catch (e) {
      installed = false;
    }
    console.log(`  ${dep}: ${version} - ${installed ? colors.green + 'Installed' : colors.red + 'Missing'}${colors.reset}`);
  }
} catch (e) {
  console.log(`${colors.yellow}Could not read package.json${colors.reset}`);
}

// Integration Guide Check
try {
  const integrationJs = fs.readFileSync(path.join(__dirname, 'integration.js'), 'utf8');
  console.log(`${colors.green}Integration guide is available.${colors.reset}`);
} catch (e) {
  console.log(`${colors.red}Integration guide (integration.js) is missing!${colors.reset}`);
}

console.log(`\n${colors.bright}${colors.blue}Testing completed at ${new Date().toLocaleString()}${colors.reset}`); 