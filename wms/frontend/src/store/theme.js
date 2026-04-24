import { create } from 'zustand';

const THEME_KEY = 'wms-ui-theme';

function readTheme() {
  if (typeof window === 'undefined') return 'dark';
  return window.localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  document.body.setAttribute('data-theme', theme);
}

export const useThemeStore = create((set, get) => ({
  theme: readTheme(),
  setTheme: (theme) => {
    const nextTheme = theme === 'light' ? 'light' : 'dark';
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_KEY, nextTheme);
    }
    applyTheme(nextTheme);
    set({ theme: nextTheme });
  },
  toggleTheme: () => {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark');
  },
}));

export function initTheme() {
  const theme = readTheme();
  applyTheme(theme);
  return theme;
}
