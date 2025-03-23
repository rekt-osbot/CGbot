# Enhanced Stock Alert System

A modern, elegant stock alert system with a beautiful dashboard and well-formatted Telegram alerts.

![Stock Alert System](https://via.placeholder.com/800x400?text=Stock+Alert+Dashboard)

## Features

- **Beautiful Dashboard**: Modern, responsive UI with real-time system status
- **Enhanced Telegram Alerts**: Well-structured, readable message formats with visual hierarchy
- **Comprehensive Monitoring**: Track system health, performance, and alert history
- **Modern Architecture**: Modular codebase with separation of concerns
- **Responsive Design**: Works great on desktop and mobile devices

## Getting Started

### Prerequisites

- Node.js 18.x or later
- npm (included with Node.js)
- A Telegram bot token and chat ID for sending alerts

### Installation

1. Clone this repository or download the files:

```bash
git clone https://github.com/yourusername/stock-alert-system.git
cd stock-alert-system
```

2. Install dependencies:

```bash
npm install
```

Alternatively, you can use the included test runner which will check and install dependencies for you:

```bash
node run-tests.js
```

3. Create a `.env` file in the root directory with your configuration:

```
PORT=3000
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
WEBHOOK_SECRET=your_webhook_secret
```

### Running Tests

The system includes a comprehensive test suite to verify all functionality:

```bash
node test-enhanced.js
```

Or use the test runner for a more guided experience:

```bash
node run-tests.js
```

### Integration

If you already have an existing stock alert application, follow these steps to integrate the enhanced features:

1. Copy the enhanced files to your project:
   - `status.js`
   - `telegramFormats.js`
   - `dashboard.html`
   - `enhanced-dashboard.js`
   - `integration.js`

2. Update your `index.js` file according to the instructions in `integration.js`

3. Install additional dependencies:

```bash
npm install handlebars --save
```

## Components

### Enhanced Dashboard

The dashboard provides real-time information about your stock alerts system:

- System health and status
- Recent alerts and error logs
- Performance metrics
- Telegram connection status

Access the dashboard at: `http://localhost:3000/status`

### Telegram Alerts

The enhanced Telegram alerts include:

- Structured layout with clear sections
- Visual indicators for price movements
- Technical analysis data
- Actionable insights based on alert type
- Daily summaries

### Status Monitoring

The system includes comprehensive monitoring:

- System performance tracking
- Error logging with timestamps
- Alert history
- Health check API endpoint

## API Endpoints

- `/status` - Web dashboard
- `/api/status` - JSON API for system status
- `/webhook` - Webhook endpoint for receiving alerts

## Development

The system uses:

- Express.js for the web server
- Handlebars for HTML templating
- Node-telegram-bot-api for Telegram integration

### Project Structure

```
├── index.js              # Main application file
├── status.js             # Status monitoring module
├── telegramFormats.js    # Telegram message formatting
├── dashboard.html        # Dashboard template
├── enhanced-dashboard.js # Dashboard controller
├── integration.js        # Integration guide
├── test-enhanced.js      # Test suite
└── data/                 # Data storage directory
    └── system_status.json # Status data
```

## Troubleshooting

**Dashboard not loading?**
- Make sure the `dashboard.html` file is in the same directory as your `index.js`
- Verify that Handlebars is installed: `npm install handlebars --save`

**Telegram messages not sending?**
- Check your environment variables for TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
- Ensure your bot has been added to the target chat

**Tests failing?**
- Run `node run-tests.js` to automatically install missing dependencies
- Check that all required files are present

## License

This project is licensed under the MIT License - see the LICENSE file for details.