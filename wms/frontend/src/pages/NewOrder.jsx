import { useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useCompanies, useProducts, useCreateOrder, useImportOrderItemsXlsx, useCreateOrderFromXlsx, useLogisticsReference, useTariffs, useCreateCharge, useConsumables } from '../hooks/queries';
import { Button, Input, Select, fmt } from '../components/ui';
import useDismissibleDropdown from '../hooks/useDismissibleDropdown';
import { useAuthStore } from '../store/auth';

const TYPE_OPTIONS = [
  { key: 'supply',     label: 'Поставка',   sub: 'Заявка на поставку товаров' },
  { key: 'processing', label: 'Обработка',  sub: 'Обработка товаров' },
  { key: 'logistics',  label: 'Логистика',  sub: 'Логистические услуги' },
];
const TYPE_OPTION_CLASS = {
  supply: 'is-supply',
  processing: 'is-processing',
  logistics: 'is-logistics',
};
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
const TYPE_OPTION_ICON = {
  supply: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <path d="M12 12v4m-2-2h4" />
    </svg>
  ),
  processing: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  logistics: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22">
      <path d="M1 3h15v13H1z" />
      <path d="M16 8h4l3 3v5h-7V8z" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  ),
};

export default function NewOrder() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const isClientUser = user?.role === 'client';
  if (isClientUser) {
    return <Navigate to="/client/new-order" replace />;
  }
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
  const [serviceMode, setServiceMode] = useState('template');
  const [serviceQuery, setServiceQuery] = useState('');
  const [customServiceName, setCustomServiceName] = useState('');
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
  const createFromImportInputRef = useRef(null);

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
  const createOrderFromXlsx = useCreateOrderFromXlsx();
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
  const serviceDraftName = serviceMode === 'custom' ? customServiceName.trim() : serviceQuery.trim();
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
  const handleCreateOrderFromFile = async (event) => {
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
      const payload = {
        file,
        company_id: companyId,
        type,
        comment: normalizeOptionalText(comment),
        ...(type === 'supply'
          ? {
              supply: {
                delivery_type: supply.delivery_type,
                delivery_date: normalizeOptionalText(supply.delivery_date),
                pickup_address:
                  supply.delivery_type === 'Самостоятельно'
                    ? undefined
                    : companyOverride(supply.pickup_address, selectedCompany?.address),
                places_count: Number(supply.places_count || 0),
                weight_kg: Number(supply.weight_kg || 0),
                volume_m3: Number(supply.volume_m3 || 0),
                cargo_number:
                  supply.delivery_type === 'Самостоятельно'
                    ? undefined
                    : normalizeOptionalText(supply.cargo_number),
                contact_name:
                  supply.delivery_type === 'Самостоятельно'
                    ? undefined
                    : companyOverride(supply.contact_name, selectedCompany?.contact_name),
                contact_phone:
                  supply.delivery_type === 'Самостоятельно'
                    ? undefined
                    : companyOverride(supply.contact_phone, selectedCompany?.phone),
              },
            }
          : {}),
        ...(type === 'logistics' ? { logistics } : {}),
      };

      const result = await createOrderFromXlsx.mutateAsync(payload);
      navigate(`/orders/${result.order.id}`);
    } catch (e) {
      setImportStatus(e.response?.data?.error || 'Не удалось создать заявку из Excel');
    }
  };
  const resetServiceDraft = () => {
    setServiceMode('template');
    setServiceQuery('');
    setCustomServiceName('');
    setSelectedTariffCode('');
    setServiceQuantity(1);
    setServiceUnitPrice('');
    setServiceDiscount(0);
    setServiceMenuOpen(false);
  };
  const addService = () => {
    if (!selectedTariff && !serviceDraftName) return;
    const quantity = clampQty(serviceQuantity);
    const base_price = clampMoney(selectedServiceBasePrice);
    const discount = selectedServiceDiscount;
    const isManualService = serviceMode === 'custom' || !selectedTariff;
    setServices((prev) => [
      ...prev,
      normalizeServiceRow({
        tariff_code: selectedTariff?.code || 'custom_manual',
        name: selectedTariff?.name || serviceDraftName,
        description: selectedTariff?.description || (isManualService ? 'Своя услуга' : ''),
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
        ...(!isClientUser ? {
          consumables: consumablesUsed.map(({ consumable_id, quantity, unit_price, discount, comment: note }) => ({
            consumable_id,
            quantity,
            unit_price,
            discount,
            comment: normalizeOptionalText(note),
          })),
        } : {}),
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
      if (!isClientUser) {
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
      }
      navigate(`/orders/${order.id}`);
    } catch (e) {
      setError(e.response?.data?.error || 'Ошибка создания заявки');
    }
  };

  const selectedType = TYPE_OPTIONS.find((option) => option.key === type) || TYPE_OPTIONS[0];
  const sectionTitle = type === 'logistics' ? 'Логистика на МП' : selectedType?.label;
  const parameterTitle = type === 'supply'
    ? 'Параметры поставки'
    : type === 'logistics'
      ? 'Маршрут и отгрузка'
      : 'Параметры обработки';
  const parameterHint = type === 'supply'
    ? 'Укажите, как и когда привезут груз, чтобы склад принял его без уточнений.'
    : type === 'logistics'
      ? 'Выберите маркетплейс, склад назначения и параметры отгрузки.'
      : 'Для обработки достаточно состава товаров и общего комментария к заявке.';
  const canSubmit = Boolean(companyId) && items.length > 0 && !createOrder.isPending;
  const totalQty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const blockHeader = (num, title, hint) => (
    <div className="client-new-order-block-head">
      <div className="client-new-order-block-copy">
        <div className="client-new-order-block-num">{num}</div>
        <div>
          <div className="client-new-order-block-title">{title}</div>
          {hint && <div className="client-new-order-block-hint">{hint}</div>}
        </div>
      </div>
      {num === 1 && items.length > 0 && (
        <div className="client-new-order-block-count">{items.length}</div>
      )}
    </div>
  );

  return (
    <div className="client-page client-new-order-page admin-new-order-page">
      <div className="client-new-order-head">
        <div>
          <div className="client-new-order-title">Создание заявки</div>
          <div className="client-new-order-subtitle">
            Соберите состав, параметры и комментарий в той же рабочей области, что и в кабинете клиента.
          </div>
        </div>
      </div>

      <div className="client-new-order-type-shell">
        <div className="client-type-grid client-new-order-type-grid">
          {TYPE_OPTIONS.map((option) => {
            const selected = type === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setType(option.key)}
                className={`client-new-order-type-card${selected ? ' active' : ''}`}
              >
                <div className={`client-new-order-type-icon ${TYPE_OPTION_CLASS[option.key] || ''}`.trim()}>
                  {TYPE_OPTION_ICON[option.key]}
                </div>
                <div className="client-new-order-type-copy">
                  <div className="client-new-order-type-title">{option.label}</div>
                  <div className="client-new-order-type-sub">{option.sub}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="client-new-order-shell">
        <div className="client-new-order-shell-head">
          <div className="client-new-order-shell-num">1</div>
          <div>
            <div className="client-new-order-shell-title">{sectionTitle}</div>
            <div className="client-new-order-shell-subtitle">{selectedType?.sub}</div>
          </div>
        </div>

        <div className="client-new-order-shell-body">
          <div className={`client-new-order-layout${type === 'processing' ? ' is-processing' : ''}`}>
            <section className="client-new-order-panel">
              {blockHeader(1, 'Компания и товары', 'Выберите клиента, добавьте позиции и при необходимости загрузите Excel.')}

              <div className="client-new-order-field-group">
                <label className="client-new-order-label">Компания</label>
                <select
                  value={companyId}
                  onChange={(event) => {
                    setCompanyId(event.target.value);
                    setItems([]);
                  }}
                  className="client-new-order-select"
                >
                  <option value="">Выберите компанию</option>
                  {companies?.map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
              </div>

              {!companyId ? (
                <div className="client-new-order-items-summary">
                  <span className="client-new-order-items-summary-icon">○</span>
                  <span>Выберите компанию, чтобы добавить товары</span>
                </div>
              ) : (
                <>
                  <div className="client-new-order-product-search" ref={productDropdownRef}>
                    <label className="client-new-order-label">Товар</label>
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
                      placeholder="Поиск по названию, артикулу или штрихкоду"
                      className="client-new-order-input client-new-order-input-search"
                    />
                    <svg className="client-new-order-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                    </svg>
                    {showProductSuggestions && (
                      <div className="services-search-dropdown">
                        {availableProducts
                          .filter((product) => !items.find((item) => item.product_id === product.id))
                          .slice(0, 12)
                          .map((product) => (
                            <button
                              key={product.id}
                              type="button"
                              className="services-search-option"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                pickProduct(product);
                              }}
                            >
                              <div>{product.name}</div>
                              <div className="client-new-order-search-option-meta">
                                {product.article ? `${product.article} · ` : ''}
                                {product.barcode ? `Баркод ${product.barcode}` : 'Баркод не указан'}
                              </div>
                            </button>
                          ))}
                        {productQuery.trim() && !availableProducts.filter((product) => !items.find((item) => item.product_id === product.id)).length && (
                          <div className="services-search-option client-new-order-search-empty">
                            Ничего не найдено
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="client-new-order-product-actions">
                    <div className="client-new-order-qty-field">
                      <label className="client-new-order-label">Кол-во</label>
                      <input
                        type="number"
                        min="1"
                        value={productQty}
                        onChange={(event) => setProductQty(event.target.value)}
                        className="client-new-order-input client-new-order-input-right"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={addSelectedProduct}
                      className="client-new-order-action-btn client-new-order-action-btn-primary"
                    >
                      + Добавить
                    </button>
                    <div className="client-new-order-actions-secondary">
                      <button
                        type="button"
                        onClick={() => importInputRef.current?.click()}
                        disabled={importOrderItemsXlsx.isPending}
                        className="client-new-order-action-btn client-new-order-action-btn-secondary"
                      >
                        {importOrderItemsXlsx.isPending ? 'Импорт...' : 'Импорт Excel'}
                      </button>
                      <button
                        type="button"
                        onClick={() => createFromImportInputRef.current?.click()}
                        disabled={createOrderFromXlsx.isPending}
                        className="client-new-order-action-btn client-new-order-action-btn-secondary"
                      >
                        {createOrderFromXlsx.isPending ? 'Создаём...' : 'Создать из Excel'}
                      </button>
                    </div>
                  </div>

                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".xlsx"
                    onChange={handleImportItemsFile}
                    className="client-new-order-hidden-file-input"
                  />
                  <input
                    ref={createFromImportInputRef}
                    type="file"
                    accept=".xlsx"
                    onChange={handleCreateOrderFromFile}
                    className="client-new-order-hidden-file-input"
                  />

                  {importStatus && (
                    <div className={`client-new-order-import-status${importStatus.startsWith('Импортировано') ? ' is-success' : ' is-error'}`}>
                      {importStatus}
                    </div>
                  )}

                  <div className={`client-new-order-items-summary${items.length > 0 ? ' filled' : ''}`}>
                    <span className="client-new-order-items-summary-icon">○</span>
                    <span>
                      {items.length > 0 ? `Просмотреть · ${items.length} товаров · ${fmt(totalQty)} шт` : 'Выберите товар, чтобы продолжить'}
                    </span>
                  </div>

                  {items.length > 0 && (
                    <div className="client-new-order-items-list">
                      {items.map((item) => (
                        <div key={item.product_id} className="client-new-order-item-row">
                          <div className="client-new-order-item-main">
                            <div className="client-new-order-item-name">{item.product_name}</div>
                            <div className="client-new-order-item-article">{item.article || item.barcode || 'Артикул не указан'}</div>
                          </div>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(event) => setQty(item.product_id, Number(event.target.value))}
                            className="client-new-order-item-qty client-new-order-input client-new-order-input-right client-new-order-input-compact client-new-order-input-pane"
                          />
                          <button
                            type="button"
                            onClick={() => removeItem(item.product_id)}
                            className="client-new-order-item-remove"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>

            <section className="client-new-order-panel">
              {blockHeader(2, parameterTitle, parameterHint)}

              {type === 'supply' && (
                <div className="client-new-order-form-stack">
                  <div className="client-new-order-three-col-grid client-new-order-tight-grid">
                    {['Водитель Фулфилмента', 'Самостоятельно', 'Транзитная поставка'].map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setSupplyField('delivery_type', option)}
                        className={`client-new-order-choice-btn${supply.delivery_type === option ? ' active' : ''}`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>

                  <div className="client-new-order-three-col-grid">
                    <div>
                      <label className="client-new-order-label">Дата и время поставки</label>
                      <input
                        type="datetime-local"
                        value={supply.delivery_date || ''}
                        onChange={(event) => setSupplyField('delivery_date', event.target.value)}
                        className="client-new-order-input"
                      />
                    </div>
                    <div>
                      <label className="client-new-order-label">Количество мест</label>
                      <input
                        type="number"
                        min="0"
                        value={supply.places_count}
                        onChange={(event) => setSupplyField('places_count', Number(event.target.value))}
                        className="client-new-order-input client-new-order-input-right"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="client-new-order-label">Вес груза (кг)</label>
                      <input
                        type="number"
                        min="0"
                        value={supply.weight_kg}
                        onChange={(event) => setSupplyField('weight_kg', Number(event.target.value))}
                        className="client-new-order-input client-new-order-input-right"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {supply.delivery_type !== 'Самостоятельно' && (
                    <div className="client-new-order-two-col-grid">
                      <div>
                        <label className="client-new-order-label">Адрес откуда забрать</label>
                        <input
                          type="text"
                          list="pickup-address-suggestions"
                          placeholder={selectedCompany?.address || 'Введите адрес'}
                          value={supply.pickup_address || ''}
                          onChange={(event) => setSupplyField('pickup_address', event.target.value)}
                          className="client-new-order-input"
                        />
                        <datalist id="pickup-address-suggestions">
                          {companyAddressOptions.map((address) => (
                            <option key={address} value={address} />
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <label className="client-new-order-label">Номер груза</label>
                        <input
                          value={supply.cargo_number || ''}
                          onChange={(event) => setSupplyField('cargo_number', event.target.value)}
                          className="client-new-order-input"
                          placeholder="Введите номер"
                        />
                      </div>
                    </div>
                  )}

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
                    <div className="client-new-order-two-col-grid">
                      <div>
                        <label className="client-new-order-label">Контакт по заявке</label>
                        <input
                          placeholder={selectedCompany?.contact_name || 'Оставить контакт компании'}
                          value={supply.contact_name || ''}
                          onChange={(event) => setSupplyField('contact_name', event.target.value)}
                          className="client-new-order-input"
                        />
                      </div>
                      <div>
                        <label className="client-new-order-label">Телефон по заявке</label>
                        <input
                          placeholder={selectedCompany?.phone || '+7'}
                          value={supply.contact_phone || ''}
                          onChange={(event) => setSupplyField('contact_phone', event.target.value)}
                          className="client-new-order-input"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {type === 'logistics' && (
                <div className="client-new-order-form-stack">
                  <div>
                    <label className="client-new-order-label">Тип маршрута</label>
                    <div className="client-new-order-two-col-grid client-new-order-tight-grid">
                      {[['transit', 'Транзитная поставка', 'Через транзитный склад'], ['direct', 'Прямая поставка', 'Напрямую на конечный склад']].map(([value, title, hint]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setLogField('dest_type', value)}
                          className={`client-new-order-route-card${logistics.dest_type === value ? ' active' : ''}`}
                        >
                          <div className="client-new-order-route-title">{title}</div>
                          <div className="client-new-order-route-hint">{hint}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="client-new-order-label">Маркетплейс</label>
                    <div className="client-new-order-marketplace-row">
                      {groupedWarehouseOptions.map((group) => (
                        <button
                          key={group.key}
                          type="button"
                          onClick={() => {
                            setWarehouseMarketplace(group.key);
                            setLogField('dest_warehouse', '');
                          }}
                          className={`client-new-order-marketplace-choice${warehouseMarketplace === group.key ? ' active' : ''}`}
                        >
                          {group.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="client-new-order-three-col-grid">
                    <div>
                      <label className="client-new-order-label">Склад назначения</label>
                      <select
                        value={logistics.dest_warehouse}
                        onChange={(event) => setLogField('dest_warehouse', event.target.value)}
                        className="client-new-order-select"
                      >
                        <option value="">Выберите склад {groupedWarehouseOptions.find((group) => group.key === warehouseMarketplace)?.label || ''}</option>
                        {activeWarehouseOptions.map((warehouse) => (
                          <option key={warehouse} value={warehouse}>{warehouse}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="client-new-order-label">Дата и время отгрузки</label>
                      <input
                        type="datetime-local"
                        value={logistics.ship_date || ''}
                        onChange={(event) => setLogField('ship_date', event.target.value)}
                        className="client-new-order-input"
                      />
                    </div>
                    <div>
                      <label className="client-new-order-label">Номер пропуска</label>
                      <input
                        value={logistics.pass_number || ''}
                        onChange={(event) => setLogField('pass_number', event.target.value)}
                        className="client-new-order-input"
                        placeholder="Введите номер"
                      />
                    </div>
                  </div>
                </div>
              )}

              {type === 'processing' && (
                <div className="client-new-order-processing-note">
                  После создания заявки менеджер согласует состав работ по обработке. На этом шаге достаточно выбрать товары и оставить комментарий с пожеланиями по упаковке, маркировке или подготовке поставки.
                </div>
              )}
            </section>
          </div>

          <section className="client-new-order-section client-new-order-comment-section">
            {blockHeader(3, 'Общее ТЗ и комментарий', 'Добавьте инструкции по поставке, упаковке, логистике или особым условиям обработки.')}
            <div className="client-new-order-comment-grid">
              <button type="button" className="client-new-order-file-placeholder">
                <span className="client-new-order-file-placeholder-icon">⌁</span>
                Файлы скоро здесь
              </button>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                className="client-new-order-input client-new-order-comment-input"
                rows={5}
                placeholder="Общее техническое задание для всей заявки..."
              />
            </div>
          </section>
        </div>
      </div>

      {!isClientUser && (
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
                <div className="services-action-row">
                  <label>Услуга</label>
                  <Button
                    type="button"
                    size="sm"
                    variant={serviceMode === 'custom' ? 'primary' : 'secondary'}
                    onClick={() => {
                      setServiceMode('custom');
                      setSelectedTariffCode('');
                      setServiceMenuOpen(false);
                    }}
                  >
                    Своя услуга
                  </Button>
                </div>
                {serviceMode === 'custom' ? (
                  <div className="services-custom-panel">
                    <input
                      value={customServiceName}
                      onChange={(event) => setCustomServiceName(event.target.value)}
                      placeholder="Название своей услуги"
                    />
                    <div className="services-custom-note">
                      Вы можете сразу ввести свою услугу и цену без выбора шаблона.
                    </div>
                  </div>
                ) : null}
                <input
                  value={serviceQuery}
                  onFocus={() => setServiceMenuOpen(true)}
                  onChange={(event) => {
                    setServiceQuery(event.target.value);
                    setSelectedTariffCode('');
                    setServiceMenuOpen(true);
                    setServiceMode('template');
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
                          setServiceMode('template');
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

            {(selectedTariff || serviceDraftName) && (
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
                        <div className="font-medium text-xs">{selectedTariff?.name || serviceDraftName}</div>
                        <div className="text-xs text-gray-400">{selectedTariff?.description || 'Своя услуга без шаблона'}</div>
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
      )}

      {!isClientUser && (
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
      )}

      {error && (
        <div className="client-new-order-error">
          {error}
        </div>
      )}

      <div className="client-new-order-footer">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="client-new-order-submit"
        >
          {createOrder.isPending ? 'Создаём...' : 'Отправить заявку'}
        </button>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="client-new-order-cancel"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
