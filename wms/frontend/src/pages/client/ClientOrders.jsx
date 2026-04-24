import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDeleteClientOrder, useOrders } from '../../hooks/queries';
import { TypeBadge, StageBadge, fmt } from '../../components/ui';

const STAGE_LABELS = {
  new: 'Новая',
  approval: 'Согласование',
  pickup: 'Забор груза',
  in_transit: 'В пути',
  receiving: 'Приёмка',
  accepted: 'Принято',
  waiting: 'Ожидает',
  in_progress: 'В работе',
  delivered: 'Доставлено',
  mp_shipping: 'Отгрузка на МП',
  done: 'Готово',
};

const TYPE_LABELS = {
  supply: 'Поставка',
  processing: 'Обработка',
  logistics: 'Логистика',
};

function formatDate(value) {
  if (!value) return 'Не указана';
  return new Date(value).toLocaleDateString('ru-RU');
}

const S = {
  wrap: { fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', fontSize:13 },
  ph: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 },
  ptitle: { fontSize:20, fontWeight:700, color:'var(--gray-900)', letterSpacing:'-0.3px' },
  card: { background:'var(--surface-pane)', border:'1px solid var(--gray-200)', borderRadius:14, overflow:'hidden', boxShadow:'var(--theme-card-shadow)' },
  toolbar: { display:'flex', gap:8, marginBottom:16, alignItems:'center', flexWrap:'wrap' },
  ftabs: { display:'inline-flex', gap:2, background:'var(--surface-pane-muted)', borderRadius:10, padding:3, border:'1px solid var(--gray-200)' },
  ftab: (active) => ({
    padding:'5px 14px', borderRadius:7, fontSize:12, fontWeight:500, cursor:'pointer',
    border:'none', background: active ? 'var(--gray-200)' : 'none',
    color: active ? 'var(--gray-900)' : 'var(--gray-500)',
    boxShadow: active ? '0 1px 3px rgba(0,0,0,.06)' : 'none',
  }),
  btn: { padding:'7px 16px', background:'var(--teal-400)', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer' },
  search: { padding:'7px 10px 7px 28px', border:'1px solid var(--gray-200)', borderRadius:10, fontSize:13, width:220, outline:'none', background:'var(--surface-pane)', color:'var(--gray-900)' },
  empty: { padding:'48px', textAlign:'center', color:'var(--gray-400)', fontSize:13 },
  tr: { borderBottom:'1px solid var(--gray-100)', cursor:'pointer' },
  td: { padding:'11px 16px', color:'#e4e8ef' },
};

export default function ClientOrders() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('active');
  const deleteOrder = useDeleteClientOrder();

  const { data: orders, isLoading } = useOrders({ search, type, status });

  const handleDelete = async (event, order) => {
    event.stopPropagation();
    const ok = window.confirm(`Удалить заявку #${order.number}?`);
    if (!ok) return;
    try {
      await deleteOrder.mutateAsync(order.id);
    } catch (error) {
      alert(error.response?.data?.error || 'Не удалось удалить заявку');
    }
  };

  return (
    <div className="client-page" style={S.wrap}>
      <div className="client-page-head" style={S.ph}>
        <div className="client-page-title" style={S.ptitle}>Мои заявки</div>
        <button className="client-primary-btn desktop-only" style={S.btn} onClick={() => navigate('/client/new-order')}>+ Новая заявка</button>
      </div>

      <div className="client-page-toolbar" style={S.toolbar}>
        <input className="client-dark-input client-orders-search" style={S.search} value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск..." />
        <div className="client-filter-tabs" style={S.ftabs}>
          {[['','Все'],['supply','Поставка'],['processing','Обработка'],['logistics','Логистика']].map(([v,l]) => (
            <button key={v} className={`client-filter-tab${type===v ? ' active' : ''}`} style={S.ftab(type===v)} onClick={() => setType(v)}>{l}</button>
          ))}
        </div>
        <div className="client-filter-tabs" style={S.ftabs}>
          {[['active','В работе'],['done','Завершено'],['','Все']].map(([v,l]) => (
            <button key={v} className={`client-filter-tab${status===v ? ' active' : ''}`} style={S.ftab(status===v)} onClick={() => setStatus(v)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="client-shell-card" style={S.card}>
        {isLoading ? (
          <div style={S.empty}>Загрузка...</div>
        ) : orders?.length === 0 ? (
          <div style={S.empty}>
            <div style={{ fontSize:32, marginBottom:12 }}>📋</div>
            <div style={{ fontWeight:600, marginBottom:6 }}>Заявок нет</div>
            <div style={{ marginBottom:16, color:'var(--gray-400)' }}>Создайте первую заявку на поставку товаров</div>
            <button style={S.btn} onClick={() => navigate('/client/new-order')}>+ Создать заявку</button>
          </div>
        ) : (
          <>
            <div className="client-table-wrap desktop-only">
              <table className="client-dark-table" style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ background:'#0F6E56' }}>
                    {['#','Тип','Кол-во','Этап','Дата',''].map(h => (
                      <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11.5, fontWeight:600, color:'rgba(255,255,255,.9)', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id} style={S.tr} onClick={() => navigate(`/client/orders/${o.id}`)}>
                      <td style={{ ...S.td, color:'var(--gray-400)', fontFamily:'monospace', fontSize:11 }}>{o.number}</td>
                      <td style={S.td}><TypeBadge type={o.type} /></td>
                      <td style={{ ...S.td, fontWeight:600, color:'var(--teal-400)' }}>{fmt(o.total_qty)}</td>
                      <td style={S.td}><StageBadge stage={o.stage} /></td>
                      <td style={{ ...S.td, color:'var(--gray-400)', fontSize:11 }}>{new Date(o.created_at).toLocaleDateString('ru-RU')}</td>
                      <td style={{ ...S.td, textAlign:'right' }}>
                        {o.status === 'active' && ['new', 'approval'].includes(o.stage) && (
                          <button
                            onClick={(e) => handleDelete(e, o)}
                            disabled={deleteOrder.isPending}
                            style={{
                              padding:'5px 10px',
                              border:'1px solid #F0D2D2',
                              background:'#FFF5F5',
                              borderRadius:8,
                              color:'#C84E4E',
                              fontSize:11.5,
                              fontWeight:600,
                              cursor:'pointer',
                            }}
                          >
                            Удалить
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-only client-orders-mobile-list" style={{ padding: 12, display: 'grid', gap: 14 }}>
              {orders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="client-order-mobile-card"
                  onClick={() => navigate(`/client/orders/${o.id}`)}
                  style={{ display:'grid', gap: 12, padding: 16, borderRadius: 18 }}
                >
                  <div className="client-order-mobile-head">
                    <div>
                      <div className="client-order-mobile-number">Заявка #{o.number}</div>
                      <div className="client-order-mobile-date">
                        {formatDate(o.created_at)}
                      </div>
                    </div>
                    <StageBadge stage={o.stage} />
                  </div>

                  <div className="client-order-mobile-warehouse-label">Склад отгрузки</div>
                  <div className="client-order-mobile-warehouse">
                    {o.shipping_warehouse || 'Уточняется'}
                  </div>

                  <div className="client-order-mobile-grid">
                    <div className="client-order-mobile-chip">
                      <span>Дата отгрузки</span>
                      <strong>{formatDate(o.shipping_date || o.created_at)}</strong>
                    </div>
                    <div className="client-order-mobile-chip">
                      <span>Коробов</span>
                      <strong>{fmt(o.boxes_count)} шт</strong>
                    </div>
                  </div>

                  <div className="client-order-mobile-summary">
                    <span>{TYPE_LABELS[o.type] || o.type}</span>
                    <strong>{fmt(o.total_qty)} шт</strong>
                  </div>

                  {o.status === 'active' && ['new', 'approval'].includes(o.stage) && (
                    <div className="client-order-mobile-actions">
                      <button
                        type="button"
                        className="client-order-mobile-delete"
                        onClick={(e) => handleDelete(e, o)}
                        disabled={deleteOrder.isPending}
                      >
                        Удалить
                      </button>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
