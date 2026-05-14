import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useOrders, useWarehouseSummary, useDefects } from '../hooks/queries';
import { TypeBadge, StageBadge, fmt, Spinner } from '../components/ui';
import AdminOrderCard from '../components/AdminOrderCard';
import api from '../api/client';
import { useQuery } from '@tanstack/react-query';

const STAGE_LABELS = {
  new:'Новая', approval:'Согласование', pickup:'Забор груза', in_transit:'В пути',
  receiving:'Приёмка', accepted:'Принято', waiting:'Ожидает', in_progress:'В работе',
  delivered:'Доставлено', mp_shipping:'Отгрузка МП', done:'Готово',
};

const TYPE_LABELS = {
  supply: 'Поставка',
  processing: 'Обработка',
  logistics: 'Логистика',
};

function today() {
  return new Date().toLocaleDateString('ru-RU', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
}

function defectCompanyName(row) {
  return row?.company_name || row?.name || row?.client_name || 'Компания';
}

// Иконки для stat-карточек
const ICONS = {
  teal: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1.5 4l5.5-3 5.5 3v6.5l-5.5 3-5.5-3V4Z" stroke="var(--teal-400)" strokeWidth="1.2"/></svg>,
  blue: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2" width="11" height="10" rx="1.5" stroke="var(--blue-400)" strokeWidth="1.2"/><path d="M4 6h6M4 8.5h4" stroke="var(--blue-400)" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  red:  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5L13 11.5H1L7 1.5Z" stroke="var(--red-400)" strokeWidth="1.2"/><path d="M7 5.5v3M7 10v.5" stroke="var(--red-400)" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  amber:<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="3" width="10" height="8" rx="1.5" stroke="var(--amber-400)" strokeWidth="1.2"/><path d="M4.5 6.5h5M4.5 8.5h3" stroke="var(--amber-400)" strokeWidth="1.2" strokeLinecap="round"/></svg>,
};

const MOBILE_ROW_TYPE_CLASS = {
  supply: 'supply',
  processing: 'processing',
  logistics: 'logistics',
};

function formatMobileRowDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU');
}

function formatMobileRowSub(order) {
  const date = formatMobileRowDate(order.shipping_date || order.created_at);
  if (order.type === 'processing') return `${order.shipping_warehouse || 'Без склада'}${date ? ` · ${date}` : ''}`;
  if (order.type === 'logistics') return `${order.shipping_warehouse || 'WB'}${date ? ` · ${date}` : ''}`;
  return `${order.shipping_warehouse || 'Без адреса'}${date ? ` · ${date}` : ''}`;
}

