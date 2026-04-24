import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useMe } from '../hooks/queries';
import { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle';

const NAV = [
  { to: '/', label: 'Дашборд', icon: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="11" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="11" width="6" height="6" rx="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5"/></svg>
  )},
  { to: '/orders', label: 'Заявки', icon: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="2" width="14" height="14" rx="2"/><line x1="5" y1="7" x2="13" y2="7"/><line x1="5" y1="10.5" x2="10" y2="10.5"/></svg>
  )},
  { to: '/products', label: 'Товары', icon: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 1L16 5V13L9 17L2 13V5L9 1Z"/><line x1="9" y1="9" x2="9" y2="17"/><line x1="2" y1="5" x2="9" y2="9"/><line x1="16" y1="5" x2="9" y2="9"/></svg>
  )},
  { to: '/warehouse', label: 'Склад', icon: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="1" y="8" width="16" height="9" rx="1.5"/><path d="M1 8L9 2L17 8"/><line x1="7" y1="17" x2="7" y2="12"/><line x1="11" y1="17" x2="11" y2="12"/></svg>
  )},
  { to: '/documents', label: 'Документы', icon: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 1.5h5.5L15.5 6v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 16V3A1.5 1.5 0 0 1 5 1.5Z"/><path d="M10.5 1.5V6h5"/><line x1="6" y1="9" x2="12" y2="9"/><line x1="6" y1="12" x2="12" y2="12"/></svg>
  )},
  { to: '/invoices', label: 'Счета', icon: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="2" width="14" height="14" rx="2"/><line x1="5" y1="6" x2="13" y2="6"/><line x1="5" y1="9" x2="13" y2="9"/><line x1="5" y1="12" x2="10" y2="12"/></svg>
  )},
  { to: '/new-order', label: 'Новая заявка', icon: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="9" r="8"/><line x1="9" y1="5.5" x2="9" y2="12.5"/><line x1="5.5" y1="9" x2="12.5" y2="9"/></svg>
  )},
  { to: '/companies', label: 'Компании', icon: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="8" width="6" height="9"/><rect x="10" y="4" width="6" height="13"/><line x1="1" y1="17" x2="17" y2="17"/></svg>
  )},
  { to: '/marketplace', label: 'WB / Ozon', icon: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="3" width="14" height="12" rx="2"/><path d="M6 7l2.2 4L10 7l1.8 4L14 7"/></svg>
  )},
  { to: '/settings', label: 'Настройки', icon: (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="5" r="3"/><path d="M3 16a6 6 0 0 1 12 0"/></svg>
  )},
];

export default function Layout() {
  const { token, user, setUser, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: me } = useMe();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navItems = NAV.filter((item) => {
    const adminOnly = ['/settings', '/marketplace'];
    return !adminOnly.includes(item.to) || ['admin', 'manager'].includes(user?.role);
  });
  const mobilePrimaryNav = [
    navItems.find((item) => item.to === '/'),
    navItems.find((item) => item.to === '/orders'),
    navItems.find((item) => item.to === '/documents'),
  ].filter(Boolean);
  const mobileSecondaryNav = navItems.filter((item) => !['/', '/orders', '/documents', '/new-order'].includes(item.to));

  useEffect(() => { if (me) setUser(me); }, [me]);
  useEffect(() => { if (!token) navigate('/login'); }, [token]);
  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-name">SMART WMS</div>
          <div className="logo-sub">Фулфилмент</div>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            item.href ? (
              <a
                key={item.label}
                href={item.href}
                className="nav-link"
              >
                {item.icon}
                {item.label}
              </a>
            ) : (
              <NavLink key={item.to} to={item.to} end={item.to === '/'}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                {item.icon}
                {item.label}
              </NavLink>
            )
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-theme-toggle">
            <ThemeToggle />
          </div>
          <div className="user-name">{user?.full_name || user?.email}</div>
          <div className="user-role">{user?.role}</div>
          <button className="logout-btn" onClick={() => { logout(); navigate('/login'); }}>
            Выйти
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>

      <div className={`app-mobile-more-sheet${mobileMenuOpen ? ' open' : ''}`}>
        <div className="app-mobile-more-sheet-inner">
          {mobileSecondaryNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `app-mobile-sheet-link${isActive ? ' active' : ''}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            className="app-mobile-sheet-logout"
            onClick={() => { logout(); navigate('/login'); }}
          >
            Выйти
          </button>
        </div>
      </div>

      <div
        className={`app-mobile-more-backdrop${mobileMenuOpen ? ' open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      <nav className="app-mobile-bottom-nav">
        {mobilePrimaryNav.slice(0, 2).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `app-mobile-bottom-link${isActive ? ' active' : ''}`}
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}

        <button
          type="button"
          className="app-mobile-plus-btn"
          onClick={() => navigate('/new-order')}
          aria-label="Новая заявка"
        >
          +
        </button>

        <NavLink
          to={mobilePrimaryNav[2]?.to || '/documents'}
          className={({ isActive }) => `app-mobile-bottom-link${isActive ? ' active' : ''}`}
        >
          {mobilePrimaryNav[2]?.icon}
          <span>{mobilePrimaryNav[2]?.label || 'Документы'}</span>
        </NavLink>

        <button
          type="button"
          className={`app-mobile-bottom-link app-mobile-bottom-link-button${mobileMenuOpen ? ' active' : ''}`}
          onClick={() => setMobileMenuOpen((value) => !value)}
          aria-expanded={mobileMenuOpen}
          aria-label="Открыть меню"
        >
          <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="4" cy="9" r="1.25"/>
            <circle cx="9" cy="9" r="1.25"/>
            <circle cx="14" cy="9" r="1.25"/>
          </svg>
          <span>Ещё</span>
        </button>
      </nav>
    </div>
  );
}
