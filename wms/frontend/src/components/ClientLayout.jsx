import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useMe } from '../hooks/queries';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import api from '../api/client';
import ThemeToggle from './ThemeToggle';

const NAV = [
  { to: '/client',            label: 'Главная',    end: true, icon: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="11" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="11" width="6" height="6" rx="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5"/></svg>
  )},
  { to: '/client/orders',     label: 'Мои заявки', icon: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="2" width="14" height="14" rx="2"/><line x1="5" y1="7" x2="13" y2="7"/><line x1="5" y1="10.5" x2="10" y2="10.5"/></svg>
  )},
  { to: '/client/products',   label: 'Мои товары', icon: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 1L16 5V13L9 17L2 13V5L9 1Z"/><line x1="9" y1="9" x2="9" y2="17"/><line x1="2" y1="5" x2="9" y2="9"/><line x1="16" y1="5" x2="9" y2="9"/></svg>
  )},
  { to: '/client/integrations', label: 'Интеграции', icon: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 5V3a2 2 0 114 0v2"/><rect x="3" y="5" width="12" height="10" rx="2"/><path d="M8 10h2"/></svg>
  )},
  { to: '/client/documents',  label: 'Документы',  icon: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="2" width="14" height="14" rx="1.5"/><line x1="5" y1="7" x2="8" y2="7"/><line x1="5" y1="10" x2="8" y2="10"/><line x1="11" y1="7" x2="13" y2="7"/><line x1="11" y1="10" x2="13" y2="10"/></svg>
  )},
  { to: '/client/new-order',  label: 'Новая заявка', icon: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="9" r="8"/><line x1="9" y1="5.5" x2="9" y2="12.5"/><line x1="5.5" y1="9" x2="12.5" y2="9"/></svg>
  )},
  { to: '/client/notifications', label: 'Уведомления', icon: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 2a5 5 0 015 5v3l1.5 2.5H2.5L4 10V7a5 5 0 015-5z"/><path d="M7 14a2 2 0 004 0"/></svg>
  )},
];

export default function ClientLayout() {
  const { token, user, setUser, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: me } = useMe();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobilePrimaryNav = [
    NAV.find((item) => item.to === '/client'),
    NAV.find((item) => item.to === '/client/orders'),
    NAV.find((item) => item.to === '/client/documents'),
    { to: '#more', label: 'Ещё', icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="4" cy="9" r="1.25"/>
        <circle cx="9" cy="9" r="1.25"/>
        <circle cx="14" cy="9" r="1.25"/>
      </svg>
    )},
  ].filter(Boolean);

  // Счётчик непрочитанных уведомлений
  const { data: unreadData } = useQuery({
    queryKey: ['client-unread'],
    queryFn: () => api.get('/client/notifications/unread-count').then(r => r.data),
    refetchInterval: 60_000,
    enabled: !!token,
  });
  const unread = unreadData?.count || 0;

  useEffect(() => { if (me) setUser(me); }, [me]);
  useEffect(() => { if (!token) navigate('/client/login'); }, [token]);
  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);

  return (
    <div className="client-layout">
      <aside className="client-sidebar">
        <div className="client-sidebar-head">
          <div className="client-sidebar-head-row">
            <div>
              <div className="client-logo">SMART WMS</div>
              <div className="client-logo-sub">Личный кабинет</div>
            </div>
          </div>
        </div>

        <nav className="client-sidebar-nav">
          {NAV.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) => `client-nav-link${isActive ? ' active' : ''}`}>
              <span className="client-nav-icon">{item.icon}</span>
              <span className="client-nav-label">{item.label}</span>
              {item.label === 'Уведомления' && unread > 0 && (
                <span className="client-nav-badge">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="client-sidebar-footer">
          <div className="client-sidebar-theme-toggle">
            <ThemeToggle />
          </div>
          <div className="client-user-name">{user?.full_name || user?.email}</div>
          <div className="client-user-role">Клиент</div>
          <button
            onClick={() => { logout(); navigate('/client/login'); }}
            className="client-logout-btn">
            Выйти
          </button>
        </div>
      </aside>

      <main className="client-main">
        <Outlet />
      </main>

      <div className={`client-mobile-more-sheet${mobileMenuOpen ? ' open' : ''}`}>
        <div className="client-mobile-more-sheet-inner">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `client-mobile-sheet-link${isActive ? ' active' : ''}`}
            >
              <span className="client-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.label === 'Уведомления' && unread > 0 && (
                <span className="client-nav-badge">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </NavLink>
          ))}
          <button
            type="button"
            className="client-mobile-sheet-logout"
            onClick={() => { logout(); navigate('/client/login'); }}
          >
            Выйти
          </button>
        </div>
      </div>

      <div
        className={`client-mobile-more-backdrop${mobileMenuOpen ? ' open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      <nav className="client-mobile-bottom-nav">
        {mobilePrimaryNav.slice(0, 2).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `client-mobile-bottom-link${isActive ? ' active' : ''}`}
          >
            <span className="client-nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}

        <button
          type="button"
          className="client-mobile-plus-btn"
          onClick={() => navigate('/client/new-order')}
          aria-label="Новая заявка"
        >
          +
        </button>

        <NavLink
          to={mobilePrimaryNav[2].to}
          className={({ isActive }) => `client-mobile-bottom-link${isActive ? ' active' : ''}`}
        >
          <span className="client-nav-icon">{mobilePrimaryNav[2].icon}</span>
          <span>{mobilePrimaryNav[2].label}</span>
        </NavLink>

        <button
          type="button"
          className={`client-mobile-bottom-link client-mobile-bottom-link-button${mobileMenuOpen ? ' active' : ''}`}
          onClick={() => setMobileMenuOpen((value) => !value)}
          aria-expanded={mobileMenuOpen}
          aria-label="Открыть меню"
        >
          <span className="client-nav-icon">{mobilePrimaryNav[3].icon}</span>
          <span>{mobilePrimaryNav[3].label}</span>
        </button>
      </nav>
    </div>
  );
}
