/**
 * Stable Process Runner
 * 
 * This script runs the main application and monitors its health.
 * It only restarts the service if it truly crashes, not on every error.
 * This prevents unnecessary restarts that would trigger duplicate Telegram notifications.
 * 
 * Enhanced for Railway deployment and market hours optimization.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const MAX_RESTARTS = 5; // Maximum number of restarts within restart period
const RESTART_PERIOD = 3600000; // 1 hour in milliseconds
const COOLDOWN_TIME = 30000; // 30 seconds cooldown between restarts
const LOG_FILE = path.join(__dirname, 'data', 'server.log');
const MARKET_START_HOUR = 9; // 9:00 AM IST
const MARKET_PRE_OPEN_MINUTES = 15; // Start 15 mins before market opens
const MARKET_END_HOUR = 15; // 3:45 PM IST
const MARKET_END_MINUTE = 45;
const MARKET_POST_CLOSE_MINUTES = 30; // Run 30 mins after market closes
const IS_RAILWAY = process.env.RAILWAY_ENVIRONMENT !== undefined;

// State tracking
let restarts = 0;
let lastRestartTime = Date.now();
let isRestarting = false;
let childProcess = null;
let scheduledRestart = null;

// Ensure log directory exists
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Log function that writes to console and file
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  
  console.log(logMessage);
  
  try {
    fs.appendFileSync(LOG_FILE, logMessage + '\n');
  } catch (error) {
    console.error(`Error writing to log file: ${error.message}`);
  }
}

// Get current IST time details
function getISTTimeDetails() {
  // Convert to Indian Standard Time (UTC+5:30)
  const now = new Date();
  const istOffset = 330; // IST is UTC+5:30 (330 minutes)
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const istMinutes = (utcMinutes + istOffset) % (24 * 60);
  const istHour = Math.floor(istMinutes / 60);
  const istMinute = istMinutes % 60;
  const istDay = now.getUTCDay(); // 0 is Sunday, 1 is Monday, etc.
  
  return {
    now,
    istHour,
    istMinute,
    istMinutes,
    istDay
  };
}

// Check if current time is around market hours with buffer
function isAroundMarketHours() {
  const { istHour, istMinute, istMinutes, istDay } = getISTTimeDetails();
  
  // Only between Monday (1) and Friday (5)
  if (istDay === 0 || istDay === 6) {
    log(`Today is ${istDay === 0 ? 'Sunday' : 'Saturday'}, outside of trading days`);
    return false;
  }
  
  // Market pre-open buffer (15 minutes before market open)
  const marketOpenMinutes = MARKET_START_HOUR * 60;
  const preOpenMinutes = marketOpenMinutes - MARKET_PRE_OPEN_MINUTES;
  
  // Market post-close buffer (30 minutes after market close)
  const marketCloseMinutes = MARKET_END_HOUR * 60 + MARKET_END_MINUTE;
  const postCloseMinutes = marketCloseMinutes + MARKET_POST_CLOSE_MINUTES;
  
  // Check if time is within the expanded market hours window
  if (istMinutes >= preOpenMinutes && istMinutes <= postCloseMinutes) {
    return true;
  }
  
  return false;
}

// Calculate time until next market session
function getTimeUntilNextMarketSession() {
  const { now, istHour, istMinute, istMinutes, istDay } = getISTTimeDetails();
  
  // Market pre-open time (15 minutes before market open)
  const marketPreOpenMinutes = MARKET_START_HOUR * 60 - MARKET_PRE_OPEN_MINUTES;
  
  // Calculate days until next market day
  let daysUntilMarketDay = 0;
  
  if (istDay === 0) { // Sunday
    daysUntilMarketDay = 1; // Next market day is Monday
  } else if (istDay === 6) { // Saturday
    daysUntilMarketDay = 2; // Next market day is Monday
  } else if (istDay === 5) { // Friday
    // If it's after market close on Friday
    const marketPostCloseMinutes = MARKET_END_HOUR * 60 + MARKET_END_MINUTE + MARKET_POST_CLOSE_MINUTES;
    if (istMinutes > marketPostCloseMinutes) {
      daysUntilMarketDay = 3; // Next market day is Monday
    }
  }
  
  // Calculate minutes until pre-market open
  let minutesUntilMarketSession = 0;
  
  if (daysUntilMarketDay > 0) {
    // Calculate to next market day's pre-open
    minutesUntilMarketSession = daysUntilMarketDay * 24 * 60 + marketPreOpenMinutes - istMinutes;
    
    // If we've crossed midnight, adjust calculation
    if (istMinutes > marketPreOpenMinutes) {
      minutesUntilMarketSession = daysUntilMarketDay * 24 * 60 - (istMinutes - marketPreOpenMinutes);
    } else {
      minutesUntilMarketSession = daysUntilMarketDay * 24 * 60 + (marketPreOpenMinutes - istMinutes);
    }
  } else if (istMinutes < marketPreOpenMinutes) {
    // Same day, before pre-market open
    minutesUntilMarketSession = marketPreOpenMinutes - istMinutes;
  } else {
    // After market post-close, wait until next day's pre-open
    const marketPostCloseMinutes = MARKET_END_HOUR * 60 + MARKET_END_MINUTE + MARKET_POST_CLOSE_MINUTES;
    
    if (istMinutes > marketPostCloseMinutes) {
      // After post-close, check if it's Friday
      if (istDay === 5) {
        // Friday after post-close, wait until Monday
        minutesUntilMarketSession = (3 * 24 * 60) - (istMinutes - marketPreOpenMinutes);
      } else {
        // Weekday after post-close, wait until next day's pre-open
        minutesUntilMarketSession = (24 * 60) - (istMinutes - marketPreOpenMinutes);
      }
    }
  }
  
  // Convert to milliseconds
  return minutesUntilMarketSession * 60 * 1000;
}

// Start the main process
function startProcess() {
  if (isRestarting) return;
  
  // Check if we should start based on market hours
  // Even on Railway, we now follow market hours as specified
  const shouldStart = isAroundMarketHours();
  
  if (!shouldStart) {
    const timeUntilNextSession = getTimeUntilNextMarketSession();
    log(`Outside market hours. Waiting ${Math.round(timeUntilNextSession / 60000)} minutes until next market session...`);
    
    if (scheduledRestart) {
      clearTimeout(scheduledRestart);
    }
    
    scheduledRestart = setTimeout(() => {
      log('Market hours approaching. Starting server...');
      startProcess();
    }, timeUntilNextSession);
    
    return;
  }
  
  // Reset restart counter if we're outside the restart period
  const now = Date.now();
  if (now - lastRestartTime > RESTART_PERIOD) {
    restarts = 0;
    lastRestartTime = now;
  }
  
  // Check if we've restarted too many times
  if (restarts >= MAX_RESTARTS) {
    log(`ERROR: Too many restarts (${restarts}) within ${RESTART_PERIOD/60000} minutes. Waiting for 1 hour before trying again.`);
    
    setTimeout(() => {
      restarts = 0;
      lastRestartTime = Date.now();
      isRestarting = false;
      startProcess();
    }, RESTART_PERIOD);
    
    return;
  }
  
  // Increment restart counter
  restarts++;
  
  log(`Starting server (restart ${restarts}/${MAX_RESTARTS})...`);
  isRestarting = true;
  
  // Start the actual Node.js process
  childProcess = spawn('node', ['index.js'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      STABLE_RUNNER: 'true' // Let the app know it's being run by this script
    }
  });
  
  // Handle process exit
  childProcess.on('exit', (code) => {
    log(`Server process exited with code ${code}`);
    
    if (code !== 0) {
      log(`Server crashed. Waiting ${COOLDOWN_TIME/1000} seconds before restarting...`);
      
      // Wait before restarting to prevent rapid restart loops
      setTimeout(() => {
        isRestarting = false;
        startProcess();
      }, COOLDOWN_TIME);
    } else {
      log('Server exited cleanly. Not restarting.');
      process.exit(0);
    }
  });
  
  // Handle error in spawning process
  childProcess.on('error', (err) => {
    log(`Failed to start server: ${err.message}`);
    isRestarting = false;
    
    // Try again after cooldown
    setTimeout(() => {
      startProcess();
    }, COOLDOWN_TIME);
  });
  
  // After 5 seconds, allow restarts if needed
  setTimeout(() => {
    isRestarting = false;
    
    // Schedule shutdown after market hours
    scheduleMarketCloseShutdown();
  }, 5000);
}

// Schedule shutdown at market close + buffer
function scheduleMarketCloseShutdown() {
  // Cancel any existing scheduled shutdown
  if (scheduledRestart) {
    clearTimeout(scheduledRestart);
    scheduledRestart = null;
  }
  
  // Check if we're during market hours
  if (isAroundMarketHours()) {
    // Get current IST time
    const { istHour, istMinute, istDay } = getISTTimeDetails();
    
    // Calculate time until market close + buffer
    const marketCloseMinutes = MARKET_END_HOUR * 60 + MARKET_END_MINUTE;
    const marketPostCloseMinutes = marketCloseMinutes + MARKET_POST_CLOSE_MINUTES;
    
    // Current time in minutes from midnight IST
    const currentMinutesIST = istHour * 60 + istMinute;
    
    // If we're already after market close + buffer, don't schedule
    if (currentMinutesIST >= marketPostCloseMinutes) {
      return;
    }
    
    // Time until post-close in minutes
    const minutesUntilPostClose = marketPostCloseMinutes - currentMinutesIST;
    
    // Convert to milliseconds
    const timeUntilPostClose = minutesUntilPostClose * 60 * 1000;
    
    if (timeUntilPostClose > 0) {
      log(`Scheduling shutdown for ${MARKET_POST_CLOSE_MINUTES} minutes after market close (in ${Math.round(timeUntilPostClose / 60000)} minutes)`);
      
      scheduledRestart = setTimeout(() => {
        // Special message for Friday
        const isFriday = istDay === 5;
        
        log(`Market closed${isFriday ? ' for the weekend' : ''}. Shutting down server until next market session...`);
        
        if (childProcess) {
          // Send market closed notification before shutting down
          // Set environment variable for the child process
          process.env.MARKET_CLOSE_SHUTDOWN = 'true';
          
          // Signal the child process to shut down
          if (childProcess.kill) {
            childProcess.kill('SIGTERM');
          }
        }
        
        // Restart the scheduler to wait for next market day
        setTimeout(() => {
          isRestarting = false;
          startProcess();
        }, 5000);
      }, timeUntilPostClose);
    }
  }
}

// Handle signals to properly shut down the child process
if (process) {
  process.on('SIGINT', () => {
    log('Received SIGINT. Shutting down server gracefully...');
    
    if (childProcess && childProcess.kill) {
      childProcess.kill('SIGINT');
    } else {
      process.exit(0);
    }
  });

  process.on('SIGTERM', () => {
    log('Received SIGTERM. Shutting down server gracefully...');
    
    if (childProcess && childProcess.kill) {
      childProcess.kill('SIGTERM');
    } else {
      process.exit(0);
    }
  });

  // Handle uncaught exceptions in the runner itself
  process.on('uncaughtException', (error) => {
    log(`UNCAUGHT EXCEPTION in runner: ${error.message}`);
    log(error.stack);
    
    // Try to restart after cooldown
    setTimeout(() => {
      isRestarting = false;
      startProcess();
    }, COOLDOWN_TIME);
  });
}

// Start the process
log('Stock Alert System Stable Runner starting...');
startProcess(); 