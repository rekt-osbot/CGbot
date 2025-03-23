/**
 * Telegram Message Formatter
 * 
 * Enhanced formats for Telegram messages to make alerts more elegant and readable
 */

/**
 * Format a single stock alert message
 * @param {Object} data Stock data
 * @param {string} scanType Type of scan that triggered the alert
 * @returns {string} Formatted message
 */
function formatSingleStockAlert(data) {
  const { symbol, open, low, high, close, volume, sma20 } = data;
  
  // Handle cases where stock data isn't fully populated
  if (!open || !close) {
    // Basic format for webhook data without full stock info
    const stockSymbol = data.symbol || data.stocks;
    let message = `📈 *${stockSymbol}*`;
    
    if (data.trigger_price || data.trigger_prices) {
      message += ` at ₹${data.trigger_price || data.trigger_prices}`;
    }
    
    if (data.triggered_at) {
      message += `\n⏰ ${data.triggered_at}`;
    }
    
    return message;
  }
  
  // For fully populated stock data
  // Calculate stop loss based on 20SMA or day low
  const stopLoss = calculateStopLoss(low, sma20);
  
  // Always calculate percent change from open price
  const priceChange = close - open;
  const percentChange = (priceChange / open * 100).toFixed(2);
  
  // Calculate stop loss distance as percentage
  const slDistance = ((close - stopLoss) / close * 100).toFixed(2);
  
  // Store calculated values for sorting
  data.percentChange = parseFloat(percentChange);
  data.slDistance = parseFloat(slDistance);
  
  // Format with up/down arrow based on change direction
  const changeEmoji = priceChange >= 0 ? '🔼' : '🔽';
  const changeColor = priceChange >= 0 ? '🟢' : '🔴';
  
  // Clean, minimal format
  let message = `${changeColor} *${symbol}* at ₹${close.toFixed(2)}\n`;
  message += `   ${changeEmoji} ${percentChange}% from open (₹${open.toFixed(2)})\n`;
  message += `   📉 SL: ₹${stopLoss.toFixed(2)} (${slDistance}% away)\n`;
  message += `   📊 Range: ₹${low.toFixed(2)} - ₹${high.toFixed(2)}\n`;
  
  return message;
}

/**
 * Format a detailed alert message
 * @param {Object} data Stock data
 * @param {string} scanType Type of scan
 * @param {boolean} isMultiple Whether this is part of a multiple alert
 * @returns {string} Formatted message
 */
