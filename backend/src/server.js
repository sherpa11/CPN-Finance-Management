require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const { evaluateDueNotifications } = require('./services/notificationService');

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
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
  CPN RAJA – VATTI MANAGEMENT SYSTEM
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
