/**
 * Test script for database functionality
 */
require('dotenv').config();
const Database = require('./database');

async function testDatabase() {
  try {
    console.log('Connecting to MongoDB...');
    await Database.connect();
    console.log('Connected to MongoDB successfully');
    
    // Test storing alerts
    console.log('\nTesting alert storage:');
    const testAlert = {
      symbol: 'TEST',
      scanName: 'DB Test',
      alertPrice: 100.5,
      open: 99.5,
      high: 101.2,
      low: 98.7,
      close: 100.5,
      stopLoss: 98.5,
      timestamp: new Date(),
      percentChange: 1.0
    };
    const savedAlert = await Database.storeAlert(testAlert);
    console.log('Stored test alert:', savedAlert ? 'Success' : 'Failed');
    
    // Test storing a summary
    console.log('\nTesting summary storage:');
    const testSummary = {
      totalAlerts: 10,
      successfulAlerts: 7,
      failedAlerts: 3,
      stoppedOut: 1,
      avgPerformance: 2.5,
      summaryText: 'Test summary text',
      bestPerformer: {
        symbol: 'BEST',
        performance: 5.2
      },
      worstPerformer: {
        symbol: 'WORST',
        performance: -3.8
      },
      topStocks: [
        { symbol: 'TOP1', performance: 5.2, alerts: 1 },
        { symbol: 'TOP2', performance: 4.1, alerts: 2 }
      ]
    };
    const savedSummary = await Database.storeSummary(testSummary);
    console.log('Stored test summary:', savedSummary ? 'Success' : 'Failed');
    
    // Test retrieving alerts by date
    console.log('\nTesting alert retrieval by date:');
    const today = new Date();
    const alerts = await Database.getAlertsByDate(today);
    console.log(`Retrieved ${alerts.length} alerts for today`);
    
    // Test retrieving summaries
    console.log('\nTesting summary retrieval:');
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const summaries = await Database.getSummaries(lastMonth, today);
    console.log(`Retrieved ${summaries ? summaries.length : 0} summaries for the last month`);
    
    console.log('\nDatabase tests completed successfully');
  } catch (error) {
    console.error('Database test error:', error);
  } finally {
    process.exit(0);
  }
}

testDatabase(); 