require('dotenv').config();
const fs = require('fs');
const path = require('path');
const StockSummary = require('./stockSummary');

// Sample stocks for testing
const sampleStocks = [
  {
    symbol: "RELIANCE",
    open: 2950.50,
    low: 2940.20,
    high: 3025.75,
    close: 3020.45,
    sma20: 2930.00,
    scanType: "open_equals_low",
    scan_name: "Open = Low Scan",
    timestamp: new Date(new Date().setHours(9, 30, 0, 0)).toISOString()
  },
  {
    symbol: "TATAMOTORS",
    open: 780.25,
    low: 775.10,
    high: 801.50,
    close: 799.85,
    sma20: 772.00,
    scanType: "open_equals_low",
    scan_name: "Open = Low Scan",
    timestamp: new Date(new Date().setHours(9, 31, 0, 0)).toISOString()
  },
  {
    symbol: "HDFCBANK",
    open: 1550.00,
    low: 1548.50,
    high: 1580.75,
    close: 1565.30,
    sma20: 1545.00,
    scanType: "open_equals_low",
    scan_name: "Open = Low Scan",
    timestamp: new Date(new Date().setHours(9, 32, 0, 0)).toISOString()
  },
  {
    symbol: "TCS",
    open: 3800.25,
    low: 3795.00,
    high: 3850.50,
    close: 3782.60,
    sma20: 3790.00,
    scanType: "open_equals_low",
    scan_name: "Open = Low Scan",
    timestamp: new Date(new Date().setHours(9, 33, 0, 0)).toISOString()
  },
  {
    symbol: "INFY",
    open: 1650.75,
    low: 1645.00,
    high: 1690.00,
    close: 1687.50,
    sma20: 1640.00,
    scanType: "open_equals_low",
    scan_name: "Open = Low Scan",
    timestamp: new Date(new Date().setHours(9, 34, 0, 0)).toISOString()
  },
  {
    symbol: "SBIN",
    open: 660.25,
    low: 658.50,
    high: 675.00,
    close: 673.75,
    sma20: 655.00,
    scanType: "custom",
    scan_name: "Banking Scanner",
    timestamp: new Date(new Date().setHours(10, 15, 0, 0)).toISOString()
  },
  {
    symbol: "LT",
    open: 3200.50,
    low: 3195.00,
    high: 3280.25,
    close: 3275.80,
    sma20: 3190.00,
    scanType: "custom",
    scan_name: "Infrastructure Scanner",
    timestamp: new Date(new Date().setHours(10, 30, 0, 0)).toISOString()
  },
  {
    symbol: "SUNPHARMA",
    open: 1220.75,
    low: 1218.00,
    high: 1255.50,
    close: 1208.25,
    sma20: 1215.00,
    scanType: "custom",
    scan_name: "Pharma Scanner",
    timestamp: new Date(new Date().setHours(11, 0, 0, 0)).toISOString()
  },
  {
    symbol: "INDUSINDBK",
    open: 1450.00,
    low: 1447.50,
    high: 1485.25,
    close: 1435.75,
    sma20: 1445.00,
    scanType: "custom",
    scan_name: "Banking Scanner",
    timestamp: new Date(new Date().setHours(11, 30, 0, 0)).toISOString()
  },
  {
    symbol: "WIPRO",
    open: 480.25,
    low: 478.00,
    high: 493.50,
    close: 491.75,
    sma20: 475.00,
    scanType: "custom",
    scan_name: "IT Scanner",
    timestamp: new Date(new Date().setHours(12, 0, 0, 0)).toISOString()
  }
];

// Create the data directory if it doesn't exist
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
  console.log('Created data directory:', dataDir);
}

// Function to generate sample data file
async function generateSampleData() {
  try {
    console.log('Generating sample data for daily summary testing...');
    
    // Calculate current prices with some random variations
    const stocksWithCurrentPrices = sampleStocks.map(stock => {
      // Calculate percentage change from open to close
      const percentChange = ((stock.close - stock.open) / stock.open) * 100;
      
      // Calculate stop loss based on low and SMA20
      const stopLoss = stock.sma20 < stock.low && stock.sma20 > stock.low * 0.98 
        ? stock.sma20 
        : stock.low;
      
      // Generate a random current price that's either above or below close
      // Let's have 70% winners and 30% losers
      const randomFactor = Math.random() < 0.7 ? 1 : -1;
      const priceChange = stock.close * (0.5 + Math.random() * 3) / 100 * randomFactor;
      const currentPrice = stock.close + priceChange;
      
      // Calculate if stop loss was hit (for 10% of stocks)
      const hitStopLoss = Math.random() < 0.1 && currentPrice < stopLoss;
      
      return {
        ...stock,
        percentChange,
        stopLoss,
        currentPrice: hitStopLoss ? stopLoss - Math.random() * 5 : currentPrice,
        hitStopLoss
      };
    });
    
    // Convert to the format needed for the StockSummary
    const trackedStocks = {};
    
    stocksWithCurrentPrices.forEach(stock => {
      trackedStocks[stock.symbol] = {
        symbol: stock.symbol,
        alertTime: stock.timestamp,
        alertPrice: stock.close,
        openPrice: stock.open,
        highPrice: stock.high,
        lowPrice: stock.low,
        stopLoss: stock.stopLoss,
        sma20: stock.sma20,
        scanName: stock.scan_name,
        currentPrice: stock.currentPrice,
        hitStopLoss: stock.hitStopLoss
      };
    });
    
    // Save the data to the file
    const filePath = path.join(dataDir, 'alerted_stocks.json');
    fs.writeFileSync(filePath, JSON.stringify(trackedStocks, null, 2));
    
    console.log(`Sample data generated and saved to ${filePath}`);
    console.log(`Generated data for ${Object.keys(trackedStocks).length} stocks`);
    
    // Log some stats about the generated data
    const winners = Object.values(trackedStocks).filter(
      stock => stock.currentPrice > stock.alertPrice
    ).length;
    
    const losers = Object.values(trackedStocks).filter(
      stock => stock.currentPrice < stock.alertPrice
    ).length;
    
    const hitStopLoss = Object.values(trackedStocks).filter(
      stock => stock.hitStopLoss
    ).length;
    
    console.log(`Winners: ${winners}, Losers: ${losers}, Hit Stop Loss: ${hitStopLoss}`);
    console.log('You can now run the daily summary test with: node test-daily-summary.js');
    
  } catch (error) {
    console.error('Error generating sample data:', error);
  }
}

// Run the sample data generator
generateSampleData(); 