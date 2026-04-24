import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

const ADMIN_TOKEN_KEY = 'wms_token_admin';
const CLIENT_TOKEN_KEY = 'wms_token_client';
const LEGACY_TOKEN_KEY = 'wms_token';

function getScopeToken() {
  const isClientScope = window.location.pathname.startsWith('/client');
  const scoped = localStorage.getItem(isClientScope ? CLIENT_TOKEN_KEY : ADMIN_TOKEN_KEY);
  return scoped || localStorage.getItem(LEGACY_TOKEN_KEY);
}

// Добавляем токен к каждому запросу
api.interceptors.request.use(config => {
  const token = getScopeToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Если 401 — редирект на логин
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      const isClientScope = window.location.pathname.startsWith('/client');
      localStorage.removeItem(isClientScope ? CLIENT_TOKEN_KEY : ADMIN_TOKEN_KEY);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      window.location.href = isClientScope ? '/client/login' : '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
