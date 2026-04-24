import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompanies, useProducts, useCreateOrder, useImportOrderItemsXlsx, useLogisticsReference, useTariffs, useCreateCharge, useConsumables } from '../hooks/queries';
import { PageHeader, Button, Input, Select, fmt } from '../components/ui';
import useDismissibleDropdown from '../hooks/useDismissibleDropdown';

const TYPE_OPTIONS = [
  { key: 'supply',     label: 'Поставка',   sub: 'Заявка на поставку товаров' },
  { key: 'processing', label: 'Обработка',  sub: 'Обработка товаров' },
  { key: 'logistics',  label: 'Логистика',  sub: 'Логистические услуги' },
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
const ADDRESS_SUGGESTIONS = [
  'Москва, Котляковская улица, 6с8',
  'Москва, Варшавское шоссе, 37А',
  'Москва, Проектируемый проезд № 4062, 6с16',
  'Подольск, Домодедовское шоссе, 20',
  'Электросталь, Строительный переулок, 10',
  'Домодедово, Индустриальная улица, 1',
  'Санкт-Петербург, Софийская улица, 95',
  'Казань, Тихорецкая улица, 19',
];

const clampPercent = (value) => Math.max(0, Math.min(100, Number(value || 0)));
const clampMoney = (value) => Math.max(0, Number(value || 0));
const clampQty = (value) => Math.max(1, Number(value || 1));
const calcTotal = (unitPrice, quantity) => Number((clampMoney(unitPrice) * clampQty(quantity)).toFixed(2));
const normalizeProductList = (data) => (Array.isArray(data) ? data : data?.items || []);

export default function NewOrder() {
  const navigate = useNavigate();
  const [type, setType] = useState('supply');
  const [companyId, setCompanyId] = useState('');
  const [comment, setComment] = useState('');
  const [showSupplyOverrides, setShowSupplyOverrides] = useState(false);
  const [items, setItems] = useState([]);
  const [productQuery, setProductQuery] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productQty, setProductQty] = useState(1);
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const [supply, setSupply] = useState({ delivery_type: 'Водитель Фулфилмента', places_count: 0, weight_kg: 0 });
  const [logistics, setLogistics] = useState({ dest_type: 'direct', dest_warehouse: '', ship_date: '', pass_number: '' });
  const [warehouseMarketplace, setWarehouseMarketplace] = useState('wb');
  const [serviceQuery, setServiceQuery] = useState('');
  const [selectedTariffCode, setSelectedTariffCode] = useState('');
  const [serviceQuantity, setServiceQuantity] = useState(1);
  const [serviceUnitPrice, setServiceUnitPrice] = useState('');
  const [serviceDiscount, setServiceDiscount] = useState(0);
  const [services, setServices] = useState([]);
  const [serviceMenuOpen, setServiceMenuOpen] = useState(false);
  const [consumableQuery, setConsumableQuery] = useState('');
  const [selectedConsumableId, setSelectedConsumableId] = useState('');
  const [consumableQuantity, setConsumableQuantity] = useState(1);
  const [consumableUnitPrice, setConsumableUnitPrice] = useState('');
  const [consumableDiscount, setConsumableDiscount] = useState(0);
  const [consumableComment, setConsumableComment] = useState('');
  const [consumablesUsed, setConsumablesUsed] = useState([]);
  const [consumableMenuOpen, setConsumableMenuOpen] = useState(false);
  const [error, setError] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const serviceDropdownRef = useDismissibleDropdown(serviceMenuOpen, () => setServiceMenuOpen(false));
  const consumableDropdownRef = useDismissibleDropdown(consumableMenuOpen, () => setConsumableMenuOpen(false));
  const productDropdownRef = useDismissibleDropdown(productMenuOpen, () => setProductMenuOpen(false));
  const importInputRef = useRef(null);

  const { data: companies } = useCompanies();
  const { data: products } = useProducts(
    companyId
      ? { company_id: companyId, search: productQuery.trim() || undefined }
      : { enabled: false }
  );
  const { data: logisticsReference } = useLogisticsReference();
  const { data: tariffs } = useTariffs();
  const { data: consumables } = useConsumables();
  const createOrder = useCreateOrder();
  const importOrderItemsXlsx = useImportOrderItemsXlsx();
  const createCharge = useCreateCharge();
  const availableProducts = normalizeProductList(products);
  const selectedCompany = (companies || []).find((company) => company.id === companyId) || null;
  const showProductSuggestions = productMenuOpen && (productQuery.trim() || availableProducts.length > 0);
  const normalizeOptionalText = (value) => {
    const next = String(value ?? '').trim();
    return next || undefined;
  };
  const companyOverride = (value, fallback) => {
    const next = normalizeOptionalText(value);
    const base = normalizeOptionalText(fallback);
    if (!next) return undefined;
    return base && next === base ? undefined : next;
  };
  const companyAddressOptions = Array.from(
    new Set(
      [...ADDRESS_SUGGESTIONS, ...(logisticsReference?.pickup_addresses || []), ...(companies?.map((company) => company.address).filter(Boolean) || [])]
        .map((value) => String(value).trim())
        .filter(Boolean)
    )
  );
  const destinationWarehouseGroups = logisticsReference?.warehouse_groups?.length
    ? logisticsReference.warehouse_groups
    : DEFAULT_WAREHOUSE_GROUPS;
  const groupedWarehouseOptions = Array.from(new Map(
    destinationWarehouseGroups.map((group) => {
      const key = String(group.key || '').toLowerCase();
      const bucketKey = key.includes('ozon') ? 'ozon' : key.includes('yandex') ? 'yandex' : 'wb';
      const bucketLabel = bucketKey === 'ozon' ? 'Ozon' : bucketKey === 'yandex' ? 'Яндекс' : 'WB';
      return [bucketKey, {
        key: bucketKey,
        label: bucketLabel,
        items: Array.from(new Set(
          destinationWarehouseGroups
            .filter((item) => {
              const itemKey = String(item.key || '').toLowerCase();
              return bucketKey === 'ozon'
                ? itemKey.includes('ozon')
                : bucketKey === 'yandex'
                  ? itemKey.includes('yandex')
                  : !itemKey.includes('ozon') && !itemKey.includes('yandex');
            })
            .flatMap((item) => item.items || [])
        )),
      }];
    })
  ).values());
  const activeWarehouseOptions = groupedWarehouseOptions.find((group) => group.key === warehouseMarketplace)?.items || [];
  const hasSupplyOverrides = Boolean(
    normalizeOptionalText(supply.pickup_address)
    || normalizeOptionalText(supply.cargo_number)
    || normalizeOptionalText(supply.contact_name)
    || normalizeOptionalText(supply.contact_phone)
  );
  const showSupplyOverrideFields = supply.delivery_type !== 'Самостоятельно' && (showSupplyOverrides || hasSupplyOverrides);

  const setSupplyField = (k, v) => setSupply(s => ({ ...s, [k]: v }));
  const setLogField = (k, v) => setLogistics(l => ({ ...l, [k]: v }));
  const availableServices = (tariffs || []).filter((item) => {
    const query = serviceQuery.trim().toLowerCase();
    if (!query) return true;
    return item.name?.toLowerCase().includes(query) || item.description?.toLowerCase().includes(query) || item.code?.toLowerCase().includes(query);
  });
  const selectedTariff = (tariffs || []).find((item) => item.code === selectedTariffCode);
  const selectedServiceBasePrice = selectedTariff
    ? clampMoney(serviceUnitPrice === '' ? selectedTariff.price || 0 : serviceUnitPrice)
    : clampMoney(serviceUnitPrice);
  const selectedServiceDiscount = clampPercent(serviceDiscount);
  const selectedServiceUnitPrice = Number((selectedServiceBasePrice * (1 - selectedServiceDiscount / 100)).toFixed(2));
  const selectedServiceTotal = calcTotal(selectedServiceUnitPrice, serviceQuantity);
  const availableConsumables = (consumables || []).filter((item) => {
    const query = consumableQuery.trim().toLowerCase();
    if (!query) return true;
    return item.name?.toLowerCase().includes(query) || item.code?.toLowerCase().includes(query) || item.category?.toLowerCase().includes(query);
  });
  const selectedConsumable = (consumables || []).find((item) => item.id === selectedConsumableId);
  const selectedConsumableBasePrice = selectedConsumable
    ? clampMoney(consumableUnitPrice === '' ? selectedConsumable.price || 0 : consumableUnitPrice)
    : clampMoney(consumableUnitPrice);
  const selectedConsumableDiscount = clampPercent(consumableDiscount);
  const selectedConsumableUnitPrice = Number((selectedConsumableBasePrice * (1 - selectedConsumableDiscount / 100)).toFixed(2));
  const selectedConsumableTotal = calcTotal(selectedConsumableUnitPrice, consumableQuantity);

  const normalizeServiceRow = (row) => {
    const quantity = clampQty(row.quantity);
    const base_price = clampMoney(row.base_price);
    const discount = clampPercent(row.discount);
    const unit_price = Number((base_price * (1 - discount / 100)).toFixed(2));
    return {
      ...row,
      quantity,
      base_price,
      discount,
      unit_price,
      total: Number((unit_price * quantity).toFixed(2)),
    };
  };

  const normalizeConsumableRow = (row) => {
    const quantity = clampQty(row.quantity);
    const base_price = clampMoney(row.base_price);
    const discount = clampPercent(row.discount);
    const unit_price = Number((base_price * (1 - discount / 100)).toFixed(2));
    return {
      ...row,
      quantity,
      base_price,
      discount,
      unit_price,
      total: Number((unit_price * quantity).toFixed(2)),
    };
  };

  const addItem = (productId, quantity = 1) => {
    if (items.find(i => i.product_id === productId)) return;
    const p = availableProducts.find(p => p.id === productId);
    if (p) setItems(prev => [...prev, { product_id: productId, product_name: p.name, article: p.article, quantity: clampQty(quantity) }]);
  };
  const pickProduct = (product) => {
    setSelectedProductId(product.id);
    setProductQuery(product.name || '');
    setProductMenuOpen(false);
  };
  const addSelectedProduct = () => {
    const product = (selectedProductId && availableProducts.find((item) => item.id === selectedProductId))
      || (availableProducts.length === 1 ? availableProducts[0] : null);
    if (!product) return;
    addItem(product.id, productQty);
    setProductQuery('');
    setSelectedProductId('');
    setProductQty(1);
    setProductMenuOpen(false);
  };

  const removeItem = (pid) => setItems(prev => prev.filter(i => i.product_id !== pid));
  const setQty = (pid, qty) => setItems(prev => prev.map(i => i.product_id === pid ? { ...i, quantity: qty } : i));
  const handleImportItemsFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!companyId) {
      setImportStatus('Сначала выберите компанию, затем загрузите Excel.');
      return;
    }
    setImportStatus('');
    setError('');
    try {
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
      setProductQty(1);
      setImportStatus(
        `Импортировано строк: ${result.stats?.imported_rows || 0}, товаров в заявке: ${result.stats?.total_items || 0}, создано: ${result.stats?.created || 0}, обновлено: ${result.stats?.updated || 0}.`
      );
    } catch (e) {
      setImportStatus(e.response?.data?.error || 'Не удалось импортировать Excel');
    }
  };
  const resetServiceDraft = () => {
    setServiceQuery('');
    setSelectedTariffCode('');
    setServiceQuantity(1);
    setServiceUnitPrice('');
    setServiceDiscount(0);
    setServiceMenuOpen(false);
  };
  const addService = () => {
    if (!selectedTariff) return;
    const quantity = clampQty(serviceQuantity);
    const base_price = clampMoney(selectedServiceBasePrice);
    const discount = selectedServiceDiscount;
    setServices((prev) => [
      ...prev,
      normalizeServiceRow({
        tariff_code: selectedTariff.code,
        name: selectedTariff.name,
        description: selectedTariff.description,
        quantity,
        base_price,
        discount,
      }),
    ]);
    resetServiceDraft();
  };
  const updateServiceRow = (index, field, value) => {
    setServices((prev) => prev.map((row, itemIndex) => (
      itemIndex === index ? normalizeServiceRow({ ...row, [field]: value }) : row
    )));
  };
  const removeService = (index) => setServices((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  const resetConsumableDraft = () => {
    setConsumableQuery('');
    setSelectedConsumableId('');
    setConsumableQuantity(1);
    setConsumableUnitPrice('');
    setConsumableDiscount(0);
    setConsumableComment('');
    setConsumableMenuOpen(false);
  };
  const addConsumable = () => {
    if (!selectedConsumable) return;
    const quantity = clampQty(consumableQuantity);
    const base_price = clampMoney(selectedConsumableBasePrice);
    const discount = selectedConsumableDiscount;
    setConsumablesUsed((prev) => [
      ...prev,
      normalizeConsumableRow({
        consumable_id: selectedConsumable.id,
        name: selectedConsumable.name,
        code: selectedConsumable.code,
        category: selectedConsumable.category,
        unit: selectedConsumable.unit,
        quantity,
        base_price,
        discount,
        comment: consumableComment,
      }),
    ]);
    resetConsumableDraft();
  };
  const updateConsumableRow = (index, field, value) => {
    setConsumablesUsed((prev) => prev.map((row, itemIndex) => (
      itemIndex === index ? normalizeConsumableRow({ ...row, [field]: value }) : row
    )));
  };
  const removeConsumable = (index) => setConsumablesUsed((prev) => prev.filter((_, itemIndex) => itemIndex !== index));

  const handleSubmit = async () => {
    setError('');
    if (!companyId) return setError('Выберите компанию');
    try {
      const payload = {
        company_id: companyId,
        type,
        comment: normalizeOptionalText(comment),
        items: items.map(({ product_id, quantity }) => ({ product_id, quantity })),
        consumables: consumablesUsed.map(({ consumable_id, quantity, unit_price, discount, comment: note }) => ({
          consumable_id,
          quantity,
          unit_price,
          discount,
          comment: normalizeOptionalText(note),
        })),
        ...(type === 'supply' ? {
          supply: {
            delivery_type: supply.delivery_type,
            delivery_date: normalizeOptionalText(supply.delivery_date),
            pickup_address: supply.delivery_type === 'Самостоятельно'
              ? undefined
              : companyOverride(supply.pickup_address, selectedCompany?.address),
            places_count: Number(supply.places_count || 0),
            weight_kg: Number(supply.weight_kg || 0),
            cargo_number: supply.delivery_type === 'Самостоятельно' ? undefined : normalizeOptionalText(supply.cargo_number),
            contact_name: supply.delivery_type === 'Самостоятельно' ? undefined : companyOverride(supply.contact_name, selectedCompany?.contact_name),
            contact_phone: supply.delivery_type === 'Самостоятельно' ? undefined : companyOverride(supply.contact_phone, selectedCompany?.phone),
          },
        } : {}),
        ...(type === 'logistics' ? { logistics } : {}),
      };
      const order = await createOrder.mutateAsync(payload);
      for (const service of services) {
          await createCharge.mutateAsync({
            company_id: companyId,
            order_id: order.id,
            tariff_code: service.tariff_code,
            quantity: service.quantity,
            unit_price: service.unit_price,
            discount: service.discount,
            description: `${service.name}${service.discount > 0 ? ` (скидка ${service.discount}%)` : ''}`,
          });
        }
      navigate(`/orders/${order.id}`);
    } catch (e) {
      setError(e.response?.data?.error || 'Ошибка создания заявки');
    }
  };

  return (
    <div className="max-w-3xl new-order-page">
      <PageHeader title="Новая заявка" />

      {/* Тип заявки */}
      <div className="new-order-section">
        <h2 className="new-order-section-title">Тип заявки</h2>
        <div className="grid grid-cols-3 gap-3">
          {TYPE_OPTIONS.map(t => (
            <button key={t.key} onClick={() => setType(t.key)}
              className={`text-left border rounded-xl p-4 transition-colors ${
                type === t.key ? 'border-teal-500 bg-teal-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100'
              }`}>
              <div className={`text-sm font-medium mb-1 ${type === t.key ? 'text-teal-700' : 'text-gray-800'}`}>{t.label}</div>
              <div className="text-xs text-gray-400">{t.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Компания */}
      <div className="new-order-section">
        <h2 className="new-order-section-title">Компания</h2>
        <Select value={companyId} onChange={e => { setCompanyId(e.target.value); setItems([]); }}>
          <option value="">Выберите компанию</option>
          {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>

      <div className="new-order-section">
        <h2 className="new-order-section-title">Оказываемые услуги</h2>

        {!companyId ? (
          <div className="new-order-empty">
            Сначала выберите компанию, потом можно добавить услуги в заявку
          </div>
        ) : !tariffs?.length ? (
          <div className="new-order-empty">
            В системе пока нет тарифов для добавления услуг
          </div>
        ) : (
          <>
            <div className="services-editor-grid">
              <div className="services-search-wrap" ref={serviceDropdownRef}>
                <label>Услуга</label>
                <input
                  value={serviceQuery}
                  onFocus={() => setServiceMenuOpen(true)}
                  onChange={(event) => {
                    setServiceQuery(event.target.value);
                    setSelectedTariffCode('');
                    setServiceMenuOpen(true);
                  }}
                  placeholder="Начните вводить или выберите из списка..."
                />
                {serviceMenuOpen && !!serviceQuery && !!availableServices.length && (
                  <div className="services-search-dropdown">
                    {availableServices.map((tariff) => (
                      <button
                        key={tariff.code}
                        type="button"
                        className="services-search-option"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setSelectedTariffCode(tariff.code);
                          setServiceQuery(tariff.name);
                          setServiceUnitPrice(String(tariff.price ?? 0));
                          setServiceDiscount(0);
                          setServiceMenuOpen(false);
                        }}
                      >
                        {tariff.name}{tariff.description ? ` (${tariff.description})` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Input
                label="Количество"
                className="compact-number-input"
                type="number"
                min="1"
                value={serviceQuantity}
                onChange={(event) => setServiceQuantity(event.target.value)}
              />
            </div>

            {selectedTariff && (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Название услуги</th>
                      <th style={{ textAlign: 'right' }}>Стоимость</th>
                      <th style={{ textAlign: 'right' }}>Количество</th>
                      <th style={{ textAlign: 'right' }}>Скидка %</th>
                      <th style={{ textAlign: 'right' }}>Итого</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <div className="font-medium text-xs">{selectedTariff.name}</div>
                        <div className="text-xs text-gray-400">{selectedTariff.description}</div>
                      </td>
                      <td className="text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={serviceUnitPrice}
                          onChange={(event) => setServiceUnitPrice(event.target.value)}
                          className="table-number-input tiny"
                        />
                      </td>
                      <td className="text-right">
                        <input
                          type="number"
                          min="1"
                          value={serviceQuantity}
                          onChange={(event) => setServiceQuantity(event.target.value)}
                          className="table-number-input tiny"
                        />
                      </td>
                      <td className="text-right">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={serviceDiscount}
                          onChange={(event) => setServiceDiscount(event.target.value)}
                          className="table-number-input tiny"
                        />
                      </td>
                      <td className="text-right text-xs font-medium">{selectedServiceTotal.toLocaleString('ru-RU')} RUB</td>
                      <td className="text-right">
                        <Button size="sm" onClick={addService}>Добавить</Button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {services.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-100 text-xs">
                      <th className="text-left pb-2 font-medium">Название услуги</th>
                      <th className="text-right pb-2 font-medium">Цена</th>
                      <th className="text-right pb-2 font-medium">Кол-во</th>
                      <th className="text-right pb-2 font-medium">Скидка</th>
                      <th className="text-right pb-2 font-medium">Итого</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((service, index) => (
                      <tr key={`${service.tariff_code}-${index}`} className="border-b border-gray-50">
                        <td className="py-2">
                          <div className="font-medium text-xs">{service.name}</div>
                          <div className="text-xs text-gray-400">{service.description}</div>
                        </td>
                        <td className="py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={service.base_price}
                            onChange={(event) => updateServiceRow(index, 'base_price', event.target.value)}
                            className="table-number-input tiny"
                          />
                        </td>
                        <td className="py-2 text-right">
                          <input
                            type="number"
                            min="1"
                            value={service.quantity}
                            onChange={(event) => updateServiceRow(index, 'quantity', event.target.value)}
                            className="table-number-input tiny"
                          />
                        </td>
                        <td className="py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={service.discount}
                            onChange={(event) => updateServiceRow(index, 'discount', event.target.value)}
                            className="table-number-input tiny"
                          />
                        </td>
                        <td className="py-2 text-right text-xs font-medium">{service.total.toLocaleString('ru-RU')} RUB</td>
                        <td className="py-2 text-right">
                          <button onClick={() => removeService(index)} className="text-gray-300 hover:text-red-400 text-sm">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <div className="new-order-section">
        <h2 className="new-order-section-title">Расходники</h2>

        {!companyId ? (
          <div className="new-order-empty">
            Сначала выберите компанию, потом можно добавить коробки, пленку, скотч и другие расходники
          </div>
        ) : !consumables?.length ? (
          <div className="new-order-empty">
            В справочнике пока нет расходников
          </div>
        ) : (
          <>
            <div className="services-editor-grid">
              <div className="services-search-wrap" ref={consumableDropdownRef}>
                <label>Расходник</label>
                <input
                  value={consumableQuery}
                  onFocus={() => setConsumableMenuOpen(true)}
                  onChange={(event) => {
                    setConsumableQuery(event.target.value);
                    setSelectedConsumableId('');
                    setConsumableMenuOpen(true);
                  }}
                  placeholder="Начните вводить или выберите из списка..."
                />
                {consumableMenuOpen && !!consumableQuery && !!availableConsumables.length && (
                  <div className="services-search-dropdown">
                    {availableConsumables.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="services-search-option"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setSelectedConsumableId(item.id);
                          setConsumableQuery(item.name);
                          setConsumableUnitPrice(String(item.price ?? 0));
                          setConsumableDiscount(0);
                          setConsumableMenuOpen(false);
                        }}
                      >
                        {item.name} ({item.category || 'без категории'}) - остаток {fmt(item.stock_qty)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Input
                label="Количество"
                className="compact-number-input"
                type="number"
                min="1"
                value={consumableQuantity}
                onChange={(event) => setConsumableQuantity(event.target.value)}
              />
            </div>

            {selectedConsumable && (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Расходник</th>
                      <th style={{ textAlign: 'right' }}>Цена</th>
                      <th style={{ textAlign: 'right' }}>Остаток</th>
                      <th style={{ textAlign: 'right' }}>Количество</th>
                      <th style={{ textAlign: 'right' }}>Скидка %</th>
                      <th>Комментарий</th>
                      <th style={{ textAlign: 'right' }}>Итого</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <div className="font-medium text-xs">{selectedConsumable.name}</div>
                        <div className="text-xs text-gray-400">{selectedConsumable.code} / {selectedConsumable.unit}</div>
                      </td>
                      <td className="text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={consumableUnitPrice}
                          onChange={(event) => setConsumableUnitPrice(event.target.value)}
                          className="table-number-input tiny"
                        />
                      </td>
                      <td className="text-right text-xs">{fmt(selectedConsumable.stock_qty)}</td>
                      <td className="text-right">
                        <input
                          type="number"
                          min="1"
                          value={consumableQuantity}
                          onChange={(event) => setConsumableQuantity(event.target.value)}
                          className="table-number-input tiny"
                        />
                      </td>
                      <td className="text-right">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={consumableDiscount}
                          onChange={(event) => setConsumableDiscount(event.target.value)}
                          className="table-number-input tiny"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={consumableComment}
                          onChange={(event) => setConsumableComment(event.target.value)}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                          placeholder="Комментарий"
                        />
                      </td>
                      <td className="text-right text-xs font-medium">{selectedConsumableTotal.toLocaleString('ru-RU')} RUB</td>
                      <td className="text-right">
                        <Button size="sm" onClick={addConsumable}>Добавить</Button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {consumablesUsed.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table>
                      <thead>
                    <tr className="text-gray-400 border-b border-gray-100 text-xs">
                      <th className="text-left pb-2 font-medium">Расходник</th>
                      <th className="text-right pb-2 font-medium">Цена</th>
                      <th className="text-right pb-2 font-medium">Кол-во</th>
                      <th className="text-right pb-2 font-medium">Скидка</th>
                      <th className="text-left pb-2 font-medium">Комментарий</th>
                      <th className="text-right pb-2 font-medium">Итого</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {consumablesUsed.map((item, index) => (
                      <tr key={`${item.consumable_id}-${index}`} className="border-b border-gray-50">
                        <td className="py-2">
                          <div className="font-medium text-xs">{item.name}</div>
                          <div className="text-xs text-gray-400">{item.category || '—'}</div>
                        </td>
                        <td className="py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.base_price}
                            onChange={(event) => updateConsumableRow(index, 'base_price', event.target.value)}
                            className="table-number-input tiny"
                          />
                        </td>
                        <td className="py-2 text-right">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(event) => updateConsumableRow(index, 'quantity', event.target.value)}
                            className="table-number-input tiny"
                          />
                        </td>
                        <td className="py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={item.discount}
                            onChange={(event) => updateConsumableRow(index, 'discount', event.target.value)}
                            className="table-number-input tiny"
                          />
                        </td>
                        <td className="py-2 text-xs text-gray-400">{item.comment || '—'}</td>
                        <td className="py-2 text-right text-xs font-medium">{item.total.toLocaleString('ru-RU')} RUB</td>
                        <td className="py-2 text-right">
                          <button onClick={() => removeConsumable(index)} className="text-gray-300 hover:text-red-400 text-sm">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Детали поставки */}
      {type === 'supply' && (
        <div className="new-order-section">
          <h2 className="new-order-section-title">Детали поставки</h2>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Тип доставки" value={supply.delivery_type} onChange={e => setSupplyField('delivery_type', e.target.value)}>
              <option>Водитель Фулфилмента</option>
              <option>Самостоятельно</option>
              <option>Транзитная поставка</option>
            </Select>
            <Input label="Дата и время поставки" type="datetime-local"
              onChange={e => setSupplyField('delivery_date', e.target.value)} />
            {supply.delivery_type !== 'Самостоятельно' && (
              <div className="form-group address-field">
                <label>Адрес откуда забрать</label>
                <input
                  type="text"
                  list="pickup-address-suggestions"
                  placeholder={selectedCompany?.address || 'Введите адрес'}
                  value={supply.pickup_address || ''}
                  onChange={e => setSupplyField('pickup_address', e.target.value)}
                />
                <datalist id="pickup-address-suggestions">
                  {companyAddressOptions.map((address) => (
                    <option key={address} value={address} />
                  ))}
                </datalist>
              </div>
            )}
            <Input label="Количество мест" className="compact-number-input" type="number" min="0"
              value={supply.places_count}
              onChange={e => setSupplyField('places_count', Number(e.target.value))} />
            <Input label="Вес груза (кг)" className="compact-number-input" type="number" min="0"
              value={supply.weight_kg}
              onChange={e => setSupplyField('weight_kg', Number(e.target.value))} />
          </div>
          {supply.delivery_type !== 'Самостоятельно' && (
            <div className="new-order-inline-note">
              <div>
                По умолчанию используем контакт и адрес компании
                {selectedCompany?.contact_name || selectedCompany?.phone || selectedCompany?.address
                  ? `: ${[selectedCompany?.contact_name, selectedCompany?.phone, selectedCompany?.address].filter(Boolean).join(' · ')}`
                  : '.'}
              </div>
              <button
                type="button"
                className="new-order-inline-link"
                onClick={() => setShowSupplyOverrides((value) => !value)}
              >
                {showSupplyOverrideFields ? 'Скрыть переопределение' : 'Указать другие данные'}
              </button>
            </div>
          )}
          {showSupplyOverrideFields && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Input label="Номер груза"
                value={supply.cargo_number || ''}
                onChange={e => setSupplyField('cargo_number', e.target.value)} />
              <Input label="Контакт по заявке"
                placeholder={selectedCompany?.contact_name || 'Оставить контакт компании'}
                value={supply.contact_name || ''}
                onChange={e => setSupplyField('contact_name', e.target.value)} />
              <Input label="Телефон по заявке" placeholder={selectedCompany?.phone || '+7'}
                value={supply.contact_phone || ''}
                onChange={e => setSupplyField('contact_phone', e.target.value)} />
            </div>
          )}
        </div>
      )}

      {/* Детали логистики */}
      {type === 'logistics' && (
        <div className="new-order-section">
          <h2 className="new-order-section-title">Логистика</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {[['transit', 'Транзитная поставка', 'Через транзитный склад'],
              ['direct',  'Прямая поставка',     'Напрямую на конечный склад']].map(([v, label, sub]) => (
              <button key={v} onClick={() => setLogField('dest_type', v)}
                className={`text-left border rounded-xl p-4 transition-colors ${
                  logistics.dest_type === v ? 'border-teal-500 bg-teal-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100'
                }`}>
                <div className={`text-sm font-medium mb-1 ${logistics.dest_type === v ? 'text-teal-700' : ''}`}>{label}</div>
                <div className="text-xs text-gray-400">{sub}</div>
              </button>
            ))}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:12 }}>
            <div className="form-group">
              <label>Маркетплейс</label>
              <div className="client-card-grid-3" style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:8 }}>
                {groupedWarehouseOptions.map((group) => (
                  <button
                    key={group.key}
                    type="button"
                    onClick={() => {
                      setWarehouseMarketplace(group.key);
                      setLogField('dest_warehouse', '');
                    }}
                    style={{
                      border: warehouseMarketplace === group.key ? '2px solid var(--teal-400)' : '1px solid var(--gray-200)',
                      background: warehouseMarketplace === group.key ? 'var(--teal-50)' : 'var(--surface-hover)',
                      borderRadius: 14,
                      padding: '12px 14px',
                      textAlign: 'left',
                      color: warehouseMarketplace === group.key ? 'var(--teal-600)' : 'var(--gray-900)',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {group.label}
                  </button>
                ))}
              </div>
            </div>
            <Select label="Склад назначения" value={logistics.dest_warehouse} onChange={e => setLogField('dest_warehouse', e.target.value)}>
              <option value="">Выберите склад {groupedWarehouseOptions.find((g) => g.key === warehouseMarketplace)?.label || ''}</option>
              {activeWarehouseOptions.map((warehouse) => <option key={warehouse} value={warehouse}>{warehouse}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Дата и время отгрузки" type="datetime-local"
              value={logistics.ship_date || ''}
              onChange={e => setLogField('ship_date', e.target.value)} />
            <Input label="Номер пропуска"
              value={logistics.pass_number || ''}
              onChange={e => setLogField('pass_number', e.target.value)} />
          </div>
        </div>
      )}

      {/* Товары */}
      <div className="new-order-section">
        <h2 className="new-order-section-title">Товары</h2>
        {!companyId ? (
          <div className="new-order-empty">Выберите компанию, чтобы добавить товары</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <div className="text-xs text-gray-400">
                Можно загрузить Excel формата WB: баркод, количество, предмет, артикул поставщика, бренд, размер, цвет.
              </div>
              <div>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".xlsx"
                  onChange={handleImportItemsFile}
                  style={{ display: 'none' }}
                />
                <Button
                  variant="secondary"
                  onClick={() => importInputRef.current?.click()}
                  disabled={importOrderItemsXlsx.isPending}
                >
                  {importOrderItemsXlsx.isPending ? 'Импортируем...' : 'Импорт из Excel'}
                </Button>
              </div>
            </div>
            {!!importStatus && (
              <div
                style={{
                  marginBottom: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: importStatus.startsWith('Импортировано') ? 'rgba(32, 163, 118, 0.08)' : 'rgba(220, 38, 38, 0.08)',
                  color: importStatus.startsWith('Импортировано') ? 'var(--green-700)' : 'var(--red-600)',
                  fontSize: 12.5,
                }}
              >
                {importStatus}
              </div>
            )}
            <div ref={productDropdownRef} style={{ position: 'relative', marginBottom: 12 }}>
              <label className="new-order-product-label">Товар</label>
              <input
                value={productQuery}
                onFocus={() => setProductMenuOpen(true)}
                onChange={(event) => {
                  setProductQuery(event.target.value);
                  setSelectedProductId('');
                  setProductMenuOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addSelectedProduct();
                  }
                }}
                placeholder="Название, артикул или штрихкод (можно сканером)..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              {showProductSuggestions && (
                <div className="services-search-dropdown">
                  {availableProducts
                    .filter((p) => !items.find((item) => item.product_id === p.id))
                    .slice(0, 10)
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="services-search-option"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          pickProduct(p);
                        }}
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
                  <div className="services-search-option" style={{ cursor: 'default' }}>
                    Ничего не найдено
                  </div>
                </div>
              )}
            </div>

            <div className="admin-new-order-item-row">
              <Input
                label="Кол-во"
                className="compact-number-input"
                type="number"
                min="1"
                value={productQty}
                onChange={e => setProductQty(e.target.value)}
              />
              <div className="admin-new-order-item-action">
                <Button onClick={addSelectedProduct}>Добавить</Button>
              </div>
            </div>

            {items.length > 0 && (
              <>
                <div className="desktop-only">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-100 text-xs">
                        <th className="text-left pb-2 font-medium">Товар</th>
                        <th className="text-right pb-2 font-medium">Кол-во</th>
                        <th className="pb-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(item => (
                        <tr key={item.product_id} className="border-b border-gray-50">
                          <td className="py-2">
                            <div className="font-medium text-xs">{item.product_name}</div>
                            <div className="text-xs text-gray-400">{item.article}</div>
                          </td>
                          <td className="py-2 text-right">
                            <input type="number" min="1" value={item.quantity}
                              onChange={e => setQty(item.product_id, Number(e.target.value))}
                              className="w-20 border border-gray-200 rounded px-2 py-1 text-xs text-right" />
                          </td>
                          <td className="py-2 text-right">
                            <button onClick={() => removeItem(item.product_id)}
                              className="text-gray-300 hover:text-red-400 text-sm">✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mobile-only admin-new-order-items-mobile">
                  {items.map((item) => (
                    <div key={item.product_id} className="admin-new-order-item-card">
                      <div>
                        <div className="admin-new-order-item-title">{item.product_name}</div>
                        <div className="admin-new-order-item-sub">{item.article || 'Артикул не указан'}</div>
                      </div>
                      <div className="admin-new-order-item-controls">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => setQty(item.product_id, Number(e.target.value))}
                          className="qty-input"
                        />
                        <button
                          type="button"
                          className="admin-new-order-item-remove"
                          onClick={() => removeItem(item.product_id)}
                        >
                          Убрать
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Комментарий */}
      <div className="new-order-section" style={{ marginBottom: 20 }}>
        <h2 className="new-order-section-title">Комментарий</h2>
        <textarea value={comment} onChange={e => setComment(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
          rows={3} placeholder="Дополнительная информация..." />
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4">{error}</div>}

      <div className="new-order-actions">
        <Button onClick={handleSubmit} disabled={createOrder.isPending} size="lg">
          {createOrder.isPending ? 'Создаём...' : 'Отправить заявку'}
        </Button>
        <Button variant="secondary" onClick={() => navigate(-1)} size="lg">Отмена</Button>
      </div>
    </div>
  );
}
