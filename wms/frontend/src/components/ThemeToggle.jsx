import { useThemeStore } from '../store/theme';

export default function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

  return (
    <div className="app-theme-toggle-wrap">
      <span className="app-theme-toggle-label">Тема</span>
      <div className="app-theme-toggle" role="group" aria-label="Переключение темы">
        <button
          type="button"
          className={`app-theme-toggle-btn${theme === 'light' ? ' active' : ''}`}
          onClick={() => setTheme('light')}
          aria-label="Светлая тема"
          title="Светлая тема"
        >
          ☀
        </button>
        <button
          type="button"
          className={`app-theme-toggle-btn${theme === 'dark' ? ' active' : ''}`}
          onClick={() => setTheme('dark')}
          aria-label="Тёмная тема"
          title="Тёмная тема"
        >
          ☾
        </button>
      </div>
    </div>
  );
}
