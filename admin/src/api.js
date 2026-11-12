const defaultApiUrl = import.meta.env.DEV
  ? 'http://localhost:3000'
  : (typeof window !== 'undefined' ? window.location.origin : '');
const API_URL = import.meta.env.VITE_API_URL || defaultApiUrl;
const BASE_URL = `${API_URL}/api/v1/admin`;

function getToken() {
  return localStorage.getItem('admin_token');
}

async function request(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);
  if (res.status === 401 && path !== '/auth/login') {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
  }
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Invalid server response (${res.status})`);
  }
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

const api = {
  // Auth
  login: (phoneNumber, password) => request('POST', '/auth/login', { phoneNumber, password }),
  getMe: () => request('GET', '/auth/me'),
  updateProfile: (data) => request('PUT', '/auth/profile', data),

  // Dashboard
  getDashboardStats: () => request('GET', '/dashboard/stats'),
  getRecentTransactions: () => request('GET', '/dashboard/recent-transactions'),
  getRecentGames: () => request('GET', '/dashboard/recent-games'),
  getRevenueChart: () => request('GET', '/dashboard/revenue-chart'),

  // Players
  getPlayers: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/players${qs ? '?' + qs : ''}`);
  },
  getPlayer: (id) => request('GET', `/players/${id}`),
  createPlayer: (data) => request('POST', '/players', data),
  updatePlayer: (id, data) => request('PUT', `/players/${id}`, data),
  deletePlayer: (id) => request('DELETE', `/players/${id}`),
  bulkDeletePlayers: (data) => request('POST', '/players/bulk-delete', data),
  updatePlayerStatus: (id, isActive) => request('PUT', `/players/${id}/status`, { isActive }),
  adjustPlayerBalance: (id, amount, mode) => request('POST', `/players/${id}/adjust-balance`, { amount, mode }),

  // Games
  getGames: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/games${qs ? '?' + qs : ''}`);
  },
  getGame: (id) => request('GET', `/games/${id}`),
  createGame: (data) => request('POST', '/games', data),
  updateGame: (id, data) => request('PUT', `/games/${id}`, data),
  deleteGame: (id) => request('DELETE', `/games/${id}`),
  refundGame: (id) => request('POST', `/games/${id}/refund`),
  forceStartGame: (id) => request('POST', `/games/${id}/force-start`),

  // Room Configs
  getRoomConfigs: () => request('GET', '/room-configs'),
  updateQuota: (groupSize, maxSeatsPerUser) => request('PUT', `/room-configs/quota/${groupSize}`, { maxSeatsPerUser }),

  // Transactions & Withdrawals
  getTransactions: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/transactions${qs ? '?' + qs : ''}`);
  },
  deleteTransaction: (id, confirmPassword) => request('DELETE', `/transactions/${id}`, { confirmPassword }),
  bulkDeleteTransactions: (ids, confirmPassword) => request('POST', '/transactions/bulk-delete', { ids, confirmPassword }),
  getTransactionAuditLogs: () => request('GET', '/transactions/audit-logs'),
  getWithdrawals: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/withdrawals${qs ? '?' + qs : ''}`);
  },
  updateWithdrawal: (id, data) => request('PUT', `/withdrawals/${id}`, data),
  deleteWithdrawal: (id, refundPending = false, confirmPassword) => request('DELETE', `/withdrawals/${id}${refundPending ? '?refundPending=true' : ''}`, { refundPending, confirmPassword }),
  bulkDeleteWithdrawals: (ids, refundPending = false, confirmPassword) => request('POST', '/withdrawals/bulk-delete', { ids, refundPending, confirmPassword }),
  bulkUpdateWithdrawals: (ids, status, notes = '', confirmPassword) => request('POST', '/withdrawals/bulk-update', { ids, status, notes, confirmPassword }),
  getWithdrawalAuditLogs: () => request('GET', '/withdrawals/audit-logs'),

  // Profit
  getProfitSummary: () => request('GET', '/profit/summary'),
  getProfitChart: (period) => request('GET', `/profit/chart?period=${period || '30d'}`),

  // Prize Settings
  getPrizeSettings: () => request('GET', '/prize-settings'),

  // Reports
  getPlayerReport: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/reports/players${qs ? '?' + qs : ''}`);
  },
  getGameReport: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/reports/games${qs ? '?' + qs : ''}`);
  },
  getTransactionReport: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/reports/transactions${qs ? '?' + qs : ''}`);
  },
  getProfitReport: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/reports/profit${qs ? '?' + qs : ''}`);
  },

  // Settings & Admins
  getSettings: () => request('GET', '/settings'),
  updateSettings: (data) => request('PUT', '/settings', data),
  getAdmins: () => request('GET', '/admins'),
  createAdmin: (data) => request('POST', '/create-admin', data),
  updateAdmin: (id, data) => request('PUT', `/admins/${id}`, data),
  deleteAdmin: (id) => request('DELETE', `/admins/${id}`),
};

export default api;

