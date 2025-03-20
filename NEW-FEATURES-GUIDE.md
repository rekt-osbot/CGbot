# New Web Dashboard Features

We've added several new features to your Telegram bot's web dashboard that make it easier to test webhooks and recover from any alert delivery failures.

## New Features

### 1. Test Webhook Dashboard

A user-friendly web interface to test your webhook functionality:

- **URL**: `https://cgalerts-production.up.railway.app/test-webhook-dashboard`
- **Features**:
  - Form to send test webhooks directly from the browser
  - Configurable stock symbol, price, and scan name
  - Real-time response display
  - Direct integration with your existing webhook endpoint

### 2. Resend Alerts Dashboard

A dashboard to view and resend any alerts that may have failed to deliver:

- **URL**: `https://cgalerts-production.up.railway.app/resend-alerts`
- **Features**:
  - Lists all alerts received today
  - Grouped by scan name for easy organization
  - One-click resending of individual alerts
  - Bulk resend option for all alerts in a scan
  - Visual confirmation of successful resends

### 3. Improved Status Dashboard

We've enhanced the status dashboard with direct links to the new features:

- **URL**: `https://cgalerts-production.up.railway.app/status`
- **New Features**:
  - Quick action buttons for testing webhooks and Telegram
  - Link to resend alerts
  - Cleaner, more organized interface
  - Real-time status information

## How to Use

### Testing Webhooks

1. Go to `/test-webhook-dashboard`
2. Enter a stock symbol (e.g., "RELIANCE")
3. Set a trigger price
4. Enter a scan name
5. Click "Send Webhook"
6. You'll see the response and a message will be sent to Telegram

### Resending Alerts

1. Go to `/resend-alerts`
2. View all alerts from today, organized by scan
3. Click "Resend" next to any individual alert
4. Or click "Resend All" to resend all alerts for a particular scan
5. A status message will confirm successful delivery

## Technical Improvements

1. **MongoDB Integration**:
   - Added methods to retrieve alerts by ID (`getAlertById`)
   - Added methods to retrieve alerts by scan name (`getAlertsByScan`)
   - Added method to retrieve alerts after a date (`getAlertsAfterDate`)

2. **API Endpoints**:
   - `/api/resend-alert` - Resends a single alert by ID
   - `/api/resend-alerts-by-scan` - Resends all alerts for a specific scan

3. **"stocks" field support**:
   - The webhook handler now correctly processes webhooks with the "stocks" field
   - This ensures compatibility with your analytics platform's webhook format

## Deployment

These features are already included in the latest code changes. To deploy them:

1. Commit the changes to your git repository:
   ```
   git add .
   git commit -m "Add webhook testing and alert resending features"
   git push
   ```

2. Railway will automatically deploy the updates based on your git integration.

## Note on Data Security

The resend alerts feature only shows alerts from the current day to avoid exposing too much historical data. If you need to resend older alerts, you would need to modify the date filter in the code. 