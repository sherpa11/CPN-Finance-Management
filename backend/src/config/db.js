/**
 * MongoDB Connection Configuration with Optimized Serverless Connection Caching
 */
require('dotenv').config();
const mongoose = require('mongoose');

// Serverless-aware global connection cache to prevent duplicate connection pools across invocations
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  const uri =
    process.env.NODE_ENV === 'test'
      ? process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/cpn_raja_test_db'
      : process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cpn_raja_vatti_db';

  if (!cached.promise) {
    const opts = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: process.env.VERCEL ? 10 : 20,
      minPoolSize: process.env.VERCEL ? 1 : 2,
      autoIndex: true,
    };

    cached.promise = mongoose.connect(uri, opts).then((mongooseInstance) => {
      if (process.env.NODE_ENV !== 'test') {
        console.log(
          `[MongoDB] Connected successfully to: ${mongooseInstance.connection.host}/${mongooseInstance.connection.name}`
        );
      }
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (error) {
    cached.promise = null;
    console.error(`[MongoDB] Initial connection failure: ${error.message}`);
    if (process.env.NODE_ENV === 'test' || process.env.VERCEL) {
      throw error;
    }
    process.exit(1);
  }
};

module.exports = connectDB;
