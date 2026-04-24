import { useNavigate } from 'react-router-dom';
import { useOrders, useWarehouseSummary, useDefects } from '../hooks/queries';
import { Stat, TypeBadge, StageBadge, fmt, Spinner } from '../components/ui';
import KanbanBoard from '../components/KanbanBoard';

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: orders, isLoading } = useOrders({ status: 'active' });
  const { data: summary } = useWarehouseSummary();
  const { data: defects } = useDefects();

  const orderRows = Array.isArray(orders) ? orders : [];
  const summaryRows = Array.isArray(summary) ? summary : [];
  const defectRows = Array.isArray(defects) ? defects : [];

  const totalQty     = summaryRows.reduce((s, r) => s + Number(r.quantity), 0) || 0;
  const totalDefects = defectRows.reduce((s, r) => s + Number(r.defect_qty), 0) || 0;

  const recentOrdersMobile = orderRows.slice(0, 8);
  const summaryMobile = summaryRows.slice(0, 8);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Дашборд</h1>
      </div>

      <div className="stats-grid">
        <Stat label="Единиц на складе"  value={fmt(totalQty)} sub={`${summaryRows.length || 0} компаний`} />
        <Stat label="Заявок в работе"   value={fmt(orderRows.length || 0)} />
        <Stat label="На платном хранении" value="—" />
        <Stat label="Брак"              value={fmt(totalDefects)} sub="ед. на проверке" />
      </div>

      <div className="card mb-5">
        <div className="card-header">
          <span className="card-title">Заявки в работе</span>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/orders')}>Все заявки →</button>
        </div>
        <div className="card-body admin-dashboard-kanban-body" style={{ padding: '16px 20px' }}>
          <KanbanBoard />
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header"><span className="card-title">Последние заявки</span></div>
          {isLoading ? <Spinner /> : (
            <>
              <div className="desktop-only table-wrap">
              <table>
                <thead><tr>
                  <th>#</th><th>Клиент</th><th>Тип</th><th>Этап</th>
                </tr></thead>
                <tbody>
                  {recentOrdersMobile.map(o => (
                    <tr key={o.id} className="clickable" onClick={() => navigate(`/orders/${o.id}`)}>
                      <td className="text-muted text-sm">{o.number}</td>
                      <td style={{ fontWeight: 500, maxWidth: 150 }} className="truncate">{o.company_name}</td>
                      <td><TypeBadge type={o.type} /></td>
                      <td><StageBadge stage={o.stage} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <div className="mobile-only admin-dashboard-mobile-block">
                {!recentOrdersMobile.length ? (
                  <div className="empty" style={{ padding: 20 }}>Нет активных заявок</div>
                ) : (
                  <div className="admin-orders-mobile-list admin-dashboard-mobile-list">
                    {recentOrdersMobile.map((o) => (
                      <div
                        key={o.id}
                        className="admin-order-mobile-card"
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/orders/${o.id}`)}
                        onKeyDown={(event) => event.key === 'Enter' && navigate(`/orders/${o.id}`)}
                      >
                        <div className="admin-order-mobile-head">
                          <div>
                            <div className="admin-order-mobile-number">#{o.number}</div>
                            <div className="admin-order-mobile-date">{new Date(o.created_at).toLocaleDateString('ru-RU')}</div>
                          </div>
                          <StageBadge stage={o.stage} />
                        </div>
                        <div className="admin-order-mobile-company">{o.company_name}</div>
                        <div className="admin-order-mobile-grid">
                          <div className="admin-order-mobile-chip">
                            <span>Тип</span>
                            <strong><TypeBadge type={o.type} /></strong>
                          </div>
                          <div className="admin-order-mobile-chip">
                            <span>Этап</span>
                            <strong>{o.stage || '—'}</strong>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Остатки по компаниям</span></div>
          <div className="desktop-only table-wrap">
            <table>
              <thead><tr><th>Компания</th><th style={{ textAlign:'right' }}>Кол-во</th><th style={{ textAlign:'right' }}>Товаров</th></tr></thead>
              <tbody>
                {summaryMobile.map(r => (
                  <tr key={r.id}>
                    <td className="truncate" style={{ maxWidth: 160 }}>{r.name}</td>
                    <td className="text-right text-teal">{fmt(r.quantity)}</td>
                    <td className="text-right text-muted text-sm">{r.products_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mobile-only admin-dashboard-mobile-block">
            {!summaryMobile.length ? (
              <div className="empty" style={{ padding: 20 }}>Остатков пока нет</div>
            ) : (
              <div className="admin-products-mobile-list admin-dashboard-mobile-list">
                {summaryMobile.map((r) => (
                  <div key={r.id} className="admin-product-mobile-card">
                    <div className="admin-order-mobile-company" style={{ fontSize: 15, marginBottom: 10 }}>{r.name}</div>
                    <div className="admin-order-mobile-grid">
                      <div className="admin-order-mobile-chip">
                        <span>Кол-во</span>
                        <strong className="text-teal">{fmt(r.quantity)}</strong>
                      </div>
                      <div className="admin-order-mobile-chip">
                        <span>Товаров</span>
                        <strong>{r.products_count}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
