require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const { evaluateDueNotifications } = require('./services/notificationService');

const PORT = process.env.PORT || 5000;

function validateEnvironment() {
  const isProduction = process.env.NODE_ENV === 'production';
  const missing = [];

  if (isProduction) {
    if (!process.env.MONGODB_URI) {
      missing.push('MONGODB_URI (MongoDB Atlas connection string)');
    }
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
      missing.push('JWT_SECRET (Cryptographically secure string, minimum 16-32 characters)');
    }
  }

  if (missing.length > 0) {
    console.error('\n=====================================================');
    console.error('  FATAL: CRITICAL ENVIRONMENT CONFIGURATION MISSING');
    console.error('=====================================================');
    missing.forEach((m) => console.error(`  - Missing: ${m}`));
    console.error('Please configure these in your deployment environment variables.\n');
    process.exit(1);
  }
}

async function startServer() {
  try {
    validateEnvironment();
    await connectDB();

    // Initial evaluation of dues and notifications on startup
    try {
      const notifResult = await evaluateDueNotifications();
      console.log(`[Notification Engine] Synchronized on startup: ${notifResult.count} notifications.`);
    } catch (nErr) {
      console.error('[Notification Engine] Startup sync error:', nErr.message);
    }

    // Schedule periodic due evaluation check every 30 minutes
    setInterval(async () => {
      try {
        await evaluateDueNotifications();
      } catch (err) {
        console.error('[Notification Engine] Periodic evaluation error:', err.message);
      }
    }, 30 * 60 * 1000);

    const server = app.listen(PORT, () => {
      console.log(`
=====================================================
  CPN RAJA – FINANCE MANAGEMENT SYSTEM
  Backend Server Running on Port: ${PORT}
  Environment: ${process.env.NODE_ENV || 'development'}
  Timezone: ${process.env.TIMEZONE || 'Asia/Kolkata'}
=====================================================
      `);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('[Server] SIGTERM received. Shutting down gracefully...');
      server.close(() => {
        console.log('[Server] Process terminated.');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('[Server Startup Failure]', error);
    process.exit(1);
  }
}

startServer();
