# MongoDB Connection Fix Guide

Your Telegram stock alert system is currently experiencing MongoDB connection issues. This guide will help you resolve these issues to ensure your database functions correctly.

## Current Issue

The system is showing error messages like:

```
MongoDB connection error: MongooseServerSelectionError: Could not connect to any servers in your MongoDB Atlas cluster.
```

This is typically caused by one of the following issues:

1. **IP Whitelist Restrictions**: Railway's IP addresses are not whitelisted in MongoDB Atlas
2. **Invalid Connection String**: The MongoDB URI environment variable is incorrect
3. **Authentication Issues**: Username or password in the connection string is incorrect

## Immediate Fixes

### Fix 1: Update MongoDB Atlas IP Whitelist

1. Log in to your [MongoDB Atlas account](https://cloud.mongodb.com/)
2. Select your project and cluster (appears to be `cluster0`)
3. Click on "Network Access" in the left sidebar
4. Click "Add IP Address"
5. Choose one of these options:
   - Add `0.0.0.0/0` to allow access from anywhere (easiest but less secure)
   - Add Railway's IP addresses (more secure)
     - Contact Railway support to get their current IP addresses
     - Or, wait for a deployment and check the logs for the IP that's trying to connect

### Fix 2: Verify Your MongoDB Connection String

The connection string should look like:
```
mongodb+srv://<username>:<password>@cluster0.ygywb.mongodb.net/<database>?retryWrites=true&w=majority
```

1. In Railway, go to your project settings
2. Check the `MONGODB_URI` environment variable
3. Verify that:
   - The username and password are correct
   - The cluster address matches your Atlas cluster (looks like it should be `cluster0.ygywb.mongodb.net`)
   - The database name is correctly specified

### Fix 3: Test the Connection Locally

To verify if the connection string is working:

1. Install MongoDB Compass (GUI tool)
2. Paste your connection string
3. If it connects successfully, the issue is likely with IP whitelisting
4. If it fails, the connection string itself may be incorrect

## App Behavior During Connection Issues

We've updated the application to handle MongoDB connection issues gracefully:

1. The status page will show "database disconnected" instead of "undefined"
2. The resend alerts page will display a helpful error message
3. Core functionality like receiving webhooks and sending Telegram alerts will still work
4. Data will be temporarily stored in local files until the database connection is restored

## Long-term Solutions

For a more reliable setup:

1. **Consider Using Railway's MongoDB Add-on**:
   - Railway offers a MongoDB database add-on that automatically handles connectivity
   - This eliminates IP whitelisting issues since everything is within the Railway network

2. **Set Up Connection Pooling**:
   - MongoDB Atlas offers a connection pooling service called "Atlas Data Lake"
   - This can help with intermittent connection issues

3. **Implement Robust Retry Logic**:
   - We've already added basic reconnection logic to the app
   - This can be further enhanced with exponential backoff if needed

## After Fixing the Connection

Once you've fixed the connection:

1. Restart your Railway deployment
2. Check the logs for any remaining MongoDB-related errors
3. Visit the `/status` page to verify the connection status shows "healthy"
4. Check the `/resend-alerts` page to see if alerts are being properly retrieved

## Need Help?

If you continue to experience issues:

1. Check the Railway logs for specific error messages
2. Contact MongoDB Atlas support with your cluster ID (appears to be `atlas-5vs8ph-shard-0`)
3. Review the [MongoDB Atlas connection troubleshooting guide](https://docs.mongodb.com/atlas/troubleshoot-connection/)

We hope this guide helps you resolve the connection issues quickly! The system will continue to function in a limited capacity until the database connection is restored. 