import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { fmt, StageBadge, TypeBadge } from '../../components/ui';

const OP_LABELS = { in:'Приход', out:'Расход', defect:'Брак', write_off:'Списание' };
const OP_COLORS = { in:'#1D9E75', out:'#E24B4A', defect:'#E24B4A', write_off:'#9E9C95' };
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

function formatDate(value) {
  if (!value) return 'Не указана';
  return new Date(value).toLocaleDateString('ru-RU');
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background:'var(--surface-pane)', border:'1px solid var(--gray-200)', borderRadius:14, padding:'16px 20px', boxShadow:'var(--theme-card-shadow)' }}>
      <div style={{ fontSize:11.5, color:'var(--gray-400)', fontWeight:500, marginBottom:8 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:700, color: color || 'var(--teal-400)', letterSpacing:'-0.5px', lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--gray-400)', marginTop:5 }}>{sub}</div>}
    </div>
  );
}

export default function ClientDashboard() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['client-summary'],
    queryFn: () => api.get('/client/summary').then(r => r.data),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  if (isLoading) return (
    <div style={{ display:'flex', justifyContent:'center', padding:48 }}>
      <div style={{ width:24, height:24, border:'2.5px solid #E4E2DA', borderTopColor:'#1D9E75', borderRadius:'50%', animation:'spin .7s linear infinite' }} />
    </div>
  );

  if (data?.empty) return (
    <div style={{ textAlign:'center', padding:'48px 0' }}>
      <div style={{ fontSize:14, color:'var(--gray-400)' }}>Ваш аккаунт не привязан к компании. Обратитесь к менеджеру.</div>
    </div>
  );

  const stock = data?.stock;
  const billing = data?.billing;

  return (
    <div className="client-page">
      <div style={{ marginBottom:24 }}>
        <div className="client-page-title" style={{ fontSize:20, fontWeight:700, color:'var(--gray-900)', letterSpacing:'-0.3px' }}>Добро пожаловать</div>
        <div className="client-page-subtitle" style={{ fontSize:13, color:'var(--gray-400)', marginTop:3 }}>Ваш склад и заявки</div>
      </div>

      {/* Статистика */}
      <div className="stats-grid client-stats-grid" style={{ marginBottom:24 }}>
        <StatCard label="Единиц на складе" value={fmt(stock?.total_qty || 0)} sub={`${stock?.products_count || 0} товаров`} />
        <StatCard label="Доступно" value={fmt(stock?.available_qty || 0)} />
        <StatCard label="Брак" value={fmt(stock?.defect_qty || 0)} color={Number(stock?.defect_qty) > 0 ? '#E24B4A' : 'var(--teal-400)'} />
        <StatCard label="Заявок в работе" value={data?.active_orders_count || 0} color="var(--blue-400)" />
      </div>

      {/* Долг */}
      {Number(billing?.pending) > 0 && (
        <div style={{
          background:'linear-gradient(135deg, #FFF7E9 0%, #FFF2D8 100%)',
          border:'1px solid rgba(186,117,23,.22)',
          borderRadius:14,
          padding:'14px 16px',
          display:'flex',
          alignItems:'center',
          gap:12,
          marginBottom:20,
          boxShadow:'0 10px 24px rgba(186,117,23,.08)',
        }}>
          <div style={{
            width:34,
            height:34,
            borderRadius:10,
            background:'rgba(255,255,255,.72)',
            display:'flex',
            alignItems:'center',
            justifyContent:'center',
            fontSize:17,
            flexShrink:0,
          }}>💳</div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--amber-600)', letterSpacing:'.04em', textTransform:'uppercase', marginBottom:4 }}>
              К оплате
            </div>
            <div style={{ fontWeight:800, color:'var(--gray-900)', fontSize:20, lineHeight:1.05 }}>
              {fmt(Math.round(Number(billing.pending)))} ₽
            </div>
            <div style={{ fontSize:12, color:'var(--gray-600)', marginTop:5 }}>
              Счетов: {fmt(Number(billing.total_invoices || 0))} • Оплачено: {fmt(Math.round(Number(billing.paid || 0)))} ₽
            </div>
          </div>
          <button onClick={() => navigate('/client/documents')}
            style={{
              marginLeft:'auto',
              padding:'8px 14px',
              background:'var(--amber-400)',
              color:'#fff',
              border:'none',
              borderRadius:10,
              fontSize:12,
              fontWeight:700,
              cursor:'pointer',
              whiteSpace:'nowrap',
              boxShadow:'0 8px 18px rgba(186,117,23,.18)',
            }}>
            Открыть
          </button>
        </div>
      )}

      <div className="client-card-grid-2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {/* Активные заявки */}
        <div className="client-shell-card" style={{ background:'var(--surface-pane)', border:'1px solid var(--gray-200)', borderRadius:14, overflow:'hidden' }}>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--gray-100)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontWeight:600, fontSize:13, color:'var(--gray-900)' }}>Активные заявки</span>
            <button onClick={() => navigate('/client/orders')} style={{ background:'none', border:'none', color:'var(--teal-400)', fontSize:12, cursor:'pointer', fontWeight:500 }}>
              Все →
            </button>
          </div>
          {!data?.recent_orders?.length ? (
            <div style={{ padding:'24px', textAlign:'center', color:'var(--gray-400)', fontSize:13 }}>Нет активных заявок</div>
          ) : (
            <>
              <div className="desktop-only">
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
                  <tbody>
                    {data.recent_orders.map(o => (
                      <tr key={o.id} style={{ borderBottom:'1px solid var(--gray-100)', cursor:'pointer' }}
                        onClick={() => navigate(`/client/orders/${o.id}`)}>
                        <td style={{ padding:'10px 18px', color:'var(--gray-400)', fontFamily:'monospace', fontSize:11 }}>#{o.number}</td>
                        <td style={{ padding:'10px 8px' }}><TypeBadge type={o.type} /></td>
                        <td style={{ padding:'10px 8px' }}><StageBadge stage={o.stage} /></td>
                        <td style={{ padding:'10px 18px', color:'var(--gray-400)', fontSize:11 }}>
                          {new Date(o.created_at).toLocaleDateString('ru-RU')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mobile-only" style={{ padding: 12 }}>
                <div className="mobile-card-list">
                  {data.recent_orders.map((o) => (
                    <div
                      key={o.id}
                      className="mobile-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/client/orders/${o.id}`)}
                      onKeyDown={(event) => event.key === 'Enter' && navigate(`/client/orders/${o.id}`)}
                    >
                      <div className="mobile-card-title">#{o.number}</div>
                      <div className="mobile-card-sub" style={{ marginBottom: 8 }}>{o.shipping_warehouse || 'Склад уточняется'}</div>
                      <div style={{ display:'flex', gap: 8, flexWrap:'wrap', marginBottom: 8 }}>
                        <TypeBadge type={o.type} />
                        <StageBadge stage={o.stage} />
                      </div>
                      <div className="mobile-card-grid">
                        <div className="mobile-card-field">
                          <div className="mobile-card-field-label">Дата</div>
                          <div className="mobile-card-field-value">{formatDate(o.shipping_date || o.created_at)}</div>
                        </div>
                        <div className="mobile-card-field">
                          <div className="mobile-card-field-label">Коробов</div>
                          <div className="mobile-card-field-value">{fmt(o.boxes_count)} шт</div>
                        </div>
                        <div className="mobile-card-field">
                          <div className="mobile-card-field-label">Статус</div>
                          <div className="mobile-card-field-value">{STAGE_LABELS[o.stage] || 'В работе'}</div>
                        </div>
                        <div className="mobile-card-field">
                          <div className="mobile-card-field-label">Кол-во</div>
                          <div className="mobile-card-field-value">{fmt(o.total_qty)} шт</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Последние операции */}
        <div className="client-shell-card" style={{ background:'var(--surface-pane)', border:'1px solid var(--gray-200)', borderRadius:14, overflow:'hidden' }}>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--gray-100)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontWeight:600, fontSize:13, color:'var(--gray-900)' }}>Последние операции</span>
            <button onClick={() => navigate('/client/products')} style={{ background:'none', border:'none', color:'var(--teal-400)', fontSize:12, cursor:'pointer', fontWeight:500 }}>
              Все товары →
            </button>
          </div>
          {!data?.recent_ops?.length ? (
            <div style={{ padding:'24px', textAlign:'center', color:'var(--gray-400)', fontSize:13 }}>Операций нет</div>
          ) : (
            <>
              <div className="desktop-only" style={{ padding:'8px 0' }}>
                {data.recent_ops.map((op, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 18px', borderBottom: i < data.recent_ops.length-1 ? '1px solid var(--gray-100)' : 'none' }}>
                    <div style={{ width:26, height:26, borderRadius:'50%', background: OP_COLORS[op.op_type] + '18', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <span style={{ color: OP_COLORS[op.op_type], fontSize:12, fontWeight:700 }}>
                        {op.op_type === 'in' ? '+' : '−'}
                      </span>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12.5, fontWeight:500, color:'var(--gray-900)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{op.product_name}</div>
                      <div style={{ fontSize:11, color:'var(--gray-400)' }}>{OP_LABELS[op.op_type] || op.op_type}</div>
                    </div>
                    <div style={{ fontSize:12, fontWeight:600, color: OP_COLORS[op.op_type], flexShrink:0 }}>
                      {op.op_type === 'in' ? '+' : '−'}{fmt(op.quantity)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mobile-only" style={{ padding: 12 }}>
                <div className="mobile-card-list">
                  {data.recent_ops.map((op, i) => (
                    <div key={i} className="mobile-card">
                      <div className="mobile-card-title">{op.product_name}</div>
                      <div className="mobile-card-sub">{OP_LABELS[op.op_type] || op.op_type}</div>
                      <div className="mobile-card-grid">
                        <div className="mobile-card-field">
                          <div className="mobile-card-field-label">Кол-во</div>
                          <div className="mobile-card-field-value" style={{ color: OP_COLORS[op.op_type] }}>
                            {op.op_type === 'in' ? '+' : '−'}{fmt(op.quantity)}
                          </div>
                        </div>
                        <div className="mobile-card-field">
                          <div className="mobile-card-field-label">Статус</div>
                          <div className="mobile-card-field-value">{op.order_number ? `#${op.order_number}` : '—'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
