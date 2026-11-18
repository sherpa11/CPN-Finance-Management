/**
 * Central Error Handler Middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error('[Application Error]', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.originalUrl,
    method: req.method,
  });

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message,
    errors: err.errors || undefined,
  });
};

module.exports = errorHandler;
