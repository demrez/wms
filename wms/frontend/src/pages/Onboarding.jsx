import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { fmt } from '../components/ui';

// ── Стили ────────────────────────────────────────────────────────
const S = {
  wrap: { fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', fontSize:13, maxWidth:860, margin:'0 auto' },
  title: { fontSize:22, fontWeight:700, color:'#1A1A18', letterSpacing:'-0.4px', marginBottom:4 },
  sub: { fontSize:13.5, color:'#6E6C66', marginBottom:28 },
  section: { background:'#fff', border:'1px solid #E4E2DA', borderRadius:16, overflow:'hidden', marginBottom:16 },
  secHd: { padding:'14px 20px', borderBottom:'1px solid #F1EFE8', display:'flex', alignItems:'center', justifyContent:'space-between' },
  secTitle: { fontSize:14, fontWeight:700, color:'#1A1A18' },
  secBody: { padding:'18px 20px' },
  inp: { padding:'9px 12px', border:'1px solid #E4E2DA', borderRadius:10, fontSize:13.5, outline:'none', width:'100%', fontFamily:'inherit', color:'#1A1A18', background:'#fff', transition:'border .12s' },
  inpFocus: { borderColor:'#1D9E75', boxShadow:'0 0 0 3px rgba(29,158,117,.1)' },
  label: { fontSize:12, fontWeight:500, color:'#6E6C66', marginBottom:5, display:'block' },
  grid2: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },
  grid3: { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 },
  btn: (v='primary') => ({
    padding:'9px 20px', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer',
    background: v==='primary' ? '#1D9E75' : v==='danger' ? '#FCEBEB' : '#fff',
    color: v==='primary' ? '#fff' : v==='danger' ? '#A32D2D' : '#3D3D3A',
    border: v!=='primary' ? '1px solid #E4E2DA' : 'none',
  }),
  badge: (c) => ({ display:'inline-block', padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:600, background:c+'18', color:c }),
  row: { display:'flex', alignItems:'center', gap:8, marginBottom:6 },
  check: (done) => ({
    width:20, height:20, borderRadius:'50%', border:`2px solid ${done?'#1D9E75':'#C8C6BE'}`,
    background:done?'#1D9E75':'transparent', display:'flex', alignItems:'center', justifyContent:'center',
    flexShrink:0, transition:'all .2s',
  }),
  progress: (pct) => ({ height:6, background:'#F1EFE8', borderRadius:20, overflow:'hidden', marginBottom:24, '> div':{ height:'100%', background:'#1D9E75', width:`${pct}%`, transition:'width .4s' } }),
};

// ── Компонент поля с фокусом ──────────────────────────────────────
function Field({ label, value, onChange, placeholder, type='text', hint, readOnly, mono }) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      {label && <label style={S.label}>{label}</label>}
      <input
        type={type} value={value} onChange={onChange} placeholder={placeholder}
        readOnly={readOnly}
        style={{ ...S.inp, ...(focused ? S.inpFocus : {}), ...(readOnly ? { background:'#F8F8F6', color:'#6E6C66' } : {}), ...(mono ? { fontFamily:'monospace', fontSize:12 } : {}) }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {hint && <div style={{ fontSize:11, color:'#9E9C95', marginTop:4 }}>{hint}</div>}
    </div>
  );
}

