import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(() => {
    try { return JSON.parse(localStorage.getItem('admin_user') || 'null'); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      api.getMe()
        .then(data => setAdmin(data))
        .catch(() => { localStorage.removeItem('admin_token'); localStorage.removeItem('admin_user'); setAdmin(null); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (phoneNumber, password) => {
    const data = await api.login(phoneNumber, password);
    localStorage.setItem('admin_token', data.token);
    localStorage.setItem('admin_user', JSON.stringify(data.admin));
    setAdmin(data.admin);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    setAdmin(null);
  };

  const refreshAdmin = async () => {
    const data = await api.getMe();
    localStorage.setItem('admin_user', JSON.stringify(data));
    setAdmin(data);
    return data;
  };

  return (
    <AuthContext.Provider value={{ admin, loading, login, logout, refreshAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

