import { useEffect, useState } from 'react';
import { useCreateProduct, useDeleteClientProduct, useProduct, useProducts, useUpdateBarcodes, useUpdateProduct } from '../../hooks/queries';
import { fmt } from '../../components/ui';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';

const OP_LABELS = { in:'Приход', out:'Расход', defect:'Брак', defect_return:'Возврат из брака', write_off:'Списание' };
const OP_CLR = { in:'#1D9E75', out:'#E24B4A', defect:'#E24B4A', defect_return:'#BA7517', write_off:'#9E9C95' };
const MP = { ff: 'Фулфилмент', wb: 'WB', ozon: 'Ozon', yandex: 'Яндекс' };

function getErrorMessage(error, fallback = 'Не удалось сохранить товар') {
  const payload = error?.response?.data?.error;
  if (!payload) return fallback;
  if (typeof payload === 'string') return payload;
  if (payload instanceof Error) return payload.message || fallback;
  if (Array.isArray(payload)) {
    return payload
      .map((item) => item?.message || item?.path?.join('.') || item?.code || JSON.stringify(item))
      .join(', ');
  }
  if (typeof payload === 'object') {
    const candidate = payload?.message || payload?.error || payload?.detail;
    if (typeof candidate === 'string') return candidate;
    if (candidate != null) return JSON.stringify(candidate);
    return JSON.stringify(payload);
  }
  if (error?.message) return error.message;
  return String(payload);
}