function StatCard({ icon, label, value, sub, color, onClick }) {
  const CardTag = onClick ? 'button' : 'div';
  return (
    <CardTag className={`stat-card${onClick ? ' stat-card-clickable' : ''}`} onClick={onClick} type={onClick ? 'button' : undefined}>
      <div className={`stat-card-icon ${icon}`}>{ICONS[icon]}</div>
      <div className="stat-value" style={{ color: color || 'var(--teal-400)' }}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub" style={{ color: color === 'var(--red-400)' ? 'var(--red-400)' : undefined }}>{sub}</div>}
    </CardTag>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: orders, isLoading } = useOrders({ status: 'active' });
  const { data: summary }           = useWarehouseSummary();
  const { data: defects }           = useDefects();

  // Счёт к оплате
  const { data: billingData } = useQuery({
    queryKey: ['dashboard-billing'],
    queryFn: () => api.get('/billing/summary').then(r => r.data).catch(() => null),
  });

  const orderRows  = Array.isArray(orders)  ? orders  : [];
  const summaryRows= Array.isArray(summary) ? summary : [];
  const defectRows = Array.isArray(defects) ? defects : [];

  const totalQty     = summaryRows.reduce((s, r) => s + Number(r.quantity   || 0), 0);
  const totalDefects = defectRows.reduce ((s, r) => s + Number(r.defect_qty || 0), 0);
  const companyCount = summaryRows.length;

  // Группируем брак по компаниям для алерта
  const defectCompanies = defectRows
    .filter(r => Number(r.defect_qty) > 0)
    .sort((a, b) => Number(b.defect_qty) - Number(a.defect_qty))
    .slice(0, 3);

  const recentOrders = orderRows.slice(0, 8);
  const dashboardOrders = orderRows.slice(0, 6);

  return (
    <div className="dashboard-page">
      {/* ── Шапка дашборда ── */}
      <div className="page-header dashboard-page-header" style={{ marginBottom:16 }}>
        <h1 className="page-title">Дашборд</h1>
        <div className="dashboard-header-actions">
          <span className="dashboard-header-date">{today()}</span>
          <button className="btn btn-secondary btn-sm"
            onClick={() => qc.invalidateQueries()}
            style={{ display:'flex', alignItems:'center', gap:5 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M10.5 6A4.5 4.5 0 1 1 6 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M10.5 1.5v3h-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Обновить
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/new-order')}>+ Новая заявка</button>
        </div>
      </div>

      {/* ── Алерт брака ── */}
      {totalDefects > 0 && (
        <div className="dashboard-defect-alert">
          <div className="dashboard-defect-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L14.5 13H1.5L8 2Z" stroke="white" strokeWidth="1.3"/>
              <path d="M8 6v4M8 11.5v.5" stroke="white" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="dashboard-defect-text">
            <div className="dashboard-defect-title">{fmt(totalDefects)} единиц брака требуют разбора</div>
            {defectCompanies.length > 0 && (
              <span className="dashboard-defect-subtext">
                {defectCompanies.length} {defectCompanies.length === 1 ? 'компания' : 'компании'} ·{' '}
                {defectCompanies.map(r => `${defectCompanyName(r)} (${r.defect_qty} ед.)`).join(', ')}
              </span>
            )}
          </div>
          <button className="dashboard-defect-link" onClick={() => navigate('/warehouse')}>
            Перейти в склад →
          </button>
        </div>
      )}

      {/* ── Статистика ── */}
      <div className="stats-grid" style={{ marginBottom:20 }}>
        <StatCard icon="teal"  label="Единиц на складе"   value={fmt(totalQty)}          sub={`${companyCount} компаний`} onClick={() => navigate('/warehouse?tab=summary')} />
        <StatCard icon="blue"  label="Заявок в работе"    value={fmt(orderRows.length)}  color="var(--blue-400)"
          onClick={() => navigate('/orders?status=active')}
          sub={orderRows.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString()).length > 0
            ? `+${orderRows.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString()).length} сегодня`
            : undefined} />
        <StatCard icon="red"   label="Брак на проверке"   value={fmt(totalDefects)}      color={totalDefects > 0 ? 'var(--red-400)' : 'var(--gray-400)'}
          onClick={() => navigate('/warehouse?tab=defects')}
          sub={totalDefects > 0 ? 'требует решения' : undefined} />
        <StatCard icon="amber" label="К оплате"
          value={billingData?.pending_amount ? `${fmt(Math.round(Number(billingData.pending_amount)))} ₽` : '—'}
          color="var(--amber-400)"
          onClick={() => navigate('/documents?payment_status=pending')}
          sub={billingData?.pending_count ? `${billingData.pending_count} документов` : undefined} />
      </div>

      {/* ── Двухколоночный блок: канбан + остатки ── */}
      <div className="dashboard-two-col">

        {/* Канбан */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Заявки в работе</span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/orders')}>Все заявки →</button>
          </div>
          <div className="card-body" style={{ padding:'12px 16px' }}>
            {isLoading ? (
              <Spinner />
            ) : dashboardOrders.length === 0 ? (
              <div className="empty" style={{ padding:24 }}>Нет активных заявок</div>
            ) : (
              <div className="admin-order-cards-grid compact">
                {dashboardOrders.map((order) => (
                  <AdminOrderCard key={order.id} order={order} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Остатки */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Остатки по клиентам</span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/warehouse')}>Склад →</button>
          </div>
          {summaryRows.length === 0 ? (
            <div className="empty" style={{ padding:24 }}>Нет данных</div>
          ) : summaryRows.slice(0, 8).map(r => {
            const defect = defectRows.find(d => d.company_id === r.id || d.name === r.name);
            const defectQty = defect ? Number(defect.defect_qty) : 0;
            return (
              <div key={r.id} className="stock-row">
                <span className="stock-name">{r.name}</span>
                <span className="stock-qty">{fmt(r.quantity)}</span>
                {defectQty > 0
                  ? <span className="stock-defect">{defectQty}!</span>
                  : <span className="stock-defect" style={{ color:'var(--gray-300)' }}>{r.products_count || ''}</span>
                }
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Последние заявки ── */}
      <div className="card dashboard-section-card">
        <div className="card-header">
          <span className="card-title">Последние заявки</span>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/orders')}>Все →</button>
        </div>
        {isLoading ? <Spinner /> : (
          <>
            {/* Десктоп */}
            <div className="desktop-only table-wrap">
              <table>
                <thead><tr>
                  <th>#</th><th>Клиент</th><th>Тип</th>
                  <th style={{ textAlign:'right' }}>Кол-во</th>
                  <th>Этап</th><th>Дата</th>
                </tr></thead>
                <tbody>
                  {recentOrders.map(o => (
                    <tr key={o.id} className="clickable" onClick={() => navigate(`/orders/${o.id}`)}>
                      <td className="text-muted text-sm mono">{o.number}</td>
                      <td style={{ fontWeight:500 }}>{o.company_name}</td>
                      <td><TypeBadge type={o.type} /></td>
                      <td className="text-right">{fmt(o.total_qty)}</td>
                      <td><StageBadge stage={o.stage} /></td>
                      <td className="text-muted text-sm">
                        {new Date(o.created_at).toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Мобиль */}
            <div className="mobile-only mobile-orders-redesign-list">
              {recentOrders.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  className={`mobile-orders-redesign-row ${MOBILE_ROW_TYPE_CLASS[order.type] || ''}`}
                  onClick={() => navigate(`/orders/${order.id}`)}
                >
                  <span className="mobile-orders-redesign-num">#{order.number}</span>
                  <div className="mobile-orders-redesign-info">
                    <div className="mobile-orders-redesign-company">{order.company_name}</div>
                    <div className="mobile-orders-redesign-sub">{formatMobileRowSub(order)}</div>
                  </div>
                  <div className="mobile-orders-redesign-right">
                    <span className={`mobile-orders-redesign-badge ${MOBILE_ROW_TYPE_CLASS[order.type] || ''}`}>
                      {TYPE_LABELS[order.type] || order.type}
                    </span>
                    <span className="mobile-orders-redesign-stage">{STAGE_LABELS[order.stage] || order.stage}</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
