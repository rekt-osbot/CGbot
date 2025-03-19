# Stock Alert System

A powerful Node.js application that sends real-time stock alerts to Telegram, with performance tracking and analytics.

![Stock Alert System Banner](https://i.imgur.com/your-banner-image.png) *(Optional: Add a banner image)*

## 📋 Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Requirements](#requirements)
- [Installation Guide](#installation-guide)
- [Setting Up Telegram](#setting-up-telegram)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [Testing Your Setup](#testing-your-setup)
- [Using the System](#using-the-system)
- [Monitoring & Analytics](#monitoring--analytics)
- [Database Integration](#database-integration)
- [Customization](#customization)
- [Troubleshooting](#troubleshooting)
- [Deployment](#deployment)
- [Support & Contributing](#support--contributing)
- [License](#license)

## 🚀 Introduction

The Stock Alert System is designed to help traders receive timely notifications about stocks matching their criteria. Whether you're a day trader looking for quick intraday movements or a long-term investor tracking multiple stocks, this system provides real-time alerts and performance analytics directly to your Telegram account.

## ✨ Features

### Core Functionality
- **📱 Telegram Integration**: Receive all alerts directly on your mobile or desktop via Telegram
- **📈 Real-time Stock Alerts**: Get notified instantly when stocks match your criteria
- **📊 Intraday Performance**: Track stock performance from market open
- **🛡️ Stop Loss Tracking**: Automatically calculate and monitor stop loss levels
- **📉 Multiple Alert Formats**: Support for both single and multiple stock alerts

### Enhanced Features
- **📑 Daily Summary Reports**: Receive end-of-day performance summaries of all alerted stocks
- **📊 Dashboard & Analytics**: Web interface to monitor system status and alert performance
- **💾 MongoDB Integration**: Store all your alerts and performance data for long-term analysis
- **📋 Performance Metrics**: Track which stock scans and alerts perform best
- **🔄 Auto-scheduled Summaries**: Get daily reports automatically at market close

## 🔧 Requirements

Before you begin, make sure you have:

1. **Node.js**: Version 12.0 or higher
   - [Download Node.js](https://nodejs.org/)
   - To check your version, run: `node -v` in your terminal/command prompt

2. **Telegram Account**:
   - You'll need a Telegram account to receive alerts
   - You'll create a Telegram bot using BotFather (instructions below)

3. **Basic Terminal/Command Line Knowledge**:
   - Know how to navigate directories and run commands

4. **Internet Connection**:
   - Required for fetching stock data and sending Telegram messages

## 📥 Installation Guide

### Step 1: Download the Project

**Option A: Using Git** (Recommended if you have Git installed)
```bash
git clone https://github.com/yourusername/stock-alert-system.git
cd stock-alert-system
```

**Option B: Download ZIP**
1. Download the project as a ZIP file
2. Extract it to a folder on your computer
3. Open terminal/command prompt and navigate to that folder:
   ```bash
   cd path/to/stock-alert-system
   ```

### Step 2: Install Dependencies

Run this command in your terminal/command prompt from the project directory:
```bash
npm install
```

This will install all required packages. You'll see some text output as npm downloads the necessary files.

## 📱 Setting Up Telegram

### Creating a Telegram Bot

1. **Start a chat with BotFather**:
   - Open Telegram and search for "@BotFather"
   - Start a chat and send the command: `/newbot`

2. **Name your bot**:
   - Follow BotFather's instructions to create a name
   - Then create a username (must end with "bot")

3. **Save your API token**:
   - BotFather will give you an API token (looks like `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`)
   - **Keep this token secure!** It's how the system authenticates with Telegram

### Getting your Chat ID

1. **Create a group or channel**: 
   - Create a new Telegram group or channel where you want to receive alerts
   - Add your new bot to this group/channel as an administrator

2. **Get the Chat ID**:
   - **Option 1**: Use the "getUpdates" method:
     - Visit `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates` in your browser
     - Replace `<YOUR_BOT_TOKEN>` with your actual bot token
     - Find the "chat" object and note the "id" value (will be negative for groups)

   - **Option 2**: Add @RawDataBot to your group, then remove it after getting the chat ID

## ⚙️ Configuration

### Creating the Environment File

1. Create a new file named `.env` in your project folder
2. Add the following content, replacing the placeholder values with your actual information:

```
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id

# Webhook Security (create any random string)
WEBHOOK_SECRET=create_a_random_string_here

# Server Configuration
PORT=3000

# Database (Optional - see MongoDB section)
# MONGODB_URI=mongodb+srv://username:password@cluster0.mongodb.net/stockalerts
```

### Required Values Explanation

- **TELEGRAM_BOT_TOKEN**: The token you received from BotFather
- **TELEGRAM_CHAT_ID**: The ID of your group/channel (often a negative number for groups)
- **WEBHOOK_SECRET**: Any random string to secure your webhooks
- **PORT**: The port your server will run on (3000 is standard)

## 🚀 Running the Application

### Starting the Server

From your project directory, run:
```bash
npm start
```

You should see output confirming the server is running, typically:
```
Server running on port 3000
Connected to Telegram bot: YourBotName
```

Keep this terminal window open while using the system.

### Stable Running Mode (Recommended)

To prevent unnecessary restarts that can cause duplicate Telegram notifications, use the stable running mode:

```bash
npm run start:stable
```

The stable runner:
- Monitors the main application process
- Only restarts if the process truly crashes (with exit code other than 0)
- Implements cooldown periods between restarts
- Limits the number of restarts in a given time period
- Logs all events to `server.log`

This mode is highly recommended for production environments.

### Making the Server Run in Background (Optional)

- **On Windows**: Use a tool like [PM2](https://pm2.keymetrics.io/) or [Forever](https://github.com/foreversd/forever)
- **On Mac/Linux**: Use `nohup npm run start:stable &` or PM2

## 🧪 Testing Your Setup

Let's make sure everything is working correctly:

### 1. Test Telegram Connection

Run this command in a new terminal window:
```bash
node test-telegram.js
```

You should receive a test message in your Telegram group/channel.

### 2. Test Single Stock Alert

```bash
node test-multiple-stocks.js single
```

### 3. Test Multiple Stocks Alert

```bash
node test-multiple-stocks.js symbols
```

### 4. Test Daily Summary Report

```bash
node generate-summary.js
```

After each test, check your Telegram to see if you received the corresponding message.

## 🎯 Using the System

### Understanding Alert Formats

#### Single Stock Alert
The system sends detailed information about one stock:
```
🚨 STOCK ALERT: RELIANCE 🚨

📈 Price: ₹2,500.50 🔼 3.2% from open
📉 StopLoss: ₹2,450.00 (2.0% away)

⚠️ Stock alert triggered at 10:30 AM
```

#### Multiple Stocks Alert
For multiple stocks in a single notification:
```
🔔 MULTIPLE STOCK ALERTS 🔔

1. 📈 RELIANCE ₹2,500.50 🔼 3.2%
   📉 SL: ₹2,450.00 (2.0%)

2. 📈 HDFCBANK ₹1,655.75 🔼 1.8%
   📉 SL: ₹1,630.00 (1.5%)

⚠️ 2 stocks alerted at 10:30 AM
```

### Daily Summary Report
At the end of each trading day, you'll receive a performance summary:
```
📊 DAILY TRADING SUMMARY 📊

📅 Date: 19/03/2023

📈 OVERALL PERFORMANCE
Total Alerts: 10
Winners: 7 (70.0%)
Losers: 3 (30.0%)
Hit Stop Loss: 1

🏆 TOP PERFORMERS
1. RELIANCE: 🔼 5.2%
   Alert: ₹2,450.00 → Current: ₹2,577.40

2. TATASTEEL: 🔼 4.1%
   Alert: ₹950.00 → Current: ₹989.45

📉 WORST PERFORMERS
1. INFY: 🔽 2.1%
   Alert: ₹1,450.00 → Current: ₹1,419.55
```

### Webhook Integration

To receive actual alerts from your trading platform or scanner:

1. **Configure your trading platform/scanner** to send webhook notifications to:
   ```
   http://your-server-address:3000/webhook
   ```

2. **Add the secret header** for security:
   - Header name: `x-webhook-secret`
   - Value: The same value as your `WEBHOOK_SECRET` environment variable

3. **Format the payload** according to one of these formats:

   **Single Stock:**
   ```json
   {
     "symbol": "RELIANCE",
     "scan_name": "Breakout Scanner"
   }
   ```

   **Multiple Stocks:**
   ```json
   {
     "symbols": ["RELIANCE", "TATASTEEL", "HDFCBANK"],
     "scan_name": "Momentum Scanner"
   }
   ```

## 📊 Monitoring & Analytics

The system includes built-in monitoring and analytics dashboards.

### Status Dashboard

Access at: `http://your-server-address:3000/status`

The status dashboard shows:
- System uptime and health
- Alert statistics
- Error rates
- Recent activity

### Analytics Dashboard

Access at: `http://your-server-address:3000/analytics`

The analytics dashboard provides:
- Success rate of alerts
- Best and worst performing stocks
- Top performing scan types
- Historical performance data
- Customizable date ranges (day, week, month, all time)

### API Endpoints

For technical users or integrating with other systems:

- **`/api/status`**: Get server status information
- **`/api/analytics?period=day|week|month|all`**: Get performance analytics
- **`/health`**: Simple health check endpoint

## 💾 Database Integration

By default, the system stores data locally, but for better reliability and performance, you can connect it to MongoDB.

### Setting Up MongoDB (Optional but Recommended)

1. **Create a free MongoDB Atlas account**:
   - Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
   - Sign up for a free account
   - Create a new cluster (the free tier is sufficient)

2. **Set up database access**:
   - Create a database user with password
   - Allow network access from anywhere (or specify your server's IP)

3. **Get your connection string**:
   - Click "Connect" on your cluster
   - Choose "Connect your application"
   - Copy the connection string

4. **Add to your .env file**:
   ```
   MONGODB_URI=mongodb+srv://username:password@cluster0.mongodb.net/stockalerts?retryWrites=true&w=majority
   ```
   (Replace with your actual connection string)

5. **Restart your application**:
   - Stop the running server (Ctrl+C)
   - Start it again: `npm start`

### Benefits of Using MongoDB

- **Data Persistence**: Your alerts and analytics are stored long-term
- **Better Performance**: Faster analytics for large datasets
- **Reliability**: Data is stored in the cloud, not just locally
- **Scalability**: Can handle thousands of alerts without issues

## 🔧 Customization

### Alert Formatting

To customize how alerts look, edit the following files:

- **Single Stock Alerts**: Edit the `formatSingleStockAlert` function in `index.js`
- **Multiple Stocks Alerts**: Edit the `formatMultipleStocksMessage` function in `index.js`
- **Daily Summary**: Edit the `generateDailySummary` method in `stockSummary.js`

### Adding Custom Calculators

You can extend the system with custom calculators:

1. Create a new file in the project root (e.g., `myCalculator.js`)
2. Add your logic to calculate custom indicators
3. Import and use in `stockData.js`

## 🔍 Troubleshooting

### Common Issues and Solutions

**Issue**: Telegram messages not being sent
- **Check**: Verify your TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
- **Check**: Ensure your bot has permission to post in the channel/group
- **Test**: Run `node test-telegram.js`

**Issue**: Webhook not receiving alerts
- **Check**: Verify your server is accessible from the internet
- **Check**: Confirm the webhook URL in your trading platform/scanner
- **Check**: Verify the webhook secret is correct
- **Test**: Run `node test-multiple-stocks.js single`

**Issue**: MongoDB connection failing
- **Check**: Verify your MONGODB_URI in the .env file
- **Check**: Ensure your IP address is whitelisted in MongoDB Atlas
- **Test**: Run `node test-db.js`

**Issue**: Node.js errors when starting
- **Check**: Verify you're using Node.js v12 or higher
- **Check**: Run `npm install` again to ensure all dependencies are installed

## 🌐 Deployment

### Railway Deployment (Recommended)

This application is optimized for Railway deployment with automatic market hours handling. Here's how to set it up:

1. **Create a Railway account** at [railway.app](https://railway.app) if you don't have one already
2. **Deploy your application** using one of these methods:
   - Option 1: Deploy directly from GitHub
     - Push your code to a GitHub repository
     - In Railway, click "New Project" → "Deploy from GitHub repo"
     - Select your repository
   - Option 2: Deploy with the Railway CLI
     - Install the Railway CLI: `npm i -g @railway/cli`
     - Login: `railway login`
     - Link to your project: `railway link`
     - Deploy: `railway up`
3. **Set up environment variables**
   - In Railway dashboard, go to your project → Variables
   - Add all the required variables from `.env.example`:
     - `TELEGRAM_BOT_TOKEN`
     - `TELEGRAM_CHAT_ID`
     - `WEBHOOK_SECRET`
     - `MONGODB_URI` (if using MongoDB)
   - Add `RAILWAY_ENVIRONMENT=true` to optimize for Railway

4. **Configure project settings**
   - In Railway dashboard, go to your project → Settings
   - Set memory limit to at least 512 MB
   - Enable "Always On" if you want 24/7 availability (app will still only run during market hours)

5. **Set up your webhook endpoint**
   - In Railway dashboard, go to your project → Settings → Domains
   - Generate a custom domain or use the provided Railway domain
   - Use this URL as your webhook endpoint in ChartInk or other services

Railway will automatically build and deploy your application. The stable process manager will keep your service running during market hours and handle restarts appropriately.

### Troubleshooting Railway Deployments

If you encounter build failures when connecting your Git repository to Railway, try these solutions:

1. **Manual deployment first**:
   - Run `railway up` from your local machine to test the deployment
   - Once successful, try connecting the Git repository again

2. **Check build logs**:
   - In Railway dashboard, go to your project → Deployments
   - Click on the failed deployment to view logs
   - Look for specific error messages

3. **Alternative configuration files**:
   This repository includes multiple configuration options for Railway:
   - `railway.json` - Primary configuration
   - `railway.toml` - Alternative TOML format
   - `Procfile` - Simple process definition
   - `nixpacks.toml` - Custom build instructions

4. **Environment variables**:
   - Ensure all required environment variables are set in Railway
   - Double-check for typos or missing variables

5. **Node.js version**:
   - Railway uses the Node.js version specified in package.json
   - Ensure your `engines` field specifies a compatible version

### Market Hours Operation

The stable runner is configured to run automatically during Indian stock market hours with buffer periods:

- **Market Hours**: Monday-Friday, 9:00 AM to 3:45 PM IST
- **Operation Window**: 
  - Starts 15 minutes before market open (8:45 AM IST)
  - Runs through market hours
  - Continues 30 minutes after market close (4:15 PM IST)
- **Behavior**:
  - On Railway and self-hosted: Only runs during the extended market hours window
  - Outside market hours: The process sleeps to conserve resources
  - On weekends: Automatically sleeps until Monday morning

The system will:
1. Start automatically 15 minutes before market open
2. Send notifications only when necessary (not on every restart)
3. Run through the entire trading day
4. Continue for 30 minutes after market close to capture post-market activity
5. Shut down gracefully after the post-market period
6. Sleep during weekends and holidays, automatically waking on the next trading day

This optimization ensures reliable operation during trading hours while minimizing resource usage and unnecessary notifications.

## 🤝 Support & Contributing

### Getting Help

If you encounter issues or have questions:
- Check the troubleshooting section above
- Create an issue in the GitHub repository
- Contact the developers directly at [your-email@example.com]

### Contributing

Contributions are welcome! To contribute:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## 📚 Available Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start the server (basic mode) |
| `npm run start:stable` | Start the server with automatic crash recovery (recommended for production) |
| `node test-telegram.js` | Test Telegram connectivity |
| `node test-multiple-stocks.js single` | Test single stock alert |
| `node test-multiple-stocks.js symbols` | Test multiple stocks alert |
| `node generate-summary.js` | Generate and send a daily summary |
| `node test-db.js` | Test database connectivity |

---

*Built with ❤️ for traders and investors* 