function parseNumberInput(value) {
  if (value === '' || value == null) return undefined;
  const normalized = String(value).replace(',', '.').trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function ProductHistory({ productId }) {
  const { data: ops, isLoading } = useQuery({
    queryKey: ['warehouse-ops', { product_id: productId }],
    queryFn: () => api.get('/warehouse/ops', { params: { product_id: productId } }).then(r => r.data),
    enabled: !!productId,
  });

  if (isLoading) return <div style={{ padding:'16px', color:'#8b93a1', fontSize:12 }}>Загрузка...</div>;
  if (!ops?.length) return <div style={{ padding:'16px', color:'#8b93a1', fontSize:12 }}>Операций нет</div>;

  return (
    <div style={{ borderTop:'1px solid #17191d' }}>
      <div style={{ padding:'10px 16px', fontSize:11, fontWeight:600, color:'#8b93a1', textTransform:'uppercase', letterSpacing:'.5px' }}>
        История движения
      </div>
      <table className="client-dark-table" style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
        <thead>
          <tr style={{ background:'#0F6E56' }}>
            <th style={{ padding:'7px 16px', textAlign:'left', fontWeight:600, color:'rgba(255,255,255,.92)' }}>Дата</th>
            <th style={{ padding:'7px 16px', textAlign:'left', fontWeight:600, color:'rgba(255,255,255,.92)' }}>Операция</th>
            <th style={{ padding:'7px 16px', textAlign:'right', fontWeight:600, color:'rgba(255,255,255,.92)' }}>Кол-во</th>
            <th style={{ padding:'7px 16px', textAlign:'left', fontWeight:600, color:'rgba(255,255,255,.92)' }}>Заявка</th>
          </tr>
        </thead>
        <tbody>
          {ops.slice(0, 20).map(op => (
            <tr key={op.id} style={{ borderTop:'1px solid #17191d' }}>
              <td style={{ padding:'7px 16px', color:'#8b93a1' }}>{new Date(op.created_at).toLocaleDateString('ru-RU')}</td>
              <td style={{ padding:'7px 16px' }}>
                <span style={{ fontSize:11, fontWeight:500, color: OP_CLR[op.op_type] }}>{OP_LABELS[op.op_type] || op.op_type}</span>
              </td>
              <td style={{ padding:'7px 16px', textAlign:'right', fontWeight:600, color: OP_CLR[op.op_type] }}>
                {['in','defect_return'].includes(op.op_type) ? '+' : '−'}{fmt(op.quantity)}
              </td>
              <td style={{ padding:'7px 16px', fontFamily:'monospace', fontSize:11, color:'#8b93a1' }}>
                {op.order_number ? `#${op.order_number}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ClientProducts() {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState(null);
  const { data: products, isLoading } = useProducts({ search, page, limit: pageSize });
  const { data: editProduct } = useProduct(editId);
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteClientProduct();
  const updateBarcodes = useUpdateBarcodes();
  const [form, setForm] = useState({
    name: '',
    article: '',
    brand: '',
    color: '',
    size: '',
    weight_g: '',
    country: '',
    composition: '',
    dim_l: '',
    dim_w: '',
    dim_h: '',
  });
  const [barcodes, setBarcodes] = useState([{ marketplace: 'ff', barcode: '', article_mp: '' }]);
  const [editForm, setEditForm] = useState(null);
  const productRows = Array.isArray(products) ? products : products?.items || [];
  const totalRows = Array.isArray(products) ? productRows.length : Number(products?.total || 0);
  const totalPages = Array.isArray(products) ? 1 : Number(products?.totalPages || 1);

  const set = (key, value) => setForm((curr) => ({ ...curr, [key]: value }));
  const setEdit = (key, value) => setEditForm((curr) => ({ ...curr, [key]: value }));

  useEffect(() => {
    if (!editProduct) return;
    setEditForm({
      name: editProduct.name || '',
      article: editProduct.article || '',
      brand: editProduct.brand || '',
      color: editProduct.color || '',
      size: editProduct.size || '',
      weight_g: editProduct.weight_g || '',
      country: editProduct.country || '',
      composition: editProduct.composition || '',
      dim_l: editProduct.dim_l || '',
      dim_w: editProduct.dim_w || '',
      dim_h: editProduct.dim_h || '',
    });
    setBarcodes(editProduct.barcodes?.length ? editProduct.barcodes : [{ marketplace: 'ff', barcode: '', article_mp: '' }]);
  }, [editProduct]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);
  const handleDelete = async (productId, productName) => {
    const ok = window.confirm(`Удалить товар "${productName}"?`);
    if (!ok) return;
    try {
      await deleteProduct.mutateAsync(productId);
      setExpanded((current) => (current === productId ? null : current));
    } catch (error) {
      alert(error.response?.data?.error || 'Не удалось удалить товар');
    }
  };
  const handleEditOpen = (productId) => {
    setEditId(productId);
  };
  const handleCreateOpen = () => {
    setForm({
      name: '',
      article: '',
      brand: '',
      color: '',
      size: '',
      weight_g: '',
      country: '',
      composition: '',
      dim_l: '',
      dim_w: '',
      dim_h: '',
    });
    setBarcodes([{ marketplace: 'ff', barcode: '', article_mp: '' }]);
    setShowCreate(true);
  };
  const handleEditClose = () => {
    setEditId(null);
    setEditForm(null);
    setBarcodes([{ marketplace: 'ff', barcode: '', article_mp: '' }]);
  };
  const handleEditSave = async () => {
    if (!editId || !editForm?.name?.trim()) return;
    try {
      const saved = await updateProduct.mutateAsync({
        id: editId,
        name: editForm.name.trim(),
        article: editForm.article || undefined,
        brand: editForm.brand || undefined,
        color: editForm.color || undefined,
        size: editForm.size || undefined,
        weight_g: parseNumberInput(editForm.weight_g),
        country: editForm.country || undefined,
        composition: editForm.composition || undefined,
        dim_l: parseNumberInput(editForm.dim_l),
        dim_w: parseNumberInput(editForm.dim_w),
        dim_h: parseNumberInput(editForm.dim_h),
      });
      const nextBarcodes = barcodes.filter((row) => row.barcode || row.article_mp);
      if (nextBarcodes.length > 0) {
        try {
          await updateBarcodes.mutateAsync({
            id: saved.id,
            barcodes: nextBarcodes,
          });
        } catch (barcodeError) {
          alert(`Товар сохранён, но не удалось сохранить связи маркетплейсов: ${getErrorMessage(barcodeError, 'ошибка связей')}`);
        }
      }
      handleEditClose();
    } catch (error) {
      alert(getErrorMessage(error));
    }
  };
  const submit = async () => {
    if (!form.name.trim()) return;
    try {
      const product = await createProduct.mutateAsync({
        name: form.name.trim(),
        article: form.article || undefined,
        brand: form.brand || undefined,
        color: form.color || undefined,
        size: form.size || undefined,
        weight_g: parseNumberInput(form.weight_g),
        country: form.country || undefined,
        composition: form.composition || undefined,
        dim_l: parseNumberInput(form.dim_l),
        dim_w: parseNumberInput(form.dim_w),
        dim_h: parseNumberInput(form.dim_h),
      });
      const nextBarcodes = barcodes.filter((row) => row.barcode || row.article_mp);
      setShowCreate(false);
      setForm({ name: '', article: '', brand: '', color: '', size: '', weight_g: '', country: '', composition: '', dim_l: '', dim_w: '', dim_h: '' });
      setBarcodes([{ marketplace: 'ff', barcode: '', article_mp: '' }]);
      if (nextBarcodes.length > 0) {
        try {
          await updateBarcodes.mutateAsync({
            id: product.id,
            barcodes: nextBarcodes,
          });
        } catch (barcodeError) {
          alert(`Товар сохранён, но не удалось сохранить связи маркетплейсов: ${getErrorMessage(barcodeError, 'ошибка связей')}`);
        }
      }
    } catch (error) {
      alert(getErrorMessage(error));
    }
  };

  return (
    <div className="client-page" style={{ fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', fontSize:13 }}>
      <div className="client-page-head" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div className="client-page-title" style={{ fontSize:20, fontWeight:700, color:'#f7f9fc', letterSpacing:'-0.3px' }}>Мои товары</div>
        <button
          className="client-secondary-btn"
          onClick={handleCreateOpen}
          style={{ padding:'8px 14px', borderRadius:10, border:'1px solid #2a2e36', background:'#16191e', cursor:'pointer', fontSize:13, fontWeight:600, color:'#f7f9fc' }}
        >
          + Добавить товар
        </button>
      </div>

      <div style={{ marginBottom:14 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по названию, артикулу или штрихкоду..."
          className="client-dark-input"
          style={{ padding:'8px 12px 8px 32px', border:'1px solid #2a2e36', borderRadius:10, fontSize:13, width:280, outline:'none', color:'#f7f9fc', background:'#16191e url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'14\' height=\'14\' fill=\'none\' stroke=\'%238b93a1\' stroke-width=\'2\' viewBox=\'0 0 24 24\'%3E%3Ccircle cx=\'11\' cy=\'11\' r=\'8\'/%3E%3Cpath d=\'m21 21-4.35-4.35\'/%3E%3C/svg%3E") no-repeat 10px center' }} />
      </div>

      <div className="client-shell-card" style={{ background:'#111317', border:'1px solid #23262c', borderRadius:14, overflow:'hidden' }}>
        {isLoading ? (
          <div style={{ padding:48, textAlign:'center', color:'#8b93a1' }}>Загрузка...</div>
        ) : productRows.length === 0 ? (
          <div style={{ padding:48, textAlign:'center', color:'#8b93a1' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>📦</div>
            <div>Товаров нет</div>
          </div>
        ) : (
          productRows.map(p => (
            <div key={p.id} style={{ borderBottom:'1px solid #17191d' }}>
              {/* Строка товара */}
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 40px', alignItems:'center', padding:'11px 16px', cursor:'pointer', transition:'background .1s' }}
                onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  {p.photo_url
                    ? <img src={p.photo_url} alt="" style={{ width:36, height:36, borderRadius:6, objectFit:'cover', flexShrink:0 }} />
                    : <div style={{ width:36, height:36, borderRadius:6, background:'#1a1d22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>📦</div>
                  }
                  <div>
                    <div style={{ fontWeight:500, fontSize:13, color:'#f7f9fc' }}>{p.name}</div>
                    {p.brand && <div style={{ fontSize:11, color:'#8b93a1' }}>{p.brand}</div>}
                    <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:4, fontSize:11, color:'#9aa3b1' }}>
                      <span>Штрихкод: {p.barcode || '—'}</span>
                      <span>Цвет: {p.color || '—'}</span>
                      <span>Размер: {p.size || '—'}</span>
                      <span>Артикул: {p.article || '—'}</span>
                    </div>
                    {Number(p.barcodes_count || 0) > 1 && (
                      <div style={{ marginTop:6, display:'inline-flex', alignItems:'center', gap:6, padding:'4px 8px', borderRadius:999, background:'#12362d', color:'#7be2c0', fontSize:11, fontWeight:600 }}>
                        {fmt(p.barcodes_count)} баркода
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ fontFamily:'monospace', fontSize:11, color:'#8b93a1' }}>{p.article || '—'}</div>
                <div>
                  <div style={{ fontSize:10, color:'#8b93a1', marginBottom:2 }}>Остаток</div>
                  <div style={{ fontWeight:700, color:'#1D9E75', fontSize:15 }}>{fmt(p.quantity)}</div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:'#8b93a1', marginBottom:2 }}>Доступно</div>
                  <div style={{ fontWeight:600, fontSize:14, color:'#f7f9fc' }}>{fmt(p.available_qty)}</div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:'#8b93a1', marginBottom:2 }}>Брак</div>
                  <div style={{ fontWeight:600, color: p.defect_qty > 0 ? '#E24B4A' : '#C8C6BE', fontSize:14 }}>{fmt(p.defect_qty)}</div>
                </div>
                <div style={{ textAlign:'center', color:'#8b93a1', fontSize:16, transform: expanded === p.id ? 'rotate(90deg)' : 'none', transition:'transform .2s' }}>›</div>
              </div>
              {/* История */}
                {expanded === p.id && (
                  <>
                    <div style={{ padding:'0 16px 12px', display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:10 }}>
                    {[
                      ['Штрихкод', p.barcode || '—'],
                      ['Цвет', p.color || '—'],
                      ['Размер', p.size || '—'],
                      ['Артикул', p.article || '—'],
                      ['Связей МП', fmt(p.barcodes_count || 0)],
                    ].map(([label, value]) => (
                      <div key={label} style={{ background:'#16191e', border:'1px solid #23262c', borderRadius:10, padding:'10px 12px' }}>
                        <div style={{ fontSize:11, color:'#8b93a1', marginBottom:4 }}>{label}</div>
                        <div style={{ fontSize:13, fontWeight:600, color:'#f7f9fc', wordBreak:'break-word' }}>{value}</div>
                        </div>
                      ))}
                    <div style={{ gridColumn:'1/-1', display:'flex', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditOpen(p.id);
                        }}
                        style={{ padding:'7px 12px', borderRadius:9, border:'1px solid #2a2e36', background:'#16191e', color:'#f7f9fc', fontSize:12, fontWeight:600, cursor:'pointer' }}
                      >
                        Изменить товар
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(p.id, p.name);
                        }}
                        disabled={deleteProduct.isPending}
                        style={{ padding:'7px 12px', borderRadius:9, border:'1px solid #F0D2D2', background:'#FFF5F5', color:'#C84E4E', fontSize:12, fontWeight:600, cursor:'pointer' }}
                      >
                        {deleteProduct.isPending ? 'Удаляем...' : 'Удалить товар'}
                      </button>
                    </div>
                  </div>
                  <ProductHistory productId={p.id} />
                </>
              )}
            </div>
          ))
        )}
      </div>

      {!isLoading && (
        <div className="pagination-bar" style={{ marginTop: 12 }}>
          <div className="text-muted text-sm">
            Показано {Math.min((page - 1) * pageSize + 1, totalRows)}–{Math.min(page * pageSize, totalRows)} из {totalRows}
          </div>
          <div className="pagination-controls">
            <span className="text-muted text-sm">На странице</span>
            <div className="page-size-toggle">
              {[25, 50, 100].map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`page-size-btn${pageSize === size ? ' active' : ''}`}
                  onClick={() => setPageSize(size)}
                >
                  {size}
                </button>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
              Назад
            </button>
            <span className="text-muted text-sm">Страница {page} из {totalPages}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || totalPages <= 1}>
              Вперёд
            </button>
          </div>
        </div>
      )}

      {editId && editForm && (
        <div
          onClick={handleEditClose}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.25)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:3000 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width:640, maxWidth:'92vw', background:'#fff', borderRadius:16, border:'1px solid #E4E2DA', overflow:'hidden' }}
          >
            <div style={{ padding:'14px 16px', borderBottom:'1px solid #F1EFE8', fontSize:18, fontWeight:700, color:'#1A1A18' }}>Редактировать товар</div>
            <div style={{ padding:16, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <input value={editForm.name} onChange={(e) => setEdit('name', e.target.value)} placeholder="Название*" style={{ gridColumn:'1/-1', padding:'8px 12px', border:'1px solid #E4E2DA', borderRadius:10, fontSize:13 }} />
              <input value={editForm.article} onChange={(e) => setEdit('article', e.target.value)} placeholder="Артикул" style={{ padding:'8px 12px', border:'1px solid #E4E2DA', borderRadius:10, fontSize:13 }} />
              <input value={editForm.brand} onChange={(e) => setEdit('brand', e.target.value)} placeholder="Бренд" style={{ padding:'8px 12px', border:'1px solid #E4E2DA', borderRadius:10, fontSize:13 }} />
              <input value={editForm.color} onChange={(e) => setEdit('color', e.target.value)} placeholder="Цвет" style={{ padding:'8px 12px', border:'1px solid #E4E2DA', borderRadius:10, fontSize:13 }} />
              <input value={editForm.size} onChange={(e) => setEdit('size', e.target.value)} placeholder="Размер" style={{ padding:'8px 12px', border:'1px solid #E4E2DA', borderRadius:10, fontSize:13 }} />
              <input value={editForm.weight_g} type="text" inputMode="decimal" onChange={(e) => setEdit('weight_g', e.target.value)} placeholder="Вес, г" style={{ width:96, padding:'8px 10px', border:'1px solid #E4E2DA', borderRadius:10, fontSize:13 }} />
              <input value={editForm.country} onChange={(e) => setEdit('country', e.target.value)} placeholder="Страна" style={{ padding:'8px 12px', border:'1px solid #E4E2DA', borderRadius:10, fontSize:13 }} />
              <input value={editForm.composition} onChange={(e) => setEdit('composition', e.target.value)} placeholder="Состав" style={{ padding:'8px 12px', border:'1px solid #E4E2DA', borderRadius:10, fontSize:13 }} />
              <div style={{ gridColumn:'1/-1', display:'flex', gap:8, alignItems:'center' }}>
                <span style={{ fontSize:12, color:'#6E6C66', minWidth:82 }}>Габариты, см</span>
                <input value={editForm.dim_l} type="text" inputMode="decimal" onChange={(e) => setEdit('dim_l', e.target.value)} placeholder="Д" style={{ width:68, padding:'7px 8px', border:'1px solid #E4E2DA', borderRadius:9, fontSize:13 }} />
                <input value={editForm.dim_w} type="text" inputMode="decimal" onChange={(e) => setEdit('dim_w', e.target.value)} placeholder="Ш" style={{ width:68, padding:'7px 8px', border:'1px solid #E4E2DA', borderRadius:9, fontSize:13 }} />
                <input value={editForm.dim_h} type="text" inputMode="decimal" onChange={(e) => setEdit('dim_h', e.target.value)} placeholder="В" style={{ width:68, padding:'7px 8px', border:'1px solid #E4E2DA', borderRadius:9, fontSize:13 }} />
              </div>
              <div style={{ gridColumn:'1/-1', borderTop:'1px solid #F1EFE8', marginTop:2, paddingTop:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:'#6E6C66' }}>Связи маркетплейсов</span>
                  <button
                    type="button"
                    onClick={() => setBarcodes((current) => [...current, { marketplace: 'ff', barcode: '', article_mp: '' }])}
                    style={{ padding:'5px 10px', border:'1px solid #E4E2DA', borderRadius:8, background:'#fff', cursor:'pointer', fontSize:12 }}
                  >
                    + Добавить
                  </button>
                </div>
                {barcodes.map((row, index) => (
                  <div key={index} style={{ display:'grid', gridTemplateColumns:'150px 1fr 1fr 36px', gap:8, marginBottom:8 }}>
                    <select
                      value={row.marketplace}
                      onChange={(event) => setBarcodes((current) => current.map((item, itemIndex) => (
                        itemIndex === index ? { ...item, marketplace: event.target.value } : item
                      )))}
                      style={{ padding:'8px 10px', border:'1px solid #E4E2DA', borderRadius:10, fontSize:13 }}
                    >
                      {Object.entries(MP).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <input
                      value={row.barcode || ''}
                      onChange={(event) => setBarcodes((current) => current.map((item, itemIndex) => (
                        itemIndex === index ? { ...item, barcode: event.target.value } : item
                      )))}
                      placeholder="Штрихкод"
                      style={{ padding:'8px 10px', border:'1px solid #E4E2DA', borderRadius:10, fontSize:13 }}
                    />
                    <input
                      value={row.article_mp || ''}
                      onChange={(event) => setBarcodes((current) => current.map((item, itemIndex) => (
                        itemIndex === index ? { ...item, article_mp: event.target.value } : item
                      )))}
                      placeholder="Артикул МП"
                      style={{ padding:'8px 10px', border:'1px solid #E4E2DA', borderRadius:10, fontSize:13 }}
                    />
                    <button
                      type="button"
                      onClick={() => setBarcodes((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index))}
                      style={{ border:'1px solid #E4E2DA', borderRadius:10, background:'#fff', cursor:'pointer', color:'#9E9C95' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding:'0 16px 16px', display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button onClick={handleEditClose} style={{ padding:'8px 14px', borderRadius:10, border:'1px solid #E4E2DA', background:'#fff', cursor:'pointer' }}>Отмена</button>
              <button onClick={handleEditSave} disabled={updateProduct.isPending} style={{ padding:'8px 14px', borderRadius:10, border:'none', background:'#1D9E75', color:'#fff', cursor:'pointer', opacity: updateProduct.isPending ? .7 : 1 }}>
                {updateProduct.isPending ? 'Сохраняем...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div
          onClick={() => setShowCreate(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.25)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:3000 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width:640, maxWidth:'92vw', background:'#fff', borderRadius:16, border:'1px solid #E4E2DA', overflow:'hidden' }}
          >
            <div style={{ padding:'14px 16px', borderBottom:'1px solid #F1EFE8', fontSize:18, fontWeight:700, color:'#1A1A18' }}>Новый товар</div>
            <div style={{ padding:16, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Название*" style={{ gridColumn:'1/-1', padding:'8px 12px', border:'1px solid #E4E2DA', borderRadius:10, fontSize:13 }} />
              <input value={form.article} onChange={(e) => set('article', e.target.value)} placeholder="Артикул" style={{ padding:'8px 12px', border:'1px solid #E4E2DA', borderRadius:10, fontSize:13 }} />
              <input value={form.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Бренд" style={{ padding:'8px 12px', border:'1px solid #E4E2DA', borderRadius:10, fontSize:13 }} />
              <input value={form.color} onChange={(e) => set('color', e.target.value)} placeholder="Цвет" style={{ padding:'8px 12px', border:'1px solid #E4E2DA', borderRadius:10, fontSize:13 }} />
              <input value={form.size} onChange={(e) => set('size', e.target.value)} placeholder="Размер" style={{ padding:'8px 12px', border:'1px solid #E4E2DA', borderRadius:10, fontSize:13 }} />
              <input value={form.weight_g} type="text" inputMode="decimal" onChange={(e) => set('weight_g', e.target.value)} placeholder="Вес, г" style={{ width:96, padding:'8px 10px', border:'1px solid #E4E2DA', borderRadius:10, fontSize:13 }} />
              <input value={form.country} onChange={(e) => set('country', e.target.value)} placeholder="Страна" style={{ padding:'8px 12px', border:'1px solid #E4E2DA', borderRadius:10, fontSize:13 }} />
              <input value={form.composition} onChange={(e) => set('composition', e.target.value)} placeholder="Состав" style={{ padding:'8px 12px', border:'1px solid #E4E2DA', borderRadius:10, fontSize:13 }} />
              <div style={{ gridColumn:'1/-1', display:'flex', gap:8, alignItems:'center' }}>
                <span style={{ fontSize:12, color:'#6E6C66', minWidth:82 }}>Габариты, см</span>
                <input value={form.dim_l} type="text" inputMode="decimal" onChange={(e) => set('dim_l', e.target.value)} placeholder="Д" style={{ width:68, padding:'7px 8px', border:'1px solid #E4E2DA', borderRadius:9, fontSize:13 }} />
                <input value={form.dim_w} type="text" inputMode="decimal" onChange={(e) => set('dim_w', e.target.value)} placeholder="Ш" style={{ width:68, padding:'7px 8px', border:'1px solid #E4E2DA', borderRadius:9, fontSize:13 }} />
                <input value={form.dim_h} type="text" inputMode="decimal" onChange={(e) => set('dim_h', e.target.value)} placeholder="В" style={{ width:68, padding:'7px 8px', border:'1px solid #E4E2DA', borderRadius:9, fontSize:13 }} />
              </div>
              <div style={{ gridColumn:'1/-1', borderTop:'1px solid #F1EFE8', marginTop:2, paddingTop:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:'#6E6C66' }}>Связи маркетплейсов</span>
                  <button
                    type="button"
                    onClick={() => setBarcodes((current) => [...current, { marketplace: 'ff', barcode: '', article_mp: '' }])}
                    style={{ padding:'5px 10px', border:'1px solid #E4E2DA', borderRadius:8, background:'#fff', cursor:'pointer', fontSize:12 }}
                  >
                    + Добавить
                  </button>
                </div>
                {barcodes.map((row, index) => (
                  <div key={index} style={{ display:'grid', gridTemplateColumns:'150px 1fr 1fr 36px', gap:8, marginBottom:8 }}>
                    <select
                      value={row.marketplace}
                      onChange={(event) => setBarcodes((current) => current.map((item, itemIndex) => (
                        itemIndex === index ? { ...item, marketplace: event.target.value } : item
                      )))}
                      style={{ padding:'8px 10px', border:'1px solid #E4E2DA', borderRadius:10, fontSize:13 }}
                    >
                      {Object.entries(MP).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <input
                      value={row.barcode || ''}
                      onChange={(event) => setBarcodes((current) => current.map((item, itemIndex) => (
                        itemIndex === index ? { ...item, barcode: event.target.value } : item
                      )))}
                      placeholder="Штрихкод"
                      style={{ padding:'8px 10px', border:'1px solid #E4E2DA', borderRadius:10, fontSize:13 }}
                    />
                    <input
                      value={row.article_mp || ''}
                      onChange={(event) => setBarcodes((current) => current.map((item, itemIndex) => (
                        itemIndex === index ? { ...item, article_mp: event.target.value } : item
                      )))}
                      placeholder="Артикул МП"
                      style={{ padding:'8px 10px', border:'1px solid #E4E2DA', borderRadius:10, fontSize:13 }}
                    />
                    <button
                      type="button"
                      onClick={() => setBarcodes((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index))}
                      style={{ border:'1px solid #E4E2DA', borderRadius:10, background:'#fff', cursor:'pointer', color:'#9E9C95' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding:'0 16px 16px', display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button onClick={() => setShowCreate(false)} style={{ padding:'8px 14px', borderRadius:10, border:'1px solid #E4E2DA', background:'#fff', cursor:'pointer' }}>Отмена</button>
              <button onClick={submit} disabled={createProduct.isPending || !form.name.trim()} style={{ padding:'8px 14px', borderRadius:10, border:'none', background:'#1D9E75', color:'#fff', cursor:'pointer', opacity: createProduct.isPending ? .7 : 1 }}>
                {createProduct.isPending ? 'Сохраняем...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
