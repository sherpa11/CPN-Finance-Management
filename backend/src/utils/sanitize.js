/**
 * Centralized Input Sanitization & Security Utilities
 * Protects against ReDoS, RegExp injection, and NoSQL operator injection.
 */

/**
 * Escapes any special characters for use in RegExp constructors
 * Prevents SyntaxError when searching phone numbers with '+', parentheses, etc.
 * @param {string} text
 * @returns {string}
 */
function escapeRegex(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * Safely prepares a search string for MongoDB regex search
 * @param {any} input
 * @returns {string} sanitized trimmed string safe for RegExp
 */
function sanitizeSearch(input) {
  if (typeof input !== 'string') return '';
  return escapeRegex(input.trim());
}

/**
 * Ensures input is a clean trimmed string
 * @param {any} input
 * @param {string} fallback
 * @returns {string}
 */
function cleanString(input, fallback = '') {
  if (typeof input !== 'string') return fallback;
  return input.trim();
}

module.exports = {
  escapeRegex,
  sanitizeSearch,
  cleanString,
};
