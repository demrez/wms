import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInvoices, useGenerateInvoice, useUpdateInvoice, useCompanies } from '../hooks/queries';
import { PageHeader, Button, Input, Select, fmt, Spinner, Empty, Badge } from '../components/ui';
import api from '../api/client';
import { useQueryClient } from '@tanstack/react-query';

const STATUS = {
  draft: 'Черновик',
  sent: 'Отправлено',
  paid: 'Оплачено',
  deferred: 'Отсрочка',
  cancelled: 'Отменено',
};

function GeneratePanel({ onClose }) {
  const { data: companies } = useCompanies();
  const generate = useGenerateInvoice();
  const [form, setForm] = useState({ company_id:'', period_from:'', period_to:'', type:'invoice', tax_rate:0, notes:'' });
  const [error, setError] = useState('');
  const set = (k,v) => setForm(f => ({...f,[k]:v}));

  const handleGenerate = async () => {
    setError('');
    if (!form.company_id||!form.period_from||!form.period_to) return setError('Заполните все поля');
    try {
      await generate.mutateAsync({...form, tax_rate: Number(form.tax_rate)});
      onClose();
    } catch(e) { setError(e.response?.data?.error || 'Нет данных за период — проверьте услуги и начисления'); }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Сформировать счёт</h1>
        <div style={{display:'flex',gap:8}}>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button onClick={handleGenerate} disabled={generate.isPending}>
            {generate.isPending?'Формируем...':'Сформировать'}
          </Button>
        </div>
      </div>
      <div className="card">
        <div className="card-body">
          <Select label="Компания *" value={form.company_id} onChange={e => set('company_id',e.target.value)}>
            <option value="">Выберите компанию</option>
            {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <div className="form-grid" style={{marginTop:14}}>
            <Input label="Период с *" type="date" value={form.period_from} onChange={e => set('period_from',e.target.value)} />
            <Input label="Период по *" type="date" value={form.period_to} onChange={e => set('period_to',e.target.value)} />
            <Select label="Тип документа" value={form.type} onChange={e => set('type',e.target.value)}>
              <option value="invoice">Счёт</option>
              <option value="act">Акт выполненных работ</option>
            </Select>
            <Input label="НДС %" type="number" min="0" max="100" value={form.tax_rate}
              onChange={e => set('tax_rate',e.target.value)} placeholder="0 = без НДС" />
          </div>
          <div className="form-group" style={{marginTop:14}}>
            <label>Примечание</label>
            <textarea value={form.notes} onChange={e => set('notes',e.target.value)} rows={2} />
          </div>
          {error && <div className="alert alert-error" style={{marginTop:12}}>{error}</div>}
          <div style={{marginTop:14,padding:12,background:'var(--teal-50)',borderRadius:'var(--radius-md)',fontSize:12,color:'var(--teal-700)'}}>
            Система автоматически подтянет все оказанные услуги и начисления за выбранный период.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Invoices() {
  const qc = useQueryClient();
  const { data: invoices, isLoading } = useInvoices();
  const updateInvoice = useUpdateInvoice();
  const [view, setView] = useState('list');
  const [pdfLoading, setPdfLoading] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');

  const genPdf = async (id) => {
    setPdfLoading(id);
    try {
      const { data } = await api.get(`/invoices/${id}/pdf`);
      window.open(data.url, '_blank');
      qc.invalidateQueries({ queryKey: ['invoices'] });
    } catch(e) { alert(e.response?.data?.error || 'Ошибка PDF. Убедитесь что установлен pdfmake'); }
    finally { setPdfLoading(null); }
  };

  if (view === 'new') return <GeneratePanel onClose={() => setView('list')} />;

  const filtered = filterStatus ? invoices?.filter(i => i.status === filterStatus) : invoices;
  const totalPending = invoices?.filter(i => i.status !== 'paid' && i.status !== 'cancelled')
    .reduce((s,i) => s+Number(i.total),0)||0;
  const totalPaid = invoices?.filter(i => i.status === 'paid')
    .reduce((s,i) => s+Number(i.total),0)||0;

  return (
    <div>
      <PageHeader title="Счета">
        <Button onClick={() => setView('new')}>+ Сформировать счёт</Button>
      </PageHeader>

      <div className="desktop-only stats-grid" style={{gridTemplateColumns:'repeat(5,1fr)',marginBottom:20}}>
        <div className="stat-card"><div className="stat-label">Всего счетов</div><div className="stat-value">{invoices?.length||0}</div></div>
        <div className="stat-card"><div className="stat-label">Черновики</div><div className="stat-value">{invoices?.filter(i=>i.status==='draft').length||0}</div></div>
        <div className="stat-card"><div className="stat-label">Отсрочка</div><div className="stat-value">{invoices?.filter(i=>i.status==='deferred').length||0}</div></div>
        <div className="stat-card"><div className="stat-label">К получению</div><div className="stat-value" style={{fontSize:18,color:'var(--amber-400)'}}>{fmt(Math.round(totalPending))} ₽</div></div>
        <div className="stat-card"><div className="stat-label">Получено</div><div className="stat-value" style={{fontSize:18}}>{fmt(Math.round(totalPaid))} ₽</div></div>
      </div>
      <div className="mobile-only" style={{ marginBottom: 18 }}>
        <div className="mobile-stat-strip">
          <div className="mobile-stat-card">
            <div className="mobile-stat-card-label">Всего счетов</div>
            <div className="mobile-stat-card-value">{fmt(invoices?.length || 0)}</div>
          </div>
          <div className="mobile-stat-card">
            <div className="mobile-stat-card-label">Черновики</div>
            <div className="mobile-stat-card-value">{fmt(invoices?.filter(i => i.status === 'draft').length || 0)}</div>
          </div>
          <div className="mobile-stat-card">
            <div className="mobile-stat-card-label">Отсрочка</div>
            <div className="mobile-stat-card-value">{fmt(invoices?.filter(i => i.status === 'deferred').length || 0)}</div>
          </div>
          <div className="mobile-stat-card">
            <div className="mobile-stat-card-label">К получению</div>
            <div className="mobile-stat-card-value mobile-stat-card-value-amber">{fmt(Math.round(totalPending))} ₽</div>
          </div>
          <div className="mobile-stat-card">
            <div className="mobile-stat-card-label">Получено</div>
            <div className="mobile-stat-card-value">{fmt(Math.round(totalPaid))} ₽</div>
          </div>
        </div>
      </div>

      <div className="toolbar">
        <div className="filter-tabs">
          {[['','Все'],['draft','Черновик'],['sent','Отправлено'],['paid','Оплачено'],['deferred','Отсрочка'],['cancelled','Отменено']].map(([v,l]) => (
            <button key={v} className={`filter-tab${filterStatus===v?' active':''}`} onClick={() => setFilterStatus(v)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="card">
        {isLoading ? <Spinner /> : filtered?.length === 0 ? (
          <div style={{padding:'48px',textAlign:'center'}}>
            <div style={{fontSize:36,marginBottom:12,color:'var(--gray-300)'}}>🧾</div>
            <div style={{fontWeight:600,marginBottom:6}}>Нет счетов</div>
            <div className="text-muted text-sm" style={{marginBottom:20}}>Сформируйте счёт из оказанных услуг за период</div>
            <Button onClick={() => setView('new')}>+ Создать первый счёт</Button>
          </div>
        ) : (
          <>
          <div className="desktop-only table-wrap">
            <table>
              <thead><tr>
                <th>#</th><th>Компания</th><th>Поставка</th><th>Период</th>
                <th style={{textAlign:'right'}}>Сумма</th>
                <th>Статус</th><th></th>
              </tr></thead>
              <tbody>
                {filtered.map(inv => (
                  <tr key={inv.id}>
                    <td>
                      <Link to={`/invoices/${inv.id}`} className="mono text-muted" style={{ color: 'var(--teal-500)', fontWeight: 600 }}>
                        {inv.number}
                      </Link>
                    </td>
                    <td style={{ fontWeight: 500, maxWidth: 220 }}>{inv.company_name}</td>
                    <td className="text-muted text-sm">
                      {inv.order_id ? (
                        <Link to={`/orders/${inv.order_id}`} style={{ color: 'var(--teal-500)', fontWeight: 600 }}>
                          #{inv.order_number || '—'}
                        </Link>
                      ) : '—'}
                    </td>
                    <td className="text-muted text-sm">
                      {inv.period_from
                        ? `${new Date(inv.period_from).toLocaleDateString('ru-RU')} — ${new Date(inv.period_to).toLocaleDateString('ru-RU')}`
                        : new Date(inv.created_at).toLocaleDateString('ru-RU')}
                    </td>
                    <td style={{textAlign:'right',fontWeight:700,color:'var(--teal-400)', whiteSpace: 'nowrap'}}>
                      {fmt(Math.round(inv.total))} ₽
                    </td>
                    <td>
                      <select value={inv.status}
                        onChange={e => updateInvoice.mutate({ id:inv.id, status:e.target.value })}
                        style={{border:'none',background:'transparent',fontSize:12,cursor:'pointer',
                          color:inv.status==='paid'?'var(--teal-600)':inv.status==='cancelled'?'var(--red-400)':inv.status==='deferred'?'var(--amber-400)':'var(--gray-500)'}}>
                        {Object.entries(STATUS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td>
                      <div className="docs-actions">
                        <Button size="sm" variant="secondary" onClick={() => genPdf(inv.id)} disabled={pdfLoading===inv.id}>
                          {pdfLoading===inv.id?'...':'↓ PDF'}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => window.location.assign(`/invoices/${inv.id}`)}>
                          Открыть
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mobile-only admin-invoices-mobile-list">
            <div className="mobile-entity-list">
              {filtered.map((inv) => (
                <div key={inv.id} className="admin-invoice-mobile-card">
                  <div className="admin-invoice-mobile-head">
                    <div>
                      <div className="admin-invoice-mobile-number">Счёт {inv.number}</div>
                      <div className="admin-invoice-mobile-company">{inv.company_name}</div>
                    </div>
                    <Badge variant={inv.status === 'paid' ? 'green' : inv.status === 'cancelled' ? 'red' : inv.status === 'deferred' ? 'amber' : inv.status === 'sent' ? 'blue' : 'gray'}>
                      {STATUS[inv.status] || inv.status}
                    </Badge>
                  </div>
                  <div className="admin-invoice-mobile-grid">
                    <div className="admin-invoice-mobile-chip">
                      <div className="mobile-entity-pill-label">Поставка</div>
                      <div className="mobile-entity-pill-value">{inv.order_id ? `#${inv.order_number || '—'}` : '—'}</div>
                    </div>
                    <div className="admin-invoice-mobile-chip">
                      <div className="mobile-entity-pill-label">Период</div>
                      <div className="mobile-entity-pill-value">
                        {inv.period_from
                          ? `${new Date(inv.period_from).toLocaleDateString('ru-RU')} — ${new Date(inv.period_to).toLocaleDateString('ru-RU')}`
                          : new Date(inv.created_at).toLocaleDateString('ru-RU')}
                      </div>
                    </div>
                    <div className="admin-invoice-mobile-chip">
                      <div className="mobile-entity-pill-label">Сумма</div>
                      <div className="mobile-entity-pill-value" style={{ color: 'var(--teal-400)' }}>{fmt(Math.round(inv.total))} ₽</div>
                    </div>
                    <div className="admin-invoice-mobile-chip">
                      <div className="mobile-entity-pill-label">Статус</div>
                      <div className="mobile-entity-pill-value">
                        <select
                          value={inv.status}
                          onChange={e => updateInvoice.mutate({ id:inv.id, status:e.target.value })}
                          style={{ border: 'none', background: 'transparent', padding: 0, minHeight: 0 }}
                        >
                          {Object.entries(STATUS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="mobile-entity-actions">
                    <Button size="sm" variant="secondary" onClick={() => genPdf(inv.id)} disabled={pdfLoading===inv.id}>
                      {pdfLoading===inv.id ? '...' : 'PDF'}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => window.location.assign(`/invoices/${inv.id}`)}>
                      Открыть
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
