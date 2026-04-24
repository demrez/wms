import { useEffect, useState } from 'react';
import { useServices, useCreateService, useImportServices, useUpdateService, useUpdateServiceConsumables, useSupplies } from '../hooks/queries';
import { PageHeader, Button, Modal, Input, Select, fmt, Spinner, Empty, Badge } from '../components/ui';

const CAT = { receiving:'Приёмка', packing:'Упаковка', labeling:'Маркировка', photo:'Фото', logistics:'Логистика', storage:'Хранение', other:'Прочее' };
const CAT_V = { receiving:'green', packing:'blue', labeling:'purple', photo:'amber', logistics:'gray', storage:'teal', other:'gray' };
const UNIT = { per_unit:'/ ед.', per_order:'/ заявка', per_kg:'/ кг', per_m3:'/ м³', per_day:'/ день' };
const SUPPLY_UNIT = { pcs:'шт', m:'м', kg:'кг', roll:'рул', pack:'упак' };

function formatServiceLabel(service) {
  if (!service) return '';
  return service.display_name || (service.description ? `${service.name} (${service.description})` : service.name);
}

function ImportServicesModal({ open, onClose }) {
  const importer = useImportServices();
  const [sheetUrl, setSheetUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [deactivateMissing, setDeactivateMissing] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    setSheetUrl('');
    setRawText('');
    setDeactivateMissing(false);
    setError('');
    setResult(null);
  }, [open]);

  const handleImport = async () => {
    setError('');
    setResult(null);
    if (!sheetUrl.trim() && !rawText.trim()) {
      setError('Вставьте ссылку Google Sheets или TSV/CSV таблицу');
      return;
    }
    try {
      const data = await importer.mutateAsync({
        sheet_url: sheetUrl.trim() || undefined,
        raw_text: rawText.trim() || undefined,
        activate_missing: !deactivateMissing,
      });
      setResult(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Не удалось импортировать услуги');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Импорт услуг" size="lg">
      <div className="form-group">
        <label>Ссылка Google Sheets</label>
        <input
          value={sheetUrl}
          onChange={(event) => setSheetUrl(event.target.value)}
          placeholder="https://docs.google.com/spreadsheets/..."
        />
      </div>
      <div className="form-group">
        <label>Или вставьте таблицу TSV/CSV</label>
        <textarea
          rows={10}
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          placeholder={'name\tcategory\tunit\tbase_price\tcomment'}
        />
      </div>
      <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'var(--gray-600)' }}>
        <input
          type="checkbox"
          checked={deactivateMissing}
          onChange={(event) => setDeactivateMissing(event.target.checked)}
        />
        Отключать услуги, которых нет в импортируемой таблице
      </label>
      <div className="surface-note" style={{ marginTop:12 }}>
        Поддерживаются колонки `name`, `category`, `unit`, `base_price`, `comment`.
        Комментарий будет показываться в названии услуги в скобках.
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {result && (
        <div className="alert alert-success">
          Импорт завершён: создано {result.created}, обновлено {result.updated}, всего строк {result.total}.
        </div>
      )}
      <div className="modal-footer" style={{ padding:0, border:'none' }}>
        <Button variant="secondary" onClick={onClose}>Закрыть</Button>
        <Button onClick={handleImport} disabled={importer.isPending}>
          {importer.isPending ? 'Импортируем...' : 'Импортировать'}
        </Button>
      </div>
    </Modal>
  );
}

