import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initTheme, useThemeStore } from './store/theme';

initTheme();

function ThemeSync() {
  const theme = useThemeStore((state) => state.theme);

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeSync />
  </React.StrictMode>
);