// ── Шаг 1: Поиск компании по ИНН ─────────────────────────────────
function StepCompany({ data, onChange, onSave, saved }) {
  const [inn, setInn] = useState(data.inn || '');
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState(null);
  const [error, setError] = useState('');
  const [found, setFound] = useState(null);

  const handleInnChange = async (val) => {
    const clean = val.replace(/\D/g, '').slice(0, 12);
    setInn(clean);
    setError('');
    if (found) setFound(null);

    // Подсказка региона по первым 2 цифрам
    if (clean.length >= 2) {
      const { data: h } = await api.get(`/inn/hint?inn=${clean}`).catch(() => ({ data: null }));
      setHint(h);
    } else {
      setHint(null);
    }

    // Автопоиск при 10 или 12 цифрах
    if (clean.length === 10 || clean.length === 12) {
      setLoading(true);
      try {
        const { data: r } = await api.get(`/inn/lookup?inn=${clean}`);
        setFound(r);
        onChange({ ...r, inn: clean });
      } catch (e) {
        setError(e.response?.data?.error || 'Организация не найдена');
      } finally { setLoading(false); }
    }
  };

  return (
    <div style={S.section}>
      <div style={S.secHd}>
        <span style={S.secTitle}>
          <span style={{ marginRight:8, ...S.check(saved) }}>{saved ? '✓' : '1'}</span>
          Добавить компанию клиента
        </span>
        {saved && <span style={S.badge('#1D9E75')}>Сохранено</span>}
      </div>
      <div style={S.secBody}>
        <div style={{ marginBottom:16 }}>
          <label style={S.label}>ИНН (10 цифр для ЮЛ, 12 для ИП)</label>
          <div style={{ position:'relative' }}>
            <input
              type="text" value={inn} onChange={e => handleInnChange(e.target.value)}
              placeholder="Начните вводить ИНН..."
              style={{ ...S.inp, paddingRight:40 }}
              maxLength={12}
            />
            {loading && (
              <div style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', width:16, height:16, border:'2px solid #E4E2DA', borderTopColor:'#1D9E75', borderRadius:'50%', animation:'spin .7s linear infinite' }} />
            )}
          </div>
          {hint?.region && (
            <div style={{ marginTop:5, fontSize:11.5, color:'#9E9C95' }}>
              📍 Регион: <strong style={{ color:'#3D3D3A' }}>{hint.region}</strong>
              {hint.type && <> · <strong style={{ color:'#1D9E75' }}>{hint.type}</strong></>}
            </div>
          )}
          {error && <div style={{ marginTop:6, fontSize:12, color:'#A32D2D', background:'#FCEBEB', padding:'6px 10px', borderRadius:8 }}>{error}</div>}
        </div>

        {found && (
          <div style={{ background:'#E1F5EE', border:'1px solid #9FE1CB', borderRadius:12, padding:'14px 16px', marginBottom:16 }}>
            <div style={{ fontWeight:700, color:'#085041', fontSize:14, marginBottom:8 }}>✓ Найдено в реестре</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, fontSize:12.5 }}>
              <div><span style={{ color:'#6E6C66' }}>Название: </span><strong>{found.name}</strong></div>
              <div><span style={{ color:'#6E6C66' }}>ОГРН: </span><span style={{ fontFamily:'monospace' }}>{found.ogrn}</span></div>
              {found.director_name && <div><span style={{ color:'#6E6C66' }}>Руководитель: </span><strong>{found.director_name}</strong></div>}
              {found.director_post && <div><span style={{ color:'#6E6C66' }}>Должность: </span>{found.director_post}</div>}
              {found.address && <div style={{ gridColumn:'1/-1' }}><span style={{ color:'#6E6C66' }}>Адрес: </span>{found.address}</div>}
            </div>
          </div>
        )}

        <div style={S.grid2}>
          <Field label="Краткое название *" value={data.name || ''} onChange={e => onChange({ ...data, name: e.target.value })} placeholder="ООО «Ромашка» или ИП Иванов" />
          <Field label="ИНН" value={data.inn || inn} readOnly />
          <Field label="Юридическое название" value={data.legal_name || ''} onChange={e => onChange({ ...data, legal_name: e.target.value })} placeholder="Полное название" />
          <Field label="ОГРН/ОГРНИП" value={data.ogrn || ''} readOnly mono />
          <Field label="Телефон" value={data.phone || ''} onChange={e => onChange({ ...data, phone: e.target.value })} placeholder="+7 900 000 00 00" />
          <Field label="Email" value={data.email || ''} onChange={e => onChange({ ...data, email: e.target.value })} placeholder="client@example.com" type="email" />
        </div>

        <div style={{ marginTop:14, display:'flex', gap:8, alignItems:'center' }}>
          <button style={S.btn()} onClick={onSave} disabled={!data.name}>
            {saved ? '✓ Обновить' : 'Сохранить компанию'}
          </button>
          {!data.name && <span style={{ fontSize:12, color:'#9E9C95' }}>Введите ИНН или название вручную</span>}
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── Шаг 2: Расходники ────────────────────────────────────────────
const DEFAULT_SUPPLIES = [
  { name:'Короб S (30×20×20)', sku:'BOX-S', unit:'pcs', stock_qty:0, cost_price:18, sale_price:35, min_stock:50 },
  { name:'Короб M (40×30×30)', sku:'BOX-M', unit:'pcs', stock_qty:0, cost_price:28, sale_price:55, min_stock:30 },
  { name:'Короб L (60×40×40)', sku:'BOX-L', unit:'pcs', stock_qty:0, cost_price:45, sale_price:85, min_stock:20 },
  { name:'Скотч коричневый 50м', sku:'TAPE-B', unit:'roll', stock_qty:0, cost_price:55, sale_price:0, min_stock:10 },
  { name:'Стретч-плёнка рулон', sku:'FILM', unit:'roll', stock_qty:0, cost_price:180, sale_price:0, min_stock:5 },
  { name:'Пакет зип-лок A4', sku:'BAG-A4', unit:'pcs', stock_qty:0, cost_price:1.2, sale_price:3, min_stock:200 },
  { name:'Этикетка 58×40мм', sku:'LBL-S', unit:'pcs', stock_qty:0, cost_price:0.3, sale_price:1, min_stock:500 },
  { name:'Термоэтикетка 100×150', sku:'LBL-L', unit:'pcs', stock_qty:0, cost_price:0.8, sale_price:2, min_stock:200 },
];
const UNIT_LABELS = { pcs:'шт', m:'м', kg:'кг', roll:'рул', pack:'уп' };