function formatAlertMessage(data, scanType = 'default', isMultiple = false) {
  // If it's a single stock and not part of a multiple alert
  if (!isMultiple) {
    const { symbol, open, low, high, close, volume, sma20 } = data;
    
    if (!open || !close) {
      // Simple format for webhook triggers without full data
      let message = `🚨 *Stock Alert: ${data.symbol || data.stocks}* 🚨\n\n`;
      
      // Add scan type if provided
      if (data.scan_name) {
        message += `📊 *Scan*: ${data.scan_name}\n\n`;
      }
      
      // Add trigger price if available
      if (data.trigger_price || data.trigger_prices) {
        message += `📈 *Trigger Price*: ₹${data.trigger_price || data.trigger_prices}\n\n`;
      }
      
      // Add triggered time if available
      if (data.triggered_at) {
        message += `⏰ *Triggered at*: ${data.triggered_at}\n\n`;
      }
      
      message += `⚠️ Stock alert triggered`;
      
      return message;
    }
    
    // For fully enriched data with price info
    const stopLoss = calculateStopLoss(low, sma20);
    
    // Calculate price changes
    const priceChange = close - open;
    const percentChange = (priceChange / open * 100).toFixed(2);
    const slDistance = ((close - stopLoss) / close * 100).toFixed(2);
    
    // Format with up/down arrow based on change direction
    const changeEmoji = priceChange >= 0 ? '🔼' : '🔽';
    const changeColor = priceChange >= 0 ? '🟢' : '🔴';
    
    // Create a more visually structured message
    let message = `${changeColor} *${symbol} Alert* ${changeColor}\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    // Add scan name if provided, with a nice format
    if (data.scan_name) {
      message += `🔍 *Scan*: ${data.scan_name}\n\n`;
    }
    
    // Price section
    message += `💲 *Price Details*\n`;
    message += `   • Current: ₹${close.toFixed(2)} ${changeEmoji} ${percentChange}%\n`;
    message += `   • Open: ₹${open.toFixed(2)}\n`;
    message += `   • Range: ₹${low.toFixed(2)} - ₹${high.toFixed(2)}\n\n`;
    
    // Technical indicators
    message += `📊 *Technical Indicators*\n`;
    message += `   • Stop Loss: ₹${stopLoss.toFixed(2)} (${slDistance}% away)\n`;
    message += `   • 20-day SMA: ₹${sma20 ? sma20.toFixed(2) : 'N/A'}\n`;
    
    // Volume if available
    if (volume) {
      const volumeFormatted = volume >= 1000000 
        ? `${(volume/1000000).toFixed(2)}M` 
        : volume >= 1000 
          ? `${(volume/1000).toFixed(2)}K` 
          : volume;
      
      message += `   • Volume: ${volumeFormatted}\n`;
    }
    
    message += `\n`;
    
    // Action hint based on scan type
    if (scanType === 'open_equals_low') {
      message += `💡 *Insight*: This stock opened at its low and is trading above 20 SMA. Potential bounce candidate.`;
    } else if (scanType === 'volume_breakout') {
      message += `💡 *Insight*: Stock is breaking out with high volume. Watch for continuation.`;
    } else if (scanType === 'resistance_breakout') {
      message += `💡 *Insight*: Stock is breaking above resistance level. Potential trend change.`;
    } else if (scanType === 'support_bounce') {
      message += `💡 *Insight*: Stock is bouncing from support level. Watch for reversal confirmation.`;
    } else {
      message += `💡 *Insight*: Monitor this stock for potential trading opportunities.`;
    }
    
    return message;
  } else {
    // It's a single stock but part of a multiple alert
    return formatSingleStockAlert(data);
  }
}

/**
 * Format a message for multiple stocks
 * @param {Array} stocksData Array of stock data
 * @param {string} scanName Name of the scan
 * @returns {string} Formatted message
 */
function formatMultipleStocksMessage(stocksData, scanName) {
  // Start with header
  let message = `🔔 *Multiple Stock Alerts* 🔔\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  // Add scan name if available
  if (scanName) {
    message += `🔍 *Scan*: ${scanName}\n`;
  }
  
  // Add timestamp
  const formattedTime = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  message += `⏰ *Time*: ${formattedTime}\n\n`;
  
  // Check if we have stocks with complete data or just webhook data
  const hasFullData = stocksData.some(stock => stock.open && stock.close);
  
  if (hasFullData) {
    // Sort stocks by stop loss distance (smallest first) when we have full data
    // This prioritizes stocks closest to their stop loss
    const sortedStocks = [...stocksData].sort((a, b) => {
      // First, make sure slDistance is calculated
      if (a.slDistance === undefined && a.low && a.close) {
        const aStopLoss = calculateStopLoss(a.low, a.sma20);
        a.slDistance = ((a.close - aStopLoss) / a.close * 100);
      }
      
      if (b.slDistance === undefined && b.low && b.close) {
        const bStopLoss = calculateStopLoss(b.low, b.sma20);
        b.slDistance = ((b.close - bStopLoss) / b.close * 100);
      }
      
      if (a.slDistance === undefined || b.slDistance === undefined) {
        return 0;
      }
      
      return a.slDistance - b.slDistance;
    });
    
    // Add alert label
    message += `📋 *Stock List* (${sortedStocks.length})\n`;
    
    // Add each stock to the message
    for (const stock of sortedStocks) {
      message += formatSingleStockAlert(stock) + '\n';
    }
  } else {
    // Simplified format for partial data
    message += `📋 *Stock List* (${stocksData.length})\n\n`;
    
    stocksData.forEach(stock => {
      const stockSymbol = stock.symbol || stock.stocks;
      message += `• *${stockSymbol}*`;
      
      if (stock.trigger_price || stock.trigger_prices) {
        message += ` at ₹${stock.trigger_price || stock.trigger_prices}`;
      }
      
      message += '\n';
    });
  }
  
  // Add a footer with help text
  message += `\n💡 *Tip*: Use /info <symbol> to get more details about a specific stock.`;
  
  return message;
}

/**
 * Format daily summary message
 * @param {Array} alerts Array of alerts
 * @returns {string} Formatted summary message
 */
function formatDailySummary(alerts) {
  if (!alerts || alerts.length === 0) {
    return `📊 *Daily Summary*\n\nNo alerts were triggered today.`;
  }
  
  // Group alerts by scan name
  const scanGroups = {};
  alerts.forEach(alert => {
    const scanName = alert.scanName || 'Other Alerts';
    if (!scanGroups[scanName]) {
      scanGroups[scanName] = [];
    }
    scanGroups[scanName].push(alert);
  });
  
  // Calculate overall stats
  const totalAlerts = alerts.length;
  
  // Calculate performance stats
  const alertsWithChange = alerts.filter(a => a.percentChange !== undefined);
  let positiveAlerts = 0;
  let negativeAlerts = 0;
  let bestPerformer = { symbol: 'N/A', percentChange: 0 };
  let worstPerformer = { symbol: 'N/A', percentChange: 0 };
  
  if (alertsWithChange.length > 0) {
    positiveAlerts = alertsWithChange.filter(a => a.percentChange > 0).length;
    negativeAlerts = alertsWithChange.filter(a => a.percentChange < 0).length;
    
    bestPerformer = alertsWithChange.reduce((best, current) => {
      return (current.percentChange > best.percentChange) ? current : best;
    }, { symbol: 'N/A', percentChange: -Infinity });
    
    worstPerformer = alertsWithChange.reduce((worst, current) => {
      return (current.percentChange < worst.percentChange) ? current : worst;
    }, { symbol: 'N/A', percentChange: Infinity });
  }
  
  // Format the summary
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long', 
    day: 'numeric'
  });
  
  let message = `📊 *Daily Summary* - ${today}\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  // Overall stats
  message += `📈 *Alert Statistics*\n`;
  message += `• Total Alerts: ${totalAlerts}\n`;
  
  if (alertsWithChange.length > 0) {
    const successRate = Math.round((positiveAlerts / alertsWithChange.length) * 100);
    message += `• Success Rate: ${successRate}% (${positiveAlerts}/${alertsWithChange.length})\n`;
    message += `• Best Performer: ${bestPerformer.symbol} (${bestPerformer.percentChange.toFixed(2)}%)\n`;
    message += `• Worst Performer: ${worstPerformer.symbol} (${worstPerformer.percentChange.toFixed(2)}%)\n`;
  }
  
  message += `\n`;
  
  // Alerts by scan
  message += `🔍 *Alerts by Scan*\n`;
  for (const [scanName, scanAlerts] of Object.entries(scanGroups)) {
    message += `• ${scanName}: ${scanAlerts.length} alerts\n`;
  }
  
  message += `\n`;
  
  // Top 5 stocks
  if (alertsWithChange.length > 0) {
    message += `🏆 *Top Performers*\n`;
    
    const topStocks = [...alertsWithChange]
      .sort((a, b) => b.percentChange - a.percentChange)
      .slice(0, 5);
    
    topStocks.forEach((stock, index) => {
      message += `${index + 1}. ${stock.symbol}: ${stock.percentChange.toFixed(2)}%\n`;
    });
  }
  
  // Footer
  message += `\n💡 *Note*: This is an automated daily summary. Use /stats for more detailed analytics.`;
  
  return message;
}

/**
 * Calculate the stop loss based on day low and 20SMA
 * @param {number} dayLow The day's low price
 * @param {number|null} sma20 The 20-day SMA value
 * @returns {number} The calculated stop loss
 */
function calculateStopLoss(dayLow, sma20) {
  if (!sma20) return dayLow;
  
  // If 20SMA is below day low and close to it (within 2%), use 20SMA as stop loss
  if (sma20 < dayLow && sma20 > dayLow * 0.98) {
    return sma20;
  }
  
  // Otherwise use day low
  return dayLow;
}

module.exports = {
  formatSingleStockAlert,
  formatAlertMessage,
  formatMultipleStocksMessage,
  formatDailySummary,
  calculateStopLoss
}; 