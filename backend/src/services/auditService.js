/**
 * Audit Log Service
 */
const AuditLog = require('../models/AuditLog');

async function logAuditEvent({
  action,
  entityType,
  entityId,
  performedBy,
  ipAddress,
  previousState,
  newState,
  details,
}) {
  try {
    const logId = `AUD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const log = new AuditLog({
      logId,
      action,
      entityType,
      entityId: String(entityId),
      performedBy: performedBy || 'CPN Raja',
      ipAddress: ipAddress || '127.0.0.1',
      previousState,
      newState,
      details: details || '',
      timestamp: new Date(),
    });
    await log.save();
    return log;
  } catch (error) {
    console.error('[AuditService] Failed to record audit log:', error.message);
    // Non-blocking for primary transaction, but logged
  }
}

module.exports = {
  logAuditEvent,
};
