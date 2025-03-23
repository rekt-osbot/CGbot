/**
 * Test script for Enhanced Stock Data Service with Yahoo Finance
 * 
 * This script tests the Yahoo Finance integration and stock data functions
 * Run with: node stock-data-test.js
 */

const enhancedStockData = require('./stockData-enhanced');
const fs = require('fs');
const path = require('path');

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

// Test parameters
const TEST_SYMBOLS = ['INFY', 'RELIANCE', 'TATASTEEL', 'HDFC', 'TCS'];
const INTERNATIONAL_SYMBOLS = ['AAPL', 'MSFT', 'TSLA', 'AMZN', 'GOOGL'];
const TEST_SYMBOL = 'INFY';

/**
 * Main test function
 */
async function runTests() {
  console.log(`${colors.bright}${colors.blue}=== ENHANCED STOCK DATA SERVICE TEST ===\n${colors.reset}`);
  
  await testSymbolFormatting();
  await testStockInfo(TEST_SYMBOL);
  await testMultipleStocks();
  await testHistoricalData();
  await testTechnicalIndicators();
  await testSectorPerformance();
  await testSearchFunction();
  await testRateLimiting();
  await testErrorHandling();
  
  console.log(`\n${colors.bright}${colors.green}All tests completed!${colors.reset}`);
  
  // Save sample data for integration and dashboard
  saveSampleData();
}

/**
 * Test symbol formatting
 */
async function testSymbolFormatting() {
  console.log(`${colors.cyan}Testing symbol formatting...${colors.reset}`);
  
  const testCases = [
    { input: 'INFY', expected: 'INFY.NS' },
    { input: 'RELIANCE', expected: 'RELIANCE.NS' },
    { input: 'INFY.NS', expected: 'INFY.NS' },
    { input: 'AAPL', expected: 'AAPL.NS' }, // Even US stocks get NS suffix with the current logic
  ];
  
  let passed = 0;
  
  for (const test of testCases) {
    const formatted = enhancedStockData.formatSymbol(test.input);
    
    if (formatted === test.expected) {
      console.log(`  ${colors.green}✓${colors.reset} ${test.input} -> ${formatted}`);
      passed++;
    } else {
      console.log(`  ${colors.red}✗${colors.reset} ${test.input} -> ${formatted} (expected: ${test.expected})`);
    }
  }
  
  console.log(`  ${passed}/${testCases.length} tests passed\n`);
}

/**
 * Test stock info retrieval
 */
async function testStockInfo(symbol) {
  console.log(`${colors.cyan}Testing stock info retrieval for ${symbol}...${colors.reset}`);
  
  try {
    const startTime = Date.now();
    const stockInfo = await enhancedStockData.getCurrentStockInfo(symbol);
    const duration = Date.now() - startTime;
    
    if (stockInfo) {
      console.log(`  ${colors.green}✓${colors.reset} Retrieved stock info in ${duration}ms`);
      
      // Check required fields
      const requiredFields = ['symbol', 'shortName', 'open', 'high', 'low', 'close', 'volume'];
      const missingFields = requiredFields.filter(field => stockInfo[field] === undefined);
      
      if (missingFields.length === 0) {
        console.log(`  ${colors.green}✓${colors.reset} All required fields present`);
      } else {
        console.log(`  ${colors.red}✗${colors.reset} Missing fields: ${missingFields.join(', ')}`);
      }
      
      // Check technical indicators
      if (stockInfo.sma20 && stockInfo.rsi14) {
        console.log(`  ${colors.green}✓${colors.reset} Technical indicators present`);
        console.log(`    SMA20: ${stockInfo.sma20.toFixed(2)}`);
        console.log(`    RSI14: ${stockInfo.rsi14.toFixed(2)}`);
      } else {
        console.log(`  ${colors.yellow}!${colors.reset} Some technical indicators missing`);
      }
      
      // Display some key data
      console.log(`\n  Symbol: ${stockInfo.symbol}`);
      console.log(`  Name: ${stockInfo.shortName}`);
      console.log(`  Price: ${stockInfo.close}`);
      console.log(`  Change: ${stockInfo.changePercent?.toFixed(2)}%`);
      console.log(`  Volume: ${stockInfo.volume}`);
      
      if (stockInfo.sector) {
        console.log(`  Sector: ${stockInfo.sector}`);
        console.log(`  Industry: ${stockInfo.industry}`);
      }
      
      console.log(`  52-Week Range: ${stockInfo.fiftyTwoWeekRange}`);
    } else {
      console.log(`  ${colors.red}✗${colors.reset} Failed to retrieve stock info`);
    }
  } catch (error) {
    console.log(`  ${colors.red}✗${colors.reset} Error: ${error.message}`);
  }
  
  console.log('');
}

