import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDeleteClientOrder, useOrder, useOrderServices, useClientOrderDocuments, useUpdateClientOrderItem, useOrderBoxes } from '../../hooks/queries';
import { Button, Input, Modal, TypeBadge, StageBadge, fmt } from '../../components/ui';
import { openExistingDocument, openOrderDocument } from '../../lib/orderDocuments';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';

const STAGE_LABELS = {
  new:'Новая', approval:'Согласование', pickup:'Забор груза', in_transit:'В пути',
  receiving:'Приёмка', accepted:'Принято', waiting:'Ожидает',
  in_progress:'В работе', delivered:'Доставлено', mp_shipping:'Отгрузка на МП', done:'Готово',
};
const SUPPLY_STAGES  = ['new','approval','pickup','in_transit','receiving','accepted','mp_shipping','done'];
const PROCESS_STAGES = ['new','waiting','in_progress','done'];
const LOGISTICS_STAGES = ['new','approval','pickup','in_transit','delivered','mp_shipping','done'];

function ProgressBar({ order }) {
  const stages = order.type === 'supply' ? SUPPLY_STAGES
    : order.type === 'processing' ? PROCESS_STAGES
    : LOGISTICS_STAGES;
  const idx = stages.indexOf(order.stage);

  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:0, overflowX:'auto', paddingBottom:4 }}>
      {stages.map((s, i) => {
        const past = i < idx, current = i === idx;
        return (
          <div key={s} style={{ display:'flex', alignItems:'flex-start', flexShrink:0 }}>
            {i > 0 && (
              <div style={{ height:2, width:28, background: past||current ? 'var(--teal-400)' : 'var(--gray-200)', marginTop:12, flexShrink:0 }} />
            )}
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
              <div style={{
                width:26, height:26, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:10, fontWeight:700,
                background: current ? 'var(--teal-400)' : past ? 'var(--teal-50)' : 'var(--surface-hover)',
                color: current ? '#fff' : past ? 'var(--teal-600)' : 'var(--gray-400)',
                border: current ? '2px solid var(--teal-600)' : past ? '2px solid var(--teal-400)' : '2px solid var(--gray-200)',
                boxShadow: current ? '0 0 0 3px rgba(29,158,117,.2)' : 'none',
              }}>
                {past ? '✓' : i + 1}
              </div>
              <span style={{ fontSize:10, color: current ? 'var(--teal-600)' : 'var(--gray-400)', fontWeight: current ? 700 : 400, whiteSpace:'nowrap', maxWidth:60, textAlign:'center', lineHeight:1.3 }}>
                {STAGE_LABELS[s]}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ClientOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [itemEdit, setItemEdit] = useState(null);
  const [docLoadingKey, setDocLoadingKey] = useState(null);
  const { data: order, isLoading } = useOrder(id);
  const {
    data: orderBoxes,
    isLoading: isBoxesLoading,
    error: boxesError,
  } = useOrderBoxes(id);
  const { data: services } = useOrderServices(id);
  const { data: orderDocuments } = useClientOrderDocuments(id);
  const deleteOrder = useDeleteClientOrder();
  const updateClientItem = useUpdateClientOrderItem();

  if (isLoading) return <div style={{ padding:48, textAlign:'center', color:'var(--gray-400)' }}>Загрузка...</div>;
  if (!order) return <div style={{ padding:48, textAlign:'center', color:'var(--gray-400)' }}>Заявка не найдена</div>;

  const servicesTotal = services?.reduce((s, x) => s + Number(x.total), 0) || 0;
  const invoices = orderDocuments?.invoices || [];
  const allUploadedDocs = orderDocuments?.documents || [];
  const uploadedDocs = allUploadedDocs.filter((doc) => (doc.kind || doc.doc_type) !== 'technical_task');
  const latestInvoice = invoices.find((doc) => doc.type === 'invoice');
  const latestAct = invoices.find((doc) => doc.type === 'act');
  const acceptanceDoc = allUploadedDocs.find((doc) => (doc.kind || doc.doc_type) === 'acceptance_sheet');
  const technicalTaskDoc = allUploadedDocs.find((doc) => (doc.kind || doc.doc_type) === 'technical_task');
  const canPrepareBillingDocs = order.stage === 'done' || order.status === 'done';
  const hasWbShipment = Array.isArray(order.marketplace_shipments)
    && order.marketplace_shipments.some((row) => String(row.marketplace || '').toLowerCase() === 'wb');
  const wbBoxes = Array.isArray(orderBoxes?.wb_boxes) ? orderBoxes.wb_boxes : [];

  const handleDocumentAction = async (doc) => {
    if (!doc?.canOpen) return;
    setDocLoadingKey(doc.key);
    try {
      if (doc.useExisting && doc.url) {
        openExistingDocument(doc.url);
      } else {
        await openOrderDocument(order.id, doc.kind);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['client', 'order-documents', order.id] }),
        qc.invalidateQueries({ queryKey: ['client-documents-index'] }),
        qc.invalidateQueries({ queryKey: ['client-unread'] }),
      ]);
    } catch (error) {
      alert(error?.response?.data?.error || error?.message || 'Документ пока недоступен');
    } finally {
      setDocLoadingKey(null);
    }
  };

  const documentRows = [
    {
      key: 'invoice',
      kind: 'invoice',
      label: 'Счёт',
      title: latestInvoice ? `Счёт №${latestInvoice.number}` : 'Счёт не выставлен',
      sub: latestInvoice
        ? `${new Date(latestInvoice.created_at).toLocaleDateString('ru-RU')} • ${fmt(Math.round(Number(latestInvoice.total || 0)))} ₽`
        : canPrepareBillingDocs ? 'Будет подготовлен как PDF по текущей заявке' : 'Появится после завершения заявки',
      actionLabel: latestInvoice ? 'Скачать' : canPrepareBillingDocs ? 'Подготовить' : 'Недоступно',
      canOpen: Boolean(latestInvoice?.download_url) || canPrepareBillingDocs,
      useExisting: Boolean(latestInvoice?.download_url),
      url: latestInvoice?.download_url || null,
    },
    {
      key: 'act',
      kind: 'act',
      label: 'Акт',
      title: latestAct ? `Акт №${latestAct.number}` : 'Акт ещё не сформирован',
      sub: latestAct
        ? `${new Date(latestAct.created_at).toLocaleDateString('ru-RU')} • ${fmt(Math.round(Number(latestAct.total || 0)))} ₽`
        : canPrepareBillingDocs ? 'Будет подготовлен как PDF по текущей заявке' : 'Появится после завершения заявки',
      actionLabel: latestAct ? 'Скачать' : canPrepareBillingDocs ? 'Подготовить' : 'Недоступно',
      canOpen: Boolean(latestAct?.download_url) || canPrepareBillingDocs,
      useExisting: Boolean(latestAct?.download_url),
      url: latestAct?.download_url || null,
    },
    {
      key: 'acceptance',
      kind: 'acceptance_sheet',
      label: 'Приёмка',
      title: acceptanceDoc ? (acceptanceDoc.title || `Лист приёмки №${order.number}`) : `Лист приёмки №${order.number}`,
      sub: acceptanceDoc
        ? new Date(acceptanceDoc.created_at).toLocaleDateString('ru-RU')
        : 'Будет подготовлен как файл по текущей заявке',
      actionLabel: acceptanceDoc ? 'Скачать' : 'Подготовить',
      canOpen: true,
      useExisting: Boolean(acceptanceDoc?.download_url),
      url: acceptanceDoc?.download_url || null,
    },
    {
      key: 'tt',
      kind: 'technical_task',
      label: 'ТЗ',
      title: technicalTaskDoc ? (technicalTaskDoc.title || `Техническое задание №${order.number}`) : `Техническое задание №${order.number}`,
      sub: technicalTaskDoc
        ? new Date(technicalTaskDoc.created_at).toLocaleDateString('ru-RU')
        : 'Будет подготовлено как файл по текущей заявке',
      actionLabel: technicalTaskDoc ? 'Скачать' : 'Подготовить',
      canOpen: true,
      useExisting: Boolean(technicalTaskDoc?.download_url),
      url: technicalTaskDoc?.download_url || null,
    },
  ];

  const canDeleteOrder = order.status === 'active' && ['new', 'approval'].includes(order.stage);
  const canEditItems = order.status === 'active' && ['new', 'approval'].includes(order.stage);

  const openItemEditor = (item) => {
    if (!canEditItems) return;
    setItemEdit({
      item,
      quantity: String(item.quantity ?? 1),
    });
  };

  const closeItemEditor = () => setItemEdit(null);

  const saveItemQuantity = async () => {
    if (!itemEdit?.item) return;
    const quantity = Number(String(itemEdit.quantity).trim().replace(',', '.'));
    if (!Number.isInteger(quantity) || quantity < 1) {
      alert('Количество должно быть целым и больше нуля');
      return;
    }
    try {
      await updateClientItem.mutateAsync({
        orderId: order.id,
        itemId: itemEdit.item.id,
        quantity,
      });
      closeItemEditor();
    } catch (error) {
      alert(error.response?.data?.error || 'Не удалось сохранить количество');
    }
  };
  const handleDelete = async () => {
    if (!canDeleteOrder) return;
    const ok = window.confirm(`Удалить заявку #${order.number}?`);
    if (!ok) return;
    try {
      await deleteOrder.mutateAsync(order.id);
      navigate('/client/orders');
    } catch (error) {
      alert(error.response?.data?.error || 'Не удалось удалить заявку');
    }
  };

  const downloadWbBoxesExport = async () => {
    try {
      const response = await api.get(`/orders/${order.id}/boxes/wb-template-export`, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `wb_boxes_order_${order.number}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      alert(error?.response?.data?.error || 'Не удалось скачать Excel по коробам WB');
    }
  };

  return (
    <div className="client-page" style={{ fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', fontSize:13 }}>
      {/* Шапка */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:24 }}>
        <button onClick={() => navigate('/client/orders')}
          style={{ background:'none', border:'none', color:'var(--gray-400)', cursor:'pointer', fontSize:18, padding:0, lineHeight:1 }}>←</button>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:18, fontWeight:700, color:'var(--gray-900)' }}>Заявка #{order.number}</span>
            <TypeBadge type={order.type} />
            <StageBadge stage={order.stage} />
          </div>
          <div style={{ fontSize:12, color:'var(--gray-400)', marginTop:3 }}>
            Создана {new Date(order.created_at).toLocaleDateString('ru-RU')}
          </div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
          {canDeleteOrder && (
            <button
              onClick={handleDelete}
              disabled={deleteOrder.isPending}
              style={{ padding:'8px 12px', border:'1px solid rgba(226,75,74,.24)', background:'var(--red-50)', color:'var(--red-600)', borderRadius:10, fontSize:12, fontWeight:600, cursor:'pointer' }}
            >
              {deleteOrder.isPending ? 'Удаляем...' : 'Удалить заявку'}
            </button>
          )}
        </div>
      </div>

      {/* Прогресс */}
      <div className="client-shell-card client-order-detail-section" style={{ background:'var(--surface-pane)', border:'1px solid var(--gray-200)', borderRadius:14, padding:'18px 20px', marginBottom:16 }}>
        <div style={{ fontSize:12, fontWeight:600, color:'var(--gray-400)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:14 }}>
          Этапы обработки
        </div>
        <ProgressBar order={order} />
      </div>

      {/* Детали поставки */}
      {order.details && (
        <div className="client-shell-card client-order-detail-section" style={{ background:'var(--surface-pane)', border:'1px solid var(--gray-200)', borderRadius:14, padding:'16px 20px', marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--gray-400)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:12 }}>
            Детали
          </div>
          <div className="client-card-grid-3 client-order-detail-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
            {order.details.delivery_type && (
              <div><div style={{ fontSize:11, color:'var(--gray-400)', marginBottom:3 }}>Тип доставки</div><div style={{ fontWeight:500, color:'var(--gray-900)' }}>{order.details.delivery_type}</div></div>
            )}
            {order.details.delivery_date && (
              <div><div style={{ fontSize:11, color:'var(--gray-400)', marginBottom:3 }}>Дата</div><div style={{ fontWeight:500, color:'var(--gray-900)' }}>{new Date(order.details.delivery_date).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}</div></div>
            )}
            {order.details.places_count > 0 && (
              <div><div style={{ fontSize:11, color:'var(--gray-400)', marginBottom:3 }}>Мест</div><div style={{ fontWeight:500, color:'var(--gray-900)' }}>{order.details.places_count}</div></div>
            )}
            {order.details.weight_kg > 0 && (
              <div><div style={{ fontSize:11, color:'var(--gray-400)', marginBottom:3 }}>Вес</div><div style={{ fontWeight:500, color:'var(--gray-900)' }}>{order.details.weight_kg} кг</div></div>
            )}
          </div>
        </div>
      )}

      {Array.isArray(order.marketplace_shipments) && order.marketplace_shipments.length > 0 && (
        <div className="client-shell-card client-order-detail-table-card" style={{ background:'var(--surface-pane)', border:'1px solid var(--gray-200)', borderRadius:14, overflow:'hidden', marginBottom:16 }}>
          <div className="client-shell-card-header" style={{ padding:'14px 20px', borderBottom:'1px solid var(--gray-100)', fontSize:13, fontWeight:600, color:'var(--gray-900)' }}>
            Отгрузка на склады маркетплейсов
          </div>
          <div className="client-table-wrap">
          <table className="client-dark-table" style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
            <thead>
              <tr style={{ background:'var(--teal-600)' }}>
                {['МП', 'Склад', 'Дата', 'Мест', 'Кол-во'].map((h) => (
                  <th key={h} style={{ padding:'9px 16px', textAlign:'left', fontSize:11.5, fontWeight:600, color:'rgba(255,255,255,.9)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {order.marketplace_shipments.map((row) => (
                <tr key={row.id} style={{ borderBottom:'1px solid var(--gray-100)' }}>
                  <td style={{ padding:'10px 16px', fontWeight:600, color:'var(--gray-900)' }}>{(row.marketplace || '').toUpperCase()}</td>
                  <td style={{ padding:'10px 16px', color:'var(--gray-900)' }}>{row.warehouse_name}</td>
                  <td style={{ padding:'10px 16px', color:'var(--gray-400)' }}>{row.ship_date ? new Date(row.ship_date).toLocaleString('ru-RU') : '—'}</td>
                  <td style={{ padding:'10px 16px', color:'var(--gray-900)' }}>{fmt(row.places_count)}</td>
                  <td style={{ padding:'10px 16px', fontWeight:700, color:'var(--teal-400)' }}>{fmt(row.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {(hasWbShipment || isBoxesLoading || boxesError || wbBoxes.length > 0) && (
        <div className="client-shell-card client-order-detail-table-card" style={{ background:'var(--surface-pane)', border:'1px solid var(--gray-200)', borderRadius:14, overflow:'hidden', marginBottom:16 }}>
          <div className="client-shell-card-header" style={{ padding:'14px 20px', borderBottom:'1px solid var(--gray-100)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
            <span style={{ fontSize:13, fontWeight:600, color:'var(--gray-900)' }}>Короба WB</span>
            <button
              onClick={downloadWbBoxesExport}
              className="client-secondary-btn"
              disabled={isBoxesLoading || wbBoxes.length === 0}
              style={{ padding:'7px 12px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer' }}
            >
              Скачать Excel для WB
            </button>
          </div>
          {isBoxesLoading ? (
            <div style={{ padding:'16px 20px', fontSize:12.5, color:'var(--gray-400)' }}>
              Загружаем короба WB...
            </div>
          ) : boxesError ? (
            <div style={{ padding:'16px 20px', fontSize:12.5, color:'var(--red-600)' }}>
              Не удалось загрузить короба WB. Обновите страницу ещё раз.
            </div>
          ) : wbBoxes.length === 0 ? (
            <div style={{ padding:'16px 20px', fontSize:12.5, color:'var(--gray-400)' }}>
              Короба по этой поставке ещё не сформированы.
            </div>
          ) : (
            <>
              <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--gray-100)', fontSize:12, color:'var(--gray-400)' }}>
                Коробов: <strong style={{ color:'var(--gray-900)' }}>{fmt(orderBoxes.summary?.wb_boxes || 0)}</strong>
                {' '}· Разложено: <strong style={{ color:'var(--gray-900)' }}>{fmt(orderBoxes.summary?.total_items_packed || 0)}</strong>
                {' '}· Осталось: <strong style={{ color:'var(--gray-900)' }}>{fmt(orderBoxes.summary?.total_items_remaining || 0)}</strong>
              </div>
              <div style={{ display:'grid', gap:12, padding:'14px 20px' }}>
                {wbBoxes.map((box) => (
                  <div key={box.id} style={{ border:'1px solid var(--gray-200)', borderRadius:12, padding:14, background:'var(--surface)' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap', marginBottom:10 }}>
                      <div>
                        <div style={{ fontSize:12, color:'var(--gray-400)', marginBottom:4 }}>ШК короба</div>
                        <div style={{ fontSize:15, fontWeight:700, color:'var(--gray-900)', letterSpacing:'.03em' }}>{box.box_code}</div>
                      </div>
                      <div style={{ fontSize:12, color:'var(--gray-400)', textAlign:'right' }}>
                        <div>{box.warehouse_name || 'WB склад'}</div>
                        <div>{box.ship_date ? new Date(box.ship_date).toLocaleString('ru-RU') : 'без даты'}</div>
                        <div style={{ color:'var(--gray-900)', marginTop:4 }}>В коробе: {fmt(box.items_total || 0)} ед.</div>
                      </div>
                    </div>
                    <div className="client-table-wrap">
                      <table className="client-dark-table" style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
                        <thead>
                          <tr style={{ background:'var(--teal-600)' }}>
                            {['Товар', 'Баркод', 'Кол-во', 'Срок годности'].map((h) => (
                              <th key={h} style={{ padding:'9px 12px', textAlign:'left', fontSize:11.5, fontWeight:600, color:'rgba(255,255,255,.9)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(box.items || []).map((item, index) => (
                            <tr key={`${box.id}-${index}`} style={{ borderBottom:'1px solid var(--gray-100)' }}>
                              <td style={{ padding:'10px 12px', color:'var(--gray-900)', fontWeight:500 }}>{item.product_name || 'Товар'}</td>
                              <td style={{ padding:'10px 12px', color:'var(--gray-400)', fontFamily:'monospace', fontSize:11.5 }}>{item.barcode || '—'}</td>
                              <td style={{ padding:'10px 12px', color:'var(--gray-900)', fontWeight:600 }}>{fmt(item.quantity)}</td>
                              <td style={{ padding:'10px 12px', color:'var(--gray-500)' }}>{item.expiry_date || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Состав */}
      <div className="client-shell-card client-order-detail-table-card" style={{ background:'var(--surface-pane)', border:'1px solid var(--gray-200)', borderRadius:14, overflow:'hidden', marginBottom:16 }}>
        <div className="client-shell-card-header" style={{ padding:'14px 20px', borderBottom:'1px solid var(--gray-100)' }}>
          <span style={{ fontSize:13, fontWeight:600, color:'var(--gray-900)' }}>Состав заявки</span>
        </div>
        <div className="client-table-wrap">
        <table className="client-dark-table" style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
          <thead>
            <tr style={{ background:'var(--teal-600)' }}>
              {['Товар','Баркод','Артикул','Цвет','Размер','Заявлено','Принято','Брак'].map(h => (
                <th key={h} style={{ padding:'9px 16px', textAlign:'left', fontSize:11.5, fontWeight:600, color:'rgba(255,255,255,.9)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.items?.map(item => (
              <tr key={item.id} style={{ borderBottom:'1px solid var(--gray-100)' }}>
                <td style={{ padding:'10px 16px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {item.photo_url
                      ? <img src={item.photo_url} alt="" style={{ width:32, height:32, borderRadius:5, objectFit:'cover' }} />
                      : <div style={{ width:32, height:32, borderRadius:5, background:'var(--surface-hover)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>📦</div>
                    }
                    <div>
                      <div style={{ fontWeight:500, color:'var(--gray-900)' }}>{item.product_name}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding:'10px 16px', fontFamily:'monospace', fontSize:11, color:'var(--gray-400)' }}>{item.barcode || '—'}</td>
                <td style={{ padding:'10px 16px', fontFamily:'monospace', fontSize:11, color:'var(--gray-400)' }}>{item.article}</td>
                <td style={{ padding:'10px 16px', color:'var(--gray-500)' }}>{item.color || '—'}</td>
                <td style={{ padding:'10px 16px', color:'var(--gray-500)' }}>{item.size || '—'}</td>
                <td style={{ padding:'10px 16px', color:'var(--gray-900)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, justifyContent:'space-between' }}>
                    <span style={{ fontWeight:600 }}>{fmt(item.quantity)}</span>
                    {canEditItems && (
                      <button
                        type="button"
                        onClick={() => openItemEditor(item)}
                        style={{
                          border:'1px solid #E4E2DA',
                          background:'#fff',
                          color:'#1A1A18',
                          borderRadius:8,
                          padding:'5px 10px',
                          fontSize:11.5,
                          fontWeight:600,
                          cursor:'pointer',
                          whiteSpace:'nowrap',
                        }}
                      >
                        Изменить
                      </button>
                    )}
                  </div>
                </td>
                <td style={{ padding:'10px 16px', fontWeight:600, color:'#1D9E75' }}>{fmt(item.ready_qty)}</td>
                <td style={{ padding:'10px 16px', color: item.defect_qty > 0 ? '#E24B4A' : '#C8C6BE', fontWeight: item.defect_qty > 0 ? 600 : 400 }}>
                  {fmt(item.defect_qty)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Услуги */}
      {services?.length > 0 && (
        <div className="client-shell-card" style={{ background:'var(--surface-pane)', border:'1px solid var(--gray-200)', borderRadius:14, overflow:'hidden', marginBottom:16 }}>
          <div className="client-shell-card-header" style={{ padding:'14px 20px', borderBottom:'1px solid var(--gray-100)' }}>
            <span style={{ fontSize:13, fontWeight:600, color:'var(--gray-900)' }}>Оказанные услуги</span>
          </div>
          <div className="client-table-wrap">
          <table className="client-dark-table" style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
            <thead>
              <tr style={{ background:'#0F6E56' }}>
                {['Услуга','Кол-во','Цена','Сумма'].map(h => (
                  <th key={h} style={{ padding:'9px 16px', textAlign:'left', fontSize:11.5, fontWeight:600, color:'rgba(255,255,255,.9)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {services.map(s => (
                <tr key={s.id} style={{ borderBottom:'1px solid var(--gray-100)' }}>
                  <td style={{ padding:'10px 16px', fontWeight:500, color:'var(--gray-900)' }}>{s.display_name || s.service_name}</td>
                  <td style={{ padding:'10px 16px', color:'var(--gray-900)' }}>{fmt(s.quantity)}</td>
                  <td style={{ padding:'10px 16px', color:'var(--gray-400)' }}>{Number(s.unit_price).toFixed(2)} ₽</td>
                  <td style={{ padding:'10px 16px', fontWeight:700, color:'#1D9E75' }}>{fmt(Math.round(s.total))} ₽</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop:'2px solid var(--gray-200)' }}>
                <td colSpan={3} style={{ padding:'10px 16px', fontWeight:600, color:'var(--gray-900)' }}>Итого:</td>
                <td style={{ padding:'10px 16px', fontWeight:700, fontSize:15, color:'#1D9E75' }}>{fmt(Math.round(servicesTotal))} ₽</td>
              </tr>
            </tfoot>
          </table>
          </div>
        </div>
      )}

      <div className="client-shell-card" style={{ background:'var(--surface-pane)', border:'1px solid var(--gray-200)', borderRadius:14, padding:'16px 20px', marginBottom:16 }}>
        <div style={{ fontSize:12, fontWeight:600, color:'var(--gray-400)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:14 }}>
          Документы
        </div>

        <div className="client-doc-list" style={{ marginBottom:16 }}>
          {documentRows.map((doc) => (
            <div key={doc.key} className="client-doc-row">
              <div className="client-doc-row-main">
                <div className="client-doc-row-label">{doc.label}</div>
                <div className="client-doc-row-title">{doc.title}</div>
                <div className="client-doc-row-sub">{doc.sub}</div>
              </div>
              <div className="client-doc-row-actions">
                <button
                  onClick={() => handleDocumentAction(doc)}
                  className="client-secondary-btn"
                  disabled={!doc.canOpen || docLoadingKey === doc.key}
                  style={{ padding:'7px 12px', borderRadius:8, fontSize:12, fontWeight:600, cursor:!doc.canOpen ? 'not-allowed' : 'pointer', opacity:!doc.canOpen ? 0.55 : 1 }}
                >
                  {docLoadingKey === doc.key ? '...' : doc.actionLabel}
                </button>
              </div>
            </div>
          ))}
        </div>

        {uploadedDocs.length > 0 && (
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--gray-400)', marginBottom:8 }}>Прикрепленные документы</div>
            <div className="client-doc-list">
              {uploadedDocs.map((doc) => (
                <div key={doc.id} className="client-uploaded-doc-row">
                  <div className="client-uploaded-doc-main">
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--gray-900)' }}>{doc.title || doc.original_name}</div>
                    <div style={{ fontSize:11.5, color:'var(--gray-400)', marginTop:2 }}>
                      {new Date(doc.created_at).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
                  <button
                    onClick={() => window.open(doc.file_url, '_blank', 'noopener,noreferrer')}
                    className="client-secondary-btn"
                    style={{ padding:'6px 12px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer', flexShrink:0 }}
                  >
                    Скачать
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* История этапов */}
      {order.stages?.length > 0 && (
        <div className="client-shell-card" style={{ background:'var(--surface-pane)', border:'1px solid var(--gray-200)', borderRadius:14, padding:'16px 20px' }}>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--gray-400)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:14 }}>
            История
          </div>
          <div className="client-timeline">
            {order.stages.map(s => (
              <div key={s.id} className="client-timeline-item">
                <div className="client-timeline-dot" />
                <div className="client-timeline-content">
                  <div className="client-timeline-head">
                    <StageBadge stage={s.stage} />
                    <span className="client-timeline-date">{new Date(s.created_at).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</span>
                  </div>
                  {s.note && <div className="client-timeline-note">{s.note}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={!!itemEdit} onClose={closeItemEditor} title="Изменить количество товара" size="lg">
        <div style={{ display:'grid', gap:12 }}>
          <div style={{ border:'1px solid #E4E2DA', borderRadius:12, padding:12, background:'#FCFCFB' }}>
            <div style={{ fontSize:12, color:'#9E9C95', marginBottom:4 }}>Товар</div>
            <div style={{ fontSize:14, fontWeight:600, color:'#1A1A18' }}>{itemEdit?.item?.product_name}</div>
          </div>
          <Input
            label="Количество"
            value={itemEdit?.quantity ?? ''}
            onChange={(e) => setItemEdit((prev) => prev ? { ...prev, quantity: e.target.value } : prev)}
            inputMode="numeric"
          />
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <Button variant="ghost" onClick={closeItemEditor}>Отмена</Button>
            <Button onClick={saveItemQuantity} disabled={updateClientItem.isPending}>
              {updateClientItem.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
