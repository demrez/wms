import { fmt } from '../../components/ui';
import api from '../../api/client';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { openExistingDocument, openOrderDocument } from '../../lib/orderDocuments';

const STATUS_LABELS = { draft:'Черновик', sent:'Отправлено', paid:'Оплачен', deferred:'Отсрочка', cancelled:'Отменён' };
const STATUS_COLORS = { draft:'#9E9C95', sent:'#185FA5', paid:'#1D9E75', deferred:'#9A6B16', cancelled:'#E24B4A' };
const STATUS_BG = { draft:'#F1EFE8', sent:'#E6F1FB', paid:'#E1F5EE', deferred:'#F8F1E1', cancelled:'#FCEBEB' };

export default function ClientInvoices() {
  const navigate = useNavigate();
  const [pdfLoading, setPdfLoading] = useState(null);
  const qc = useQueryClient();

  const { data: orderDocs, isLoading } = useQuery({
    queryKey: ['client-documents-index'],
    queryFn: () => api.get('/client/documents').then((r) => r.data),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  const visibleInvoices = useMemo(() => {
    if (!Array.isArray(orderDocs)) return [];
    return orderDocs
      .filter((doc) => ['invoice', 'act'].includes(doc.kind))
      .map((doc) => ({
        id: doc.id,
        number: doc.number,
        type: doc.kind,
        status: doc.status,
        total: doc.total,
        created_at: doc.created_at,
        order_id: doc.order_id,
        download_url: doc.download_url || null,
      }));
  }, [orderDocs]);

  const genPdf = async (id) => {
    setPdfLoading(id);
    try {
      const { data } = await api.get(`/invoices/${id}/pdf`);
      window.open(data.url, '_blank');
      qc.invalidateQueries({ queryKey: ['invoices'] });
    } catch(e) { alert(e.response?.data?.error || 'Ошибка генерации PDF'); }
    finally { setPdfLoading(null); }
  };

  const totalPending = visibleInvoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled')
    .reduce((s, i) => s + Number(i.total), 0) || 0;
  const totalPaid = visibleInvoices.filter(i => i.status === 'paid')
    .reduce((s, i) => s + Number(i.total), 0) || 0;
  const orderGroups = useMemo(() => {
    if (!Array.isArray(orderDocs)) return [];
    const map = new Map();

    orderDocs.forEach((doc) => {
      const key = doc.order_id;
      if (!map.has(key)) {
        map.set(key, {
          order_id: doc.order_id,
          order_number: doc.order_number,
          company_name: doc.company_name,
          order_stage: doc.order_stage,
          items: [],
        });
      }
      map.get(key).items.push(doc);
    });

    return Array.from(map.values()).map((group) => ({
      ...group,
      items: group.items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    }));
  }, [orderDocs]);

  return (
    <div className="client-page" style={{ fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', fontSize:13 }}>
      <div className="client-page-title" style={{ fontSize:20, fontWeight:700, color:'var(--gray-900)', letterSpacing:'-0.3px', marginBottom:20 }}>Документы</div>

      {/* Сводка */}
      <div className="client-stats-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
          {[
          { label:'Всего счетов', value: visibleInvoices.length || 0 },
          { label:'К оплате', value: fmt(Math.round(totalPending)) + ' ₽', color: totalPending > 0 ? '#BA7517' : '#1D9E75' },
          { label:'Оплачено', value: fmt(Math.round(totalPaid)) + ' ₽' },
        ].map(c => (
          <div key={c.label} className="client-shell-card" style={{ background:'var(--surface-pane)', border:'1px solid var(--gray-200)', borderRadius:12, padding:'14px 18px' }}>
            <div style={{ fontSize:11.5, color:'var(--gray-400)', marginBottom:6 }}>{c.label}</div>
            <div style={{ fontSize:22, fontWeight:700, color: c.color || 'var(--teal-400)', letterSpacing:'-0.5px' }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="client-shell-card" style={{ background:'var(--surface-pane)', border:'1px solid var(--gray-200)', borderRadius:14, overflow:'hidden', marginBottom: 16 }}>
        <div className="client-shell-card-header" style={{ padding:'14px 18px', borderBottom:'1px solid var(--gray-100)', fontWeight:600, fontSize:13, color:'var(--gray-900)' }}>Счета и акты</div>
        {isLoading ? (
          <div style={{ padding:48, textAlign:'center', color:'var(--gray-400)' }}>Загрузка...</div>
        ) : visibleInvoices.length === 0 ? (
          <div style={{ padding:48, textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>🧾</div>
            <div style={{ color:'var(--gray-400)' }}>Счетов пока нет</div>
          </div>
        ) : (
          <div className="client-table-wrap">
          <table className="client-dark-table" style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#0F6E56' }}>
                {['#','Тип','Период','Сумма','Статус',''].map(h => (
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11.5, fontWeight:600, color:'rgba(255,255,255,.9)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleInvoices.map(inv => (
                <tr key={inv.id} style={{ borderBottom:'1px solid #F8F8F6' }}>
                  <td style={{ padding:'11px 16px', fontFamily:'monospace', fontSize:11, color:'#9E9C95' }}>{inv.number}</td>
                  <td style={{ padding:'11px 16px', color:'#6E6C66' }}>{inv.type === 'invoice' ? 'Счёт' : 'Акт'}</td>
                  <td style={{ padding:'11px 16px', fontSize:12, color:'#6E6C66' }}>
                    {inv.period_from
                      ? `${new Date(inv.period_from).toLocaleDateString('ru-RU')} — ${new Date(inv.period_to).toLocaleDateString('ru-RU')}`
                      : new Date(inv.created_at).toLocaleDateString('ru-RU')}
                  </td>
                  <td style={{ padding:'11px 16px', fontWeight:700, fontSize:14, color:'#1D9E75' }}>
                    {fmt(Math.round(inv.total))} ₽
                  </td>
                  <td style={{ padding:'11px 16px' }}>
                    <span style={{
                      padding:'3px 10px', borderRadius:20, fontSize:11.5, fontWeight:500,
                      background: STATUS_BG[inv.status] || '#F1EFE8',
                      color: STATUS_COLORS[inv.status] || '#9E9C95',
                    }}>
                      {STATUS_LABELS[inv.status] || inv.status}
                    </span>
                  </td>
                  <td style={{ padding:'11px 16px' }}>
                    <button
                      onClick={() => {
                        if (inv.download_url) {
                          openExistingDocument(inv.download_url);
                          return;
                        }
                        genPdf(inv.id);
                      }}
                      disabled={pdfLoading === inv.id}
                      style={{
                        padding:'5px 12px', background:'#fff', border:'1px solid #E4E2DA',
                        borderRadius:8, fontSize:12, fontWeight:500, cursor:'pointer',
                        color: pdfLoading === inv.id ? '#9E9C95' : '#3D3D3A',
                      }}>
                      {pdfLoading === inv.id ? '...' : '↓ PDF'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <div className="client-shell-card" style={{ background:'var(--surface-pane)', border:'1px solid var(--gray-200)', borderRadius:14, overflow:'hidden' }}>
        <div className="client-shell-card-header" style={{ padding:'14px 18px', borderBottom:'1px solid var(--gray-100)', fontWeight:600, fontSize:13, color:'var(--gray-900)' }}>Документы по заявкам</div>
        {isLoading ? (
          <div style={{ padding:32, textAlign:'center', color:'var(--gray-400)' }}>Загрузка...</div>
        ) : !Array.isArray(orderGroups) || orderGroups.length === 0 ? (
          <div style={{ padding:32, textAlign:'center', color:'var(--gray-400)' }}>Документов по заявкам пока нет</div>
        ) : (
          <div style={{ padding:16, display:'grid', gap:12 }}>
            {orderGroups.map((group) => (
              <div key={group.order_id} className="client-meta-card" style={{ borderRadius:14, overflow:'hidden' }}>
                <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--gray-100)', display:'flex', justifyContent:'space-between', gap:12, alignItems:'center' }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:'var(--gray-900)' }}>Заявка #{group.order_number}</div>
                    <div style={{ fontSize:11.5, color:'var(--gray-400)', marginTop:2 }}>{group.company_name || 'Компания'} • {group.items.length} документ{group.items.length === 1 ? '' : 'ов'}</div>
                  </div>
                  <button
                    onClick={() => navigate(`/client/orders/${group.order_id}`)}
                    className="client-secondary-btn"
                    style={{ padding:'6px 12px', borderRadius:8, fontSize:12, fontWeight:500, cursor:'pointer' }}
                  >
                    Открыть заявку
                  </button>
                </div>
                <div style={{ padding:16, display:'grid', gap:10 }}>
                  {group.items.map((doc) => (
                    <div key={doc.id} style={{ border:'1px solid var(--gray-200)', borderRadius:12, padding:'12px 14px', display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap', background:'var(--surface-pane-muted)' }}>
                      <div style={{ minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                          <span style={{
                            padding:'3px 10px',
                            borderRadius:999,
                            background: doc.kind === 'invoice' ? '#E6F1FB' : doc.kind === 'act' ? '#F1FBF7' : '#F8F1E1',
                            color: doc.kind === 'invoice' ? '#185FA5' : doc.kind === 'act' ? '#1D9E75' : '#9A6B16',
                            fontSize:11.5,
                            fontWeight:600,
                          }}>
                            {doc.kind === 'invoice' ? 'Счёт' : doc.kind === 'act' ? 'Акт' : 'Файл заявки'}
                          </span>
                          <div style={{ fontWeight:600, color:'var(--gray-900)', wordBreak:'break-word' }}>
                            {doc.doc_label || doc.title || doc.original_name || 'Документ'}
                          </div>
                        </div>
                        <div style={{ fontSize:11.5, color:'var(--gray-400)', marginTop:4 }}>
                          {new Date(doc.created_at).toLocaleDateString('ru-RU')}
                        </div>
                      </div>
                      <div style={{ display:'inline-flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
                        <button
                          onClick={() => {
                            if (doc.download_url) {
                              openExistingDocument(doc.download_url);
                              return;
                            }
                            if (doc.kind === 'invoice' || doc.kind === 'act') {
                              if (doc.id) {
                                genPdf(doc.id);
                                return;
                              }
                              if (doc.order_id) {
                                openOrderDocument(doc.order_id, doc.kind).catch((error) => {
                                  alert(error?.response?.data?.error || error?.message || 'Не удалось подготовить документ');
                                });
                              }
                            }
                          }}
                          className="client-secondary-btn"
                          style={{ padding:'5px 12px', borderRadius:8, fontSize:12, fontWeight:500, cursor:'pointer' }}
                        >
                          Скачать
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
