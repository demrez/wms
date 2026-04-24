import { useState } from 'react';
import { useProposals, useProposal, useCreateProposal, useUpdateProposal, useServices } from '../hooks/queries';
import { PageHeader, Button, Input, Select, Modal, fmt, Spinner, Empty, Badge } from '../components/ui';
import api from '../api/client';
import { useQueryClient } from '@tanstack/react-query';

const STATUS_LABELS = { draft:'Черновик', sent:'Отправлено', accepted:'Принято', declined:'Отклонено' };
const STATUS_V = { draft:'gray', sent:'blue', accepted:'green', declined:'red' };
const UNIT_LABELS = { per_unit:'ед.', per_order:'заявка', per_kg:'кг', per_m3:'м³', per_day:'день' };
const CAT_LABELS = { receiving:'Приёмка', packing:'Упаковка', labeling:'Маркировка', photo:'Фото', logistics:'Логистика', storage:'Хранение', other:'Прочее' };

function safeText(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    return value.label || value.name || value.title || value.value || fallback;
  }
  return fallback;
}

function ProposalEditor({ proposal, onClose }) {
  const { data: services } = useServices();
  const create = useCreateProposal();
  const update = useUpdateProposal();
  const qc = useQueryClient();

  const [clientName, setClientName]       = useState(proposal?.client_name || '');
  const [clientContact, setClientContact] = useState(proposal?.client_contact || '');
  const [clientPhone, setClientPhone]     = useState(proposal?.client_phone || '');
  const [validUntil, setValidUntil]       = useState(proposal?.valid_until?.slice(0,10) || '');
  const [notes, setNotes]                 = useState(proposal?.notes || '');
  const [items, setItems]                 = useState(proposal?.items || []);
  const [error, setError]                 = useState('');
  const [pdfLoading, setPdfLoading]       = useState(false);

  const byCategory = {};
  services?.forEach(s => {
    if (!byCategory[s.category]) byCategory[s.category] = [];
    byCategory[s.category].push(s);
  });

  const addFromCatalog = (svcId) => {
    if (!svcId) return;
    const svc = services?.find(s => s.id === svcId);
    if (!svc || items.find(i => i.service_id === svcId)) return;
    setItems(prev => [...prev, {
      service_id: svc.id,
      label: svc.display_name || svc.name,
      unit: UNIT_LABELS[svc.unit] || 'ед.',
      quantity: 0,
      unit_price: Number(svc.base_price),
    }]);
  };

  const setItem = (i, k, v) => setItems(prev => prev.map((x,j) => j===i ? {...x,[k]:v} : x));
  const removeItem = (i) => setItems(prev => prev.filter((_,j) => j!==i));
  const total = items.reduce((s,i) => s + Number(i.quantity)*Number(i.unit_price), 0);

  const handleSave = async () => {
    setError('');
    if (!clientName) return setError('Укажите клиента');
    if (!items.length) return setError('Добавьте хотя бы одну услугу');
    try {
      const data = { client_name:clientName, client_contact:clientContact, client_phone:clientPhone, valid_until:validUntil||null, notes, items };
      proposal?.id ? await update.mutateAsync({ id:proposal.id, ...data }) : await create.mutateAsync(data);
      qc.invalidateQueries({ queryKey: ['proposals'] });
      onClose();
    } catch(e) { setError(e.response?.data?.error || 'Ошибка'); }
  };

  const genPdf = async () => {
    if (!proposal?.id) { setError('Сначала сохраните КП'); return; }
    setPdfLoading(true);
    try {
      const { data } = await api.get(`/invoices/proposals/${proposal.id}/pdf`);
      window.open(data.url, '_blank');
      qc.invalidateQueries({ queryKey: ['proposals'] });
    } catch(e) { setError(e.response?.data?.error || 'Ошибка PDF'); }
    finally { setPdfLoading(false); }
  };

  return (
    <div>
      <div className="page-header" style={{marginBottom:20}}>
        <div>
          <h1 className="page-title">{proposal ? `КП #${proposal.number}` : 'Новое коммерческое предложение'}</h1>
          {proposal && <div className="text-muted text-sm" style={{marginTop:4}}>{proposal.client_name}</div>}
        </div>
        <div style={{display:'flex',gap:8}}>
          {proposal?.id && (
            <Button variant="secondary" onClick={genPdf} disabled={pdfLoading}>
              {pdfLoading ? 'Генерация...' : '↓ Скачать PDF'}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Назад</Button>
          <Button onClick={handleSave} disabled={create.isPending||update.isPending}>Сохранить</Button>
        </div>
      </div>

      {/* Клиент */}
      <div className="card mb-4">
        <div className="card-header"><span className="card-title">Данные клиента</span></div>
        <div className="card-body">
          <div className="form-grid">
            <Input label="Компания / ФИО *" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="ООО «Клиент»" />
            <Input label="Контактное лицо" value={clientContact} onChange={e => setClientContact(e.target.value)} />
            <Input label="Телефон" value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="+7 900 000 00 00" />
            <Input label="Действует до" type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Калькулятор */}
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">Услуги и расчёт</span>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <select style={{fontSize:12,width:260}} onChange={e => { addFromCatalog(e.target.value); e.target.value=''; }}>
              <option value="">+ Добавить из каталога</option>
              {Object.entries(byCategory).map(([cat, svcs]) => (
                <optgroup key={cat} label={CAT_LABELS[cat]||cat}>
                  {svcs.filter(s => !items.find(i => i.service_id === s.id)).map(s => (
                    <option key={s.id} value={s.id}>{s.display_name || s.name} — {s.base_price} ₽</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <Button size="sm" variant="secondary" onClick={() => setItems(prev => [...prev, { service_id:null, label:'Новая услуга', unit:'ед.', quantity:0, unit_price:0 }])}>
              + Вручную
            </Button>
          </div>
        </div>

        {items.length === 0
          ? <Empty text="Добавьте услуги из каталога или вручную" />
          : (
            <>
              <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Услуга</th><th style={{width:60}}>Ед.</th>
                    <th style={{textAlign:'right',width:120}}>Объём / мес</th>
                    <th style={{textAlign:'right',width:110}}>Цена ₽</th>
                    <th style={{textAlign:'right',width:110}}>В месяц</th>
                    <th style={{width:36}}></th>
                  </tr></thead>
                  <tbody>
                    {items.map((item, i) => {
                      const lineTotal = Number(item.quantity)*Number(item.unit_price);
                      return (
                        <tr key={i} style={{borderTop:'1px solid var(--gray-100)'}}>
                          <td style={{padding:'8px 12px'}}>
                            <input value={item.label} onChange={e => setItem(i,'label',e.target.value)}
                              style={{border:'none',background:'transparent',fontWeight:500,width:'100%',outline:'none',fontSize:13,color:'var(--gray-900)'}} />
                          </td>
                          <td style={{padding:'8px 8px'}}>
                            <input value={item.unit} onChange={e => setItem(i,'unit',e.target.value)}
                              style={{border:'none',background:'transparent',width:55,outline:'none',fontSize:12,color:'var(--gray-400)'}} />
                          </td>
                          <td style={{padding:'8px 12px',textAlign:'right'}}>
                            <input type="number" min="0" step="1" value={item.quantity}
                              onChange={e => setItem(i,'quantity',Number(e.target.value))}
                              className="qty-input" />
                          </td>
                          <td style={{padding:'8px 12px',textAlign:'right'}}>
                            <input type="number" min="0" step="0.01" value={item.unit_price}
                              onChange={e => setItem(i,'unit_price',Number(e.target.value))}
                              className="qty-input" style={{width:90}} />
                          </td>
                          <td style={{padding:'8px 12px',textAlign:'right',fontWeight:600,color:lineTotal>0?'var(--teal-400)':'var(--gray-300)'}}>
                            {fmt(Math.round(lineTotal))} ₽
                          </td>
                          <td style={{padding:'8px 8px',textAlign:'center'}}>
                            <button onClick={() => removeItem(i)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--gray-300)',fontSize:16}}>✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Итог */}
              <div style={{padding:'16px 20px',borderTop:'1px solid var(--gray-100)',display:'flex',justifyContent:'flex-end',alignItems:'center',gap:32}}>
                <div style={{textAlign:'right'}}>
                  <div className="text-muted text-sm">В год</div>
                  <div style={{fontWeight:600,fontSize:15}}>{fmt(Math.round(total*12))} ₽</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div className="text-muted text-sm">Итого в месяц</div>
                  <div style={{fontWeight:700,fontSize:22,color:'var(--teal-400)'}}>{fmt(Math.round(total))} ₽</div>
                </div>
              </div>
            </>
          )
        }
      </div>

      {/* Примечание */}
      <div className="card mb-5">
        <div className="card-header"><span className="card-title">Примечание к КП</span></div>
        <div className="card-body">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            placeholder="Условия работы, скидки, особые условия..." />
        </div>
      </div>

      {error && <div className="alert alert-error mb-4">{error}</div>}
    </div>
  );
}

export default function Proposals() {
  const { data: proposals, isLoading } = useProposals();
  const qc = useQueryClient();
  const update = useUpdateProposal();
  const [view, setView]       = useState('list');
  const [selected, setSelected] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(null);
  const proposalList = Array.isArray(proposals) ? proposals : [];

  const genPdf = async (id) => {
    setPdfLoading(id);
    try {
      const { data } = await api.get(`/invoices/proposals/${id}/pdf`);
      window.open(data.url, '_blank');
      qc.invalidateQueries({ queryKey: ['proposals'] });
    } catch(e) { alert(e.response?.data?.error || 'Ошибка PDF'); }
    finally { setPdfLoading(null); }
  };

  if (view === 'edit') {
    return <ProposalEditor proposal={selected} onClose={() => { setView('list'); setSelected(null); }} />;
  }
  if (view === 'new') {
    return <ProposalEditor onClose={() => { setView('list'); setSelected(null); }} />;
  }

  const totalAccepted = proposalList.filter(p => p.status==='accepted').reduce((s,p) => s+Number(p.total_monthly),0)||0;

  return (
    <div>
      <PageHeader title="КП / Калькулятор">
        <Button onClick={() => { setSelected(null); setView('new'); }}>+ Новое КП</Button>
      </PageHeader>

      <div className="stats-grid" style={{gridTemplateColumns:'repeat(3,1fr)',marginBottom:20}}>
        <div className="stat-card"><div className="stat-label">Всего КП</div><div className="stat-value">{proposalList.length}</div></div>
        <div className="stat-card"><div className="stat-label">Принято</div><div className="stat-value" style={{color:'var(--teal-400)'}}>{proposalList.filter(p=>p.status==='accepted').length}</div></div>
        <div className="stat-card"><div className="stat-label">Принято в мес.</div><div className="stat-value" style={{fontSize:18}}>{fmt(Math.round(totalAccepted))} ₽</div></div>
      </div>

      <div className="card">
        {isLoading ? <Spinner /> : proposalList.length === 0 ? (
          <div style={{padding:'48px',textAlign:'center'}}>
            <div style={{fontSize:36,marginBottom:12,color:'var(--gray-300)'}}>📄</div>
            <div style={{fontWeight:600,marginBottom:6}}>Нет коммерческих предложений</div>
            <div className="text-muted text-sm" style={{marginBottom:20}}>Создайте КП с расчётом стоимости услуг для нового клиента</div>
            <Button onClick={() => setView('new')}>+ Создать первое КП</Button>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>#</th><th>Клиент</th><th>Контакт</th>
                <th style={{textAlign:'right'}}>В месяц</th>
                <th>Статус</th><th>До</th><th></th>
              </tr></thead>
              <tbody>
                {proposalList.map(p => (
                  <tr key={p.id}>
                    <td className="mono text-muted">{p.number}</td>
                    <td style={{fontWeight:500,cursor:'pointer',color:'var(--teal-600)'}}
                      onClick={() => { setSelected(p); setView('edit'); }}>{safeText(p.client_name)}</td>
                    <td className="text-muted">{safeText(p.client_contact)}</td>
                    <td className="text-right" style={{fontWeight:700,color:'var(--teal-400)'}}>
                      {fmt(Math.round(p.total_monthly))} ₽
                    </td>
                    <td>
                      <select value={p.status}
                        onChange={e => update.mutate({ id:p.id, status:e.target.value })}
                        style={{border:'none',background:'transparent',fontSize:12,cursor:'pointer',
                          color:p.status==='accepted'?'var(--teal-600)':p.status==='declined'?'var(--red-600)':'var(--gray-500)'}}>
                        {Object.entries(STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td className="text-muted text-sm">
                      {p.valid_until ? new Date(p.valid_until).toLocaleDateString('ru-RU') : '—'}
                    </td>
                    <td>
                      <div style={{display:'flex',gap:4}}>
                        <Button size="sm" variant="secondary" onClick={() => genPdf(p.id)} disabled={pdfLoading===p.id}>
                          {pdfLoading===p.id?'...':'↓ PDF'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setSelected(p); setView('edit'); }}>Открыть</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
