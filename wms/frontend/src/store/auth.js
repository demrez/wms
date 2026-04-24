import { create } from 'zustand';

const ADMIN_TOKEN_KEY = 'wms_token_admin';
const CLIENT_TOKEN_KEY = 'wms_token_client';
const LEGACY_TOKEN_KEY = 'wms_token';

function isClientScope() {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/client');
}

function readToken() {
  if (typeof window === 'undefined') return null;
  const scoped = localStorage.getItem(isClientScope() ? CLIENT_TOKEN_KEY : ADMIN_TOKEN_KEY);
  return scoped || localStorage.getItem(LEGACY_TOKEN_KEY);
}

export const useAuthStore = create((set) => ({
  user: null,
  token: readToken(),

  login: (user, token) => {
    const key = user?.role === 'client' ? CLIENT_TOKEN_KEY : ADMIN_TOKEN_KEY;
    localStorage.setItem(key, token);
    localStorage.setItem(LEGACY_TOKEN_KEY, token);
    set({ user, token });
  },

  logout: () => {
    if (isClientScope()) localStorage.removeItem(CLIENT_TOKEN_KEY);
    else localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    set({ user: null, token: null });
  },

  setUser: (user) => set({ user }),
}));