function StepSupplies({ saved, onSave }) {
  const [items, setItems] = useState(DEFAULT_SUPPLIES.map(s => ({ ...s, _sel: true })));
  const toggle = (i) => setItems(prev => prev.map((x,j) => j===i ? {...x, _sel:!x._sel} : x));
  const setField = (i, k, v) => setItems(prev => prev.map((x,j) => j===i ? {...x,[k]:v} : x));
  const addRow = () => setItems(prev => [...prev, { name:'', sku:'', unit:'pcs', stock_qty:0, cost_price:0, sale_price:0, min_stock:0, _sel:true, _custom:true }]);
  const remove = (i) => setItems(prev => prev.filter((_,j) => j!==i));
  const selected = items.filter(x => x._sel);

  return (
    <div style={S.section}>
      <div style={S.secHd}>
        <span style={S.secTitle}>
          <span style={{ marginRight:8 }}>{saved ? '✓' : '2'}</span>
          Расходники склада
        </span>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {saved && <span style={S.badge('#1D9E75')}>Сохранено</span>}
          <button style={S.btn('secondary')} onClick={addRow}>+ Свой расходник</button>
        </div>
      </div>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
          <thead>
            <tr style={{ background:'#F8F8F6', borderBottom:'1px solid #E4E2DA' }}>
              <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:600, color:'#6E6C66', width:30 }}></th>
              <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:600, color:'#6E6C66' }}>Название</th>
              <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:600, color:'#6E6C66', width:80 }}>Ед.</th>
              <th style={{ padding:'8px 12px', textAlign:'right', fontWeight:600, color:'#6E6C66', width:100 }}>Остаток</th>
              <th style={{ padding:'8px 12px', textAlign:'right', fontWeight:600, color:'#6E6C66', width:100 }}>Себест. ₽</th>
              <th style={{ padding:'8px 12px', textAlign:'right', fontWeight:600, color:'#6E6C66', width:100 }}>Цена кл. ₽</th>
              <th style={{ padding:'8px 12px', textAlign:'right', fontWeight:600, color:'#6E6C66', width:80 }}>Мин.</th>
              <th style={{ width:30 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} style={{ borderBottom:'1px solid #F8F8F6', opacity: item._sel ? 1 : .4 }}>
                <td style={{ padding:'6px 12px', textAlign:'center' }}>
                  <input type="checkbox" checked={item._sel} onChange={() => toggle(i)} style={{ cursor:'pointer', accentColor:'#1D9E75' }} />
                </td>
                <td style={{ padding:'6px 8px' }}>
                  <input value={item.name} onChange={e => setField(i,'name',e.target.value)}
                    style={{ ...S.inp, padding:'5px 8px', fontSize:12.5 }} />
                </td>
                <td style={{ padding:'6px 8px' }}>
                  <select value={item.unit} onChange={e => setField(i,'unit',e.target.value)}
                    style={{ ...S.inp, padding:'5px 8px', fontSize:12 }}>
                    {Object.entries(UNIT_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td style={{ padding:'6px 8px' }}>
                  <input type="number" min="0" value={item.stock_qty} onChange={e => setField(i,'stock_qty',Number(e.target.value))}
                    style={{ ...S.inp, padding:'5px 8px', fontSize:12, textAlign:'right' }} />
                </td>
                <td style={{ padding:'6px 8px' }}>
                  <input type="number" min="0" step="0.01" value={item.cost_price} onChange={e => setField(i,'cost_price',Number(e.target.value))}
                    style={{ ...S.inp, padding:'5px 8px', fontSize:12, textAlign:'right' }} />
                </td>
                <td style={{ padding:'6px 8px' }}>
                  <input type="number" min="0" step="0.01" value={item.sale_price} onChange={e => setField(i,'sale_price',Number(e.target.value))}
                    style={{ ...S.inp, padding:'5px 8px', fontSize:12, textAlign:'right' }} />
                </td>
                <td style={{ padding:'6px 8px' }}>
                  <input type="number" min="0" value={item.min_stock} onChange={e => setField(i,'min_stock',Number(e.target.value))}
                    style={{ ...S.inp, padding:'5px 8px', fontSize:12, textAlign:'right' }} />
                </td>
                <td style={{ padding:'6px 8px', textAlign:'center' }}>
                  {item._custom && (
                    <button onClick={() => remove(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'#C8C6BE', fontSize:16 }}>✕</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding:'14px 20px', borderTop:'1px solid #F8F8F6', display:'flex', gap:8, alignItems:'center' }}>
        <button style={S.btn()} onClick={() => onSave(selected.filter(x => x.name))}>
          {saved ? `✓ Обновить (${selected.length})` : `Сохранить расходники (${selected.length})`}
        </button>
        <span style={{ fontSize:12, color:'#9E9C95' }}>Снимите галочку чтобы пропустить позицию</span>
      </div>
    </div>
  );
}

// ── Шаг 3: Услуги ───────────────────────────────────────────────
const DEFAULT_SERVICES = [
  { name:'Приёмка товара', category:'receiving', unit:'per_unit', base_price:3, _sel:true },
  { name:'Упаковка в короб S', category:'packing', unit:'per_unit', base_price:15, _sel:true },
  { name:'Упаковка в короб M', category:'packing', unit:'per_unit', base_price:20, _sel:true },
  { name:'Упаковка в короб L', category:'packing', unit:'per_unit', base_price:28, _sel:false },
  { name:'Упаковка в зип-пакет', category:'packing', unit:'per_unit', base_price:5, _sel:true },
  { name:'Стикеровка', category:'labeling', unit:'per_unit', base_price:3, _sel:true },
  { name:'Маркировка честный знак', category:'labeling', unit:'per_unit', base_price:8, _sel:false },
  { name:'Стретч-упаковка паллеты', category:'packing', unit:'per_order', base_price:150, _sel:false },
  { name:'Хранение (платное)', category:'storage', unit:'per_day', base_price:0.5, _sel:false },
  { name:'Оформление поставки WB', category:'logistics', unit:'per_order', base_price:500, _sel:true },
  { name:'Доставка до WB (за ед.)', category:'logistics', unit:'per_unit', base_price:2, _sel:true },
  { name:'Фотофиксация брака', category:'photo', unit:'per_unit', base_price:10, _sel:false },
];
const UNIT_SVC = { per_unit:'/ ед.', per_order:'/ заявка', per_kg:'/ кг', per_day:'/ день' };
const CAT_LABELS = { receiving:'Приёмка', packing:'Упаковка', labeling:'Маркировка', photo:'Фото', logistics:'Логистика', storage:'Хранение', other:'Прочее' };
const CAT_COLORS = { receiving:'#1D9E75', packing:'#185FA5', labeling:'#7F77DD', logistics:'#888780', photo:'#BA7517', storage:'#1D9E75', other:'#888780' };

function StepServices({ saved, onSave }) {
  const [items, setItems] = useState(DEFAULT_SERVICES.map(s => ({ ...s })));
  const toggle = (i) => setItems(prev => prev.map((x,j) => j===i ? {...x, _sel:!x._sel} : x));
  const setField = (i, k, v) => setItems(prev => prev.map((x,j) => j===i ? {...x,[k]:v} : x));
  const addRow = () => setItems(prev => [...prev, { name:'', category:'other', unit:'per_unit', base_price:0, _sel:true, _custom:true }]);
  const remove = (i) => setItems(prev => prev.filter((_,j) => j!==i));
  const selected = items.filter(x => x._sel && x.name);

  // Группировка по категории
  const byCategory = items.reduce((g, item, idx) => {
    const cat = item.category || 'other';
    if (!g[cat]) g[cat] = [];
    g[cat].push({ ...item, _idx: idx });
    return g;
  }, {});

  return (
    <div style={S.section}>
      <div style={S.secHd}>
        <span style={S.secTitle}><span style={{ marginRight:8 }}>{saved ? '✓' : '3'}</span>Каталог услуг</span>
        <div style={{ display:'flex', gap:8 }}>
          {saved && <span style={S.badge('#1D9E75')}>Сохранено</span>}
          <button style={S.btn('secondary')} onClick={addRow}>+ Своя услуга</button>
        </div>
      </div>
      <div style={{ padding:'16px 20px' }}>
        {Object.entries(byCategory).map(([cat, catItems]) => (
          <div key={cat} style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#9E9C95', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background: CAT_COLORS[cat] || '#888' }} />
              {CAT_LABELS[cat] || cat}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {catItems.map(item => (
                <div key={item._idx} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:10, border:`1px solid ${item._sel ? '#1D9E75' : '#E4E2DA'}`, background: item._sel ? '#FAFFFC' : '#fff', transition:'all .1s', opacity: item._sel ? 1 : .5 }}>
                  <input type="checkbox" checked={item._sel} onChange={() => toggle(item._idx)} style={{ cursor:'pointer', accentColor:'#1D9E75', flexShrink:0 }} />
                  <div style={{ flex:1 }}>
                    <input value={item.name} onChange={e => setField(item._idx,'name',e.target.value)}
                      style={{ border:'none', background:'transparent', fontWeight:500, fontSize:13, color:'#1A1A18', outline:'none', width:'100%' }} />
                  </div>
                  <select value={item.unit} onChange={e => setField(item._idx,'unit',e.target.value)}
                    style={{ border:'1px solid #E4E2DA', borderRadius:6, padding:'3px 6px', fontSize:11.5, color:'#6E6C66', background:'#fff' }}>
                    {Object.entries(UNIT_SVC).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <input type="number" min="0" step="0.01" value={item.base_price}
                      onChange={e => setField(item._idx,'base_price',Number(e.target.value))}
                      style={{ width:80, padding:'3px 8px', border:'1px solid #E4E2DA', borderRadius:6, fontSize:13, textAlign:'right', fontFamily:'inherit' }} />
                    <span style={{ fontSize:12, color:'#9E9C95' }}>₽</span>
                  </div>
                  {item._custom && (
                    <button onClick={() => remove(item._idx)} style={{ background:'none', border:'none', cursor:'pointer', color:'#C8C6BE', fontSize:16, padding:0 }}>✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding:'14px 20px', borderTop:'1px solid #F8F8F6', display:'flex', gap:8 }}>
        <button style={S.btn()} onClick={() => onSave(selected)}>
          {saved ? `✓ Обновить (${selected.length})` : `Сохранить услуги (${selected.length})`}
        </button>
      </div>
    </div>
  );
}

// ── Шаг 4: Товары клиента ────────────────────────────────────────
function StepProducts({ companyId, saved, onSave }) {
  const [items, setItems] = useState([
    { name:'', article:'', color:'', brand:'', weight_g:'' },
  ]);
  const setField = (i, k, v) => setItems(prev => prev.map((x,j) => j===i ? {...x,[k]:v} : x));
  const addRow = () => setItems(prev => [...prev, { name:'', article:'', color:'', brand:'', weight_g:'' }]);
  const remove = (i) => setItems(prev => prev.filter((_,j) => j!==i));

  if (!companyId) return (
    <div style={S.section}>
      <div style={S.secHd}><span style={S.secTitle}><span style={{ marginRight:8 }}>4</span>Товары клиента</span></div>
      <div style={{ padding:'24px 20px', color:'#9E9C95', fontSize:13 }}>Сначала сохраните компанию на шаге 1</div>
    </div>
  );

  return (
    <div style={S.section}>
      <div style={S.secHd}>
        <span style={S.secTitle}><span style={{ marginRight:8 }}>{saved ? '✓' : '4'}</span>Товары клиента</span>
        <div style={{ display:'flex', gap:8 }}>
          {saved && <span style={S.badge('#1D9E75')}>Сохранено</span>}
          <button style={S.btn('secondary')} onClick={addRow}>+ Строка</button>
        </div>
      </div>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
          <thead>
            <tr style={{ background:'#F8F8F6', borderBottom:'1px solid #E4E2DA' }}>
              {['Название *','Артикул','Бренд','Цвет','Вес (г)',''].map(h => (
                <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontWeight:600, color:'#6E6C66' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} style={{ borderBottom:'1px solid #F8F8F6' }}>
                <td style={{ padding:'6px 8px', minWidth:200 }}>
                  <input value={item.name} onChange={e => setField(i,'name',e.target.value)} placeholder="Название товара"
                    style={{ ...S.inp, padding:'5px 8px', fontSize:12.5 }} />
                </td>
                <td style={{ padding:'6px 8px', width:120 }}>
                  <input value={item.article} onChange={e => setField(i,'article',e.target.value)} placeholder="SKU-001"
                    style={{ ...S.inp, padding:'5px 8px', fontSize:12, fontFamily:'monospace' }} />
                </td>
                <td style={{ padding:'6px 8px', width:120 }}>
                  <input value={item.brand} onChange={e => setField(i,'brand',e.target.value)} placeholder="Бренд"
                    style={{ ...S.inp, padding:'5px 8px', fontSize:12 }} />
                </td>
                <td style={{ padding:'6px 8px', width:100 }}>
                  <input value={item.color} onChange={e => setField(i,'color',e.target.value)} placeholder="Цвет"
                    style={{ ...S.inp, padding:'5px 8px', fontSize:12 }} />
                </td>
                <td style={{ padding:'6px 8px', width:80 }}>
                  <input type="number" min="0" value={item.weight_g} onChange={e => setField(i,'weight_g',e.target.value)} placeholder="0"
                    style={{ ...S.inp, padding:'5px 8px', fontSize:12, textAlign:'right' }} />
                </td>
                <td style={{ padding:'6px 8px', width:36, textAlign:'center' }}>
                  {items.length > 1 && (
                    <button onClick={() => remove(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'#C8C6BE', fontSize:16 }}>✕</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding:'14px 20px', borderTop:'1px solid #F8F8F6', display:'flex', gap:8, alignItems:'center' }}>
        <button style={S.btn()} onClick={() => onSave(items.filter(x => x.name), companyId)}>
          {saved ? `✓ Обновить (${items.filter(x=>x.name).length})` : `Добавить товары (${items.filter(x=>x.name).length})`}
        </button>
        <span style={{ fontSize:12, color:'#9E9C95' }}>Можно добавить больше позже через раздел «Товары»</span>
      </div>
    </div>
  );
}

// ── Главный компонент ─────────────────────────────────────────────
export default function Onboarding() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [companyData, setCompanyData] = useState({ name:'', inn:'', legal_name:'', ogrn:'', phone:'', email:'', address:'' });
  const [savedCompanyId, setSavedCompanyId] = useState(null);
  const [step1Done, setStep1Done] = useState(false);
  const [step2Done, setStep2Done] = useState(false);
  const [step3Done, setStep3Done] = useState(false);
  const [step4Done, setStep4Done] = useState(false);
  const [saving, setSaving] = useState('');
  const [errors, setErrors] = useState({});

  const progress = [step1Done, step2Done, step3Done, step4Done].filter(Boolean).length * 25;

  // Сохранить компанию
  const saveCompany = async () => {
    if (!companyData.name) return;
    setSaving('company');
    try {
      const { data } = await api.post('/companies', {
        name: companyData.name,
        legal_name: companyData.legal_name || companyData.name,
        inn: companyData.inn,
        phone: companyData.phone,
        address: companyData.address,
      });
      setSavedCompanyId(data.id);
      setStep1Done(true);
      qc.invalidateQueries({ queryKey: ['companies'] });
    } catch(e) { setErrors(err => ({ ...err, company: e.response?.data?.error || 'Ошибка' })); }
    finally { setSaving(''); }
  };

  // Сохранить расходники
  const saveSupplies = async (items) => {
    if (!items.length) return;
    setSaving('supplies');
    try {
      for (const item of items) {
        const { _sel, _custom, ...data } = item;
        await api.post('/supplies', { ...data, stock_qty: Number(data.stock_qty), cost_price: Number(data.cost_price), sale_price: Number(data.sale_price), min_stock: Number(data.min_stock) });
      }
      setStep2Done(true);
      qc.invalidateQueries({ queryKey: ['supplies'] });
    } catch(e) { setErrors(err => ({ ...err, supplies: e.response?.data?.error || 'Ошибка' })); }
    finally { setSaving(''); }
  };

  // Сохранить услуги
  const saveServices = async (items) => {
    if (!items.length) return;
    setSaving('services');
    try {
      for (const item of items) {
        const { _sel, _custom, _idx, ...data } = item;
        await api.post('/services', { ...data, base_price: Number(data.base_price) });
      }
      setStep3Done(true);
      qc.invalidateQueries({ queryKey: ['services'] });
    } catch(e) { setErrors(err => ({ ...err, services: e.response?.data?.error || 'Ошибка' })); }
    finally { setSaving(''); }
  };

  // Сохранить товары
  const saveProducts = async (items, companyId) => {
    if (!items.length || !companyId) return;
    setSaving('products');
    try {
      for (const item of items) {
        await api.post('/products', {
          company_id: companyId,
          name: item.name,
          article: item.article || null,
          brand: item.brand || null,
          color: item.color || null,
          weight_g: item.weight_g ? Number(item.weight_g) : null,
        });
      }
      setStep4Done(true);
      qc.invalidateQueries({ queryKey: ['products'] });
    } catch(e) { setErrors(err => ({ ...err, products: e.response?.data?.error || 'Ошибка' })); }
    finally { setSaving(''); }
  };

  const allDone = step1Done && step2Done && step3Done;

  return (
    <div style={S.wrap}>
      {/* Заголовок */}
      <div style={{ marginBottom:24 }}>
        <div style={S.title}>Быстрый старт</div>
        <div style={S.sub}>Настройте систему за несколько минут — добавьте клиента, расходники и услуги</div>

        {/* Прогресс */}
        <div style={{ background:'#F1EFE8', borderRadius:20, overflow:'hidden', height:6, marginBottom:8 }}>
          <div style={{ height:'100%', background:'#1D9E75', width:`${progress}%`, transition:'width .4s', borderRadius:20 }} />
        </div>
        <div style={{ fontSize:12, color:'#9E9C95' }}>
          {progress}% выполнено · {[step1Done,step2Done,step3Done,step4Done].filter(Boolean).length} из 4 шагов
        </div>
      </div>

      {/* Ошибки */}
      {Object.values(errors).some(Boolean) && (
        <div style={{ background:'#FCEBEB', border:'1px solid #f7c1c1', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:12.5, color:'#A32D2D' }}>
          {Object.values(errors).filter(Boolean).join(' · ')}
        </div>
      )}

      {/* Шаги */}
      <StepCompany data={companyData} onChange={setCompanyData} onSave={saveCompany} saved={step1Done} />
      <StepSupplies saved={step2Done} onSave={saveSupplies} />
      <StepServices saved={step3Done} onSave={saveServices} />
      <StepProducts companyId={savedCompanyId} saved={step4Done} onSave={saveProducts} />

      {/* Завершение */}
      {allDone && (
        <div style={{ background:'#E1F5EE', border:'1px solid #9FE1CB', borderRadius:16, padding:'20px 24px', textAlign:'center', marginTop:8 }}>
          <div style={{ fontSize:28, marginBottom:8 }}>🎉</div>
          <div style={{ fontSize:16, fontWeight:700, color:'#085041', marginBottom:6 }}>Готово к работе!</div>
          <div style={{ fontSize:13, color:'#0F6E56', marginBottom:16 }}>
            Компания, расходники и услуги добавлены. Можно создавать заявки.
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
            <button style={S.btn()} onClick={() => navigate('/new-order')}>Создать первую заявку →</button>
            <button style={S.btn('secondary')} onClick={() => navigate('/')}>На дашборд</button>
          </div>
        </div>
      )}
    </div>
  );
}
