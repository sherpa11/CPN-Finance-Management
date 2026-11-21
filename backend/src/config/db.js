/**
 * MongoDB Connection Configuration
 */
require('dotenv').config();
const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    isConnected = true;
    return mongoose.connection;
  }

  const uri = process.env.NODE_ENV === 'test'
    ? (process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/cpn_raja_test_db')
    : (process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cpn_raja_vatti_db');

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: true,
    });

    isConnected = conn.connections[0].readyState === 1;
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[MongoDB] Connected successfully to: ${conn.connection.host}/${conn.connection.name}`);
    }
    
    mongoose.connection.on('error', (err) => {
      console.error('[MongoDB] Connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[MongoDB] Disconnected from server');
      }
      isConnected = false;
    });

    return conn;
  } catch (error) {
    console.error(`[MongoDB] Initial connection failure: ${error.message}`);
    if (process.env.NODE_ENV === 'test') {
      throw error;
    }
    process.exit(1);
  }
};

module.exports = connectDB;
