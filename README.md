# Stock Alert System

A Node.js application that integrates with Telegram to provide real-time stock alerts and daily summaries.

## Features

- 📈 **Real-time Stock Alerts**: Receive instant notifications about stocks that match your criteria
- 📊 **Intraday Performance Tracking**: Percentage change calculations based on opening price
- 🔄 **Multiple Alert Formats**: Support for both single stock and multiple stocks alerts
- 📱 **Telegram Integration**: All alerts sent directly to your Telegram channel or group
- 📄 **Daily Summary Reports**: End-of-day performance summary of all alerted stocks
- 🛡️ **Stop Loss Tracking**: Automatic calculation of optimal stop loss levels
- 📉 **Performance Analytics**: Track which alerts performed best throughout the day

## Additional Features

### Status Monitoring Dashboard

The system now includes a comprehensive status monitoring dashboard that tracks:

- **System Health**: Real-time information about the application's uptime, memory usage, CPU load, etc.
- **Alert Metrics**: Track the number of alerts sent, webhooks received, and more.
- **Error Tracking**: Monitor and troubleshoot issues with the application.

Access the dashboard at `/status` to view all this information in a clean, user-friendly interface.

### Performance Analytics

Track the performance of your stock alerts with detailed analytics:

- **Success Rate**: See how many of your alerts resulted in successful trades.
- **Top Performers**: Identify which stocks and scan types perform best.
- **Historical Data**: View performance trends over different time periods (day, week, month, all-time).

Access analytics at `/analytics` to get insights into your trading strategy's effectiveness.

### MongoDB Integration

For better data persistence and scalability, the system now supports MongoDB:

1. **Data Storage**: Alerts and summaries are stored in MongoDB for long-term access.
2. **Automatic Fallback**: If MongoDB is unavailable, data is backed up locally.
3. **Free Tier Compatible**: Works with MongoDB Atlas free tier for cloud storage.

To enable MongoDB:

