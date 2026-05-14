import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { PageHeader, Button, Empty, Spinner, Select, fmt } from '../components/ui';
import { useBillingDocuments, useCompanies } from '../hooks/queries';
import { useAuthStore } from '../store/auth';
import { formatDateTime, formatMoney } from '../lib/documents';
import { openOrderDocument } from '../lib/orderDocuments';

const STATUS_LABELS = {
  draft:     'Черновик',
  pending:   'Ожидает',
  confirmed: 'Подтверждён',
  issued:    'Выставлен',
  paid:      'Оплачен',
};

const STATUS_STYLE = {
  draft:     { bg: 'var(--gray-100)',    color: 'var(--gray-400)'   },
  pending:   { bg: 'var(--amber-50)',    color: 'var(--amber-400)'  },
  confirmed: { bg: 'var(--blue-50)',     color: 'var(--blue-400)'   },
  issued:    { bg: 'var(--purple-50)',   color: 'var(--purple-400)' },
  paid:      { bg: 'var(--teal-50)',     color: 'var(--teal-400)'   },
};

async function downloadExport(path, filename) {
  const response = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.draft;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function DocButton({ label, onClick, disabled, busy }) {
  return (
    <button onClick={onClick} disabled={disabled || busy}
      style={{
        padding: '4px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600,
        border: '1px solid var(--gray-200)', background: 'transparent',
        color: busy ? 'var(--gray-400)' : 'var(--gray-500)',
        cursor: disabled || busy ? 'not-allowed' : 'pointer',
        transition: 'all .12s', fontFamily: 'inherit',
        opacity: disabled ? .45 : 1,
      }}
      onMouseEnter={e => { if (!disabled && !busy) e.currentTarget.style.background = 'var(--gray-100)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {busy ? '...' : label}
    </button>
  );
}

export default function Documents() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const [search, setSearch]             = useState('');
  const [type, setType]                 = useState('');
  const [companyId, setCompanyId]       = useState('');
  const [paymentStatus, setPaymentStatus] = useState(searchParams.get('payment_status') || '');
  const [busyId, setBusyId]             = useState('');

  const { data: companies } = useCompanies();
  const { data: documents, isLoading, error } = useBillingDocuments({
    search, type, company_id: companyId, payment_status: paymentStatus,
  });

  const isManager = ['admin', 'manager'].includes(user?.role);

  useEffect(() => {
    const nextPaymentStatus = searchParams.get('payment_status') || '';
    setPaymentStatus((current) => (current === nextPaymentStatus ? current : nextPaymentStatus));
  }, [searchParams]);

  const handlePaymentStatusChange = (nextValue) => {
    setPaymentStatus(nextValue);
    const nextParams = new URLSearchParams(searchParams);
    if (nextValue) nextParams.set('payment_status', nextValue);
    else nextParams.delete('payment_status');
    setSearchParams(nextParams, { replace: true });
  };

  const summary = useMemo(() => {
    const rows = Array.isArray(documents) ? documents : [];
    return rows.reduce((a, r) => ({
      orders:  a.orders + 1,
      total:   a.total   + Number(r.total_amount   || 0),
      pending: a.pending + Number(r.pending_amount  || 0),
      paid:    a.paid    + Number(r.paid_amount     || 0),
    }), { orders: 0, total: 0, pending: 0, paid: 0 });
  }, [documents]);

  const handleDoc = async (kind, row) => {
    const key = `${kind}:${row.order_id}`;
    setBusyId(key);
    try { await openOrderDocument(row.order_id, kind); }
    catch (e) { window.alert(e?.response?.data?.error || e?.message || 'Ошибка'); }
    finally { setBusyId(''); }
  };

  const rows = Array.isArray(documents) ? documents : [];

  return (
    <div>
      <PageHeader title="Документы">
        <div className="flex gap-2">
          {isManager && <Button variant="secondary" onClick={() => navigate('/invoices')}>Счета</Button>}
          {isManager && (
            <Button variant="secondary" onClick={() => downloadExport('/export/charges', 'charges_export.csv')}>Экспорт начислений</Button>
          )}
          {isManager && (
            <Button variant="secondary" onClick={() => downloadExport('/export/orders', 'orders_export.csv')}>Экспорт заявок</Button>
          )}
        </div>
      </PageHeader>

      {/* Stat-карточки */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Заявок с документами', value: fmt(summary.orders),         color: 'var(--gray-900)'  },
          { label: 'Начислено',            value: formatMoney(summary.total),   color: 'var(--blue-400)'  },
          { label: 'К оплате',             value: formatMoney(summary.pending), color: 'var(--amber-400)' },
          { label: 'Оплачено',             value: formatMoney(summary.paid),    color: 'var(--teal-400)'  },
        ].map(({ label, value, color }) => (
          <div key={label} className="stat-card">
            <div className="stat-label">{label}</div>
            <div className="stat-value" style={{ color, fontSize: 20 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Мобильные stat-карточки */}
      <div className="mobile-only" style={{ marginBottom: 18 }}>
        <div className="mobile-stat-strip">
          {[
            { label: 'Заявок', value: fmt(summary.orders) },
            { label: 'Начислено', value: formatMoney(summary.total) },
            { label: 'К оплате', value: formatMoney(summary.pending), amber: true },
            { label: 'Оплачено', value: formatMoney(summary.paid) },
          ].map(s => (
            <div key={s.label} className="mobile-stat-card">
              <div className="mobile-stat-card-label">{s.label}</div>
              <div className={`mobile-stat-card-value${s.amber ? ' mobile-stat-card-value-amber' : ''}`}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Фильтры */}
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="var(--gray-400)" strokeWidth="1.2"/>
            <path d="M10 10l2.5 2.5" stroke="var(--gray-400)" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <input className="search-input" style={{ paddingLeft: 32, width: '100%' }}
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по компании или номеру заявки..." />
        </div>
        <div className="filter-tabs">
          {[['','Все'],['supply','Поставка'],['processing','Обработка'],['logistics','Логистика']].map(([v,l]) => (
            <button key={v} className={`filter-tab${type===v?' active':''}`} onClick={() => setType(v)}>{l}</button>
          ))}
        </div>
          <Select value={paymentStatus} onChange={e => handlePaymentStatusChange(e.target.value)}>
          <option value="">Все статусы</option>
          {Object.entries(STATUS_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        {isManager && (
          <Select value={companyId} onChange={e => setCompanyId(e.target.value)}>
            <option value="">Все компании</option>
            {(companies || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
      </div>

      <div className="card">
        {isLoading ? <Spinner /> : error ? <Empty text="Не удалось загрузить документы" /> : rows.length === 0 ? <Empty text="Документов пока нет" /> : (
          <>
            {/* ДЕСКТОП */}
            <div className="desktop-only table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Заявка</th>
                    <th>Клиент</th>
                    <th>Статус</th>
                    <th style={{ textAlign:'right' }}>Начислено</th>
                    <th style={{ textAlign:'right' }}>К оплате</th>
                    <th style={{ textAlign:'right' }}>Оплачено</th>
                    <th>Начисление</th>
                    <th>Документы</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const hasPending = Number(row.pending_amount) > 0;
                    return (
                      <tr key={row.order_id}
                        style={{ borderLeft: hasPending ? '2px solid var(--amber-400)' : '2px solid transparent' }}>
                        <td>
                          <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>#{row.order_number}</div>
                          <div className="text-muted text-sm">{new Date(row.created_at).toLocaleDateString('ru-RU')}</div>
                        </td>
                        <td style={{ maxWidth: 220, fontWeight: 500 }}>{row.company_name}</td>
                        <td><StatusBadge status={row.doc_status} /></td>
                        <td className="text-right" style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {formatMoney(row.total_amount)}
                        </td>
                        <td className="text-right" style={{ whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: 700, color: hasPending ? 'var(--amber-400)' : 'var(--gray-400)' }}>
                            {formatMoney(row.pending_amount)}
                          </span>
                        </td>
                        <td className="text-right" style={{ whiteSpace: 'nowrap' }}>
                          <span style={{ color: Number(row.paid_amount) > 0 ? 'var(--teal-400)' : 'var(--gray-400)', fontWeight: 600 }}>
                            {formatMoney(row.paid_amount)}
                          </span>
                        </td>
                        <td className="text-muted text-sm">
                          {row.last_charge_at ? new Date(row.last_charge_at).toLocaleDateString('ru-RU') : '—'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <DocButton label="Открыть" onClick={() => navigate(`/orders/${row.order_id}`)} />
                            <DocButton label="Лист" busy={busyId === `acceptance_sheet:${row.order_id}`} onClick={() => handleDoc('acceptance_sheet', row)} />
                            <DocButton label="ТЗ"   busy={busyId === `technical_task:${row.order_id}`}   onClick={() => handleDoc('technical_task', row)} />
                            <DocButton label="Счёт" busy={busyId === `invoice:${row.order_id}`}           onClick={() => handleDoc('invoice', row)} />
                            <DocButton label="Акт"  busy={busyId === `act:${row.order_id}`}               onClick={() => handleDoc('act', row)} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* МОБИЛЬ */}
            <div className="mobile-only admin-invoices-mobile-list">
              <div className="admin-documents-mobile-list" style={{ display:'flex', flexDirection:'column', gap:12, padding:14 }}>
                {rows.map(row => {
                  const hasPending = Number(row.pending_amount) > 0;
                  return (
                    <div key={row.order_id} style={{
                      background: 'var(--surface-card-alt)',
                      border: '1px solid var(--gray-200)',
                      borderLeft: `3px solid ${hasPending ? 'var(--amber-400)' : 'var(--gray-200)'}`,
                      borderRadius: 16, padding: 14,
                    }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                        <div>
                          <div style={{ fontFamily:'monospace', fontSize:15, fontWeight:700 }}>#{row.order_number}</div>
                          <div style={{ fontSize:12, color:'var(--gray-400)', marginTop:2 }}>{row.company_name}</div>
                        </div>
                        <StatusBadge status={row.doc_status} />
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:12 }}>
                        {[
                          ['Начислено', formatMoney(row.total_amount),   'var(--gray-900)'],
                          ['К оплате',  formatMoney(row.pending_amount),  hasPending ? 'var(--amber-400)' : 'var(--gray-400)'],
                          ['Оплачено',  formatMoney(row.paid_amount),     Number(row.paid_amount) > 0 ? 'var(--teal-400)' : 'var(--gray-400)'],
                        ].map(([label, value, color]) => (
                          <div key={label} style={{ background:'var(--surface-pane-muted)', borderRadius:10, padding:'8px 10px', border:'1px solid var(--gray-100)' }}>
                            <div style={{ fontSize:10, color:'var(--gray-400)', marginBottom:4 }}>{label}</div>
                            <div style={{ fontSize:12, fontWeight:700, color }}>{value}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        <button onClick={() => navigate(`/orders/${row.order_id}`)}
                          style={{ flex:1, padding:'7px 10px', borderRadius:10, fontSize:12, fontWeight:600,
                            border:'1px solid var(--gray-200)', background:'transparent',
                            color:'var(--gray-700)', cursor:'pointer', fontFamily:'inherit' }}>
                          Открыть →
                        </button>
                        {[['acceptance_sheet','Лист'],['technical_task','ТЗ'],['invoice','Счёт'],['act','Акт']].map(([kind,label]) => (
                          <button key={kind} disabled={!!busyId}
                            onClick={() => handleDoc(kind, row)}
                            style={{ padding:'7px 10px', borderRadius:10, fontSize:12, fontWeight:600,
                              border:'1px solid var(--gray-200)', background:'transparent',
                              color:busyId===`${kind}:${row.order_id}` ? 'var(--gray-400)' : 'var(--gray-700)',
                              cursor:busyId?'not-allowed':'pointer', fontFamily:'inherit' }}>
                            {busyId===`${kind}:${row.order_id}` ? '...' : label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
