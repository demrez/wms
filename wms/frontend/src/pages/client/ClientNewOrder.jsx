import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateOrder, useImportOrderItemsXlsx, useProducts, useServices, useLogisticsReference } from '../../hooks/queries';
import { useAuthStore } from '../../store/auth';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import { fmt } from '../../components/ui';
import useDismissibleDropdown from '../../hooks/useDismissibleDropdown';

const TYPE_OPTIONS = [
  { key: 'supply',     label: 'Поставка',   sub: 'Привезти товары на склад',         icon: '📦' },
  { key: 'processing', label: 'Обработка',  sub: 'Упаковка, маркировка, стикеровка', icon: '🔧' },
  { key: 'logistics',  label: 'Логистика',  sub: 'Отправить товары на маркетплейс',  icon: '🚛' },
];
const DEFAULT_WAREHOUSE_GROUPS = [
  {
    key: 'wb',
    label: 'WB',
    items: [
      'WB — Коледино',
      'WB — Пушкино',
      'WB — Электросталь',
      'WB — Подольск',
      'WB — Чехов',
      'WB — Тула',
      'WB — Обухово',
    ],
  },
  {
    key: 'wb_region',
    label: 'WB Регион',
    items: [
      'WB Регион — Санкт-Петербург',
      'WB Регион — Екатеринбург',
      'WB Регион — Казань',
      'WB Регион — Краснодар',
      'WB Регион — Невинномысск',
      'WB Регион — Новосемейкино',
    ],
  },
  {
    key: 'yandex',
    label: 'Яндекс',
    items: [
      'Яндекс — Софьино',
    ],
  },
  {
    key: 'ozon',
    label: 'Ozon',
    items: [
      'Ozon — Хоругвино',
      'Ozon — МО Львовский',
      'Ozon — МО Щербинка',
      'Ozon — ТСЦ Пушкино',
      'Ozon — Гривно РФЦ',
      'Ozon — Жуковский РФЦ',
      'Ozon — Софьино РФЦ',
      'Ozon — Кавказский хаб',
      'Ozon — Волгоградский хаб',
    ],
  },
];
const SUPPLY_DELIVERY_OPTIONS = [
  'Самостоятельно',
  'Водитель Фулфилмента',
  'Транзитная поставка',
];
const CAT_LABELS = { receiving:'Приёмка', packing:'Упаковка', labeling:'Маркировка', photo:'Фото', logistics:'Логистика', storage:'Хранение', other:'Прочее' };

const inp = {
  padding:'10px 12px', border:'1px solid var(--gray-300)', borderRadius:12, fontSize:12.5,
  outline:'none', width:'100%', fontFamily:'inherit', background:'var(--surface-hover)', color:'var(--gray-900)',
};
const numInp = {
  ...inp,
  width: '96px',
  minWidth: '72px',
  maxWidth: '96px',
  textAlign: 'right',
};
const sel = { ...inp, cursor:'pointer' };
const card = (active) => ({
  border: active ? '2px solid var(--teal-400)' : '1px solid var(--gray-200)',
  background: active ? 'var(--teal-50)' : 'var(--surface-hover)',
  borderRadius:14, padding:'14px 18px', cursor:'pointer', textAlign:'left', width:'100%',
  transition:'all .12s',
});
const btn = {
  padding:'10px 24px', background:'var(--teal-400)', color:'#fff', border:'none',
  borderRadius:10, fontSize:14, fontWeight:600, cursor:'pointer',
};
const btnSec = {
  padding:'10px 20px', background:'var(--surface-hover)', color:'var(--gray-900)',
  border:'1px solid var(--gray-300)', borderRadius:10, fontSize:14, cursor:'pointer',
};
const normalizeProductList = (data) => (Array.isArray(data) ? data : data?.items || []);
const normalizeFindKey = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, '');
const formatServiceLabel = (service) => service?.display_name || service?.name || '';