1. Create a free MongoDB Atlas account at [https://www.mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register)
2. Set up a cluster and get your connection string
3. Add your connection string to your environment variables:
   ```
   MONGODB_URI=mongodb+srv://username:password@cluster0.mongodb.net/stockalerts?retryWrites=true&w=majority
   ```

## Getting Started

### Prerequisites

- Node.js (v12 or above)
- A Telegram Bot Token (obtain from [@BotFather](https://t.me/botfather))
- A Telegram Chat ID (group or channel where alerts will be sent)

### Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd stock-alert-system
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file with your configuration:
   ```
   TELEGRAM_BOT_TOKEN=your-bot-token
   TELEGRAM_CHAT_ID=your-chat-id
   WEBHOOK_SECRET=optional-secret-for-webhook-authentication
   PORT=3000
   MONGODB_URI=mongodb+srv://username:password@cluster0.mongodb.net/stockalerts?retryWrites=true&w=majority
   ```

4. Start the server:
   ```
   npm start
   ```

## Usage

### Sending Test Alerts

The system includes several test scripts to simulate alerts:

1. Test multiple stocks alert:
   ```
   node test-multiple-stocks.js symbols
   ```

2. Test single stock alert:
   ```
   node test-multiple-stocks.js single
   ```

3. Test daily summary report:
   ```
   node test-daily-summary.js
   ```

### Webhook Endpoints

The system provides several endpoints:

- **POST /webhook**: Main webhook endpoint to receive stock alerts
- **GET /check/:symbol**: Check a specific stock manually
- **GET /test-telegram**: Test the Telegram connection
- **GET /test-multiple**: Test sending multiple stock alerts
- **GET /daily-summary**: Manually trigger a daily summary report
- **GET /health**: Health check endpoint

### Webhook Format

The webhook accepts JSON payloads in several formats:

1. Single stock:
   ```json
   {
     "symbol": "STOCK_SYMBOL",
     "scan_name": "Optional Scan Name"
   }
   ```

2. Multiple stocks (symbols property):
   ```json
   {
     "symbols": ["SYMBOL1", "SYMBOL2", "SYMBOL3"],
     "scan_name": "Optional Scan Name"
   }
   ```

3. Multiple stocks (array):
   ```json
   [
     { "symbol": "SYMBOL1" },
     { "symbol": "SYMBOL2" }
   ]
   ```

## Daily Summary Feature

At the end of each trading day (3:30 PM IST), the system generates a comprehensive performance report of all stocks alerted during the day. This summary includes:

- 📊 Total number of alerts sent
- 🏆 Best performing stocks
- 📉 Worst performing stocks
- 🛑 Stocks that hit their stop loss
- 💹 Overall success rate of the alerts

The summary is automatically sent to your Telegram channel, providing valuable insights into the day's trading signals.

## Alert Format

The alert messages are designed to be clean and focus on essential information:

### Single Stock Alert
```
🚨 STOCK ALERT: SYMBOL 🚨

📊 Scan: Scan Name

📈 Price: ₹123.45 🔼 2.5%
📉 StopLoss: ₹120.00 (2.8% away)
📊 20-day SMA: ₹118.50

⚠️ Stock alert triggered
```

### Multiple Stocks Alert
```
🔔 MULTIPLE STOCK ALERTS 🔔

📊 Scan: Scan Name
⏰ Time: 10:30:45

1. 📈 SYMBOL1 ₹123.45 🔼 2.5%
   📉 SL: ₹120.00 (2.8%)

2. 📈 SYMBOL2 ₹456.78 🔽 1.2%
   📉 SL: ₹460.00 (0.7%)

⚠️ 2 stocks sorted by smallest stop loss %
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

* Uses Yahoo Finance data for stock information
* Utilizes Node.js and Express for the backend
* Telegram Bot API for notifications

## Deployment to Railway

This application is ready to be deployed on [Railway](https://railway.app/), a modern cloud development platform. Follow these steps to deploy your stock alert system:

### Step 1: Set up a Railway Account

1. Sign up for a Railway account at [https://railway.app/](https://railway.app/)
2. Install the Railway CLI (optional): `npm install -g @railway/cli`

### Step 2: Deploy Your Application

#### Option 1: Deploy via GitHub

1. Push your code to a GitHub repository
2. Log in to your Railway dashboard
3. Click "New Project" and select "Deploy from GitHub repo"
4. Find and select your repository
5. Railway will automatically detect your Node.js app and deploy it

#### Option 2: Deploy via Railway CLI

1. Open a terminal in your project directory
2. Login to Railway: `railway login`
3. Initialize your project: `railway init`
4. Deploy your app: `railway up`

### Step 3: Configure Environment Variables

1. In your Railway dashboard, navigate to your project
2. Go to the "Variables" tab
3. Add the following required environment variables:
   - `TELEGRAM_BOT_TOKEN`: Your Telegram bot token
   - `TELEGRAM_CHAT_ID`: Your Telegram chat ID
   - `WEBHOOK_SECRET`: A secret key to secure your webhook (optional)

### Step 4: Set up a Domain (Optional)

1. In the Railway dashboard, go to the "Settings" tab
2. Under "Domains", click "Generate Domain"
3. Railway will provide you with a domain like `yourapp.railway.app`

### Step 5: Testing Your Deployment

1. Visit your app's domain to ensure it's running: `https://yourapp.railway.app/health`
2. Test the Telegram integration: `https://yourapp.railway.app/test-telegram`

### Webhook Configuration

Once deployed, you can set up your stock data provider to send alerts to:
```
https://yourapp.railway.app/webhook
```

If you set a webhook secret, remember to configure your provider to include the `x-webhook-secret` header with your secret value.

## Available Commands

```
npm start             # Start the application in production mode
npm run dev           # Start the application with nodemon for development
npm run test:single   # Test a single stock alert
npm run test:symbols  # Test multiple stocks alert
npm run generate-summary  # Manually generate and send a daily summary
``` 