/**
 * Test retrieving data for multiple stocks
 */
async function testMultipleStocks() {
  console.log(`${colors.cyan}Testing multiple stock retrieval...${colors.reset}`);
  
  try {
    const startTime = Date.now();
    const results = await Promise.all(
      TEST_SYMBOLS.slice(0, 3).map(symbol => enhancedStockData.getCurrentStockInfo(symbol))
    );
    const duration = Date.now() - startTime;
    
    const successCount = results.filter(Boolean).length;
    
    console.log(`  ${colors.green}✓${colors.reset} Retrieved ${successCount}/${TEST_SYMBOLS.slice(0, 3).length} stocks in ${duration}ms`);
    
    // Show brief summary
    results.forEach((stock, index) => {
      if (stock) {
        console.log(`  ${index + 1}. ${stock.symbol}: ${stock.close} (${stock.changePercent?.toFixed(2)}%)`);
      } else {
        console.log(`  ${index + 1}. ${TEST_SYMBOLS[index]}: Failed to retrieve`);
      }
    });
  } catch (error) {
    console.log(`  ${colors.red}✗${colors.reset} Error: ${error.message}`);
  }
  
  console.log('');
}

/**
 * Test historical data
 */
async function testHistoricalData() {
  console.log(`${colors.cyan}Testing historical data retrieval...${colors.reset}`);
  
  try {
    const symbol = TEST_SYMBOL;
    const startTime = Date.now();
    const historicalData = await enhancedStockData.getHistoricalData(symbol);
    const duration = Date.now() - startTime;
    
    if (historicalData && historicalData.length > 0) {
      console.log(`  ${colors.green}✓${colors.reset} Retrieved ${historicalData.length} days of data in ${duration}ms`);
      
      // Check data structure
      const firstDay = historicalData[0];
      const requiredFields = ['date', 'open', 'high', 'low', 'close', 'volume'];
      const missingFields = requiredFields.filter(field => firstDay[field] === undefined);
      
      if (missingFields.length === 0) {
        console.log(`  ${colors.green}✓${colors.reset} All required fields present in historical data`);
      } else {
        console.log(`  ${colors.red}✗${colors.reset} Missing fields in historical data: ${missingFields.join(', ')}`);
      }
      
      // Show sample
      console.log(`\n  Historical data sample (first 3 days):`);
      historicalData.slice(0, 3).forEach((day, i) => {
        console.log(`  ${i + 1}. ${new Date(day.date).toLocaleDateString()}: O:${day.open?.toFixed(2)} H:${day.high?.toFixed(2)} L:${day.low?.toFixed(2)} C:${day.close?.toFixed(2)} V:${day.volume}`);
      });
    } else {
      console.log(`  ${colors.red}✗${colors.reset} Failed to retrieve historical data`);
    }
  } catch (error) {
    console.log(`  ${colors.red}✗${colors.reset} Error: ${error.message}`);
  }
  
  console.log('');
}

/**
 * Test technical indicators
 */
async function testTechnicalIndicators() {
  console.log(`${colors.cyan}Testing technical indicators calculation...${colors.reset}`);
  
  try {
    const symbol = TEST_SYMBOL;
    const indicators = await enhancedStockData.calculateTechnicalIndicators(symbol);
    
    if (indicators) {
      console.log(`  ${colors.green}✓${colors.reset} Calculated technical indicators`);
      
      // Display indicators
      console.log(`\n  Technical indicators for ${symbol}:`);
      console.log(`  SMA20: ${indicators.sma20?.toFixed(2)}`);
      console.log(`  SMA50: ${indicators.sma50?.toFixed(2)}`);
      console.log(`  SMA200: ${indicators.sma200?.toFixed(2)}`);
      console.log(`  RSI (14): ${indicators.rsi?.toFixed(2)}`);
      console.log(`  Volume Ratio: ${indicators.volumeRatio?.toFixed(2)}`);
      
      // Interpret RSI
      if (indicators.rsi) {
        let rsiInterpretation;
        if (indicators.rsi > 70) rsiInterpretation = "Overbought";
        else if (indicators.rsi < 30) rsiInterpretation = "Oversold";
        else if (indicators.rsi > 50) rsiInterpretation = "Bullish";
        else rsiInterpretation = "Bearish";
        
        console.log(`  RSI Interpretation: ${rsiInterpretation}`);
      }
    } else {
      console.log(`  ${colors.red}✗${colors.reset} Failed to calculate technical indicators`);
    }
  } catch (error) {
    console.log(`  ${colors.red}✗${colors.reset} Error: ${error.message}`);
  }
  
  console.log('');
}