export default function ClientNewOrder() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const createOrder = useCreateOrder();
  const importOrderItemsXlsx = useImportOrderItemsXlsx();
  const [productQuery, setProductQuery] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productQty, setProductQty] = useState('1');
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const productDropdownRef = useDismissibleDropdown(productMenuOpen, () => setProductMenuOpen(false));
  const { data: products } = useProducts({ search: productQuery.trim() || undefined });
  const { data: allProductsData } = useProducts({});
  const { data: services } = useServices();
  const { data: logisticsReference } = useLogisticsReference();
  const [serviceQuery, setServiceQuery] = useState('');
  const [serviceMenuOpen, setServiceMenuOpen] = useState(false);
  const serviceDropdownRef = useDismissibleDropdown(serviceMenuOpen, () => setServiceMenuOpen(false));

  // Получаем компанию клиента
  const { data: summary } = useQuery({
    queryKey: ['client-summary'],
    queryFn: () => api.get('/client/summary').then(r => r.data),
  });

  const { data: clientCompanyResponse } = useQuery({
    queryKey: ['client-company'],
    queryFn: () => api.get('/client/company').then((r) => r.data),
  });

  const [type, setType] = useState('supply');
  const [comment, setComment] = useState('');
  const [items, setItems] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);
  const [supply, setSupply] = useState({ delivery_type:'Самостоятельно', places_count:0, weight_kg:0, cargo_number:'' });
  const [logistics, setLogistics] = useState({ dest_type:'direct', dest_warehouse:'', ship_date:'' });
  const [warehouseMarketplace, setWarehouseMarketplace] = useState('wb');
  const [error, setError] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const importInputRef = useRef(null);

  const destinationWarehouseGroups = logisticsReference?.warehouse_groups?.length
    ? logisticsReference.warehouse_groups
    : DEFAULT_WAREHOUSE_GROUPS;
  const availableProducts = normalizeProductList(products);
  const allProducts = normalizeProductList(allProductsData);
  const productSearchPool = Array.from(
    new Map([...availableProducts, ...allProducts].filter((item) => item?.id).map((item) => [String(item.id), item])).values()
  );
  const showProductSuggestions = productMenuOpen && (productQuery.trim() || availableProducts.length > 0);
  const groupedWarehouseOptions = useMemo(() => {
    const buckets = {
      wb: { key: 'wb', label: 'WB', items: [] },
      ozon: { key: 'ozon', label: 'Ozon', items: [] },
      yandex: { key: 'yandex', label: 'Яндекс', items: [] },
    };
    destinationWarehouseGroups.forEach((group) => {
      const key = String(group.key || '').toLowerCase();
      const bucketKey = key.includes('ozon') ? 'ozon' : key.includes('yandex') ? 'yandex' : 'wb';
      buckets[bucketKey].items.push(...(group.items || []));
    });
    return Object.values(buckets).map((bucket) => ({
      ...bucket,
      items: Array.from(new Set(bucket.items)),
    }));
  }, [destinationWarehouseGroups]);
  const activeWarehouseOptions = groupedWarehouseOptions.find((group) => group.key === warehouseMarketplace)?.items || [];
  const availableServiceOptions = useMemo(() => (
    (services || [])
      .filter((svc) => ['packing','labeling','photo','other'].includes(svc.category))
      .filter((svc) => !selectedServices.find((selected) => selected.service_id === svc.id))
      .filter((svc) => {
        const query = serviceQuery.trim().toLowerCase();
        if (!query) return true;
        return `${svc.name} ${svc.description || ''}`.toLowerCase().includes(query);
      })
  ), [services, selectedServices, serviceQuery]);

  const setSupplyF = (k, v) => setSupply(s => ({ ...s, [k]: v }));
  const setLogF = (k, v) => setLogistics(l => ({ ...l, [k]: v }));

  const addItem = (pid, quantity = 1) => {
    const normalizedPid = String(pid || '');
    if (!normalizedPid || items.find(i => String(i.product_id) === normalizedPid)) return;
    const p = productSearchPool.find((product) => String(product.id) === normalizedPid);
    if (p) setItems(prev => [...prev, { product_id: p.id, product_name: p.name, article: p.article, quantity }]);
  };
  const pickProduct = (product) => {
    setSelectedProductId(String(product.id));
    setSelectedProduct(product);
    setProductQuery(product.name || '');
    setProductMenuOpen(false);
  };
  const addSelectedProduct = () => {
    const nextQty = Math.max(1, Number(productQty) || 1);
    const query = productQuery.trim();
    const queryKey = normalizeFindKey(query);
    const product = selectedProduct
      || (selectedProductId && productSearchPool.find((item) => String(item.id) === String(selectedProductId)))
      || (() => {
        if (!queryKey) return null;
        const exact = productSearchPool.find((item) => (
          normalizeFindKey(item.name) === queryKey
          || normalizeFindKey(item.article) === queryKey
          || normalizeFindKey(item.barcode) === queryKey
        ));
        if (exact) return exact;
        const fuzzy = productSearchPool.filter((item) => (
          normalizeFindKey(item.name).includes(queryKey)
          || normalizeFindKey(item.article).includes(queryKey)
          || normalizeFindKey(item.barcode).includes(queryKey)
        ));
        return fuzzy.length === 1 ? fuzzy[0] : null;
      })()
      || (availableProducts.length === 1 ? availableProducts[0] : null);
    if (!product) return;
    addItem(product.id, nextQty);
    setProductQuery('');
    setSelectedProductId('');
    setSelectedProduct(null);
    setProductQty('1');
    setProductMenuOpen(false);
  };
  const removeItem = (pid) => setItems(prev => prev.filter(i => i.product_id !== pid));
  const setQty = (pid, qty) => setItems(prev => prev.map(i => i.product_id === pid ? { ...i, quantity: qty } : i));
  const handleImportItemsFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImportStatus('');
    setError('');
    try {
      const companyId = clientCompanyResponse?.company?.id
        || summary?.recent_orders?.[0]?.company_id
        || products?.[0]?.company_id;
      const result = await importOrderItemsXlsx.mutateAsync({ file, company_id: companyId });
      setItems((result.items || []).map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        article: item.article,
        barcode: item.barcode,
        quantity: Number(item.quantity || 0),
      })));
      setProductQuery('');
      setSelectedProductId('');
      setSelectedProduct(null);
      setProductQty('1');
      setProductMenuOpen(false);
      setImportStatus(
        `Импортировано строк: ${result.stats?.imported_rows || 0}, товаров в заявке: ${result.stats?.total_items || 0}, создано: ${result.stats?.created || 0}, обновлено: ${result.stats?.updated || 0}.`
      );
    } catch (e) {
      setImportStatus(e.response?.data?.error || 'Не удалось импортировать Excel');
    }
  };

  const toggleService = (svc) => {
    const exists = selectedServices.find(s => s.service_id === svc.id);
    if (exists) setSelectedServices(prev => prev.filter(s => s.service_id !== svc.id));
    else setSelectedServices(prev => [...prev, { service_id: svc.id, name: formatServiceLabel(svc), quantity: items.reduce((s,i) => s+i.quantity,0) || 100 }]);
  };
  const addServiceFromSearch = (svc) => {
    toggleService(svc);
    setServiceQuery('');
    setServiceMenuOpen(false);
  };

  const handleSubmit = async () => {
    setError('');
    const companyId = clientCompanyResponse?.company?.id
      || summary?.recent_orders?.[0]?.company_id
      || products?.[0]?.company_id;

    if (items.length === 0) return setError('Добавьте хотя бы один товар');

    try {
      const payload = {
        type,
        comment,
        items: items.map(({ product_id, quantity }) => ({ product_id, quantity })),
        ...(type === 'supply' ? { supply: { ...supply, places_count: Number(supply.places_count), weight_kg: Number(supply.weight_kg) } } : {}),
        ...(type === 'logistics' ? { logistics } : {}),
      };
      if (companyId) payload.company_id = companyId;
      const order = await createOrder.mutateAsync(payload);
      navigate(`/client/orders/${order.id}`);
    } catch(e) { setError(e.response?.data?.error || 'Ошибка создания заявки'); }
  };

  const cardStyle = { background:'var(--surface-card)', border:'1px solid var(--gray-200)', borderRadius:14, overflow:'hidden', marginBottom:16, boxShadow:'var(--shadow-sm)' };
  const productCardStyle = { ...cardStyle, overflow:'visible' };
  const servicesCardStyle = { ...cardStyle, overflow:'visible', position:'relative', zIndex:4 };
  const cardHd = { padding:'12px 16px', borderBottom:'1px solid var(--gray-200)', fontSize:12.5, fontWeight:600, color:'var(--gray-900)' };
  const cardBd = { padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 };
  const fieldLabelStyle = { fontSize:11.5, fontWeight:500, color:'var(--gray-500)' };

  return (
    <div className="client-page client-new-order-page" style={{ fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', fontSize:13, maxWidth:680 }}>
      <div className="client-page-head" style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
        <button onClick={() => navigate('/client/orders')}
          style={{ background:'none', border:'none', color:'var(--gray-500)', cursor:'pointer', fontSize:18, padding:0 }}>←</button>
        <div className="client-page-title" style={{ fontSize:18, fontWeight:700, color:'var(--gray-900)', letterSpacing:'-0.3px' }}>Новая заявка</div>
      </div>

      {/* Тип */}
      <div style={cardStyle}>
        <div style={cardHd}>Тип заявки</div>
        <div className="client-type-grid" style={{ padding:'12px 16px', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
          {TYPE_OPTIONS.map(t => (
            <button key={t.key} style={card(type === t.key)} onClick={() => { setType(t.key); setSelectedServices([]); }}>
              <div style={{ fontSize:18, marginBottom:4 }}>{t.icon}</div>
              <div style={{ fontSize:12.5, fontWeight:700, color: type===t.key ? 'var(--teal-600)' : 'var(--gray-900)', marginBottom:2 }}>{t.label}</div>
              <div style={{ fontSize:10.5, color:'var(--gray-500)', lineHeight:1.35 }}>{t.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Детали поставки */}
      {type === 'supply' && (
        <div style={cardStyle}>
        <div style={cardHd}>Детали поставки</div>
          <div className="client-form-grid-2 client-supply-section-grid" style={{ ...cardBd, display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div style={{ gridColumn:'1/-1', display:'flex', flexDirection:'column', gap:5 }}>
              <label style={fieldLabelStyle}>Тип доставки</label>
              <div className="client-card-grid-2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {SUPPLY_DELIVERY_OPTIONS.map((option) => (
                  <button key={option} type="button" style={card(supply.delivery_type === option)} onClick={() => setSupplyF('delivery_type', option)}>
                    <div style={{ fontSize:13, fontWeight:600, color: supply.delivery_type === option ? 'var(--teal-600)' : 'var(--gray-900)', marginBottom:3 }}>{option}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="client-supply-date-field" style={{ gridColumn:'1/-1', display:'flex', flexDirection:'column', gap:5 }}>
              <label style={fieldLabelStyle}>Дата и время</label>
              <input className="client-date-input" type="datetime-local" style={inp} onChange={e => setSupplyF('delivery_date', e.target.value)} />
            </div>
            {supply.delivery_type !== 'Самостоятельно' && (
              <div style={{ gridColumn:'1/-1', display:'flex', flexDirection:'column', gap:5 }}>
                <label style={fieldLabelStyle}>Адрес откуда забрать</label>
                <input style={inp} placeholder="Введите адрес" value={supply.pickup_address||''} onChange={e => setSupplyF('pickup_address', e.target.value)} />
              </div>
            )}
            <div className="client-supply-inline-fields" style={{ gridColumn:'1/-1', display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
              <div style={{ display:'flex', flexDirection:'column', gap:5, flex:'1 1 180px', minWidth:0 }}>
                <label style={fieldLabelStyle}>Номер груза</label>
                <input
                  style={inp}
                  placeholder="Например, SPB-240411-18"
                  value={supply.cargo_number || ''}
                  onChange={e => setSupplyF('cargo_number', e.target.value)}
                />
              </div>
              <div className="client-supply-compact-field" style={{ display:'flex', flexDirection:'column', gap:5, width:86, flex:'0 0 86px' }}>
                <label style={fieldLabelStyle}>Мест</label>
                <input type="number" min="0" style={{ ...numInp, width:86, minWidth:86, maxWidth:86 }} value={supply.places_count} onChange={e => setSupplyF('places_count', e.target.value)} />
              </div>
              <div className="client-supply-compact-field" style={{ display:'flex', flexDirection:'column', gap:5, width:86, flex:'0 0 86px' }}>
                <label style={fieldLabelStyle}>Вес</label>
                <input type="number" min="0" step="0.1" style={{ ...numInp, width:86, minWidth:86, maxWidth:86 }} value={supply.weight_kg} onChange={e => setSupplyF('weight_kg', e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Логистика */}
      {type === 'logistics' && (
        <div style={cardStyle}>
          <div style={cardHd}>Куда отправить</div>
          <div style={{ padding:'14px 18px' }}>
            <div className="client-card-grid-2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
              {[['direct','Прямая поставка','Напрямую на склад МП'],['transit','Транзитная','Через наш склад']].map(([v,l,s]) => (
                <button key={v} style={card(logistics.dest_type===v)} onClick={() => setLogF('dest_type',v)}>
                  <div style={{ fontSize:13, fontWeight:600, color: logistics.dest_type===v ? 'var(--teal-600)' : 'var(--gray-900)', marginBottom:3 }}>{l}</div>
                  <div style={{ fontSize:11, color:'var(--gray-500)' }}>{s}</div>
                </button>
              ))}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={{ fontSize:11.5, fontWeight:500, color:'var(--gray-500)' }}>Маркетплейс</label>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:8 }}>
                {groupedWarehouseOptions.map((group) => (
                  <button
                    key={group.key}
                    type="button"
                    style={card(warehouseMarketplace === group.key)}
                    onClick={() => {
                      setWarehouseMarketplace(group.key);
                      setLogF('dest_warehouse', '');
                    }}
                  >
                    <div style={{ fontSize:13, fontWeight:700, color: warehouseMarketplace === group.key ? 'var(--teal-600)' : 'var(--gray-900)' }}>{group.label}</div>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5, marginTop:12 }}>
              <label style={{ fontSize:11.5, fontWeight:500, color:'var(--gray-500)' }}>Склад назначения</label>
              <select style={sel} value={logistics.dest_warehouse} onChange={e => setLogF('dest_warehouse', e.target.value)}>
                <option value="">Выберите склад {groupedWarehouseOptions.find((g) => g.key === warehouseMarketplace)?.label || ''}</option>
                {activeWarehouseOptions.map((warehouse) => <option key={warehouse} value={warehouse}>{warehouse}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5, marginTop:12 }}>
              <label style={{ fontSize:11.5, fontWeight:500, color:'var(--gray-500)' }}>Дата поставки</label>
              <input type="datetime-local" style={inp} value={logistics.ship_date || ''} onChange={e => setLogF('ship_date', e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {/* Товары */}
      <div style={productCardStyle}>
        <div style={cardHd}>Товары</div>
        <div style={{ padding:'14px 18px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:12, flexWrap:'wrap' }}>
            <div style={{ fontSize:11.5, color:'var(--gray-500)' }}>
              Можно загрузить Excel формата WB: баркод, количество, предмет, артикул поставщика, бренд, размер, цвет.
            </div>
            <div>
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx"
                onChange={handleImportItemsFile}
                style={{ display:'none' }}
              />
              <button
                type="button"
                className="client-secondary-btn"
                style={btnSec}
                onClick={() => importInputRef.current?.click()}
                disabled={importOrderItemsXlsx.isPending}
              >
                {importOrderItemsXlsx.isPending ? 'Импортируем...' : 'Импорт из Excel'}
              </button>
            </div>
          </div>
          {!!importStatus && (
            <div
              style={{
                marginBottom:12,
                padding:'10px 12px',
                borderRadius:10,
                background: importStatus.startsWith('Импортировано') ? 'rgba(32, 163, 118, 0.08)' : 'rgba(220, 38, 38, 0.08)',
                color: importStatus.startsWith('Импортировано') ? 'var(--green-700)' : 'var(--red-600)',
                fontSize:12.5,
              }}
            >
              {importStatus}
            </div>
          )}
          <div ref={productDropdownRef} style={{ position:'relative', marginBottom:12 }}>
            <label style={{ display:'block', marginBottom:5, ...fieldLabelStyle }}>Товар</label>
            <input
              style={inp}
              value={productQuery}
              onFocus={() => setProductMenuOpen(true)}
              onChange={(event) => {
                setProductQuery(event.target.value);
                setSelectedProductId('');
                setSelectedProduct(null);
                setProductMenuOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addSelectedProduct();
                }
              }}
              placeholder="Название, артикул или штрихкод (можно сканером)..."
            />
            {showProductSuggestions && (
              <div className="services-search-dropdown">
                {availableProducts
                  .filter((p) => !items.find((item) => item.product_id === p.id))
                  .slice(0, 20)
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="services-search-option"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        pickProduct(p);
                      }}
                      onClick={() => pickProduct(p)}
                    >
                      <div>
                        <div>{p.name}</div>
                          <div className="text-muted text-xs">
                          {p.article ? `${p.article} · ` : ''}
                          {p.barcode ? `Баркод ${p.barcode}` : 'Баркод не указан'}
                        </div>
                      </div>
                    </button>
                  ))}
              </div>
            )}
            {productMenuOpen && productQuery.trim() && !availableProducts.filter((p) => !items.find((item) => item.product_id === p.id)).length && (
              <div className="services-search-dropdown">
                <div className="services-search-option" style={{ cursor:'default' }}>Ничего не найдено</div>
              </div>
            )}
          </div>
          <div className="client-new-order-item-row" style={{ display:'grid', gridTemplateColumns:'1fr 120px', gap:10, marginBottom:12 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              <label style={fieldLabelStyle}>Кол-во</label>
              <input
                type="number"
                min="1"
                value={productQty}
                onChange={(event) => setProductQty(event.target.value)}
                style={{ ...inp, textAlign:'right' }}
              />
            </div>
            <div style={{ display:'flex', alignItems:'flex-end' }}>
              <button type="button" className="client-primary-btn" style={{ ...btn, width:'100%' }} onClick={addSelectedProduct}>
                Добавить
              </button>
            </div>
          </div>
          {items.length > 0 && (
            <div className="client-table-wrap">
            <table className="client-dark-table" style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
              <thead><tr style={{ background:'var(--teal-600)' }}>
                <th style={{ padding:'7px 12px', textAlign:'left', fontWeight:600, color:'rgba(255,255,255,.92)' }}>Товар</th>
                <th style={{ padding:'7px 12px', textAlign:'right', fontWeight:600, color:'rgba(255,255,255,.92)' }}>Кол-во</th>
                <th style={{ padding:'7px 12px' }}></th>
              </tr></thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.product_id} style={{ borderTop:'1px solid var(--gray-200)' }}>
                    <td style={{ padding:'8px 12px' }}>
                      <div style={{ fontWeight:500 }}>{item.product_name}</div>
                      <div style={{ fontSize:11, color:'var(--gray-500)', fontFamily:'monospace' }}>{item.article}</div>
                    </td>
                    <td style={{ padding:'8px 12px', textAlign:'right' }}>
                      <input type="number" min="1" value={item.quantity}
                        onChange={e => setQty(item.product_id, Number(e.target.value))}
                        style={{ width:62, padding:'4px 6px', border:'1px solid var(--gray-300)', borderRadius:7, fontSize:13, textAlign:'right', fontFamily:'inherit', background:'var(--surface-hover)', color:'var(--gray-900)' }} />
                    </td>
                    <td style={{ padding:'8px 12px', textAlign:'center' }}>
                      <button onClick={() => removeItem(item.product_id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--gray-500)', fontSize:16 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      {/* Услуги для обработки */}
      {type === 'processing' && services?.length > 0 && (
        <div style={servicesCardStyle}>
          <div style={cardHd}>Нужные услуги (необязательно)</div>
          <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:10 }}>
            <div ref={serviceDropdownRef} style={{ position:'relative' }}>
              <label style={{ display:'block', marginBottom:5, fontSize:11.5, fontWeight:500, color:'var(--gray-500)' }}>Услуга</label>
              <input
                style={inp}
                value={serviceQuery}
                onFocus={() => setServiceMenuOpen(true)}
                onChange={(event) => {
                  setServiceQuery(event.target.value);
                  setServiceMenuOpen(true);
                }}
                placeholder="Начните вводить услугу..."
              />
              {serviceMenuOpen && (
                <div className="services-search-dropdown">
                  {availableServiceOptions.slice(0, 20).map((svc) => (
                    <button
                      key={svc.id}
                      type="button"
                      className="services-search-option"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        addServiceFromSearch(svc);
                      }}
                      onClick={() => addServiceFromSearch(svc)}
                    >
                      <div>
                        <div>{formatServiceLabel(svc)}</div>
                        <div className="text-muted text-xs">
                          {CAT_LABELS[svc.category] || svc.category} · {svc.base_price} ₽/{svc.unit==='per_unit'?'ед':svc.unit==='per_order'?'заявка':'день'}
                        </div>
                      </div>
                    </button>
                  ))}
                  {!availableServiceOptions.length && (
                    <div className="services-search-option" style={{ cursor:'default' }}>Ничего не найдено</div>
                  )}
                </div>
              )}
            </div>

            {selectedServices.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {selectedServices.map((svc) => (
                  <div key={svc.service_id} className="client-meta-card" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'var(--gray-900)' }}>{svc.name}</div>
                      <div style={{ fontSize:11.5, color:'var(--gray-500)', marginTop:3 }}>
                        Количество: {fmt(svc.quantity)}
                      </div>
                    </div>
                    <button type="button" className="client-secondary-btn" onClick={() => toggleService({ id: svc.service_id })}>
                      Убрать
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Комментарий */}
      <div style={cardStyle}>
        <div style={cardHd}>Комментарий</div>
        <div style={{ padding:'14px 18px' }}>
          <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
            placeholder="Дополнительные пожелания..." style={{ ...inp, resize:'vertical', minHeight:72 }} />
        </div>
      </div>

      {error && <div style={{ padding:'10px 14px', background:'rgba(220, 38, 38, 0.08)', color:'var(--red-600)', borderRadius:10, marginBottom:14, fontSize:12.5, border:'1px solid rgba(220, 38, 38, 0.18)' }}>{error}</div>}

      <div className="client-page-toolbar" style={{ display:'flex', gap:10 }}>
        <button className="client-primary-btn" style={btn} onClick={handleSubmit} disabled={createOrder.isPending}>
          {createOrder.isPending ? 'Создаём...' : 'Отправить заявку'}
        </button>
        <button className="client-secondary-btn" style={btnSec} onClick={() => navigate('/client/orders')}>Отмена</button>
      </div>
    </div>
  );
}
