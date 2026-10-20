const BASE_URL = 'http://localhost:3000/api/v1/admin';

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
  const data = await res.json();
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
  getWithdrawals: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/withdrawals${qs ? '?' + qs : ''}`);
  },
  updateWithdrawal: (id, data) => request('PUT', `/withdrawals/${id}`, data),
  deleteWithdrawal: (id, refundPending = false) => request('DELETE', `/withdrawals/${id}${refundPending ? '?refundPending=true' : ''}`),
  bulkDeleteWithdrawals: (ids, refundPending = false) => request('POST', '/withdrawals/bulk-delete', { ids, refundPending }),
  bulkUpdateWithdrawals: (ids, status, notes = '') => request('POST', '/withdrawals/bulk-update', { ids, status, notes }),

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
  deleteAdmin: (id) => request('DELETE', `/admins/${id}`),
};

export default api;