/**
 * Test sector performance
 */
async function testSectorPerformance() {
  console.log(`${colors.cyan}Testing sector performance retrieval...${colors.reset}`);
  
  try {
    const startTime = Date.now();
    const sectors = await enhancedStockData.getSectorPerformance();
    const duration = Date.now() - startTime;
    
    if (sectors && sectors.length > 0) {
      console.log(`  ${colors.green}✓${colors.reset} Retrieved ${sectors.length} sectors in ${duration}ms`);
      
      // Display sectors
      console.log(`\n  Sector performance (sorted by performance):`);
      sectors.forEach((sector, i) => {
        const color = sector.change >= 0 ? colors.green : colors.red;
        console.log(`  ${i + 1}. ${sector.sector}: ${color}${sector.change >= 0 ? '+' : ''}${sector.change.toFixed(2)}%${colors.reset}`);
      });
    } else {
      console.log(`  ${colors.red}✗${colors.reset} Failed to retrieve sector performance`);
    }
  } catch (error) {
    console.log(`  ${colors.red}✗${colors.reset} Error: ${error.message}`);
  }
  
  console.log('');
}

/**
 * Test search function
 */
async function testSearchFunction() {
  console.log(`${colors.cyan}Testing stock search function...${colors.reset}`);
  
  try {
    const query = "Infosys";
    const startTime = Date.now();
    const results = await enhancedStockData.searchStocks(query);
    const duration = Date.now() - startTime;
    
    if (results && results.length > 0) {
      console.log(`  ${colors.green}✓${colors.reset} Found ${results.length} results for "${query}" in ${duration}ms`);
      
      // Display results
      console.log(`\n  Search results for "${query}":`);
      results.slice(0, 5).forEach((result, i) => {
        console.log(`  ${i + 1}. ${result.symbol} (${result.exchange}): ${result.name}`);
      });
    } else {
      console.log(`  ${colors.yellow}!${colors.reset} No results found for "${query}"`);
    }
  } catch (error) {
    console.log(`  ${colors.red}✗${colors.reset} Error: ${error.message}`);
  }
  
  console.log('');
}

/**
 * Test rate limiting
 */
async function testRateLimiting() {
  console.log(`${colors.cyan}Testing rate limiting...${colors.reset}`);
  
  try {
    // Reset the counter to a high value to trigger rate limiting
    enhancedStockData.apiCalls.count = 85;
    
    const startTime = Date.now();
    await enhancedStockData.respectRateLimits();
    const duration = Date.now() - startTime;
    
    if (duration > 50) {
      console.log(`  ${colors.green}✓${colors.reset} Rate limiting applied correctly (delayed for ${duration}ms)`);
    } else {
      console.log(`  ${colors.yellow}!${colors.reset} Rate limiting might not be working as expected`);
    }
    
    // Reset the counter
    enhancedStockData.apiCalls.count = 0;
  } catch (error) {
    console.log(`  ${colors.red}✗${colors.reset} Error: ${error.message}`);
  }
  
  console.log('');
}

/**
 * Test error handling
 */
async function testErrorHandling() {
  console.log(`${colors.cyan}Testing error handling...${colors.reset}`);
  
  try {
    // Test with invalid symbol
    const invalidSymbol = 'INVALID1234567890';
    const result = await enhancedStockData.getCurrentStockInfo(invalidSymbol);
    
    if (result === null) {
      console.log(`  ${colors.green}✓${colors.reset} Properly handled invalid symbol`);
    } else {
      console.log(`  ${colors.red}✗${colors.reset} Failed to handle invalid symbol correctly`);
    }
  } catch (error) {
    console.log(`  ${colors.red}✗${colors.reset} Error wasn't caught inside the method: ${error.message}`);
  }
  
  console.log('');
}

/**
 * Save sample data for integration testing
 */
function saveSampleData() {
  console.log(`${colors.cyan}Saving sample data for integration...${colors.reset}`);
  
  const dataDir = path.join(__dirname, 'data');
  
  // Create data directory if it doesn't exist
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Save the test data
  const sampleData = {
    timestamp: new Date().toISOString(),
    symbols: TEST_SYMBOLS,
    stockData: {},
    sectorPerformance: []
  };
  
  // Write the data
  const filePath = path.join(dataDir, 'sample-stock-data.json');
  fs.writeFileSync(filePath, JSON.stringify(sampleData, null, 2));
  
  console.log(`  ${colors.green}✓${colors.reset} Sample data saved to ${filePath}`);
}

// Run all tests
runTests().catch(err => {
  console.error(`${colors.red}Error running tests:${colors.reset}`, err);
}); 