function ServiceModal({ open, onClose, service }) {
  const { data: supplies } = useSupplies();
  const create = useCreateService();
  const update = useUpdateService();
  const updateCons = useUpdateServiceConsumables();
  const emptyForm = { name:'', category:'packing', unit:'per_unit', base_price:0, description:'' };

  const [form, setForm] = useState(service || emptyForm);
  const [consumables, setConsumables] = useState(service?.consumables || []);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setForm(service ? {
      name: service.name || '',
      category: service.category || 'packing',
      unit: service.unit || 'per_unit',
      base_price: Number(service.base_price || 0),
      description: service.description || '',
    } : emptyForm);
    setConsumables(
      service?.consumables?.map((c) => ({
        item_id: c.item_id,
        qty_per_use: Number(c.qty_per_use || 1),
      })) || []
    );
    setError('');
  }, [open, service]);

  const addConsumable = (itemId) => {
    if (!itemId || consumables.find(c => c.item_id === itemId)) return;
    setConsumables(prev => [...prev, { item_id: itemId, qty_per_use: 1 }]);
  };
  const removeCons = (i) => setConsumables(prev => prev.filter((_,j) => j !== i));
  const setCons = (i, k, v) => setConsumables(prev => prev.map((x,j) => j===i ? {...x,[k]:v} : x));

  const handleSave = async () => {
    setError('');
    try {
      const saved = service?.id
        ? await update.mutateAsync({ id: service.id, ...form })
        : await create.mutateAsync(form);
      await updateCons.mutateAsync({ id: saved.id, consumables });
      onClose();
    } catch(e) { setError(e.response?.data?.error || 'Ошибка'); }
  };

  return (
    <Modal open={open} onClose={onClose} title={service ? 'Редактировать услугу' : 'Новая услуга'} size="lg">
      <Input label="Название" value={form.name} onChange={e => set('name', e.target.value)} />
      <div className="form-grid">
        <Select label="Категория" value={form.category} onChange={e => set('category', e.target.value)}>
          {Object.entries(CAT).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select label="Единица тарификации" value={form.unit} onChange={e => set('unit', e.target.value)}>
          {Object.entries(UNIT).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Input label="Базовая цена (₽)" type="number" min="0" step="0.01"
          value={form.base_price} onChange={e => set('base_price', Number(e.target.value))} />
      </div>
      <div className="form-group">
        <label>Описание</label>
        <textarea value={form.description||''} onChange={e => set('description', e.target.value)} rows={2} />
      </div>

      <div className="surface-note">
        <div className="services-consumables-head">
          <span className="services-consumables-title">Расходники (авто-списание)</span>
          <select className="services-consumables-picker" onChange={e => { addConsumable(e.target.value); e.target.value=''; }}>
            <option value="">+ Добавить расходник</option>
            {supplies?.filter(s => !consumables.find(c => c.item_id === s.id)).map(s => (
              <option key={s.id} value={s.id}>{s.name} (ост: {fmt(s.stock_qty)} {SUPPLY_UNIT[s.unit]})</option>
            ))}
          </select>
        </div>
        {consumables.length === 0
          ? <div className="services-consumables-empty">Нет привязанных расходников</div>
          : consumables.map((c, i) => {
            const item = supplies?.find(s => s.id === c.item_id);
            return (
              <div key={i} className="services-consumable-row">
                <span className="services-consumable-name">{item?.name || c.item_id}</span>
                <span className="services-consumable-unit">×</span>
                <input type="number" min="0.001" step="0.001" value={c.qty_per_use}
                  onChange={e => setCons(i,'qty_per_use', Number(e.target.value))}
                  className="qty-input" style={{width:80}} />
                <span className="services-consumable-unit">{SUPPLY_UNIT[item?.unit]}</span>
                <Button size="sm" variant="ghost" onClick={() => removeCons(i)}>✕</Button>
              </div>
            );
          })
        }
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      <div className="modal-footer" style={{padding:0,border:'none'}}>
        <Button variant="secondary" onClick={onClose}>Отмена</Button>
        <Button onClick={handleSave} disabled={!form.name}>Сохранить</Button>
      </div>
    </Modal>
  );
}

export default function Services() {
  const { data: services, isLoading } = useServices();
  const [modal, setModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [filterCat, setFilterCat] = useState('');

  const filtered = filterCat ? services?.filter(s => s.category === filterCat) : services;

  return (
    <div>
      <PageHeader title="Каталог услуг">
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <Button variant="secondary" onClick={() => setImportModal(true)}>Импорт из таблицы</Button>
          <Button onClick={() => { setSelected(null); setModal(true); }}>+ Добавить услугу</Button>
        </div>
      </PageHeader>

      <div className="toolbar">
        <div className="filter-tabs">
          <button className={`filter-tab${!filterCat?' active':''}`} onClick={() => setFilterCat('')}>Все</button>
          {Object.entries(CAT).map(([k,v]) => (
            <button key={k} className={`filter-tab${filterCat===k?' active':''}`} onClick={() => setFilterCat(k)}>{v}</button>
          ))}
        </div>
      </div>

      <div className="card">
        {isLoading ? <Spinner /> : filtered?.length === 0 ? <Empty /> : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Услуга</th><th>Категория</th><th>Тариф</th>
                <th>Расходники</th><th></th>
              </tr></thead>
              <tbody>
                {filtered.map(svc => (
                  <tr key={svc.id}>
                    <td>
                      <div style={{fontWeight:500}}>{formatServiceLabel(svc)}</div>
                      {svc.description && <div className="text-muted text-sm">{svc.description}</div>}
                    </td>
                    <td><Badge variant={CAT_V[svc.category]||'gray'}>{CAT[svc.category]||svc.category}</Badge></td>
                    <td>
                      <span style={{fontWeight:600,color:'var(--teal-400)'}}>{Number(svc.base_price).toFixed(2)} ₽</span>
                      <span className="text-muted text-sm"> {UNIT[svc.unit]}</span>
                    </td>
                    <td>
                      {svc.consumables?.length > 0
                        ? <span className="text-muted text-sm">{svc.consumables.map(c => `${c.item_name} ×${c.qty_per_use}`).join(', ')}</span>
                        : <span className="text-muted text-sm">—</span>
                      }
                    </td>
                    <td>
                      <Button size="sm" variant="ghost" onClick={() => { setSelected(svc); setModal(true); }}>Изм.</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ServiceModal open={modal} onClose={() => { setModal(false); setSelected(null); }} service={selected} />
      <ImportServicesModal open={importModal} onClose={() => setImportModal(false)} />
    </div>
  );
}
