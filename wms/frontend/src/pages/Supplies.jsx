import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { PageHeader, Button, Modal, Input, Select, fmt, Spinner, Empty, Badge } from '../components/ui';

const UNIT_LABELS = { pcs: 'шт', m: 'м', kg: 'кг', roll: 'рул', pack: 'упак' };

const useSupplies  = () => useQuery({ queryKey: ['supplies'], queryFn: () => api.get('/supplies').then(r => r.data) });
const useLowStock  = () => useQuery({ queryKey: ['supplies','low-stock'], queryFn: () => api.get('/supplies/low-stock').then(r => r.data) });

function SupplyModal({ open, onClose, item }) {
  const qc = useQueryClient();
  const emptyForm = { name:'', sku:'', unit:'pcs', cost_price:0, sale_price:0, min_stock:0 };
  const save = useMutation({
    mutationFn: d => item?.id ? api.patch(`/supplies/${item.id}`, d) : api.post('/supplies', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplies'] }); onClose(); },
  });
  const [form, setForm] = useState(item || emptyForm);
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setForm(item ? {
      name: item.name || '',
      sku: item.sku || '',
      unit: item.unit || 'pcs',
      cost_price: Number(item.cost_price || 0),
      sale_price: Number(item.sale_price || 0),
      min_stock: Number(item.min_stock || 0),
    } : emptyForm);
  }, [open, item]);

  return (
    <Modal open={open} onClose={onClose} title={item ? 'Редактировать расходник' : 'Добавить расходник'}>
      <Input label="Название" value={form.name} onChange={e => set('name', e.target.value)} />
      <div className="form-grid">
        <Input label="Артикул / SKU" value={form.sku||''} onChange={e => set('sku', e.target.value)} />
        <Select label="Единица" value={form.unit} onChange={e => set('unit', e.target.value)}>
          {Object.entries(UNIT_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Input label="Себестоимость (₽)" className="compact-number-input" type="number" min="0" step="0.01" value={form.cost_price}
          onChange={e => set('cost_price', Number(e.target.value))} />
        <Input label="Цена клиенту (₽)" className="compact-number-input" type="number" min="0" step="0.01" value={form.sale_price}
          onChange={e => set('sale_price', Number(e.target.value))} />
        <Input label="Минимальный остаток" className="compact-number-input" type="number" min="0" value={form.min_stock}
          onChange={e => set('min_stock', Number(e.target.value))} />
      </div>
      <div className="modal-footer" style={{ padding:0, border:'none' }}>
        <Button variant="secondary" onClick={onClose}>Отмена</Button>
        <Button onClick={() => save.mutate(form)} disabled={!form.name || save.isPending}>Сохранить</Button>
      </div>
    </Modal>
  );
}

function OpModal({ open, onClose, item }) {
  const qc = useQueryClient();
  const op = useMutation({
    mutationFn: d => api.post(`/supplies/${item.id}/ops`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplies'] }); onClose(); },
  });
  const [form, setForm] = useState({ op_type: 'in', quantity: 1, note: '' });
  const [error, setError] = useState('');
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setForm({ op_type: 'in', quantity: 1, note: '' });
    setError('');
  }, [open, item]);

  const handleSave = async () => {
    setError('');
    try { await op.mutateAsync({ ...form, quantity: Number(form.quantity) }); }
    catch(e) { setError(e.response?.data?.error || 'Ошибка'); }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Операция: ${item?.name}`}>
      <Select label="Тип" value={form.op_type} onChange={e => set('op_type', e.target.value)}>
        <option value="in">Приход</option>
        <option value="out">Списание</option>
        <option value="adjust">Корректировка остатка</option>
      </Select>
      <Input label={form.op_type === 'adjust' ? 'Новый остаток' : 'Количество'} className="compact-number-input"
        type="number" min="0" value={form.quantity} onChange={e => set('quantity', e.target.value)} />
      <Input label="Комментарий" value={form.note} onChange={e => set('note', e.target.value)} />
      {error && <div className="alert alert-error">{error}</div>}
      <div className="modal-footer" style={{ padding:0, border:'none' }}>
        <Button variant="secondary" onClick={onClose}>Отмена</Button>
        <Button onClick={handleSave} disabled={op.isPending}>Провести</Button>
      </div>
    </Modal>
  );
}

export default function Supplies() {
  const { data: items, isLoading } = useSupplies();
  const { data: lowStock } = useLowStock();
  const [modal, setModal] = useState(false);
  const [opModal, setOpModal] = useState(false);
  const [selected, setSelected] = useState(null);

  const totalCost = items?.reduce((s,i) => s + Number(i.stock_qty) * Number(i.cost_price), 0) || 0;

  return (
    <div>
      <PageHeader title="Расходники">
        <Button onClick={() => { setSelected(null); setModal(true); }}>+ Добавить</Button>
      </PageHeader>

      {lowStock?.length > 0 && (
        <div className="alert alert-error mb-4" style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:18 }}>⚠️</span>
          <span>
            <strong>{lowStock.length} позиций</strong> ниже минимального остатка:{' '}
            {lowStock.map(i => i.name).join(', ')}
          </span>
        </div>
      )}

      <div className="stats-grid" style={{ gridTemplateColumns:'repeat(3,1fr)', marginBottom:20 }}>
        <div className="stat-card"><div className="stat-label">Позиций</div><div className="stat-value">{items?.length || 0}</div></div>
        <div className="stat-card"><div className="stat-label">Стоимость склада</div><div className="stat-value" style={{fontSize:20}}>{fmt(Math.round(totalCost))} ₽</div></div>
        <div className="stat-card"><div className="stat-label">Требуют закупки</div>
          <div className="stat-value" style={{ color: lowStock?.length ? 'var(--red-400)' : undefined }}>{lowStock?.length || 0}</div>
        </div>
      </div>

      <div className="card">
        {isLoading ? <Spinner /> : items?.length === 0 ? <Empty /> : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Название</th><th>SKU</th><th style={{textAlign:'right'}}>Остаток</th>
                <th style={{textAlign:'right'}}>Мин.</th><th style={{textAlign:'right'}}>Себест.</th>
                <th style={{textAlign:'right'}}>Цена кл.</th><th></th>
              </tr></thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} style={{ background: item.low_stock ? '#fff8f8' : undefined }}>
                    <td>
                      <div style={{ fontWeight:500 }}>{item.name}</div>
                      {item.low_stock && <span className="badge badge-red" style={{marginTop:2}}>Мало</span>}
                    </td>
                    <td className="mono text-muted">{item.sku || '—'}</td>
                    <td className="text-right" style={{ fontWeight:600, color: item.low_stock ? 'var(--red-400)' : 'var(--teal-400)' }}>
                      {fmt(item.stock_qty)} <span className="text-muted text-sm">{UNIT_LABELS[item.unit]}</span>
                    </td>
                    <td className="text-right text-muted">{fmt(item.min_stock)}</td>
                    <td className="text-right text-muted">{Number(item.cost_price).toFixed(2)} ₽</td>
                    <td className="text-right">
                      {Number(item.sale_price) > 0
                        ? <span style={{fontWeight:500}}>{Number(item.sale_price).toFixed(2)} ₽</span>
                        : <span className="text-muted">—</span>
                      }
                    </td>
                    <td>
                      <div style={{ display:'flex', gap:4 }}>
                        <Button size="sm" variant="secondary" onClick={() => { setSelected(item); setOpModal(true); }}>Операция</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setSelected(item); setModal(true); }}>Изм.</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SupplyModal open={modal} onClose={() => setModal(false)} item={selected} />
      {selected && <OpModal open={opModal} onClose={() => setOpModal(false)} item={selected} />}
    </div>
  );
}
