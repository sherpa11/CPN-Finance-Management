import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
  validateStatus: (status) => (status >= 200 && status < 300) || status === 304,
});

// In-flight deduplication and short-TTL response cache
const inFlightRequests = new Map();
const cache = new Map();
const DEFAULT_TTL_MS = 5000; // 5-second short cache for GET requests

export function clearApiCache() {
  cache.clear();
}

function getCacheKey(url, params) {
  let paramStr = '';
  if (params) {
    if (typeof params === 'string') {
      paramStr = params;
    } else if (params instanceof URLSearchParams) {
      paramStr = params.toString();
    } else {
      try {
        paramStr = JSON.stringify(params);
      } catch {
        paramStr = String(params);
      }
    }
  }
  return `${url}?${paramStr}`;
}

// Request interceptor to attach JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('cpn_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle auth expiration and invalidate cache on mutations
api.interceptors.response.use(
  (response) => {
    const method = response.config?.method?.toLowerCase();
    // Whenever a mutation succeeds, invalidate cache so subsequent reads are strictly up to date
    if (['post', 'put', 'patch', 'delete'].includes(method)) {
      clearApiCache();
    }
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('cpn_token');
      localStorage.removeItem('cpn_user');
      clearApiCache();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Optimized wrapped GET with in-flight deduplication and short-TTL caching
const originalGet = api.get.bind(api);
api.get = function (url, config = {}) {
  const isSkipCache = config.skipCache === true || config.headers?.['cache-control'] === 'no-cache';
  const ttl = config.cacheTTL || DEFAULT_TTL_MS;
  const key = getCacheKey(url, config.params);

  // 1. Check valid cache entry
  if (!isSkipCache && cache.has(key)) {
    const entry = cache.get(key);
    if (Date.now() - entry.timestamp < ttl) {
      return Promise.resolve(entry.response);
    }
    cache.delete(key);
  }

  // 2. Check in-flight request deduplication
  if (!isSkipCache && inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }

  // 3. Execute request and share promise among concurrent callers
  const requestPromise = originalGet(url, config)
    .then((response) => {
      if (!isSkipCache && response.status === 200) {
        cache.set(key, {
          timestamp: Date.now(),
          response,
        });
      }
      return response;
    })
    .finally(() => {
      inFlightRequests.delete(key);
    });

  if (!isSkipCache) {
    inFlightRequests.set(key, requestPromise);
  }

  return requestPromise;
};

export default api;
