import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useOrder,
  useProducts,
  useMoveStage,
  useUpdateOrderItem,
  useImportOrderHonestCodes,
  useImportOrderHonestCodesFile,
  useAddOrderItem,
  useScanOrderHonestCode,
  useDownloadOrderHonestMismatchReport,
  useCompleteOrder,
  useOrderCharges,
  useTariffs,
  useCreateCharge,
  useUpdateCharge,
  useDeleteCharge,
  useConsumables,
  useAddOrderConsumable,
  useUpdateOrderConsumable,
  useRemoveOrderConsumable,
  useUpdateOrderDetails,
  useUpdateOrderShipments,
  useLogisticsReference,
  useOrderBoxes,
  useGenerateOrderBoxes,
  useSaveOrderBoxes,
} from '../hooks/queries';
import { Button, TypeBadge, StageBadge, fmt, Spinner, Modal, Empty, Badge, Input, Select } from '../components/ui';
import HonestSignScanner from '../components/HonestSignScanner';
import { useAuthStore } from '../store/auth';
import { formatDateTime, formatMoney } from '../lib/documents';
import { openOrderDocument } from '../lib/orderDocuments';
import api from '../api/client';
import useDismissibleDropdown from '../hooks/useDismissibleDropdown';
import { useThemeStore } from '../store/theme';

const SUPPLY_STAGES = ['new', 'approval', 'pickup', 'in_transit', 'receiving', 'accepted', 'mp_shipping', 'done'];
const PROCESS_STAGES = ['new', 'waiting', 'in_progress', 'done'];
const LOGISTICS_STAGES = ['new', 'approval', 'pickup', 'mp_shipping', 'done'];
const STAGE_LABELS = {
  new: 'Новая',
  approval: 'Согласование',
  pickup: 'Забор груза',
  in_transit: 'В пути',
  receiving: 'Приёмка',
  accepted: 'Принято',
  waiting: 'Ожидает',
  in_progress: 'В работе',
  delivered: 'Доставлено',
  mp_shipping: 'Отгрузка на МП',
  done: 'Готово',
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
const DEFAULT_LOGISTICS_CARRIERS = [
  { code: 'wb_logistic', name: 'WB LOGISTIC' },
  { code: 'wb_tranzit', name: 'WB TRANZIT' },
];

function normalizeDisplayStage(order) {
  if (order?.type === 'logistics' && ['in_transit', 'delivered'].includes(order.stage)) {
    return 'mp_shipping';
  }
  return order?.stage;
}

function toDateTimeLocalMinValue(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function isShipmentDeliveredByUnloadDate(unloadDate) {
  if (!unloadDate) return false;
  const parsed = new Date(unloadDate).getTime();
  if (!Number.isFinite(parsed)) return false;
  return parsed <= Date.now();
}

function resolveShipmentStatus(row) {
  if (row?.shipment_status === 'delivered') return 'delivered';
  if (row?.shipment_status === 'pending') return 'pending';
  return isShipmentDeliveredByUnloadDate(row?.unload_date) ? 'delivered' : 'pending';
}

function detectMarketplaceCode(...values) {
  const haystack = values
    .flat()
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
  if (haystack.includes('ozon')) return 'ozon';
  if (haystack.includes('яндекс') || haystack.includes('yandex')) return 'yandex';
  if (haystack.includes('wb') || haystack.includes('wildberries')) return 'wb';
  return 'generic';
}

function buildItemDraft(items = []) {
  return Object.fromEntries(
    items.map((item) => [
      item.id,
      {
        quantity: Number(item.quantity || 0),
        ready_qty: Number(item.ready_qty || 0),
        defect_qty: Number(item.defect_qty || 0),
      },
    ])
  );
}

function buildServiceDraft(overrides = {}) {
  return {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    serviceQuery: '',
    selectedTariffCode: '',
    serviceQuantity: 1,
    discountPercent: 0,
    customServiceName: '',
    customServicePrice: 0,
    isManualServiceMode: false,
    ...overrides,
  };
}

const normalizeProductList = (data) => (Array.isArray(data) ? data : data?.items || []);
const normalizeFindKey = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, '');

function isItemDraftDirty(item, draft = {}) {
  return Number(draft.quantity ?? item.quantity ?? 0) !== Number(item.quantity || 0)
    || Number(draft.ready_qty ?? item.ready_qty ?? 0) !== Number(item.ready_qty || 0)
    || Number(draft.defect_qty ?? item.defect_qty ?? 0) !== Number(item.defect_qty || 0);
}

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { data: order, isLoading } = useOrder(id);
  const { data: orderBoxes } = useOrderBoxes(id);
  const { data: charges, isLoading: chargesLoading } = useOrderCharges(id);
  const { data: tariffs } = useTariffs();
  const { data: logisticsReference } = useLogisticsReference();
  const { data: consumablesCatalog } = useConsumables();
  const moveStage = useMoveStage();
  const updateItem = useUpdateOrderItem();
  const addOrderItem = useAddOrderItem();
  const importOrderHonestCodes = useImportOrderHonestCodes();
  const importOrderHonestCodesFile = useImportOrderHonestCodesFile();
  const completeOrder = useCompleteOrder();
  const scanOrderHonestCode = useScanOrderHonestCode();
  const downloadOrderHonestMismatchReport = useDownloadOrderHonestMismatchReport();
  const createCharge = useCreateCharge();
  const updateCharge = useUpdateCharge();
  const deleteCharge = useDeleteCharge();
  const addOrderConsumable = useAddOrderConsumable();
  const updateOrderConsumable = useUpdateOrderConsumable();
  const removeOrderConsumable = useRemoveOrderConsumable();
  const updateOrderDetails = useUpdateOrderDetails();
  const updateOrderShipments = useUpdateOrderShipments();
  const generateOrderBoxes = useGenerateOrderBoxes();
  const saveOrderBoxes = useSaveOrderBoxes();

  const [activeTab, setActiveTab] = useState('items');
  const [stageModal, setStageModal] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [newStage, setNewStage] = useState('');
  const [stageNote, setStageNote] = useState('');
  const [itemsDraft, setItemsDraft] = useState({});
  const [itemEditModal, setItemEditModal] = useState(null);
  const [itemQuery, setItemQuery] = useState('');
  const [itemQuantity, setItemQuantity] = useState(1);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [itemAddError, setItemAddError] = useState('');
  const [isItemMenuOpen, setIsItemMenuOpen] = useState(false);
  const [chargeDrafts, setChargeDrafts] = useState({});
  const [itemError, setItemError] = useState('');
  const [honestCodeDrafts, setHonestCodeDrafts] = useState({});
  const [honestCodeMode, setHonestCodeMode] = useState('file');
  const [honestCodeImportError, setHonestCodeImportError] = useState('');
  const [honestCodeScanValue, setHonestCodeScanValue] = useState('');
  const [honestCodeScanResult, setHonestCodeScanResult] = useState(null);
  const [honestCodeImportFile, setHonestCodeImportFile] = useState(null);
  const [honestCodeImportReplace, setHonestCodeImportReplace] = useState(false);
  const [honestCodeFileImportResult, setHonestCodeFileImportResult] = useState(null);
  const [showHonestSignTools, setShowHonestSignTools] = useState(false);
  const [czScannerOpen, setCzScannerOpen] = useState(false);
  const honestSignDesktopInputRef = useRef(null);
  const [serviceDrafts, setServiceDrafts] = useState([buildServiceDraft()]);
  const [activeServiceMenuIndex, setActiveServiceMenuIndex] = useState(null);
  const serviceDropdownRef = useDismissibleDropdown(activeServiceMenuIndex !== null, () => setActiveServiceMenuIndex(null));
  const itemDropdownRef = useDismissibleDropdown(isItemMenuOpen, () => setIsItemMenuOpen(false));
  const [consumableQuery, setConsumableQuery] = useState('');
  const [selectedConsumableId, setSelectedConsumableId] = useState('');
  const [consumableQuantity, setConsumableQuantity] = useState(1);
  const [consumablePrice, setConsumablePrice] = useState(0);
  const [consumableComment, setConsumableComment] = useState('');
  const [consumablesDrafts, setConsumablesDrafts] = useState({});
  const [consumableError, setConsumableError] = useState('');
  const [isConsumableMenuOpen, setIsConsumableMenuOpen] = useState(false);
  const [chargeError, setChargeError] = useState('');
  const consumableDropdownRef = useDismissibleDropdown(isConsumableMenuOpen, () => setIsConsumableMenuOpen(false));
  const [pickupDetails, setPickupDetails] = useState({
    places_count: 0,
    weight_kg: 0,
    cargo_number: '',
    pickup_address: '',
    contact_name: '',
  });
  const [shipmentsDraft, setShipmentsDraft] = useState([]);
  const [shipmentError, setShipmentError] = useState('');
  const [boxesDraft, setBoxesDraft] = useState([]);
  const [boxError, setBoxError] = useState('');
  const theme = useThemeStore((state) => state.theme);
  const isMobileDarkTheme = theme === 'dark';
  useEffect(() => {
    if (order?.items) {
      setItemsDraft(buildItemDraft(order.items));
    }
  }, [order]);

  useEffect(() => {
    if (!order?.items) return;
    setHonestCodeDrafts(
      Object.fromEntries(
        order.items.map((item) => [item.id, ''])
      )
    );
  }, [order?.items]);

  useEffect(() => {
    if (!charges?.items) return;
    setChargeDrafts(
      Object.fromEntries(
        charges.items.map((charge) => [
          charge.id,
          {
            quantity: Number(charge.quantity || 1),
            unit_price: Number(charge.unit_price || 0),
          },
        ])
      )
    );
  }, [charges]);

  useEffect(() => {
    if (!order?.consumables) return;
    setConsumablesDrafts(
      Object.fromEntries(
        order.consumables.map((item) => [
          item.id,
          {
            quantity: Number(item.quantity || 1),
            unit_price: Number(item.unit_price || 0),
            comment: item.comment || '',
          },
        ])
      )
    );
  }, [order]);

  useEffect(() => {
    setPickupDetails({
      places_count: Number(order?.details?.places_count || 0),
      weight_kg: Number(order?.details?.weight_kg || 0),
      cargo_number: order?.details?.cargo_number || '',
      pickup_address: order?.details?.pickup_address || '',
      contact_name: order?.details?.contact_name || '',
    });
  }, [order?.details?.places_count, order?.details?.weight_kg, order?.details?.cargo_number, order?.details?.pickup_address, order?.details?.contact_name]);

  useEffect(() => {
    setBoxesDraft(
      (orderBoxes?.boxes || []).map((box) => ({
        id: box.id,
        shipment_id: box.shipment_id || '',
        marketplace: box.marketplace || 'wb',
        warehouse_name: box.warehouse_name || '',
        ship_date: box.ship_date ? String(box.ship_date).slice(0, 16) : '',
        box_code: box.box_code || '',
        sequence_no: Number(box.sequence_no || 0),
        items: (box.items || []).map((item) => ({
          order_item_id: item.order_item_id,
          quantity: Number(item.quantity || 0),
          expiry_date: item.expiry_date || '',
        })),
      }))
    );
  }, [orderBoxes?.boxes]);

  const isManager = ['admin', 'manager'].includes(user?.role);
  const { data: searchProducts } = useProducts({
    company_id: order?.company_id,
    search: itemQuery.trim(),
    enabled: Boolean(
      isManager && order?.company_id && isItemMenuOpen && itemQuery.trim().length > 0
    ),
  });
  const { data: allCompanyProductsData } = useProducts({
    company_id: order?.company_id,
    enabled: Boolean(isManager && order?.company_id && order?.status === 'active'),
  });
  const stageList = order?.type === 'supply'
    ? SUPPLY_STAGES
    : order?.type === 'processing'
      ? PROCESS_STAGES
      : LOGISTICS_STAGES;
  const displayStage = normalizeDisplayStage(order);

  const totals = useMemo(() => {
    const items = order?.items || [];
    return {
      quantity: items.reduce((sum, item) => sum + Number((itemsDraft[item.id]?.quantity ?? item.quantity) || 0), 0),
      ready: items.reduce((sum, item) => sum + Number((itemsDraft[item.id]?.ready_qty ?? item.ready_qty) || 0), 0),
      defect: items.reduce((sum, item) => sum + Number((itemsDraft[item.id]?.defect_qty ?? item.defect_qty) || 0), 0),
      charges: Number(charges?.summary?.total || 0),
    };
  }, [order, itemsDraft, charges?.summary?.total]);

  const chargeItems = Array.isArray(charges?.items) ? charges.items : [];
  const dirtyReceivingItemsCount = Array.isArray(order?.items)
    ? order.items.filter((item) => isItemDraftDirty(item, itemsDraft[item.id] || {})).length
    : 0;
  const chargeSummaryItems = chargeItems.slice(0, 4);
  const remainingChargeItemsCount = Math.max(0, chargeItems.length - chargeSummaryItems.length);
  const chargesSummary = charges?.summary || { total: 0, paid: 0, pending: 0 };
  const defectItems = useMemo(
    () => (order?.items || []).filter((item) => Number(item.defect_qty || 0) > 0),
    [order?.items]
  );
  const primaryDefectItem = defectItems[0] || null;
  const remainingDefectItemsCount = Math.max(0, defectItems.length - 1);

  const availableServices = useMemo(() => {
    const list = Array.isArray(tariffs) ? [...tariffs] : [];
    return list.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  }, [tariffs]);

  const availableConsumables = useMemo(() => {
    const all = consumablesCatalog || [];
    const usedIds = new Set((order?.consumables || []).map((item) => item.consumable_id));
    const query = consumableQuery.trim().toLowerCase();
    return all
      .filter((item) => item?.is_active !== false)
      .filter((item) => !usedIds.has(item.id))
      .filter((item) => {
        if (!query) return true;
        return (
          item.name?.toLowerCase().includes(query)
          || item.code?.toLowerCase().includes(query)
          || item.category?.toLowerCase().includes(query)
        );
      });
  }, [consumablesCatalog, consumableQuery, order]);

  const selectedConsumable = useMemo(
    () => (consumablesCatalog || []).find((item) => item.id === selectedConsumableId) || null,
    [selectedConsumableId, consumablesCatalog]
  );
  const availableProducts = useMemo(() => normalizeProductList(searchProducts), [searchProducts]);
  const allCompanyProducts = useMemo(
    () => normalizeProductList(allCompanyProductsData),
    [allCompanyProductsData]
  );
  const productSearchPool = useMemo(() => {
    const byId = new Map();
    [...availableProducts, ...allCompanyProducts].forEach((product) => {
      if (!product?.id) return;
      byId.set(String(product.id), product);
    });
    return Array.from(byId.values());
  }, [availableProducts, allCompanyProducts]);
  const availableWarehouseGroups = useMemo(() => {
    if (logisticsReference?.warehouse_groups?.length) return logisticsReference.warehouse_groups;
    return DEFAULT_WAREHOUSE_GROUPS;
  }, [logisticsReference]);
  const warehouseCatalog = useMemo(
    () => (logisticsReference?.warehouse_catalog || []).filter((row) => row?.is_active !== false),
    [logisticsReference]
  );
  const availableCarriers = useMemo(() => {
    const rows = Array.isArray(logisticsReference?.carriers) ? logisticsReference.carriers : [];
    return rows.length ? rows.filter((row) => row?.is_active !== false) : DEFAULT_LOGISTICS_CARRIERS;
  }, [logisticsReference]);
  const warehouseCatalogMap = useMemo(() => {
    const map = new Map();
    warehouseCatalog.forEach((row) => {
      const label = String(row.label || '').trim().toLowerCase();
      const name = String(row.name || '').trim().toLowerCase();
      if (label) map.set(label, row);
      if (name) map.set(name, row);
    });
    return map;
  }, [warehouseCatalog]);

  const resolveShipmentPrice = (warehouseName, billingRate = 'per_unit') => {
    const key = String(warehouseName || '').trim().toLowerCase();
    const row = warehouseCatalogMap.get(key) || null;
    if (!row) return 0;
    return Number(billingRate === 'per_pallet' ? row.price_per_pallet : row.price_per_unit || 0);
  };

  useEffect(() => {
    setShipmentsDraft(
      (order?.marketplace_shipments || []).map((row) => ({
        marketplace: row.marketplace || 'wb',
        warehouse_name: row.warehouse_name || '',
        carrier_name: row.carrier_name || '',
        mp_supply_id: row.mp_supply_id || '',
        ship_date: row.ship_date ? String(row.ship_date).slice(0, 16) : '',
        unload_date: row.unload_date ? String(row.unload_date).slice(0, 16) : '',
        shipment_status: row.shipment_status || '',
        places_count: Number(row.places_count || 0),
        quantity: Number(row.quantity || 0),
        billing_rate: row.billing_rate || 'per_unit',
        unit_price: row.unit_price !== null && row.unit_price !== undefined
          ? Number(row.unit_price)
          : Number(row.billing_unit_price || resolveShipmentPrice(row.warehouse_name || '', row.billing_rate || 'per_unit')),
        note: row.note || '',
      }))
    );
  }, [order?.marketplace_shipments, warehouseCatalogMap]);

  const wbShipmentOptions = useMemo(
    () => (orderBoxes?.wb_shipments || []).map((shipment) => ({
      id: shipment.id,
      label: `${shipment.warehouse_name || 'WB'} · ${shipment.ship_date ? formatDateTime(shipment.ship_date) : 'без даты'} · ${fmt(shipment.places_count || 0)} мест`,
      warehouse_name: shipment.warehouse_name || '',
      ship_date: shipment.ship_date ? String(shipment.ship_date).slice(0, 16) : '',
      places_count: Number(shipment.places_count || 0),
    })),
    [orderBoxes?.wb_shipments]
  );

  const boxItemOptions = useMemo(
    () => (orderBoxes?.items || []).map((item) => ({
      id: item.id,
      label: `${item.product_name}${item.article ? ` · ${item.article}` : ''}${item.size ? ` · ${item.size}` : ''}${item.color ? ` · ${item.color}` : ''}${item.barcode ? ` · ${item.barcode}` : ''}`,
      remaining: Number(item.remaining_box_qty || 0),
      ready_qty: Number(item.ready_qty || 0),
      barcode: item.barcode || '',
    })),
    [orderBoxes?.items]
  );
  const draftPackedByItem = useMemo(() => {
    const totals = {};
    (boxesDraft || []).forEach((box) => {
      (box.items || []).forEach((item) => {
        if (!item?.order_item_id) return;
        totals[item.order_item_id] = Number(totals[item.order_item_id] || 0) + Number(item.quantity || 0);
      });
    });
    return totals;
  }, [boxesDraft]);
  const draftBoxSummary = useMemo(() => {
    const totalReady = (orderBoxes?.items || []).reduce((sum, item) => sum + Number(item.ready_qty || 0), 0);
    const totalPacked = Object.values(draftPackedByItem).reduce((sum, value) => sum + Number(value || 0), 0);
    return {
      totalReady,
      totalPacked,
      totalRemaining: Math.max(0, totalReady - totalPacked),
    };
  }, [orderBoxes?.items, draftPackedByItem]);

  if (isLoading) return <Spinner />;
  if (!order) return <Empty text="Заявка не найдена" />;

  const honestSignSummary = order.honest_sign_summary || {};
  const hasHonestSignActivity = Boolean(
    Number(honestSignSummary.expected_total || 0) > 0
    || Number(honestSignSummary.scanned_total || 0) > 0
    || Number(honestSignSummary.duplicate_total || 0) > 0
    || Number(honestSignSummary.unexpected_total || 0) > 0
    || Number(honestSignSummary.remaining_total || 0) > 0
  );
  const shouldShowHonestSignTools = hasHonestSignActivity || showHonestSignTools;

  const handleMoveStage = async () => {
    try {
      await moveStage.mutateAsync({ id, stage: newStage, note: stageNote });
      setStageModal(false);
      setStageNote('');
      setNewStage('');
    } catch (error) {
      window.alert(error?.response?.data?.error || error?.message || 'Не удалось сменить этап');
    }
  };

  const handleTopStageChange = async (stage) => {
    if (!stage || stage === order.stage || moveStage.isPending) return;
    const label = STAGE_LABELS[stage] || stage;
    const confirmed = window.confirm(`Перевести заявку на этап «${label}»?`);
    if (!confirmed) return;
    try {
      await moveStage.mutateAsync({ id, stage, note: '' });
      setStageModal(false);
      setStageNote('');
      setNewStage('');
    } catch (error) {
      window.alert(error?.response?.data?.error || error?.message || 'Не удалось сменить этап');
    }
  };

  const handleComplete = async () => {
    if (window.confirm('Завершить заявку и обновить остатки на складе?')) {
      await completeOrder.mutateAsync(id);
      navigate('/orders');
    }
  };

  const handleDraftChange = (itemId, field, value) => {
    const number = Number(value || 0);
    setItemsDraft((current) => ({
      ...current,
      [itemId]: { ...current[itemId], [field]: number },
    }));
  };

  const openItemEditModal = (item) => {
    setItemEditModal({
      id: item.id,
      product_name: item.product_name,
      quantity: Number(itemsDraft[item.id]?.quantity ?? item.quantity ?? 0),
      ready_qty: Number(itemsDraft[item.id]?.ready_qty ?? item.ready_qty ?? 0),
      defect_qty: Number(itemsDraft[item.id]?.defect_qty ?? item.defect_qty ?? 0),
    });
  };

  const updateItemEditDraft = (field, value) => {
    setItemEditModal((current) => {
      if (!current) return current;
      return { ...current, [field]: Number(value || 0) };
    });
  };

  const resetItemForm = () => {
    setItemQuery('');
    setItemQuantity(1);
    setSelectedProductId('');
    setSelectedProduct(null);
    setItemAddError('');
    setIsItemMenuOpen(false);
  };

  const updateHonestCodeDraft = (itemId, value) => {
    setHonestCodeDrafts((current) => ({
      ...current,
      [itemId]: value,
    }));
  };

  const triggerBlobDownload = (blob, filename) => {
    const safeName = filename || `honest_sign_${id}.xlsx`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = safeName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadHonestTemplate = async () => {
    try {
      const response = await api.get(`/orders/${id}/honest-codes/template`, { responseType: 'blob' });
      triggerBlobDownload(response.data, `honest_sign_template_order_${id}.xlsx`);
    } catch (error) {
      setHonestCodeImportError(error?.response?.data?.error || 'Не удалось скачать шаблон Excel');
    }
  };

  const handleImportHonestCodesFile = async () => {
    if (!honestCodeImportFile) {
      setHonestCodeImportError('Выберите Excel-файл с КИЗами');
      return;
    }
    try {
      const result = await importOrderHonestCodesFile.mutateAsync({
        orderId: id,
        file: honestCodeImportFile,
        replace: honestCodeImportReplace,
      });
      setHonestCodeFileImportResult(result);
      setHonestCodeImportError('');
      setHonestCodeImportFile(null);
      const input = document.getElementById(`honest-sign-file-input-${id}`);
      if (input) input.value = '';
    } catch (error) {
      setHonestCodeFileImportResult(null);
      setHonestCodeImportError(error?.response?.data?.error || 'Не удалось обработать Excel-файл с КИЗами');
    }
  };

  const importHonestCodesForItem = async (item) => {
    const rawText = String(honestCodeDrafts[item.id] || '').trim();
    if (!rawText) {
      setHonestCodeImportError(`Вставьте список КИЗов для товара "${item.product_name}"`);
      return;
    }
    try {
      await importOrderHonestCodes.mutateAsync({
        orderId: id,
        itemId: item.id,
        raw_text: rawText,
        replace: true,
      });
      updateHonestCodeDraft(item.id, '');
      setHonestCodeImportError('');
      setHonestCodeFileImportResult(null);
    } catch (error) {
      setHonestCodeImportError(error?.response?.data?.error || 'Не удалось загрузить список КИЗов');
    }
  };

  const handleHonestCodeScan = async () => {
    const code = String(honestCodeScanValue || '').trim();
    if (!code) return;
    try {
      const result = await scanOrderHonestCode.mutateAsync({ orderId: id, code });
      setHonestCodeScanResult(result);
      setHonestCodeScanValue('');
    } catch (error) {
      setHonestCodeScanResult({
        result: 'error',
        message: error?.response?.data?.error || 'Не удалось обработать скан',
      });
    }
  };

  const handleDownloadHonestMismatchReport = async () => {
    try {
      const result = await downloadOrderHonestMismatchReport.mutateAsync({ orderId: id });
      triggerBlobDownload(result.blob, `honest_sign_mismatch_order_${id}.xlsx`);
    } catch (error) {
      setHonestCodeImportError(error?.response?.data?.error || 'Не удалось скачать отчёт по несовпадениям');
    }
  };

  const handleChargeDraftChange = (chargeId, field, value) => {
    const number = Number(value || 0);
    setChargeDrafts((current) => ({
      ...current,
      [chargeId]: { ...current[chargeId], [field]: number },
    }));
  };

  const handleConsumableDraftChange = (entryId, field, value) => {
    setConsumablesDrafts((current) => ({
      ...current,
      [entryId]: { ...current[entryId], [field]: value },
    }));
  };

  const saveItem = async (item) => {
    const draft = itemsDraft[item.id] || {
      quantity: Number(item.quantity || 0),
      ready_qty: Number(item.ready_qty || 0),
      defect_qty: Number(item.defect_qty || 0),
    };
    const nextQuantity = Math.max(1, Number(draft.quantity || item.quantity || 0));
    const nextReady = Math.max(0, Number(draft.ready_qty || 0));
    const nextDefect = Math.max(0, Number(draft.defect_qty || 0));
    if (nextReady + nextDefect > nextQuantity) {
      setItemError(`Для товара "${item.product_name}" сумма "Готово" и "Брак" превышает заявленное количество.`);
      return;
    }

    setItemError('');
    await updateItem.mutateAsync({
      orderId: id,
      itemId: item.id,
      quantity: nextQuantity,
      ready_qty: nextReady,
      defect_qty: nextDefect,
    });
  };

  const saveAllItems = async () => {
    const list = Array.isArray(order?.items) ? order.items : [];
    const dirtyItems = list.filter((item) => isItemDraftDirty(item, itemsDraft[item.id] || {}));
    if (!dirtyItems.length) return;

    for (const item of dirtyItems) {
      const draft = itemsDraft[item.id] || {
        quantity: Number(item.quantity || 0),
        ready_qty: Number(item.ready_qty || 0),
        defect_qty: Number(item.defect_qty || 0),
      };
      const nextQuantity = Math.max(1, Number(draft.quantity || item.quantity || 0));
      const nextReady = Math.max(0, Number(draft.ready_qty || 0));
      const nextDefect = Math.max(0, Number(draft.defect_qty || 0));
      if (nextReady + nextDefect > nextQuantity) {
        setItemError(`Для товара "${item.product_name}" сумма "Готово" и "Брак" превышает заявленное количество.`);
        return;
      }
    }

    setItemError('');
    for (const item of dirtyItems) {
      const draft = itemsDraft[item.id] || {
        quantity: Number(item.quantity || 0),
        ready_qty: Number(item.ready_qty || 0),
        defect_qty: Number(item.defect_qty || 0),
      };
      await updateItem.mutateAsync({
        orderId: id,
        itemId: item.id,
        quantity: Math.max(1, Number(draft.quantity || item.quantity || 0)),
        ready_qty: Math.max(0, Number(draft.ready_qty || 0)),
        defect_qty: Math.max(0, Number(draft.defect_qty || 0)),
      });
    }
  };

  const saveItemFromModal = async () => {
    if (!itemEditModal) return;
    const nextQuantity = Math.max(1, Number(itemEditModal.quantity || 0));
    const nextReady = Math.max(0, Number(itemEditModal.ready_qty || 0));
    const nextDefect = Math.max(0, Number(itemEditModal.defect_qty || 0));
    if (nextReady + nextDefect > nextQuantity) {
      setItemError(`Для товара "${itemEditModal.product_name}" сумма "Готово" и "Брак" превышает заявленное количество.`);
      return;
    }
    setItemError('');
    await updateItem.mutateAsync({
      orderId: id,
      itemId: itemEditModal.id,
      quantity: nextQuantity,
      ready_qty: nextReady,
      defect_qty: nextDefect,
    });
    setItemEditModal(null);
  };

  const addProductToOrder = async (product, quantityOverride = itemQuantity) => {
    if (!product) return;
    const nextQuantity = Math.max(1, Number(quantityOverride || 1));
    const existing = (order?.items || []).find((item) => String(item.product_id) === String(product.id));
    if (existing) {
      const nextReady = Math.min(Number(existing.ready_qty || 0), nextQuantity);
      const nextDefect = Math.min(Number(existing.defect_qty || 0), Math.max(0, nextQuantity - nextReady));
      await updateItem.mutateAsync({
        orderId: order.id,
        itemId: existing.id,
        quantity: nextQuantity,
        ready_qty: nextReady,
        defect_qty: nextDefect,
      });
    } else {
      await addOrderItem.mutateAsync({
        orderId: order.id,
        product_id: product.id,
        quantity: nextQuantity,
      });
    }
    resetItemForm();
  };

  const pickProduct = (item) => {
    setSelectedProductId(String(item.id));
    setSelectedProduct(item);
    setItemQuery(item.name || '');
    setItemAddError('');
    setIsItemMenuOpen(false);
  };

  const addItemToOrder = async () => {
    const query = itemQuery.trim();
    const queryKey = normalizeFindKey(query);
    const candidate = selectedProduct
      || (selectedProductId
        ? productSearchPool.find((product) => String(product.id) === String(selectedProductId))
        : null)
      || (() => {
        if (!queryKey) return null;
        const exact = productSearchPool.find((product) => (
          normalizeFindKey(product.name) === queryKey
          || normalizeFindKey(product.article) === queryKey
          || normalizeFindKey(product.barcode) === queryKey
        ));
        if (exact) return exact;

        const splitTokens = query
          .split('·')
          .map((part) => part.trim())
          .filter(Boolean);
        for (const token of splitTokens) {
          const tokenKey = normalizeFindKey(token);
          if (!tokenKey) continue;
          const tokenMatch = productSearchPool.find((product) => (
            normalizeFindKey(product.name) === tokenKey
            || normalizeFindKey(product.article) === tokenKey
            || normalizeFindKey(product.barcode) === tokenKey
          ));
          if (tokenMatch) return tokenMatch;
        }

        const fuzzy = productSearchPool.filter((product) => (
          normalizeFindKey(product.name).includes(queryKey)
          || normalizeFindKey(product.article).includes(queryKey)
          || normalizeFindKey(product.barcode).includes(queryKey)
        ));
        return fuzzy.length === 1 ? fuzzy[0] : null;
      })()
      || (availableProducts.length === 1 ? availableProducts[0] : null);

    if (!candidate) {
      setItemAddError('Выберите товар из списка или отсканируйте баркод');
      return;
    }

    try {
      await addProductToOrder(candidate, itemQuantity);
    } catch (error) {
      setItemAddError(error?.response?.data?.error || 'Не удалось добавить товар');
    }
  };

  const saveCharge = async (charge) => {
    const draft = chargeDrafts[charge.id] || {
      quantity: Number(charge.quantity || 1),
      unit_price: Number(charge.unit_price || 0),
    };

    try {
      await updateCharge.mutateAsync({
        id: charge.id,
        quantity: Math.max(1, Number(draft.quantity || 1)),
        unit_price: Math.max(0, Number(draft.unit_price || 0)),
      });
      setChargeError('');
    } catch (error) {
      setChargeError(error?.response?.data?.error || 'Не удалось обновить начисление');
    }
  };

  const deleteChargeRow = async (charge) => {
    if (!window.confirm(`Удалить начисление "${charge.description || charge.tariff_code}" из заявки?`)) return;
    try {
      await deleteCharge.mutateAsync({ id: charge.id, orderId: order.id });
      setChargeError('');
    } catch (error) {
      setChargeError(error?.response?.data?.error || 'Не удалось удалить начисление');
    }
  };

  const pickConsumable = (item) => {
    setSelectedConsumableId(item.id);
    setConsumableQuery(`${item.name}${item.code ? ` (${item.code})` : ''}`);
    setConsumableQuantity(1);
    setConsumablePrice(Number(item.price || 0));
    setIsConsumableMenuOpen(false);
    setConsumableError('');
  };

  const addConsumableToOrder = async () => {
    if (!selectedConsumableId) return;
    try {
      await addOrderConsumable.mutateAsync({
        orderId: order.id,
        consumable_id: selectedConsumableId,
        quantity: Math.max(1, Number(consumableQuantity || 1)),
        unit_price: Math.max(0, Number(consumablePrice || 0)),
        comment: consumableComment || '',
      });
      setSelectedConsumableId('');
      setConsumableQuery('');
      setConsumableQuantity(1);
      setConsumablePrice(0);
      setConsumableComment('');
      setConsumableError('');
    } catch (error) {
      setConsumableError(error?.response?.data?.error || 'Не удалось добавить расходник');
    }
  };

  const saveConsumable = async (entry) => {
    const draft = consumablesDrafts[entry.id] || {};
    try {
      await updateOrderConsumable.mutateAsync({
        orderId: order.id,
        entryId: entry.id,
        quantity: Math.max(1, Number(draft.quantity ?? entry.quantity)),
        unit_price: Math.max(0, Number(draft.unit_price ?? entry.unit_price)),
        comment: draft.comment ?? entry.comment ?? '',
      });
      setConsumableError('');
    } catch (error) {
      setConsumableError(error?.response?.data?.error || 'Не удалось обновить расходник');
    }
  };

  const deleteConsumable = async (entry) => {
    if (!window.confirm(`Удалить расходник "${entry.name}" из заявки?`)) return;
    try {
      await removeOrderConsumable.mutateAsync({
        orderId: order.id,
        entryId: entry.id,
      });
      setConsumableError('');
    } catch (error) {
      setConsumableError(error?.response?.data?.error || 'Не удалось удалить расходник');
    }
  };

  const getServiceOptions = (query) => {
    const text = (query || '').trim().toLowerCase();
    if (!text) return availableServices;
    return availableServices.filter((item) =>
      item.name?.toLowerCase().includes(text)
      || item.description?.toLowerCase().includes(text)
      || item.code?.toLowerCase().includes(text)
    );
  };

  const updateServiceDraft = (localId, patch) => {
    setServiceDrafts((current) => current.map((draft) => (
      draft.localId === localId ? { ...draft, ...patch } : draft
    )));
  };

  const addServiceDraftRow = () => {
    setServiceDrafts((current) => {
      const next = [...current, buildServiceDraft()];
      setActiveServiceMenuIndex(next.length - 1);
      return next;
    });
  };

  const removeServiceDraftRow = (localId) => {
    setServiceDrafts((current) => {
      const next = current.filter((draft) => draft.localId !== localId);
      return next.length ? next : [buildServiceDraft()];
    });
    setActiveServiceMenuIndex(null);
  };

  const setManualServiceMode = (localId, enabled) => {
    updateServiceDraft(localId, {
      isManualServiceMode: enabled,
      selectedTariffCode: '',
      serviceQuery: enabled ? 'Своя услуга' : '',
      customServiceName: enabled ? 'Своя услуга' : '',
      customServicePrice: 0,
      discountPercent: 0,
    });
    setActiveServiceMenuIndex(null);
  };

  const pickTariff = (localId, tariff) => {
    updateServiceDraft(localId, {
      selectedTariffCode: tariff.code,
      serviceQuery: tariff.name,
      customServiceName: tariff.name,
      customServicePrice: Number(tariff.price || 0),
      isManualServiceMode: false,
    });
    setActiveServiceMenuIndex(null);
  };

  const getServicePricing = (draft) => {
    const selectedTariff = (tariffs || []).find((item) => item.code === draft.selectedTariffCode) || null;
    const basePrice = draft.isManualServiceMode
      ? Number(draft.customServicePrice || 0)
      : Number(selectedTariff?.price || 0);
    const quantity = Math.max(1, Number(draft.serviceQuantity || 1));
    const discount = Math.max(0, Math.min(100, Number(draft.discountPercent || 0)));
    const unitPrice = Number((basePrice * (1 - discount / 100)).toFixed(2));
    const discountAmount = Number(((basePrice - unitPrice) * quantity).toFixed(2));
    const total = Number((unitPrice * quantity).toFixed(2));
    return {
      selectedTariff,
      basePrice,
      quantity,
      discount,
      unitPrice,
      discountAmount,
      total,
    };
  };

  const saveServiceDraft = async (draft) => {
    if (!order?.company_id) return;
    const pricing = getServicePricing(draft);
    const serviceName = draft.isManualServiceMode
      ? draft.customServiceName
      : (draft.customServiceName || pricing.selectedTariff?.name);

    if (!serviceName) return;
    if (!draft.isManualServiceMode && !pricing.selectedTariff) return;
    if (draft.isManualServiceMode && Number(draft.customServicePrice || 0) <= 0) return;

    await createCharge.mutateAsync({
      company_id: order.company_id,
      order_id: order.id,
      tariff_code: draft.isManualServiceMode ? 'custom_manual' : pricing.selectedTariff.code,
      quantity: pricing.quantity,
      unit_price: pricing.unitPrice,
      description: `${serviceName}${pricing.discount > 0 ? ` (скидка ${pricing.discount}%)` : ''}`,
    });

    removeServiceDraftRow(draft.localId);
  };
  const showItemSuggestions = isItemMenuOpen
    && !!availableProducts.length
    && !selectedProductId;
  const showConsumableSuggestions = isConsumableMenuOpen && !!availableConsumables.length;
  const itemsTabLabel = order.stage === 'receiving' ? 'Приемка / состав' : 'Состав';
  const canEditReceiving = isManager && order.status === 'active' && order.stage === 'receiving';
  const canManageItems = isManager && order.status === 'active';
  const canManageConsumables = isManager;
  const canManageCharges = isManager;
  const canManageShipments = (
    order.status === 'active'
    && ['supply', 'logistics'].includes(order.type)
    && order.stage === 'mp_shipping'
  );
  const acceptedTotal = Number(
    (order.items || []).reduce((sum, item) => sum + Number(item.ready_qty || 0), 0)
  );
  const shipmentBaseTotal = order.type === 'logistics' ? Number(totals.quantity || 0) : acceptedTotal;
  const shipmentsTotal = Number(
    (shipmentsDraft || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0)
  );
  const shipmentsAmountTotal = Number(
    (shipmentsDraft || []).reduce(
      (sum, row) => sum + Number(row.places_count || 0) * Number(row.unit_price || 0),
      0,
    )
  );
  const shippingRemain = Math.max(0, shipmentBaseTotal - shipmentsTotal);
  const currentStageIndex = stageList.indexOf(displayStage);
  const mobileUsesReferenceStage = ['in_transit', 'receiving', 'accepted', 'mp_shipping', 'done'].includes(order.stage);
  const canUseBoxesFlow = ['supply', 'logistics'].includes(order.type) && order.status === 'active';
  const showDesktopBoxesTab = canUseBoxesFlow || (orderBoxes?.boxes || []).length > 0 || (orderBoxes?.summary?.wb_boxes || 0) > 0;
  const primaryDraftShipment = shipmentsDraft[0] || null;
  const mobileTabs = [
    ['items', itemsTabLabel],
    ['consumables', 'Расходники'],
    ['charges', 'Услуги'],
    ['details', 'Параметры'],
    ['stages', 'История'],
  ];
  const orderMetaRows = [
    ['Тип заявки', order.type === 'supply' ? 'Поставка' : order.type === 'processing' ? 'Обработка' : 'Логистика'],
    ['Этап', STAGE_LABELS[displayStage] || displayStage],
    ['Создана', formatDateTime(order.created_at)],
    ...(order.comment ? [['Общее ТЗ', order.comment]] : []),
  ];
  const orderDetailRows = (
    order.type === 'supply'
      ? [
          ['Тип доставки', order.details?.delivery_type || null],
          ['Дата поставки', order.details?.delivery_date ? formatDateTime(order.details?.delivery_date) : null],
          ['Адрес', order.details?.pickup_address || null],
          ['Мест / вес', Number(order.details?.places_count || 0) > 0 || Number(order.details?.weight_kg || 0) > 0 ? `${fmt(order.details?.places_count || 0)} / ${order.details?.weight_kg || 0} кг` : null],
          ['Номер груза', order.details?.cargo_number || null],
          ['Контакт', order.details?.contact_name || null],
          ['Телефон', order.details?.contact_phone || null],
        ]
      : order.type === 'logistics'
        ? [
            ['Тип маршрута', order.details?.dest_type === 'transit' ? 'Транзит' : order.details?.dest_type === 'direct' ? 'Прямой' : null],
            ['Склад', order.details?.dest_warehouse || null],
            ['Перевозчик', order.marketplace_shipments?.[0]?.carrier_name || null],
            ['Дата отгрузки', order.details?.ship_date ? formatDateTime(order.details?.ship_date) : null],
            ['Пропуск', order.details?.pass_number || null],
          ]
        : [
            ['Обработка', 'По составу позиций заявки'],
          ]
  ).filter(([, value]) => value);
  const orderSummaryRows = [...orderMetaRows, ...orderDetailRows];
  const desktopGeneralKpis = order.type === 'logistics'
    ? [
        ['К отгрузке', fmt(shipmentBaseTotal || totals.quantity), 'var(--blue-400)', 'ед.'],
        ['Короба', fmt(orderBoxes?.summary?.wb_boxes || 0), 'var(--gray-900)', `${fmt(orderBoxes?.summary?.items_total || 0)} вложений`],
        ['Услуги', formatMoney(chargesSummary.total), 'var(--amber-400)', 'по заявке'],
        ['Брак', fmt(totals.defect), totals.defect > 0 ? 'var(--red-400)' : 'var(--gray-900)', totals.defect > 0 ? 'требует решения' : 'без брака'],
      ]
    : order.type === 'processing'
      ? [
          ['Позиции', fmt(order.items?.length || 0), 'var(--gray-900)', 'в составе'],
          ['Обработано', fmt(totals.ready), 'var(--teal-400)', 'подтверждено'],
          ['Услуги', formatMoney(chargesSummary.total), 'var(--amber-400)', 'по заявке'],
          ['Брак', fmt(totals.defect), totals.defect > 0 ? 'var(--red-400)' : 'var(--gray-900)', totals.defect > 0 ? 'требует решения' : 'без брака'],
        ]
      : [
          ['Заявлено', fmt(totals.quantity), 'var(--blue-400)', 'ед.'],
          ['Принято', fmt(totals.ready), 'var(--teal-400)', 'подтверждено'],
          ['Услуги', formatMoney(chargesSummary.total), 'var(--amber-400)', 'по заявке'],
          ['Брак', fmt(totals.defect), totals.defect > 0 ? 'var(--red-400)' : 'var(--gray-900)', totals.defect > 0 ? 'требует решения' : 'без брака'],
        ];
  const desktopSummaryRowsLeft = [
    ['Клиент', order.company_name],
    ['Этап', STAGE_LABELS[displayStage] || displayStage],
    ['Создана', formatDateTime(order.created_at)],
    ...(order.type === 'supply' && order.details?.delivery_date ? [['Дата поставки', formatDateTime(order.details.delivery_date)]] : []),
    ...(order.type === 'processing' ? [['Тип заявки', 'Обработка']] : []),
  ];
  const desktopSummaryRowsRight = [
    ...(order.type === 'logistics'
      ? [
          ['Склад / направление', order.details?.dest_warehouse || '—'],
          ['Перевозчик', order.marketplace_shipments?.[0]?.carrier_name || '—'],
          ['Мест / коробов', `${fmt(order.details?.places_count || 0)}`],
          ['Услуги', formatMoney(chargesSummary.total)],
          ...(order.comment ? [['Общее ТЗ', order.comment]] : []),
        ]
      : order.type === 'supply'
        ? [
            ['Тип доставки', order.details?.delivery_type || '—'],
            ['Адрес', order.details?.pickup_address || '—'],
            ['Мест / вес', Number(order.details?.places_count || 0) > 0 || Number(order.details?.weight_kg || 0) > 0 ? `${fmt(order.details?.places_count || 0)} / ${order.details?.weight_kg || 0} кг` : '—'],
            ...(order.comment ? [['Общее ТЗ', order.comment]] : []),
          ]
        : [
            ['Услуги', formatMoney(chargesSummary.total)],
            ['Брак', `${fmt(totals.defect)} шт.`],
            ...(order.comment ? [['Общее ТЗ', order.comment]] : []),
          ]),
  ];
  const getReceivingStatus = (item, draft) => {
    const quantity = Number(draft?.quantity ?? item.quantity ?? 0);
    const ready = Number(draft?.ready_qty ?? item.ready_qty ?? 0);
    const defect = Number(draft?.defect_qty ?? item.defect_qty ?? 0);

    if (defect > 0) {
      return {
        label: `брак ${fmt(defect)} шт.`,
        className: 'defect',
        qtyText: ready > 0 ? `${fmt(ready)} / ${fmt(quantity)}` : `${fmt(defect)} / ${fmt(quantity)}`,
      };
    }
    if (ready >= quantity && quantity > 0) {
      return {
        label: 'принято',
        className: 'ok',
        qtyText: fmt(ready),
      };
    }
    return {
      label: 'ожидает',
      className: 'pending',
      qtyText: ready > 0 ? `${fmt(ready)} / ${fmt(quantity)}` : '—',
    };
  };
  const receivingPreviewItems = (order.items || []).slice(0, 3);
  const mobileDarkMode = isMobileDarkTheme;
  const showMobileActionBar = isManager && order.status === 'active' && order.stage !== 'done';
  const handleQuickAccept = async () => {
    await moveStage.mutateAsync({ id, stage: 'accepted', note: stageNote || 'Приемка завершена' });
  };
  const mobilePrimaryAction = canEditReceiving
    ? {
        label: moveStage.isPending ? 'Принятие...' : 'Принять',
        onClick: handleQuickAccept,
        disabled: moveStage.isPending,
      }
    : {
        label: completeOrder.isPending ? 'Готово...' : 'Готово',
        onClick: handleComplete,
        disabled: completeOrder.isPending,
      };
  const mobileLeadAction = canEditReceiving
    ? {
        label: 'Брак',
        onClick: () => setActiveTab('items'),
        className: 'mobile-action-btn mobile-action-btn-warn',
      }
    : {
        label: 'Состав',
        onClick: () => setActiveTab('items'),
        className: 'mobile-action-btn mobile-action-btn-secondary',
      };
  const isReceivingDesktopStage = order.stage === 'receiving';
  const isMpDesktopStage = order.stage === 'mp_shipping';
  const isDoneDesktopStage = order.stage === 'done';
  const shouldUseReferenceDesktopStage = isReceivingDesktopStage || isMpDesktopStage || isDoneDesktopStage;
  const remainingQty = Math.max(0, totals.quantity - totals.ready - totals.defect);
  const latestStageEvents = [...(order.stages || [])].reverse().slice(0, 3);
  const doneStageEvent = [...(order.stages || [])].reverse().find((stage) => stage.stage === 'done') || null;
  const primaryShipment = order.marketplace_shipments?.[0] || null;
  const marketplaceLabels = { wb: 'Wildberries', ozon: 'Ozon', yandex: 'Яндекс.Маркет' };
  const marketplaceCardCode = detectMarketplaceCode(
    primaryDraftShipment?.marketplace,
    primaryShipment?.marketplace,
    primaryDraftShipment?.warehouse_name,
    primaryShipment?.warehouse_name,
    order.details?.dest_warehouse
  );
  const marketplaceCardBrand = marketplaceCardCode === 'wb'
    ? { short: 'WB', title: 'Wildberries', accent: 'linear-gradient(135deg, #cb11ab 0%, #7f77dd 100%)' }
    : marketplaceCardCode === 'ozon'
      ? { short: 'OZ', title: 'Ozon', accent: 'linear-gradient(135deg, #1677ff 0%, #56a3ff 100%)' }
      : marketplaceCardCode === 'yandex'
        ? { short: 'Я', title: 'Яндекс.Маркет', accent: 'linear-gradient(135deg, #ffcc00 0%, #ff9f0a 100%)' }
        : { short: 'MP', title: 'Маркетплейс', accent: 'linear-gradient(135deg, #0f766e 0%, #1d9e75 100%)' };
  const mpChecklistItems = [
    { label: `Поставка создана в ЛК ${marketplaceCardBrand.short}${primaryShipment?.mp_supply_id ? ` (${primaryShipment.mp_supply_id})` : ''}`, done: Boolean(primaryShipment?.mp_supply_id) },
    { label: 'Штрихкоды / стикеры подготовлены', done: Number(orderBoxes?.summary?.wb_boxes || 0) > 0 },
    { label: 'Короба распределены и сохранены', done: Number(draftBoxSummary.totalPacked || 0) > 0 },
    { label: 'Документы на перевозку оформлены', done: Boolean(order.documents?.length) },
  ];
  const desktopDocumentLinks = [
    ['Лист приёмки', 'acceptance_sheet'],
    ['Техническое задание', 'technical_task'],
    ['Счёт', 'invoice'],
    ['Акт', 'act'],
  ];
  const mobileReferenceKpis = (
    order.stage === 'receiving'
      ? [
          ['Заявлено', fmt(totals.quantity), 'blue', 'единиц'],
          ['Принято', fmt(totals.ready), 'green', 'подтверждено'],
          ['Осталось', fmt(remainingQty), 'amber', 'в работе'],
          ['Брак', fmt(totals.defect), 'red', 'требует разбора'],
        ]
      : order.stage === 'accepted'
        ? [
            ['Принято', fmt(totals.ready), 'green', 'подтверждено'],
            ['Брак', fmt(totals.defect), 'red', totals.defect > 0 ? 'требует решения' : 'без брака'],
            ['Ячейка', order.details?.cell_name || '—', 'purple', 'не назначена'],
            ['Услуги', chargeItems.length ? `${chargeItems.length}` : '—', 'amber', chargeItems.length ? 'начисления есть' : 'нет услуг'],
          ]
        : order.stage === 'mp_shipping'
          ? [
              ['К отгрузке', fmt(shipmentBaseTotal), 'blue', 'подготовлено'],
              ['Отгружено', fmt(shipmentsTotal), 'green', 'по поставкам'],
              ['Короба', fmt(orderBoxes?.summary?.wb_boxes || 0), 'purple', 'распределено'],
              ['К оплате', formatMoney(shipmentsAmountTotal), 'amber', 'логистика'],
            ]
          : order.stage === 'done'
            ? [
                ['Принято', fmt(totals.ready), 'green', 'итог'],
                ['Отгружено', fmt(shipmentsTotal || shipmentBaseTotal), 'blue', 'маркетплейс'],
                ['Брак', fmt(totals.defect), 'red', 'итог'],
                ['Услуги', formatMoney(chargesSummary.total), 'amber', 'начислено'],
              ]
            : [
                ['Позиций', fmt(order.items?.length || 0), '', 'в составе'],
                ['Заявлено', fmt(totals.quantity), 'blue', 'единиц'],
                ['Готово', fmt(totals.ready), 'green', 'подтверждено'],
                ['Брак', fmt(totals.defect), 'red', 'требует разбора'],
              ]
  );
  const mobileLatestItems = (order.items || []).slice(0, 2);
  const mobileDefectItems = (order.items || []).filter((item) => Number(item.defect_qty || 0) > 0).slice(0, 2);
  const mobileDetailTabRows = [...orderMetaRows, ...orderDetailRows];

  const renderHonestSignModeSwitch = (mobile = false) => (
    <div className={`order-detail-honest-mode-switch${mobile ? ' is-mobile' : ''}`}>
      <Button
        size="sm"
        variant={honestCodeMode === 'file' ? 'primary' : 'secondary'}
        className={mobile && honestCodeMode === 'file' ? 'mobile-btn-primary' : ''}
        onClick={() => setHonestCodeMode('file')}
      >
        Загрузить Excel
      </Button>
      <Button
        size="sm"
        variant={honestCodeMode === 'manual' ? 'primary' : 'secondary'}
        className={mobile && honestCodeMode === 'manual' ? 'mobile-btn-primary' : ''}
        onClick={() => setHonestCodeMode('manual')}
      >
        Ручной ввод по позиции
      </Button>
    </div>
  );

  const renderHonestSignFileImport = (mobile = false) => (
    <div className="order-detail-honest-file-import">
      <div className={mobile ? 'mobile-order-card-sub' : 'text-muted text-sm'}>
        Один Excel-файл на всю заявку: колонки <strong>Штрихкод</strong> и <strong>КИЗ</strong> обязательны.
      </div>
      <div className="order-detail-honest-file-fields">
        <input
          id={`honest-sign-file-input-${id}`}
          type="file"
          accept=".xlsx"
          onChange={(event) => setHonestCodeImportFile(event.target.files?.[0] || null)}
        />
        <label className="order-detail-honest-checkbox">
          <input
            type="checkbox"
            checked={honestCodeImportReplace}
            onChange={(event) => setHonestCodeImportReplace(event.target.checked)}
          />
          Заменить КИЗы только по совпавшим позициям из файла
        </label>
      </div>
      <div className="order-detail-honest-file-actions">
        <Button
          onClick={handleImportHonestCodesFile}
          disabled={!honestCodeImportFile || importOrderHonestCodesFile.isPending}
          className={mobile ? 'mobile-btn-primary' : ''}
        >
          {importOrderHonestCodesFile.isPending ? 'Загружаем Excel...' : 'Загрузить Excel'}
        </Button>
        <Button variant="secondary" onClick={handleDownloadHonestTemplate} className={mobile ? 'mobile-btn-secondary' : ''}>
          Скачать шаблон Excel
        </Button>
        <Button
          variant="secondary"
          onClick={handleDownloadHonestMismatchReport}
          disabled={downloadOrderHonestMismatchReport.isPending}
          className={mobile ? 'mobile-btn-secondary' : ''}
        >
          {downloadOrderHonestMismatchReport.isPending ? 'Готовим отчёт...' : 'Скачать отчёт по несовпадениям'}
        </Button>
      </div>
      {honestCodeFileImportResult && (
        <div className="surface-note order-detail-honest-import-result">
          <div className="order-detail-honest-import-title">Результат импорта</div>
          <div className={mobile ? 'mobile-order-card-sub' : 'text-muted text-sm'}>
            Обработано {fmt(honestCodeFileImportResult.processed_total || 0)} ·
            Загружено {fmt(honestCodeFileImportResult.imported_total || 0)} ·
            Ошибки структуры {fmt(honestCodeFileImportResult.structure_errors_total || 0)} ·
            Не сопоставлено {fmt(honestCodeFileImportResult.unmatched_total || 0)} ·
            Неоднозначно {fmt(honestCodeFileImportResult.ambiguous_total || 0)} ·
            Дубли {fmt(honestCodeFileImportResult.duplicate_total || 0)}
          </div>
          {honestCodeFileImportResult.issues?.length > 0 && (
            <div className="order-detail-honest-issues">
              <div className="order-detail-honest-issues-title">Проблемные строки</div>
              <div className="order-detail-honest-issues-list">
                {honestCodeFileImportResult.issues.slice(0, 12).map((issue, index) => (
                  <div key={`${issue.row_number || index}-${issue.code || ''}`} className={mobile ? 'mobile-order-card-sub' : 'text-muted text-sm'}>
                    Строка {issue.row_number || '—'}: {issue.reason}
                    {issue.barcode ? ` · ${issue.barcode}` : ''}
                  </div>
                ))}
                {honestCodeFileImportResult.issues.length > 12 && (
                  <div className={mobile ? 'mobile-order-card-sub' : 'text-muted text-sm'}>
                    И ещё {fmt(honestCodeFileImportResult.issues.length - 12)} строк с ошибками.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const savePickupDetails = async () => {
    await updateOrderDetails.mutateAsync({
      orderId: order.id,
      supply: {
        places_count: Number(pickupDetails.places_count || 0),
        weight_kg: Number(pickupDetails.weight_kg || 0),
        cargo_number: pickupDetails.cargo_number || null,
        pickup_address: pickupDetails.pickup_address || null,
        contact_name: pickupDetails.contact_name || null,
      },
    });
  };

  const addShipmentRow = () => {
    setShipmentsDraft((current) => [
      ...current,
        {
          marketplace: 'wb',
          warehouse_name: '',
          carrier_name: availableCarriers[0]?.name || '',
          mp_supply_id: '',
          ship_date: '',
          unload_date: '',
          shipment_status: '',
          places_count: 0,
          quantity: Math.max(1, Number(shippingRemain || shipmentBaseTotal || 1)),
          billing_rate: 'per_unit',
          unit_price: 0,
          note: '',
        },
      ]);
  };

  const removeShipmentRow = (idx) => {
    setShipmentsDraft((current) => current.filter((_, index) => index !== idx));
  };

  const updateShipmentRow = (idx, field, value) => {
    setShipmentsDraft((current) =>
      current.map((row, index) => {
        if (index !== idx) return row;
        const nextRow = { ...row, [field]: value };
        if (['marketplace', 'warehouse_name', 'billing_rate'].includes(field)) {
          nextRow.unit_price = resolveShipmentPrice(
            nextRow.warehouse_name || '',
            nextRow.billing_rate || 'per_unit'
          );
        }
        return nextRow;
      })
    );
  };

  const saveShipments = async () => {
    setShipmentError('');
    const prepared = shipmentsDraft
        .map((row) => ({
          marketplace: row.marketplace || 'wb',
          warehouse_name: (row.warehouse_name || '').trim(),
          carrier_name: (row.carrier_name || '').trim() || null,
          mp_supply_id: (row.mp_supply_id || '').trim() || null,
          ship_date: row.ship_date || null,
          unload_date: row.unload_date || null,
          shipment_status: row.shipment_status || null,
          places_count: Number(row.places_count || 0),
          quantity: Number(row.quantity || 0),
          unit_price: row.unit_price === '' || row.unit_price === null || row.unit_price === undefined
            ? null
            : Number(row.unit_price),
          billing_rate: row.billing_rate || 'per_unit',
          note: (row.note || '').trim() || null,
        }))
      .filter((row) => row.warehouse_name && row.quantity > 0);

    const total = prepared.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    if (total > shipmentBaseTotal) {
      setShipmentError(`Нельзя отгрузить больше доступного: доступно ${shipmentBaseTotal}, указано ${total}`);
      return;
    }
    try {
      await updateOrderShipments.mutateAsync({ orderId: order.id, shipments: prepared });
    } catch (error) {
      setShipmentError(error?.response?.data?.error || 'Не удалось сохранить распределение по складам');
    }
  };

  const addBoxDraft = () => {
    const nextBaseSequence = Math.max(
      Number(orderBoxes?.summary?.next_box_sequence || 1) - 1,
      ...boxesDraft.map((box) => Number(box.sequence_no || 0)),
    );
    const nextSeq = nextBaseSequence + 1;
    const firstShipment = wbShipmentOptions[0] || null;
    setBoxesDraft((current) => [
      ...current,
      {
        id: '',
        shipment_id: firstShipment?.id || '',
        marketplace: 'wb',
        warehouse_name: firstShipment?.warehouse_name || '',
        ship_date: firstShipment?.ship_date || '',
        box_code: `SW-${String(nextSeq).padStart(6, '0')}`,
        sequence_no: nextSeq,
        items: [],
      },
    ]);
  };

  const removeBoxDraft = (boxIndex) => {
    setBoxesDraft((current) => current.filter((_, index) => index !== boxIndex));
  };

  const updateBoxDraft = (boxIndex, field, value) => {
    setBoxesDraft((current) =>
      current.map((box, index) => {
        if (index !== boxIndex) return box;
        const next = { ...box, [field]: value };
        if (field === 'shipment_id') {
          const shipment = wbShipmentOptions.find((row) => row.id === value);
          next.warehouse_name = shipment?.warehouse_name || '';
          next.ship_date = shipment?.ship_date || '';
        }
        return next;
      })
    );
  };

  const addBoxItemDraft = (boxIndex) => {
    const defaultItem = boxItemOptions.find((item) => item.remaining > 0) || boxItemOptions[0] || null;
    setBoxesDraft((current) =>
      current.map((box, index) => {
        if (index !== boxIndex) return box;
        return {
          ...box,
          items: [
            ...(box.items || []),
            {
              order_item_id: defaultItem?.id || '',
              quantity: defaultItem?.id ? 1 : 0,
              expiry_date: '',
            },
          ],
        };
      })
    );
  };

  const updateBoxItemDraft = (boxIndex, itemIndex, field, value) => {
    setBoxesDraft((current) =>
      current.map((box, index) => {
        if (index !== boxIndex) return box;
        return {
          ...box,
          items: (box.items || []).map((item, idx) => (
            idx === itemIndex ? { ...item, [field]: value } : item
          )),
        };
      })
    );
  };

  const removeBoxItemDraft = (boxIndex, itemIndex) => {
    setBoxesDraft((current) =>
      current.map((box, index) => {
        if (index !== boxIndex) return box;
        return {
          ...box,
          items: (box.items || []).filter((_, idx) => idx !== itemIndex),
        };
      })
    );
  };

  const saveBoxes = async () => {
    setBoxError('');
    try {
      const prepared = boxesDraft.map((box, index) => ({
        id: box.id || undefined,
        shipment_id: box.shipment_id || null,
        marketplace: 'wb',
        warehouse_name: box.warehouse_name || null,
        ship_date: box.ship_date || null,
        box_code: String(box.box_code || '').trim(),
        sequence_no: Number(box.sequence_no || index + 1),
        items: (box.items || [])
          .map((item) => ({
            order_item_id: item.order_item_id,
            quantity: Number(item.quantity || 0),
            expiry_date: String(item.expiry_date || '').trim() || null,
          }))
          .filter((item) => item.order_item_id && item.quantity > 0),
      }));

      await saveOrderBoxes.mutateAsync({ orderId: order.id, boxes: prepared });
    } catch (error) {
      setBoxError(error?.response?.data?.error || 'Не удалось сохранить короба WB');
    }
  };

  const generateBoxes = async () => {
    setBoxError('');
    try {
      await generateOrderBoxes.mutateAsync({ orderId: order.id });
    } catch (error) {
      setBoxError(error?.response?.data?.error || 'Не удалось автосоздать короба WB');
    }
  };

  const downloadWbBoxesExport = async () => {
    setBoxError('');
    try {
      const response = await api.get(`/orders/${order.id}/boxes/wb-template-export`, { responseType: 'blob' });
      triggerBlobDownload(response.data, `wb_boxes_order_${order.number}.xlsx`);
    } catch (error) {
      setBoxError(error?.response?.data?.error || 'Не удалось скачать Excel для Wildberries');
    }
  };

  const handleOpenServerDocument = async (kind) => {
    try {
      await openOrderDocument(order.id, kind);
      setDocsOpen(false);
    } catch (error) {
      window.alert(error?.response?.data?.error || error?.message || 'Не удалось подготовить документ');
    }
  };
  const getDraftRemainingForItem = (orderItemId, currentBoxIndex = -1, currentItemIndex = -1) => {
    const itemMeta = boxItemOptions.find((row) => row.id === orderItemId);
    if (!itemMeta) return 0;
    const currentQty = Number(
      boxesDraft?.[currentBoxIndex]?.items?.[currentItemIndex]?.quantity || 0
    );
    const packedQty = Number(draftPackedByItem[orderItemId] || 0);
    return Math.max(0, Number(itemMeta.ready_qty || 0) - packedQty + currentQty);
  };

  return (
    <div>
      <div className={`mobile-only mobile-order-detail${mobileDarkMode ? ' mobile-order-detail-dark' : ' mobile-order-detail-light'}`}>
        <div className="mobile-order-toolbar">
          <button onClick={() => navigate('/orders')} className="mobile-order-icon-btn">←</button>
          <div className="mobile-order-toolbar-spacer" />
          <div className="docs-menu">
            <button type="button" className="mobile-order-icon-btn" onClick={() => setDocsOpen((v) => !v)}>⋯</button>
            {docsOpen && (
              <div className="docs-dropdown">
                <button className="docs-dropdown-item" onClick={() => handleOpenServerDocument('acceptance_sheet')}>Лист приемки</button>
                <button className="docs-dropdown-item" onClick={() => handleOpenServerDocument('technical_task')}>Техническое задание</button>
                <button className="docs-dropdown-item" onClick={() => handleOpenServerDocument('invoice')}>Счет на оплату</button>
                <button className="docs-dropdown-item" onClick={() => handleOpenServerDocument('act')}>Сформировать акт</button>
              </div>
            )}
          </div>
        </div>
        <div className={`mobile-order-hero${mobileDarkMode ? ' mobile-order-hero-dark' : ''}`}>
          <div className="mobile-order-topline">
            <div className="mobile-order-title-wrap">
              <div className="mobile-order-title">Заявка #{order.number}</div>
              <div className="mobile-order-subtitle">{order.company_name}</div>
            </div>
          </div>

          <div className="mobile-order-badges">
            <TypeBadge type={order.type} />
            <StageBadge stage={order.stage} />
          </div>

          <div className="mobile-order-stage-card">
            <div className="mobile-order-stage-label">Этап</div>
            <div className="mobile-order-stage-track">
              {stageList.map((stage, index) => {
                const isPast = index < currentStageIndex;
                const isCurrent = index === currentStageIndex;
                return (
                  <div key={stage} className={`mobile-order-stage-item${isPast ? ' done' : ''}${isCurrent ? ' active' : ''}`}>
                    <div className="mobile-order-stage-dot">
                      {isPast ? '✓' : ''}
                    </div>
                    <div className="mobile-order-stage-name">{STAGE_LABELS[stage]}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mobile-order-kpis">
          {mobileReferenceKpis.map(([label, value, tone, sub]) => (
            <div key={label} className={`mobile-order-kpi${mobileDarkMode ? ' mobile-order-kpi-dark' : ''}`}>
              <span className="mobile-order-kpi-label">{label}</span>
              <strong className={`mobile-order-kpi-value${tone ? ` mobile-order-kpi-value-${tone}` : ''}`}>{value}</strong>
              <span className="mobile-order-kpi-sub">{sub}</span>
            </div>
          ))}
        </div>

        {order.stage === 'in_transit' && (
          <>
            <div className={`mobile-order-section mobile-order-highlight${mobileDarkMode ? ' mobile-order-section-dark' : ''}`}>
              <div className="mobile-order-section-title">Информация о доставке</div>
              <div className="mobile-order-meta-list">
                <div className="mobile-order-meta-row"><span>Водитель</span><strong>{order.details?.contact_name || 'Назначается'}</strong></div>
                <div className="mobile-order-meta-row"><span>Ожидаем</span><strong>{order.details?.delivery_date ? formatDateTime(order.details?.delivery_date) : 'Время уточняется'}</strong></div>
                <div className="mobile-order-meta-row"><span>Груз</span><strong>{order.details?.cargo_number || 'Без номера'}</strong></div>
                <div className="mobile-order-meta-row"><span>Коробов / вес</span><strong>{fmt(order.details?.places_count || 0)} кор. · {order.details?.weight_kg || 0} кг</strong></div>
              </div>
            </div>
            <div className={`mobile-order-section${mobileDarkMode ? ' mobile-order-section-dark' : ''}`}>
              <div className="mobile-order-section-title">Подготовить зону</div>
              <div className="mobile-order-checklist">
                {[
                  { label: `Зона приёмки ${order.details?.cell_name || 'A3'} освобождена`, done: Boolean(order.details?.pickup_address) },
                  { label: 'Весы подготовлены', done: Number(order.details?.weight_kg || 0) > 0 },
                  { label: 'Сканер заряжен', done: false },
                ].map((item) => (
                  <div key={item.label} className={`mobile-order-checklist-item${item.done ? ' done' : ''}`}>
                    <span className="mobile-order-check-icon">{item.done ? '✓' : ''}</span>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {order.stage === 'receiving' && (
          <>
            <div className={`mobile-order-section${mobileDarkMode ? ' mobile-order-section-dark' : ''}`}>
              <div className="mobile-order-section-title">Сканер / ТСД</div>
              <div className="mobile-order-scan-shell">
                <div className="mobile-order-scan-frame">
                  <div className="mobile-order-scan-line" />
                </div>
                <div className="mobile-order-card-sub">Наведи камеру на штрихкод или введи артикул вручную</div>
                <input
                  value={honestCodeScanValue}
                  onChange={(event) => setHonestCodeScanValue(event.target.value)}
                  placeholder="Штрихкод / КИЗ / артикул"
                />
                <Button
                  size="sm"
                  className={mobileDarkMode ? 'mobile-btn-primary' : ''}
                  onClick={handleHonestCodeScan}
                  disabled={!honestCodeScanValue.trim() || scanOrderHonestCode.isPending}
                >
                  {scanOrderHonestCode.isPending ? 'Сканируем...' : 'Сканировать'}
                </Button>
              </div>
            </div>
            <div className={`mobile-order-section${mobileDarkMode ? ' mobile-order-section-dark' : ''}`}>
              <div className="mobile-order-section-title">Последние сканы</div>
              <div className="mobile-order-card-list">
                {mobileLatestItems.map((item) => {
                  const draft = itemsDraft[item.id];
                  const status = getReceivingStatus(item, draft);
                  return (
                    <div key={item.id} className={`mobile-order-stack-card${mobileDarkMode ? ' mobile-order-stack-card-dark' : ''}`}>
                      <div className="mobile-order-actions-row">
                        <div>
                          <div className="mobile-order-card-title">{item.article || item.product_name}</div>
                          <div className="mobile-order-card-sub">{item.product_name}</div>
                        </div>
                        <div className={`mobile-order-receiving-chip ${status.className}`}>{status.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {order.stage === 'accepted' && (
          <>
            <div className={`mobile-order-section${mobileDarkMode ? ' mobile-order-section-dark' : ''}`}>
              <div className="mobile-order-section-title">Добавить услуги</div>
              {chargeItems.length ? (
                <div className="mobile-order-service-list">
                  {chargeItems.slice(0, 3).map((charge) => (
                    <div key={charge.id} className="mobile-order-service-row">
                      <span>{charge.description || charge.tariff_code}</span>
                      <strong>{formatMoney(charge.total)}</strong>
                    </div>
                  ))}
                  <div className="mobile-order-service-row total">
                    <span>Итого услуг</span>
                    <strong>{formatMoney(chargesSummary.total)}</strong>
                  </div>
                </div>
              ) : (
                <div className="mobile-order-card-sub">Услуги пока не добавлены</div>
              )}
            </div>
            <div className={`mobile-order-section${mobileDarkMode ? ' mobile-order-section-dark' : ''}`}>
              <div className="mobile-order-section-title">Брак — решение</div>
              {mobileDefectItems.length ? (
                <div className="mobile-order-card-list">
                  {mobileDefectItems.map((item) => (
                    <div key={item.id} className={`mobile-order-stack-card${mobileDarkMode ? ' mobile-order-stack-card-dark' : ''}`}>
                      <div className="mobile-order-actions-row">
                        <div>
                          <div className="mobile-order-card-title">{item.product_name}</div>
                          <div className="mobile-order-card-sub">{item.comment || 'Требуется решение по позиции'}</div>
                        </div>
                        <strong className="mobile-order-kpi-value mobile-order-kpi-value-red">{fmt(item.defect_qty || 0)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mobile-order-card-sub">Брак по заявке не зафиксирован</div>
              )}
            </div>
          </>
        )}

        {order.stage === 'mp_shipping' && (
          <>
            <div className={`mobile-order-section mobile-order-highlight mobile-order-highlight-blue${mobileDarkMode ? ' mobile-order-section-dark' : ''}`}>
              <div className="mobile-order-card-title">
                Оформите поставку в личном кабинете {primaryShipment?.marketplace === 'wb' ? 'WB' : 'маркетплейса'}
              </div>
              <div className="mobile-order-card-sub">Получите стикеры, наклейте на коробки и подготовьте отгрузку водителю.</div>
            </div>
            <div className={`mobile-order-section${mobileDarkMode ? ' mobile-order-section-dark' : ''}`}>
              <div className="mobile-order-section-title">Поставка</div>
              <div className="mobile-order-meta-list">
                <div className="mobile-order-meta-row"><span>Маркетплейс</span><strong>{marketplaceLabels[primaryShipment?.marketplace] || 'Wildberries'}</strong></div>
                <div className="mobile-order-meta-row"><span>№ поставки</span><strong>{primaryShipment?.mp_supply_id || '—'}</strong></div>
                <div className="mobile-order-meta-row"><span>Склад</span><strong>{primaryShipment?.warehouse_name || 'Не выбран'}</strong></div>
                <div className="mobile-order-meta-row"><span>Дата отгрузки</span><strong>{primaryShipment?.ship_date ? formatDateTime(primaryShipment.ship_date) : '—'}</strong></div>
              </div>
            </div>
            <div className={`mobile-order-section${mobileDarkMode ? ' mobile-order-section-dark' : ''}`}>
              <div className="mobile-order-section-title">Чеклист отгрузки</div>
              <div className="mobile-order-checklist">
                {mpChecklistItems.map((item) => (
                  <div key={item.label} className={`mobile-order-checklist-item${item.done ? ' done' : ''}`}>
                    <span className="mobile-order-check-icon">{item.done ? '✓' : ''}</span>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {order.stage === 'done' && (
          <>
            <div className={`mobile-order-success-card${mobileDarkMode ? ' mobile-order-success-card-dark' : ''}`}>
              <div className="mobile-order-success-icon">✓</div>
              <div className="mobile-order-success-title">Заявка завершена</div>
              <div className="mobile-order-success-sub">
                {doneStageEvent?.created_at ? `${new Date(doneStageEvent.created_at).toLocaleDateString('ru-RU')} · ` : ''}
                Принято {fmt(totals.ready)} шт. · Брак {fmt(totals.defect)} шт.
              </div>
            </div>
            <div className={`mobile-order-section${mobileDarkMode ? ' mobile-order-section-dark' : ''}`}>
              <div className="mobile-order-section-title">Итог заявки</div>
              <div className="mobile-order-meta-list">
                <div className="mobile-order-meta-row"><span>Принято</span><strong>{fmt(totals.ready)} шт.</strong></div>
                <div className="mobile-order-meta-row"><span>Брак</span><strong>{fmt(totals.defect)} шт.</strong></div>
                <div className="mobile-order-meta-row"><span>Услуги</span><strong>{formatMoney(chargesSummary.total)}</strong></div>
                <div className="mobile-order-meta-row"><span>Длительность</span><strong>{latestStageEvents.length ? 'Завершена' : '—'}</strong></div>
              </div>
            </div>
          </>
        )}

        <div className={`mobile-order-tabs${mobileDarkMode ? ' mobile-order-tabs-dark' : ''}`}>
          {mobileTabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`mobile-order-tab${activeTab === key ? ' active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'items' && (
          <div className={`mobile-order-panel${mobileDarkMode ? ' mobile-order-panel-dark' : ''}`}>
            {canManageItems && (
              <div className={`mobile-order-stack-card${mobileDarkMode ? ' mobile-order-stack-card-dark' : ''}`}>
                <div className="mobile-order-card-title">Добавить товар</div>
                <div className="services-search-wrap" ref={itemDropdownRef}>
                  <label>Товар</label>
                  <input
                    value={itemQuery}
                    onFocus={() => setIsItemMenuOpen(true)}
                    onChange={(event) => {
                      setItemQuery(event.target.value);
                      setSelectedProductId('');
                      setSelectedProduct(null);
                      setIsItemMenuOpen(true);
                      setItemAddError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addItemToOrder();
                      }
                    }}
                    placeholder="Название, артикул или баркод"
                  />
                  {showItemSuggestions && (
                    <div className="services-search-dropdown">
                      {availableProducts.slice(0, 10).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="services-search-option"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            pickProduct(item);
                          }}
                          onClick={() => pickProduct(item)}
                        >
                          <div>
                            <div>{item.name}</div>
                            <div className="text-muted text-xs">
                              {item.article ? `${item.article} · ` : ''}
                              {item.barcode ? `Баркод ${item.barcode}` : 'Баркод не указан'}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {isItemMenuOpen && itemQuery.trim() && !availableProducts.length && (
                    <div className="services-search-dropdown">
                      <div className="services-search-option order-detail-search-empty">
                        Ничего не найдено
                      </div>
                    </div>
                  )}
                </div>
                <div className="mobile-order-inline-grid">
                  <Input
                    label="Кол-во"
                    type="number"
                    min="1"
                    className="compact-number-input"
                    value={itemQuantity}
                    onChange={(event) => setItemQuantity(event.target.value)}
                  />
                  <Button onClick={addItemToOrder} disabled={addOrderItem.isPending} className={mobileDarkMode ? 'mobile-btn-primary' : ''}>
                    {addOrderItem.isPending ? 'Добавляем...' : 'Добавить'}
                  </Button>
                </div>
                {itemAddError && <div className="alert alert-error order-detail-add-item-error">{itemAddError}</div>}
              </div>
            )}

            {/* ЧЗ-сканер (мобиль) */}
            {isManager && order.stage === 'receiving' && (
              czScannerOpen ? (
                <div className={`mobile-order-stack-card${mobileDarkMode ? ' mobile-order-stack-card-dark' : ''}`}>
                  <HonestSignScanner
                    orderId={id}
                    summary={order.honest_sign_summary}
                    onClose={() => setCzScannerOpen(false)}
                  />
                  {/* Загрузка Excel по-прежнему доступна */}
                  <div className="order-detail-mobile-honest-import">
                    <div className="order-detail-mobile-honest-import-title">
                      Загрузка КИЗов из Excel
                    </div>
                    {renderHonestSignFileImport(true)}
                    {honestCodeImportError && <div className="alert alert-error order-detail-mobile-honest-import-error">{honestCodeImportError}</div>}
                  </div>
                </div>
              ) : (
                <div className={`mobile-order-stack-card${mobileDarkMode ? ' mobile-order-stack-card-dark' : ''}`}>
                  <div className="order-detail-mobile-honest-head">
                    <div>
                      <div className="mobile-order-card-title">Честный знак</div>
                      <div className="mobile-order-card-sub order-detail-mobile-honest-sub">
                        {hasHonestSignActivity
                          ? `Отсканировано ${fmt(order.honest_sign_summary?.scanned_total || 0)} из ${fmt(order.honest_sign_summary?.expected_total || 0)}`
                          : 'Включите если для этой поставки нужен ЧЗ'}
                      </div>
                    </div>
                    <Button
                      onClick={() => setCzScannerOpen(true)}
                      className={mobileDarkMode ? 'mobile-btn-primary' : ''}
                    >
                      {hasHonestSignActivity ? 'Продолжить скан' : 'Включить ЧЗ'}
                    </Button>
                  </div>
                  {hasHonestSignActivity && (
                    <div className="order-detail-mobile-honest-stats">
                      {[
                        ['Принято',  order.honest_sign_summary?.scanned_total,  'var(--teal-400)'  ],
                        ['Дубли',    order.honest_sign_summary?.duplicate_total, 'var(--amber-400)' ],
                        ['Чужие',    order.honest_sign_summary?.unexpected_total,'var(--red-400)'   ],
                      ].map(([label, count, color]) => (
                        <div key={label} className="order-detail-mobile-honest-stat-card">
                          <div className="order-detail-mobile-honest-stat-value" style={{ color }}>{fmt(count || 0)}</div>
                          <div className="order-detail-mobile-honest-stat-label">{label}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}

            {canEditReceiving && (
              <div className="alert alert-info mb-4">
                Приемка заполняется здесь: внесите фактические значения в поля <strong>Готово</strong> и <strong>Брак</strong> по каждой позиции и сохраните строку.
              </div>
            )}
            {itemError && <div className="alert alert-error mb-4">{itemError}</div>}

            {!order.items?.length ? (
                <div className="surface-note">
                  <div className="font-medium">Товары не добавлены</div>
                  <div className="text-muted text-sm order-detail-empty-note-copy">
                    Добавьте товар по баркоду или названию, чтобы начать приёмку.
                  </div>
                </div>
            ) : (
              <>
                {canEditReceiving && (
                  <div className="mobile-receiving-shell">
                    <div className="mobile-receiving-head">
                      <div className="mobile-receiving-head-title">Товары</div>
                      <div className="mobile-receiving-head-count">{fmt(order.items.length)} позиций</div>
                    </div>
                    <div className="mobile-receiving-preview-list">
                      {receivingPreviewItems.map((item) => {
                        const draft = itemsDraft[item.id] || {
                          quantity: Number(item.quantity || 0),
                          ready_qty: Number(item.ready_qty || 0),
                          defect_qty: Number(item.defect_qty || 0),
                        };
                        const status = getReceivingStatus(item, draft);
                        return (
                          <div key={`preview-${item.id}`} className="mobile-receiving-preview-card">
                            {item.photo_url
                              ? <img src={item.photo_url} alt="" className="product-thumb" />
                              : <div className="product-thumb">📦</div>}
                            <div className="mobile-receiving-preview-info">
                              <div className="mobile-receiving-preview-name">{item.product_name}</div>
                              <div className="mobile-receiving-preview-sub">
                                арт. {item.article || '—'} · ост. {fmt(Number(item.available_qty || 0))}
                              </div>
                            </div>
                            <div className="mobile-receiving-preview-side">
                              <div className={`mobile-receiving-qty mobile-receiving-qty-${status.className}`}>{status.qtyText}</div>
                              <div className={`mobile-receiving-badge mobile-receiving-badge-${status.className}`}>{status.label}</div>
                            </div>
                          </div>
                        );
                      })}
                      {order.items.length > 3 && (
                        <div className="mobile-receiving-more">+ ещё {fmt(order.items.length - 3)} позиций</div>
                      )}
                    </div>
                  </div>
                )}

                <div className="mobile-order-card-list">
                  {order.items.map((item) => {
                    const draft = itemsDraft[item.id] || {
                      quantity: Number(item.quantity || 0),
                      ready_qty: Number(item.ready_qty || 0),
                      defect_qty: Number(item.defect_qty || 0),
                    };
                    const draftQuantity = Number((draft.quantity ?? item.quantity) || 0);
                    const status = getReceivingStatus(item, draft);
                    return (
                      <div
                        key={item.id}
                        className={`mobile-order-stack-card${mobileDarkMode ? ' mobile-order-stack-card-dark' : ''}${canEditReceiving ? ' mobile-order-stack-card-receiving' : ''}`}
                      >
                        {/* Шапка товара */}
                        <div className="order-detail-mobile-receiving-head">
                          {item.photo_url
                            ? <img src={item.photo_url} alt="" className="product-thumb order-detail-mobile-receiving-thumb" />
                            : <div className="product-thumb order-detail-mobile-receiving-thumb">📦</div>}
                          <div className="order-detail-mobile-receiving-copy">
                            <div className="order-detail-mobile-receiving-title">
                              {item.product_name}
                            </div>
                            <div className="order-detail-mobile-receiving-meta">
                              {item.article && <span>{item.article}</span>}
                              {item.color   && <span className="order-detail-mobile-receiving-meta-secondary">{item.color}</span>}
                              {item.size    && <span className="order-detail-mobile-receiving-meta-secondary">{item.size}</span>}
                            </div>
                          </div>
                          {canEditReceiving && (
                            <div className="order-detail-mobile-receiving-status">
                              <div className={`mobile-receiving-qty mobile-receiving-qty-${status.className} order-detail-mobile-receiving-qty`}>
                                {status.qtyText}
                              </div>
                              <div className={`mobile-receiving-badge mobile-receiving-badge-${status.className}`}>
                                {status.label}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Поля Заявлено / Готово / Брак в одну строку */}
                        <div className="order-detail-mobile-receiving-grid">
                          {[
                            { label:'Заявлено', field:'quantity',  val: canManageItems ? (draft.quantity ?? item.quantity) : item.quantity,   disabled:!canManageItems,   min:1 },
                            { label:'Готово',   field:'ready_qty', val: canEditReceiving ? draft.ready_qty : item.ready_qty,                    disabled:!canEditReceiving, min:0 },
                            { label:'Брак',     field:'defect_qty',val: canEditReceiving ? draft.defect_qty : item.defect_qty,                  disabled:!canEditReceiving, min:0, red: true },
                          ].map(({ label, field, val, disabled, min, red }) => (
                            <div key={field} className={`order-detail-mobile-receiving-field${red && Number(val) > 0 ? ' is-red' : ''}`}>
                              <div className="order-detail-mobile-receiving-field-label">{label}</div>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={min}
                                step="1"
                                value={val}
                                disabled={disabled}
                                onChange={e => {
                                  if (field === 'quantity' && canManageItems) handleDraftChange(item.id, 'quantity', e.target.value);
                                  if (field === 'ready_qty' && canEditReceiving) handleDraftChange(item.id, 'ready_qty', e.target.value);
                                  if (field === 'defect_qty' && canEditReceiving) handleDraftChange(item.id, 'defect_qty', e.target.value);
                                }}
                                className={`order-detail-mobile-receiving-input${red && Number(val) > 0 ? ' is-red' : ''}`}
                                style={{ opacity: disabled ? .55 : 1 }}
                              />
                            </div>
                          ))}
                        </div>

                        {isManager && honestCodeMode === 'manual' && (
                          <div className="order-detail-mobile-receiving-manual-honest">
                            <Input
                              label={`КИЗы / ЧЗ (${fmt(item.honest_sign_expected || 0)} загружено, ${fmt(item.honest_sign_scanned || 0)} отсканировано)`}
                              value={honestCodeDrafts[item.id] || ''}
                              onChange={(event) => updateHonestCodeDraft(item.id, event.target.value)}
                              placeholder="Вставьте список кодов: один код в строке"
                            />
                            <div className="mobile-order-actions-row order-detail-mobile-receiving-actions">
                              <div className="mobile-order-card-sub">
                                Осталось проверить: {fmt(item.honest_sign_remaining || 0)}
                              </div>
                              <Button
                                size="sm"
                                variant={mobileDarkMode ? 'primary' : 'secondary'}
                                className={mobileDarkMode ? 'mobile-btn-primary' : ''}
                                onClick={() => importHonestCodesForItem(item)}
                                disabled={importOrderHonestCodes.isPending}
                              >
                                {importOrderHonestCodes.isPending ? 'Загружаем...' : 'Загрузить КИЗы'}
                              </Button>
                            </div>
                          </div>
                        )}

                        {(canManageItems || canEditReceiving) && (
                          <div className="mobile-order-actions-row">
                            <Button variant="secondary" size="sm" className={mobileDarkMode ? 'mobile-btn-secondary' : ''} onClick={() => openItemEditModal(item)}>
                              Изм. строку
                            </Button>
                            <Button size="sm" variant={mobileDarkMode ? 'primary' : 'secondary'} className={mobileDarkMode ? 'mobile-btn-primary' : ''} onClick={() => saveItem(item)} disabled={updateItem.isPending}>
                              Сохранить
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'consumables' && (
          <div className={`mobile-order-panel${mobileDarkMode ? ' mobile-order-panel-dark' : ''}`}>
            {consumableError && <div className="alert alert-error mb-4">{consumableError}</div>}
            {canManageConsumables && (
              <div className={`mobile-order-stack-card${mobileDarkMode ? ' mobile-order-stack-card-dark' : ''}`}>
                <div className="mobile-order-card-title">Добавить расходник</div>
                <div className="services-search-wrap" ref={consumableDropdownRef}>
                  <label>Расходник</label>
                  <input
                    value={consumableQuery}
                    onFocus={() => setIsConsumableMenuOpen(true)}
                    onChange={(event) => {
                      setConsumableQuery(event.target.value);
                      setSelectedConsumableId('');
                      setIsConsumableMenuOpen(true);
                    }}
                    placeholder="Начните вводить расходник..."
                  />
                  {showConsumableSuggestions && (
                    <div className="services-search-dropdown">
                      {availableConsumables.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="services-search-option"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            pickConsumable(item);
                          }}
                        >
                          {item.name} {item.code ? `(${item.code})` : ''}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mobile-order-meta-grid">
                  <Input
                    label="Кол-во"
                    type="number"
                    min="1"
                    className="compact-number-input"
                    value={consumableQuantity}
                    onChange={(event) => setConsumableQuantity(event.target.value)}
                  />
                  <Input
                    label="Цена за ед."
                    type="number"
                    min="0"
                    step="0.01"
                    className="compact-number-input"
                    value={consumablePrice}
                    onChange={(event) => setConsumablePrice(event.target.value)}
                  />
                </div>
                <Input
                  label="Комментарий"
                  value={consumableComment}
                  onChange={(event) => setConsumableComment(event.target.value)}
                />
                <div className="mobile-order-actions-row">
                  <div className="mobile-order-card-sub">
                    {selectedConsumable ? `Выбрано: ${selectedConsumable.name}` : 'Выберите расходник из списка'}
                  </div>
                  <Button onClick={addConsumableToOrder} disabled={!selectedConsumableId || addOrderConsumable.isPending} className={mobileDarkMode ? 'mobile-btn-primary' : ''}>
                    Добавить
                  </Button>
                </div>
              </div>
            )}

            {!order.consumables?.length ? <Empty text="Расходники по заявке не добавлены" /> : (
              <div className="mobile-order-card-list">
                {order.consumables.map((item) => {
                  const draft = consumablesDrafts[item.id] || {
                    quantity: Number(item.quantity || 1),
                    unit_price: Number(item.unit_price || 0),
                    comment: item.comment || '',
                  };
                  return (
                    <div key={item.id} className={`mobile-order-stack-card${mobileDarkMode ? ' mobile-order-stack-card-dark' : ''}`}>
                      <div className="mobile-order-card-title">{item.name}</div>
                      <div className="mobile-order-card-sub">{item.category || 'Без категории'} · {item.unit || '—'}</div>
                      <div className="mobile-order-meta-grid">
                        <Input
                          label="Цена"
                          type="number"
                          min="0"
                          step="0.01"
                          className="compact-number-input"
                          value={canManageConsumables ? draft.unit_price : item.unit_price}
                          onChange={(event) => handleConsumableDraftChange(item.id, 'unit_price', event.target.value)}
                          disabled={!canManageConsumables}
                        />
                        <Input
                          label="Кол-во"
                          type="number"
                          min="1"
                          className="compact-number-input"
                          value={canManageConsumables ? draft.quantity : item.quantity}
                          onChange={(event) => handleConsumableDraftChange(item.id, 'quantity', event.target.value)}
                          disabled={!canManageConsumables}
                        />
                      </div>
                      <Input
                        label="Комментарий"
                        type="text"
                        className="compact-input"
                        value={canManageConsumables ? draft.comment : item.comment || '—'}
                        onChange={(event) => handleConsumableDraftChange(item.id, 'comment', event.target.value)}
                        disabled={!canManageConsumables}
                      />
                      <div className="mobile-order-actions-row">
                        <div className="mobile-order-sum">Сумма: {formatMoney(Number(draft.quantity || 0) * Number(draft.unit_price || 0))}</div>
                        {canManageConsumables && (
                          <div className="flex gap-2">
                            <Button size="sm" variant={mobileDarkMode ? 'primary' : 'secondary'} className={mobileDarkMode ? 'mobile-btn-primary' : ''} onClick={() => saveConsumable(item)} disabled={updateOrderConsumable.isPending}>Сохранить</Button>
                            <Button size="sm" variant="secondary" className={mobileDarkMode ? 'mobile-btn-secondary' : ''} onClick={() => deleteConsumable(item)} disabled={removeOrderConsumable.isPending}>Удалить</Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'charges' && (
          <div className={`mobile-order-panel${mobileDarkMode ? ' mobile-order-panel-dark' : ''}`}>
            {chargeError && <div className="alert alert-error mb-4">{chargeError}</div>}
            {chargeItems.length ? (
              <>
                <div className="mobile-order-kpis mobile-order-kpis-compact">
                  <div className="mobile-order-kpi">
                    <span className="mobile-order-kpi-label">Начислено</span>
                    <strong className="mobile-order-kpi-value">{formatMoney(chargesSummary.total)}</strong>
                  </div>
                  <div className="mobile-order-kpi">
                    <span className="mobile-order-kpi-label">Оплачено</span>
                    <strong className="mobile-order-kpi-value mobile-order-kpi-value-green">{formatMoney(chargesSummary.paid)}</strong>
                  </div>
                  <div className="mobile-order-kpi">
                    <span className="mobile-order-kpi-label">К оплате</span>
                    <strong className="mobile-order-kpi-value mobile-order-kpi-value-amber">{formatMoney(chargesSummary.pending)}</strong>
                  </div>
                </div>
                <div className="mobile-order-card-list">
                  {chargeItems.map((charge) => (
                    <div key={charge.id} className={`mobile-order-stack-card${mobileDarkMode ? ' mobile-order-stack-card-dark' : ''}`}>
                      <div className="mobile-order-card-title">{charge.description || charge.tariff_code}</div>
                      <div className="mobile-order-actions-row">
                        <Badge variant={charge.status === 'paid' ? 'green' : charge.status === 'confirmed' ? 'blue' : 'amber'}>
                          {charge.status === 'paid' ? 'Оплачено' : charge.status === 'confirmed' ? 'Подтверждено' : 'Ожидает'}
                        </Badge>
                        <div className="mobile-order-sum">{formatMoney(charge.total)}</div>
                      </div>
                      <div className="mobile-order-meta-grid">
                        <Input
                          label="Кол-во"
                          type="number"
                          min="1"
                          className="compact-number-input"
                          value={canManageCharges ? (chargeDrafts[charge.id]?.quantity ?? charge.quantity) : charge.quantity}
                          onChange={(event) => handleChargeDraftChange(charge.id, 'quantity', event.target.value)}
                          disabled={!canManageCharges}
                        />
                        <Input
                          label="Цена"
                          type="number"
                          min="0"
                          step="0.01"
                          className="compact-number-input"
                          value={canManageCharges ? (chargeDrafts[charge.id]?.unit_price ?? charge.unit_price) : charge.unit_price}
                          onChange={(event) => handleChargeDraftChange(charge.id, 'unit_price', event.target.value)}
                          disabled={!canManageCharges}
                        />
                      </div>
                      {canManageCharges && (
                        <div className="mobile-order-actions-row">
                          <Button size="sm" variant={mobileDarkMode ? 'primary' : 'secondary'} className={mobileDarkMode ? 'mobile-btn-primary' : ''} onClick={() => saveCharge(charge)} disabled={updateCharge.isPending}>
                            Сохранить
                          </Button>
                          <Button size="sm" variant="secondary" className={mobileDarkMode ? 'mobile-btn-secondary' : ''} onClick={() => deleteChargeRow(charge)} disabled={deleteCharge.isPending}>
                            Удалить
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <Empty text="По заявке пока нет начислений" />
            )}
          </div>
        )}

        {activeTab === 'details' && (
          <div className={`mobile-order-panel${mobileDarkMode ? ' mobile-order-panel-dark' : ''}`}>
            <div className={`mobile-order-stack-card${mobileDarkMode ? ' mobile-order-stack-card-dark' : ''}`}>
              <div className="mobile-order-section-title">Параметры и детали</div>
              <div className="mobile-order-meta-list">
                {mobileDetailTabRows.map(([label, value]) => (
                  <div key={`${label}-${value}`} className="mobile-order-meta-row">
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'stages' && (
          <div className={`mobile-order-panel${mobileDarkMode ? ' mobile-order-panel-dark' : ''}`}>
            {order.stages?.length ? (
              <div className="mobile-order-timeline">
                {order.stages.map((stage) => (
                  <div key={stage.id} className="mobile-order-timeline-item">
                    <div className="mobile-order-timeline-dot" />
                    <div className="mobile-order-timeline-body">
                      <div className="mobile-order-actions-row">
                        <StageBadge stage={stage.stage} />
                        <span className="text-xs text-muted">{formatDateTime(stage.created_at)}</span>
                      </div>
                      {stage.changed_by_name && <div className="mobile-order-card-sub">{stage.changed_by_name}</div>}
                      {stage.note && <div className="mobile-order-note">{stage.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty text="История этапов пуста" />
            )}
          </div>
        )}

        {showMobileActionBar && (
          <div className={`mobile-order-bottom-bar${canEditReceiving ? ' mobile-order-bottom-bar-receiving' : ''}`}>
            <button type="button" className={mobileLeadAction.className} onClick={mobileLeadAction.onClick}>
              {mobileLeadAction.label}
            </button>
            <button type="button" className="mobile-action-btn mobile-action-btn-secondary" onClick={() => setStageModal(true)}>
              Этап
            </button>
            <button
              type="button"
              className="mobile-action-btn mobile-action-btn-primary"
              onClick={mobilePrimaryAction.onClick}
              disabled={mobilePrimaryAction.disabled}
            >
              {mobilePrimaryAction.label}
            </button>
          </div>
        )}
      </div>

      <div className="desktop-only">

      {/* ── Топ-бар этапов ── */}
      <div className="order-detail-stage-strip">
        {stageList.map((stage, index) => {
          const curIdx = stageList.indexOf(displayStage);
          const past    = index < curIdx;
          const current = index === curIdx;
          const canClickStage = !current && !moveStage.isPending;
          return (
            <button
              key={stage}
              type="button"
              title={current ? STAGE_LABELS[stage] : `Перевести на этап «${STAGE_LABELS[stage]}»`}
              className={`order-detail-stage-tab${current ? ' is-current' : ''}${past ? ' is-past' : ''}`}
              disabled={!canClickStage}
              onClick={() => {
                handleTopStageChange(stage);
              }}
            >
              <div className="order-detail-stage-dot">
                {past ? '✓' : index + 1}
              </div>
              <span className="order-detail-stage-label">
                {STAGE_LABELS[stage]}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Breadcrumb + действия ── */}
      <div className="page-header order-detail-page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/orders')} className="btn btn-ghost btn-sm order-detail-back-link">← Заявки</button>
          <span className="order-detail-breadcrumb-sep">/</span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title order-detail-page-title">#{order.number} — {order.company_name}</h1>
              <TypeBadge type={order.type} />
              <StageBadge stage={displayStage} />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {isManager && order.status === 'active' && (
            <>
              {order.stage === 'receiving' && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setShowHonestSignTools(true);
                      setCzScannerOpen(true);
                      setActiveTab('items');
                    }}
                  >
                    ЧЗ
                  </Button>
                </>
              )}
              {showDesktopBoxesTab && (
                <Button variant="secondary" onClick={() => setActiveTab('boxes')}>Коробки</Button>
              )}
            </>
          )}
          <div className="docs-menu">
            <Button variant="secondary" onClick={() => setDocsOpen((v) => !v)}>Документы</Button>
            {docsOpen && (
              <div className="docs-dropdown">
                <button className="docs-dropdown-item" onClick={() => handleOpenServerDocument('acceptance_sheet')}>Лист приемки</button>
                <button className="docs-dropdown-item" onClick={() => handleOpenServerDocument('technical_task')}>Техническое задание</button>
                <button className="docs-dropdown-item" onClick={() => handleOpenServerDocument('invoice')}>Счет на оплату</button>
                <button className="docs-dropdown-item" onClick={() => handleOpenServerDocument('act')}>Сформировать акт</button>
              </div>
            )}
          </div>
          {isManager && order.status === 'active' && (
            <>
              <Button variant="secondary" onClick={() => setStageModal(true)}>Сменить этап</Button>
              {order.stage !== 'done' && (
                <Button onClick={handleComplete} disabled={completeOrder.isPending}>Завершить заявку</Button>
              )}
            </>
          )}
        </div>
      </div>

      {shouldUseReferenceDesktopStage && (
        <>
          {isReceivingDesktopStage && (
            <>
              <div className="stats-grid order-detail-stage-summary">
                <div className="stat-card order-detail-stage-stat-card">
                  <div className="stat-label">Заявлено</div>
                  <div className="stat-value order-detail-stage-stat-value is-blue">{fmt(totals.quantity)}</div>
                </div>
                <div className="stat-card order-detail-stage-stat-card">
                  <div className="stat-label">Принято</div>
                  <div className="stat-value order-detail-stage-stat-value is-teal">{fmt(totals.ready)}</div>
                  <div className="stat-sub order-detail-stage-stat-sub">
                    <span>Закрыто {fmt(totals.ready + totals.defect)} / {fmt(totals.quantity)} шт.</span>
                    <span>{totals.quantity > 0 ? Math.round(((totals.ready + totals.defect) / totals.quantity) * 100) : 0}%</span>
                  </div>
                  <div className="order-detail-stage-progress">
                    <div className="order-detail-stage-progress-fill" style={{ width: `${totals.quantity > 0 ? Math.min(100, ((totals.ready + totals.defect) / totals.quantity) * 100) : 0}%` }} />
                  </div>
                </div>
                <div className="stat-card order-detail-stage-stat-card">
                  <div className="stat-label">Осталось</div>
                  <div className="stat-value order-detail-stage-stat-value is-amber">{fmt(remainingQty)}</div>
                </div>
                <div className="stat-card order-detail-stage-stat-card">
                  <div className="stat-label">Брак</div>
                  <div className="stat-value order-detail-stage-stat-value is-red">{fmt(totals.defect)}</div>
                </div>
              </div>

              <div className="mb-5">
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">СКАНЕР / ТСД</span>
                    <Badge variant="green">Активен</Badge>
                  </div>
                  <div className="card-body order-detail-desktop-scanner-card">
                    <div className="order-detail-desktop-scanner-illustration">
                      <svg width="40" height="28" viewBox="0 0 88 62" fill="none">
                        {[10,16,22,28,34,40,46,52,58,64,70].map((x, index) => (
                          <rect key={x} x={x} y="8" width={index % 3 === 0 ? 3 : 2} height="44" rx="1" fill="var(--teal-400)" opacity={index % 2 === 0 ? 1 : .86} />
                        ))}
                      </svg>
                      <div className="order-detail-desktop-scanner-line" />
                    </div>
                    <div className="order-detail-desktop-scanner-copy">
                      <div className="order-detail-desktop-scanner-title">Сканировать штрихкод / ЧЗ</div>
                      <div className="order-detail-desktop-scanner-search">
                        <input
                          className="compact-input order-detail-desktop-scanner-input"
                          value={honestCodeScanValue}
                          onChange={(event) => setHonestCodeScanValue(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              handleHonestCodeScan();
                            }
                          }}
                          placeholder="Артикул, штрихкод или код маркировки..."
                        />
                        <Button size="sm" onClick={handleHonestCodeScan} disabled={scanOrderHonestCode.isPending}>
                          {scanOrderHonestCode.isPending ? 'Ищем...' : 'Найти'}
                        </Button>
                      </div>
                      <div className="text-muted text-sm order-detail-desktop-scanner-meta">
                        {honestCodeScanResult?.message
                          ? honestCodeScanResult.message
                          : `Отсканировано ${fmt(honestSignSummary.scanned_total || 0)} из ${fmt(honestSignSummary.expected_total || 0)} · дублей ${fmt(honestSignSummary.duplicate_total || 0)}`}
                      </div>
                      <div className="order-detail-desktop-scanner-import">
                        <input
                          ref={honestSignDesktopInputRef}
                          type="file"
                          accept=".xlsx"
                          className="order-detail-desktop-scanner-hidden-input"
                          onChange={(event) => setHonestCodeImportFile(event.target.files?.[0] || null)}
                        />
                        <div className="flex gap-2 order-detail-desktop-scanner-actions">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => honestSignDesktopInputRef.current?.click()}
                          >
                            {honestCodeImportFile ? 'Файл выбран' : 'Выбрать Excel'}
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleImportHonestCodesFile}
                            disabled={!honestCodeImportFile || importOrderHonestCodesFile.isPending}
                          >
                            {importOrderHonestCodesFile.isPending ? 'Загружаем...' : 'Загрузить'}
                          </Button>
                          <Button size="sm" variant="secondary" onClick={handleDownloadHonestTemplate}>
                            Шаблон
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={handleDownloadHonestMismatchReport}
                            disabled={downloadOrderHonestMismatchReport.isPending}
                          >
                            Отчёт
                          </Button>
                        </div>
                        <label className="order-detail-desktop-scanner-checkbox">
                          <input
                            type="checkbox"
                            checked={honestCodeImportReplace}
                            onChange={(event) => setHonestCodeImportReplace(event.target.checked)}
                          />
                          Заменить КИЗы только по совпавшим позициям
                        </label>
                        {honestCodeImportFile && (
                          <div className="text-xs text-muted">{honestCodeImportFile.name}</div>
                        )}
                        {honestCodeImportError && <div className="alert alert-error order-detail-desktop-scanner-error">{honestCodeImportError}</div>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {isMpDesktopStage && (
            <>
              <div className="stats-grid order-detail-stage-summary">
                <div className="stat-card">
                  <div className="stat-label">К отгрузке</div>
                  <div className="stat-value order-detail-stage-stat-value is-blue">{fmt(shipmentsTotal || shipmentBaseTotal)}</div>
                  <div className="stat-sub">шт.</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Маркетплейс</div>
                  <div className="stat-value order-detail-stage-stat-value is-dark">{primaryShipment ? (marketplaceLabels[primaryShipment.marketplace] || primaryShipment.marketplace?.toUpperCase()) : '—'}</div>
                  <div className="stat-sub">{primaryShipment?.warehouse_name || 'склад не выбран'}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Поставка WB</div>
                  <div className="stat-value order-detail-stage-stat-value is-purple">{primaryShipment?.mp_supply_id || '—'}</div>
                  <div className="stat-sub">{primaryShipment?.mp_supply_id ? 'создана в ЛК WB' : 'ещё не создана'}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Дата отгрузки</div>
                  <div className="stat-value order-detail-stage-stat-value is-amber">{primaryShipment?.ship_date ? new Date(primaryShipment.ship_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—'}</div>
                  <div className="stat-sub">{primaryShipment?.ship_date ? new Date(primaryShipment.ship_date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : 'время не указано'}</div>
                </div>
              </div>

              <div className="alert alert-info mb-4 order-detail-mp-alert">
                Оформите поставку в личном кабинете {marketplaceCardBrand.title}, получите стикеры, наклейте на коробки и подготовьте отгрузку водителю.
              </div>

              <div className="grid-2 mb-5">
                <div className="card">
                  <div className="card-body company-meta">
                    <div className="order-detail-marketplace-head">
                      <div className="order-detail-marketplace-badge" style={{ background: marketplaceCardBrand.accent }}>
                        {marketplaceCardBrand.short}
                      </div>
                      <div className="order-detail-marketplace-copy">
                        <div className="order-detail-marketplace-title">{marketplaceCardBrand.title} — {primaryShipment?.warehouse_name || primaryDraftShipment?.warehouse_name || 'склад'}</div>
                        <div className="text-muted order-detail-marketplace-subtitle">FBO-поставка · {primaryShipment?.warehouse_name || 'направление не задано'}</div>
                      </div>
                      <Badge variant="blue">{primaryShipment?.mp_supply_id ? 'Создана' : 'Черновик'}</Badge>
                    </div>
                    {canManageShipments ? (
                      <>
                        {!primaryDraftShipment ? (
                          <div className="flex justify-between items-center order-detail-marketplace-empty">
                            <div className="text-muted">Для этой заявки ещё не создана строка отгрузки маркетплейса.</div>
                            <Button size="sm" onClick={addShipmentRow}>Добавить поставку</Button>
                          </div>
                        ) : (
                          <>
                            <div className="order-detail-marketplace-form-grid">
                              <Input
                                label={`№ поставки ${marketplaceCardBrand.short}`}
                                value={primaryDraftShipment.mp_supply_id || ''}
                                onChange={(event) => updateShipmentRow(0, 'mp_supply_id', event.target.value)}
                              />
                              <Input
                                label="Дата бронирования"
                                type="datetime-local"
                                value={primaryDraftShipment.ship_date || ''}
                                onChange={(event) => updateShipmentRow(0, 'ship_date', event.target.value)}
                              />
                              <Select
                                label={`Склад ${marketplaceCardBrand.short}`}
                                value={primaryDraftShipment.warehouse_name || ''}
                                onChange={(event) => updateShipmentRow(0, 'warehouse_name', event.target.value)}
                              >
                                <option value="">Выберите склад</option>
                                {availableWarehouseGroups.map((group) => (
                                  <optgroup key={group.key} label={group.label}>
                                    {(group.items || []).map((warehouse) => (
                                      <option key={warehouse} value={warehouse}>{warehouse}</option>
                                    ))}
                                  </optgroup>
                                ))}
                              </Select>
                              <Select
                                label="Перевозчик"
                                value={primaryDraftShipment.carrier_name || ''}
                                onChange={(event) => updateShipmentRow(0, 'carrier_name', event.target.value)}
                              >
                                <option value="">Выберите перевозчика</option>
                                {availableCarriers.map((carrier) => (
                                  <option key={carrier.id || carrier.code || carrier.name} value={carrier.name}>
                                    {carrier.name}
                                  </option>
                                ))}
                              </Select>
                              <Input
                                label="Кол-во"
                                type="number"
                                min="1"
                                max={shipmentBaseTotal}
                                value={primaryDraftShipment.quantity}
                                onChange={(event) => updateShipmentRow(0, 'quantity', event.target.value)}
                              />
                              <Input
                                label="Мест"
                                type="number"
                                min="0"
                                value={primaryDraftShipment.places_count}
                                onChange={(event) => updateShipmentRow(0, 'places_count', event.target.value)}
                              />
                              <Input
                                label="Комментарий"
                                value={primaryDraftShipment.note || ''}
                                onChange={(event) => updateShipmentRow(0, 'note', event.target.value)}
                              />
                            </div>

                            {shipmentError && <div className="alert alert-error mb-3">{shipmentError}</div>}

                            <div className="flex justify-between items-center order-detail-marketplace-footer">
                              <div className="company-meta-row order-detail-marketplace-stickers-row">
                                <span>Стикеры</span>
                                <strong className="order-detail-marketplace-stickers-value">
                                  {Number(orderBoxes?.summary?.wb_boxes || 0) > 0 ? `Получены · ${fmt(orderBoxes?.summary?.wb_boxes || 0)} шт.` : 'Не подготовлены'}
                                </strong>
                              </div>
                              <Button onClick={saveShipments} disabled={updateOrderShipments.isPending}>
                                {updateOrderShipments.isPending ? 'Сохраняем...' : 'Сохранить поставку'}
                              </Button>
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        {[
                          [`№ поставки ${marketplaceCardBrand.short}`, primaryShipment?.mp_supply_id || '—'],
                          ['Перевозчик', primaryShipment?.carrier_name || '—'],
                          [`Склад ${marketplaceCardBrand.short}`, primaryShipment?.warehouse_name || '—'],
                          ['Дата бронирования', primaryShipment?.ship_date ? formatDateTime(primaryShipment.ship_date) : '—'],
                          ['Стикеры', Number(orderBoxes?.summary?.wb_boxes || 0) > 0 ? `Получены · ${fmt(orderBoxes?.summary?.wb_boxes || 0)} шт.` : 'Не подготовлены'],
                        ].map(([label, value]) => (
                          <div key={label} className="company-meta-row">
                            <span>{label}</span>
                            <strong className={String(label).startsWith('№ поставки') ? 'order-detail-marketplace-value-supply' : label === 'Стикеры' ? 'order-detail-marketplace-value-stickers' : ''}>{value}</strong>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header"><span className="card-title">Чеклист отгрузки</span></div>
                  <div className="card-body order-detail-checklist">
                    {mpChecklistItems.map((item) => (
                      <div key={item.label} className="order-detail-checklist-item">
                        <div className={`order-detail-checklist-mark${item.done ? ' is-done' : ''}`}>
                          {item.done ? '✓' : ''}
                        </div>
                        <div className={`order-detail-checklist-label${item.done ? ' is-done' : ''}`}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {isDoneDesktopStage && (
            <>
              <div className="card order-detail-done-card">
                <div className="card-body order-detail-done-card-body">
                  <div className="order-detail-done-card-mark">✓</div>
                  <div className="order-detail-done-card-title">Заявка #{order.number} полностью завершена</div>
                  <div className="order-detail-done-card-copy">
                    {doneStageEvent?.created_at ? `${new Date(doneStageEvent.created_at).toLocaleDateString('ru-RU')} · ` : ''}
                    Принято {fmt(order.type === 'logistics' ? totals.quantity : totals.ready)} шт. · Отгружено на WB {fmt(shipmentsTotal || shipmentBaseTotal)} шт. · Брак {fmt(totals.defect)} шт. · Итого {formatMoney(chargesSummary.total)}
                  </div>
                </div>
              </div>

              <div className="order-detail-done-grid">
                <div className="card">
                  <div className="card-header"><span className="card-title">ИТОГ</span></div>
                  <div className="card-body company-meta">
                    {[
                      ['Принято', `${fmt(totals.ready)} шт.`],
                      ['Отгружено на WB', `${fmt(shipmentsTotal || shipmentBaseTotal)} шт.`],
                      ['Брак', totals.defect > 0 ? `${fmt(totals.defect)} шт.` : '—'],
                      ['Ячейка', order.cell || order.defect_cell || '—'],
                    ].map(([label, value]) => (
                      <div key={label} className="company-meta-row">
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header"><span className="card-title">УВЕДОМЛЕНИЯ КЛИЕНТУ</span></div>
                  <div className="card-body order-detail-stage-events">
                    {latestStageEvents.map((stage) => (
                      <div key={stage.id} className="order-detail-stage-event-row">
                        <div className={`order-detail-stage-event-dot${stage.stage === 'done' ? ' is-done' : ''}`} />
                        <div className="order-detail-stage-event-copy">
                          <div className="order-detail-stage-event-title">{STAGE_LABELS[stage.stage] || stage.stage}</div>
                          <div className="text-muted order-detail-stage-event-note">{stage.note || 'Уведомление отправлено клиенту'}</div>
                        </div>
                        <div className="text-muted order-detail-stage-event-time">{new Date(stage.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header"><span className="card-title">ДОКУМЕНТЫ</span></div>
                  <div className="card-body order-detail-docs-list">
                    {desktopDocumentLinks.map(([label, kind]) => (
                      <div key={kind} className="order-detail-doc-row">
                        <div className="order-detail-doc-row-title">{label}</div>
                        <button onClick={() => handleOpenServerDocument(kind)} className="order-detail-doc-download-btn">
                          Скачать PDF
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {!shouldUseReferenceDesktopStage && (
      <>
      <div className="stats-grid order-detail-general-kpis">
        {desktopGeneralKpis.map(([label, value, color, sub]) => (
          <div key={label} className="stat-card order-detail-general-kpi-card">
            <div className="stat-label">{label}</div>
            <div className={`stat-value order-detail-general-kpi-value${label === 'Услуги' ? ' is-services' : ''}`} style={{ color }}>{value}</div>
            <div className="stat-sub">{sub}</div>
          </div>
        ))}
      </div>

      {canManageItems && (
        <div className="card order-detail-compact-card order-detail-add-item-card">
          <div className="card-header">
            <span className="card-title">Добавить товар в заявку</span>
          </div>
          <div className="card-body order-detail-compact-body">
            <div className="services-editor order-detail-add-item-editor order-detail-add-item-editor-shell">
              <div
                className="services-editor-grid order-detail-add-item-grid"
              >
                <div className="services-search-wrap" ref={itemDropdownRef}>
                  <label>Товар</label>
                  <input
                    value={itemQuery}
                    onFocus={() => setIsItemMenuOpen(true)}
                    onChange={(event) => {
                      setItemQuery(event.target.value);
                      setSelectedProductId('');
                      setSelectedProduct(null);
                      setIsItemMenuOpen(true);
                      setItemAddError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addItemToOrder();
                      }
                    }}
                    placeholder="Начните вводить название, артикул или баркод..."
                  />
                  {showItemSuggestions && (
                    <div className="services-search-dropdown">
                      {availableProducts.slice(0, 10).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="services-search-option"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              pickProduct(item);
                            }}
                            onClick={() => pickProduct(item)}
                          >
                          <div>
                            <div>{item.name}</div>
                            <div className="text-muted text-xs">
                              {item.article ? `${item.article} · ` : ''}
                              {item.barcode ? `Баркод ${item.barcode}` : 'Баркод не указан'}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {isItemMenuOpen && itemQuery.trim() && !availableProducts.length && (
                      <div className="services-search-dropdown">
                      <div className="services-search-option order-detail-search-empty">
                        Ничего не найдено
                      </div>
                    </div>
                  )}
                </div>

                <Input
                  label="Кол-во"
                  type="number"
                  min="1"
                  className="compact-number-input"
                  value={itemQuantity}
                  onChange={(event) => setItemQuantity(event.target.value)}
                />

                <div className="flex items-end order-detail-add-item-action">
                  <Button size="sm" onClick={addItemToOrder} disabled={addOrderItem.isPending}>
                    {addOrderItem.isPending ? 'Добавляем...' : 'Добавить'}
                  </Button>
                </div>
              </div>
              {itemAddError && <div className="alert alert-error order-detail-add-item-error">{itemAddError}</div>}
            </div>
            <div className="text-muted text-sm order-detail-add-item-help">
              Можно добавить товар по названию, артикулу или баркоду. Если отсканирован баркод и найден один товар, он подставится в заявку.
            </div>
          </div>
        </div>
      )}

      {/* ── Инфо-подсказка по этапу ── */}
      {order.stage === 'accepted' && (
        <div className="order-detail-stage-info order-detail-stage-info-accepted">
          <span className="order-detail-stage-info-icon">ℹ</span>
          <span>Товар принят и размещён на складе. Следующий шаг — оформить отгрузку на маркетплейс (этап МП).</span>
        </div>
      )}
      {order.stage === 'receiving' && (
        <div className="order-detail-stage-info order-detail-stage-info-receiving">
          <span className="order-detail-stage-info-icon">📦</span>
          <span>Заявка на приёмке. Заполните фактические количества по каждой позиции и сохраните.</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="card">
          <div className="card-header"><span className="card-title">Параметры заявки</span></div>
          <div className="card-body company-meta">
            {desktopSummaryRowsLeft.map(([label, value]) => (
              <div key={label} className="company-meta-row"><span>{label}</span><strong>{value}</strong></div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Детали</span></div>
          <div className="card-body company-meta">
            {desktopSummaryRowsRight.map(([label, value]) => (
              <div key={label} className="company-meta-row"><span>{label}</span><strong>{value}</strong></div>
            ))}
          </div>
        </div>
      </div>
      </>
      )}

      {/* Нижний sticky action-bar */}
      {isManager && order.status === 'active' && (
        <div className="order-detail-sticky-bar">
          <div />
          <div className="order-detail-sticky-actions">
            {order.stage === 'accepted' && (
              <Button onClick={() => setMpModal?.(true)}>Оформить отгрузку МП →</Button>
            )}
            {order.stage !== 'done' && (
              <Button onClick={handleComplete} disabled={completeOrder.isPending}>
                {completeOrder.isPending ? 'Завершаем...' : 'Завершить заявку'}
              </Button>
            )}
          </div>
        </div>
      )}

      {canManageShipments && (
        <div className="card order-detail-shipment-card">
          <div className="card-header">
            <span className="card-title">Отгрузка на склады маркетплейсов</span>
          </div>
          <div className="card-body">
            <div className="alert alert-info mb-3">
              Принято к отгрузке: <strong>{fmt(shipmentBaseTotal)}</strong> ед. Распределено: <strong>{fmt(shipmentsTotal)}</strong> ед.
              {shippingRemain > 0 ? <> · Осталось распределить: <strong>{fmt(shippingRemain)}</strong> ед.</> : null}
              {' '}· Сумма отгрузок: <strong>{formatMoney(shipmentsAmountTotal)}</strong>
            </div>

            {shipmentError && <div className="alert alert-error mb-3">{shipmentError}</div>}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Маркетплейс</th>
                    <th>Склад</th>
                    <th>Перевозчик</th>
                    <th>Тариф</th>
                    <th>Дата выгрузки</th>
                    <th>Статус</th>
                    <th style={{ textAlign: 'right' }}>Мест</th>
                    <th style={{ textAlign: 'right' }}>Кол-во</th>
                    <th style={{ textAlign: 'right' }}>Цена</th>
                    <th style={{ textAlign: 'right' }}>Сумма</th>
                    <th>Комментарий</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {shipmentsDraft.length === 0 && (
                    <tr>
                      <td colSpan={12} className="text-muted order-detail-empty-table-cell">
                        Пока нет отгрузок на склады МП
                      </td>
                    </tr>
                  )}
                {shipmentsDraft.map((row, idx) => {
                    const shipmentPrice = Number(row.unit_price || 0);
                    const shipmentRowTotal = Number(row.places_count || 0) * shipmentPrice;
                    return (
                      <tr key={`shipment-${idx}`}>
                        <td>
                          <select
                            style={{ width: 92, minWidth: 92 }}
                            value={row.marketplace}
                            onChange={(event) => updateShipmentRow(idx, 'marketplace', event.target.value)}
                          >
                            <option value="wb">WB</option>
                            <option value="ozon">Ozon</option>
                            <option value="yandex">Яндекс</option>
                          </select>
                          </td>
                          <td>
                            <select
                              className="compact-input"
                              style={{ width: 170, minWidth: 170 }}
                              value={row.warehouse_name}
                              onChange={(event) => updateShipmentRow(idx, 'warehouse_name', event.target.value)}
                            >
                              <option value="">Выберите склад</option>
                              {availableWarehouseGroups.map((group) => (
                                <optgroup key={group.key} label={group.label}>
                                  {(group.items || []).map((warehouse) => (
                                    <option key={warehouse} value={warehouse}>{warehouse}</option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              className="compact-input"
                              style={{ width: 144, minWidth: 144 }}
                              value={row.carrier_name || ''}
                              onChange={(event) => updateShipmentRow(idx, 'carrier_name', event.target.value)}
                            >
                              <option value="">Выберите перевозчика</option>
                              {availableCarriers.map((carrier) => (
                                <option key={carrier.id || carrier.code || carrier.name} value={carrier.name}>{carrier.name}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                          <select
                            className="compact-input"
                            style={{ width: 98, minWidth: 98 }}
                            value={row.billing_rate || 'per_unit'}
                            onChange={(event) => updateShipmentRow(idx, 'billing_rate', event.target.value)}
                          >
                              <option value="per_unit">За короб</option>
                              <option value="per_pallet">За палет</option>
                          </select>
                          </td>
                        <td>
                          <input
                            type="datetime-local"
                            className="compact-input"
                            style={{ width: 156, minWidth: 156 }}
                            value={row.unload_date || ''}
                            min={toDateTimeLocalMinValue()}
                            onChange={(event) => updateShipmentRow(idx, 'unload_date', event.target.value)}
                          />
                        </td>
                        <td>
                          <select
                            className="compact-input"
                            style={{
                              width: 88,
                              minWidth: 88,
                              color: resolveShipmentStatus(row) === 'delivered' ? 'var(--teal-600)' : 'var(--amber-600)',
                              fontWeight: 700,
                            }}
                            value={row.shipment_status || ''}
                            onChange={(event) => updateShipmentRow(idx, 'shipment_status', event.target.value || null)}
                          >
                            <option value="">Авто</option>
                            <option value="delivered">Сдан</option>
                            <option value="pending">Не сдан</option>
                          </select>
                        </td>
                        <td className="text-right">
                          <input
                            type="number"
                            min="0"
                            className="table-number-input"
                            style={{ width: 64, minWidth: 64, maxWidth: 64 }}
                            value={row.places_count}
                            onChange={(event) => updateShipmentRow(idx, 'places_count', event.target.value)}
                          />
                        </td>
                        <td className="text-right">
                          <input
                            type="number"
                            min="1"
                            max={shipmentBaseTotal}
                            className="table-number-input"
                            style={{ width: 72, minWidth: 72, maxWidth: 72 }}
                            value={row.quantity}
                            onChange={(event) => updateShipmentRow(idx, 'quantity', event.target.value)}
                          />
                        </td>
                        <td className="text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="table-number-input"
                            style={{ width: 72, minWidth: 72, maxWidth: 72 }}
                            value={row.unit_price}
                            onChange={(event) => updateShipmentRow(idx, 'unit_price', event.target.value)}
                          />
                        </td>
                        <td className="text-right">
                          <strong>{formatMoney(shipmentRowTotal)}</strong>
                        </td>
                        <td>
                          <input
                            className="compact-input"
                            style={{ width: 124, minWidth: 124 }}
                            value={row.note || ''}
                            onChange={(event) => updateShipmentRow(idx, 'note', event.target.value)}
                            placeholder="Комментарий"
                          />
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() => removeShipmentRow(idx)}
                            title="Удалить строку"
                            aria-label="Удалить строку"
                            className="order-detail-remove-icon-btn"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between mt-3 order-detail-shipment-footer">
              <Button variant="secondary" size="sm" onClick={addShipmentRow}>+ Добавить склад</Button>
              <Button onClick={saveShipments} disabled={updateOrderShipments.isPending}>
                {updateOrderShipments.isPending ? 'Сохраняем...' : 'Сохранить распределение'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {canManageShipments && activeTab !== 'boxes' && (
        <div className="card order-detail-boxes-card">
          <div className="card-header">
            <span className="card-title">Короба WB</span>
          </div>
          <div className="card-body">
            <div className="alert alert-info mb-3">
              Коробов WB: <strong>{fmt(orderBoxes?.summary?.wb_boxes || 0)}</strong> из <strong>{fmt(orderBoxes?.summary?.wb_target_boxes || 0)}</strong>
              {' '}· Разложено: <strong>{fmt(draftBoxSummary.totalPacked || 0)}</strong> ед.
              {' '}· Осталось: <strong>{fmt(draftBoxSummary.totalRemaining || 0)}</strong> ед.
            </div>

            {boxError && <div className="alert alert-error mb-3">{boxError}</div>}

            <div className="flex justify-between items-center mb-3 order-detail-boxes-toolbar">
              <div className="text-sm text-muted">
                Используйте латиницу для ШК короба. Формат по умолчанию: <strong>SW-000001</strong>.
              </div>
              <div className="flex gap-2 order-detail-boxes-toolbar-actions">
                <Button variant="secondary" size="sm" onClick={addBoxDraft}>+ Добавить короб</Button>
                <Button variant="secondary" size="sm" onClick={generateBoxes} disabled={generateOrderBoxes.isPending}>
                  {generateOrderBoxes.isPending ? 'Создаём...' : 'Автосоздать короба'}
                </Button>
                <Button variant="secondary" size="sm" onClick={downloadWbBoxesExport}>Скачать Excel WB</Button>
                <Button size="sm" onClick={saveBoxes} disabled={saveOrderBoxes.isPending}>
                  {saveOrderBoxes.isPending ? 'Сохраняем...' : 'Сохранить короба'}
                </Button>
              </div>
            </div>

            {boxesDraft.length === 0 ? (
                <div className="surface-note">
                  <div className="font-medium">Короба ещё не созданы</div>
                <div className="text-muted text-sm order-detail-empty-note-copy">
                  Укажите места в строках отгрузки WB и нажмите «Автосоздать короба», либо добавьте короб вручную.
                </div>
              </div>
            ) : (
              <div className="order-detail-boxes-draft-list">
                {boxesDraft.map((box, boxIndex) => (
                  <div key={box.id || `box-${boxIndex}`} className="surface-note order-detail-box-draft-card">
                    <div className="flex justify-between items-start order-detail-box-draft-head">
                      <div className="order-detail-box-draft-grid">
                        <Input
                          label="ШК короба"
                          value={box.box_code}
                          onChange={(event) => updateBoxDraft(boxIndex, 'box_code', event.target.value)}
                        />
                        <div>
                          <label>Строка отгрузки WB</label>
                          <select
                            className="compact-input"
                            value={box.shipment_id || ''}
                            onChange={(event) => updateBoxDraft(boxIndex, 'shipment_id', event.target.value)}
                          >
                            <option value="">Без привязки</option>
                            {wbShipmentOptions.map((shipment) => (
                              <option key={shipment.id} value={shipment.id}>{shipment.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => removeBoxDraft(boxIndex)}>Удалить короб</Button>
                    </div>

                    <div className="order-detail-box-draft-items">
                      {(box.items || []).map((item, itemIndex) => {
                        const itemMeta = boxItemOptions.find((row) => row.id === item.order_item_id);
                        const currentRemaining = getDraftRemainingForItem(item.order_item_id, boxIndex, itemIndex);
                        return (
                          <div
                            key={`${box.id || boxIndex}-${itemIndex}`}
                            className="order-detail-box-draft-item-row"
                          >
                            <div>
                              <label>Товар</label>
                              <select
                                className="compact-input"
                                value={item.order_item_id || ''}
                                onChange={(event) => updateBoxItemDraft(boxIndex, itemIndex, 'order_item_id', event.target.value)}
                              >
                                <option value="">Выберите товар</option>
                                {boxItemOptions.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.label} · осталось {fmt(getDraftRemainingForItem(option.id, boxIndex, itemIndex))}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <Input
                              label="Кол-во"
                              type="number"
                              min="1"
                              className="compact-number-input"
                              value={item.quantity}
                              onChange={(event) => updateBoxItemDraft(boxIndex, itemIndex, 'quantity', event.target.value)}
                            />
                            <Input
                              label="Срок годности"
                              value={item.expiry_date || ''}
                              onChange={(event) => updateBoxItemDraft(boxIndex, itemIndex, 'expiry_date', event.target.value)}
                              placeholder="ДД.ММ.ГГГГ"
                            />
                            <Button variant="secondary" size="sm" onClick={() => removeBoxItemDraft(boxIndex, itemIndex)}>Убрать</Button>
                            {itemMeta && (
                              <div className="text-xs text-muted order-detail-box-draft-item-meta">
                                Принято к отгрузке: {fmt(itemMeta.ready_qty)} · ещё не разложено: {fmt(currentRemaining)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex justify-between items-center order-detail-box-draft-footer">
                      <div className="text-sm text-muted">
                        В коробе: <strong>{fmt((box.items || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0))}</strong> ед.
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => addBoxItemDraft(boxIndex)}>+ Добавить товар</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card order-detail-tabs-card">
        <div className="tab-bar">
          {[
            ['items', itemsTabLabel],
            ...(showDesktopBoxesTab ? [['boxes', 'Коробки']] : []),
            ['consumables', 'Расходники'],
            ['charges', 'Оказанные услуги'],
            ['stages', 'История этапов'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`tab-btn${activeTab === key ? ' active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="card-body">
          {activeTab === 'items' && (
            <>
              {canEditReceiving && (
                <div className="order-detail-receiving-note">
                  <div className="order-detail-receiving-note-copy">
                    <strong className="order-detail-receiving-note-strong">Приёмка активна:</strong> вносите фактические значения в
                    <strong className="order-detail-receiving-note-strong is-ready"> Готово</strong> и
                    <strong className="order-detail-receiving-note-strong is-defect"> Брак</strong>.
                  </div>
                </div>
              )}
              {canEditReceiving && (
                <div className="alert alert-info mb-4">
                  Приемка заполняется здесь: внесите фактические значения в поля <strong>Готово</strong> и <strong>Брак</strong> по всем позициям и нажмите «Сохранить всё».
                </div>
              )}
              {canEditReceiving && (order.items?.length || 0) > 0 && (
                <div className="order-detail-receiving-actions">
                  {dirtyReceivingItemsCount > 0 && (
                    <div className="text-sm text-muted">
                      Изменено строк: <strong>{fmt(dirtyReceivingItemsCount)}</strong>
                    </div>
                  )}
                  <Button
                    onClick={saveAllItems}
                    disabled={updateItem.isPending || dirtyReceivingItemsCount === 0}
                  >
                    {updateItem.isPending ? 'Сохраняем...' : 'Сохранить всё'}
                  </Button>
                </div>
              )}
              {itemError && <div className="alert alert-error mb-4">{itemError}</div>}
              {(order.items?.length || 0) === 0 ? (
                <div className="surface-note">
                  <div className="font-medium">Товары не добавлены</div>
                  <div className="text-muted text-sm order-detail-empty-note-copy">
                    Добавьте товар по баркоду или названию, чтобы начать приёмку и заполнить поля «Готово» и «Брак».
                  </div>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Товар</th>
                        <th>Баркод</th>
                        <th>Артикул</th>
                        <th>Цвет</th>
                        <th>Размер</th>
                        <th className="order-detail-table-head-num">Заявлено</th>
                        <th className="order-detail-table-head-num">Готово</th>
                        <th className="order-detail-table-head-num">Брак</th>
                        {isManager && shouldShowHonestSignTools && honestCodeMode === 'manual' && <th className="order-detail-honest-col-head">КИЗ / ЧЗ</th>}
                        {canManageItems && !canEditReceiving && <th className="order-detail-table-head-action" />}
                      </tr>
                    </thead>
                    <tbody>
                      {order.items?.map((item) => {
                        const draft = itemsDraft[item.id] || {
                          quantity: Number(item.quantity || 0),
                          ready_qty: Number(item.ready_qty || 0),
                          defect_qty: Number(item.defect_qty || 0),
                        };
                        const draftQuantity = Number((draft.quantity ?? item.quantity) || 0);
                        return (
                          <tr key={item.id}>
                            <td>
                              <div className="flex items-center gap-2">
                                {item.photo_url
                                  ? <img src={item.photo_url} alt="" className="product-thumb" />
                                  : <div className="product-thumb">📦</div>}
                                <div>
                                  <div className="order-detail-item-title">{item.product_name}</div>
                                  {(canManageItems || canEditReceiving) && (
                                    <button
                                      type="button"
                                      className="text-xs text-teal order-detail-item-edit-link"
                                      onClick={() => openItemEditModal(item)}
                                    >
                                      Изм. строку
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="mono text-muted">{item.barcode || '—'}</td>
                            <td className="mono text-muted">{item.article || '—'}</td>
                            <td className="text-muted">{item.color || '—'}</td>
                            <td className="text-muted">{item.size || '—'}</td>
                            <td className="text-right order-detail-table-cell-num">
                              {canManageItems ? (
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={draft.quantity ?? item.quantity}
                                  className="qty-input"
                                  onChange={(event) => handleDraftChange(item.id, 'quantity', event.target.value)}
                                />
                              ) : (
                                fmt(item.quantity)
                              )}
                            </td>
                            <td className="text-right order-detail-table-cell-num">
                              {canEditReceiving ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  max={draftQuantity}
                                  value={draft.ready_qty}
                                  className="qty-input"
                                  onChange={(event) => handleDraftChange(item.id, 'ready_qty', event.target.value)}
                                />
                              ) : (
                                <span className="text-teal">{fmt(item.ready_qty)}</span>
                              )}
                            </td>
                            <td className="text-right order-detail-table-cell-num">
                              {canEditReceiving ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  max={draftQuantity}
                                  value={draft.defect_qty}
                                  className="qty-input"
                                  onChange={(event) => handleDraftChange(item.id, 'defect_qty', event.target.value)}
                                />
                              ) : (
                                <span className={Number(item.defect_qty) > 0 ? 'text-red' : 'text-muted'}>{fmt(item.defect_qty)}</span>
                              )}
                            </td>
                            {isManager && shouldShowHonestSignTools && honestCodeMode === 'manual' && (
                              <td className="order-detail-honest-col">
                                <div className="order-detail-honest-tools">
                                  <div className="text-xs text-muted order-detail-honest-summary">
                                    Загружено: <strong>{fmt(item.honest_sign_expected || 0)}</strong> ·
                                    Отсканировано: <strong>{fmt(item.honest_sign_scanned || 0)}</strong> ·
                                    Осталось: <strong>{fmt(item.honest_sign_remaining || 0)}</strong>
                                  </div>
                                  <textarea
                                    value={honestCodeDrafts[item.id] || ''}
                                    onChange={(event) => updateHonestCodeDraft(item.id, event.target.value)}
                                    rows={3}
                                    placeholder="Вставьте список КИЗов, один код в строке"
                                    className="order-detail-honest-textarea"
                                  />
                                  <div className="flex justify-end order-detail-honest-actions">
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => importHonestCodesForItem(item)}
                                      disabled={importOrderHonestCodes.isPending}
                                    >
                                      {importOrderHonestCodes.isPending ? 'Загружаем...' : 'Загрузить КИЗы'}
                                    </Button>
                                  </div>
                                </div>
                              </td>
                            )}
                            {canManageItems && !canEditReceiving && (
                              <td className="text-right order-detail-table-cell-action">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => saveItem(item)}
                                  disabled={updateItem.isPending}
                                >
                                  Сохранить
                                </Button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {activeTab === 'boxes' && showDesktopBoxesTab && (
            <>
              <div className="alert alert-info mb-3">
                Коробов WB: <strong>{fmt(orderBoxes?.summary?.wb_boxes || 0)}</strong> из <strong>{fmt(orderBoxes?.summary?.wb_target_boxes || 0)}</strong>
                {' '}· Разложено: <strong>{fmt(draftBoxSummary.totalPacked || 0)}</strong> ед.
                {' '}· Осталось: <strong>{fmt(draftBoxSummary.totalRemaining || 0)}</strong> ед.
              </div>

              {boxError && <div className="alert alert-error mb-3">{boxError}</div>}

              <div className="flex justify-between items-center mb-3 order-detail-boxes-toolbar">
                <div className="text-sm text-muted">
                  Используйте латиницу для ШК короба. Формат по умолчанию: <strong>SW-000001</strong>.
                </div>
                <div className="flex gap-2 order-detail-boxes-toolbar-actions">
                  <Button variant="secondary" size="sm" onClick={addBoxDraft}>+ Добавить короб</Button>
                  <Button variant="secondary" size="sm" onClick={generateBoxes} disabled={generateOrderBoxes.isPending}>
                    {generateOrderBoxes.isPending ? 'Создаём...' : 'Автосоздать короба'}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={downloadWbBoxesExport}>Скачать Excel WB</Button>
                  <Button size="sm" onClick={saveBoxes} disabled={saveOrderBoxes.isPending}>
                    {saveOrderBoxes.isPending ? 'Сохраняем...' : 'Сохранить короба'}
                  </Button>
                </div>
              </div>

              {boxesDraft.length === 0 ? (
                <div className="surface-note">
                  <div className="font-medium">Короба ещё не созданы</div>
                  <div className="text-muted text-sm order-detail-empty-note-copy">
                    Укажите места в строках отгрузки WB и нажмите «Автосоздать короба», либо добавьте короб вручную.
                  </div>
                </div>
              ) : (
                <div className="order-detail-boxes-draft-list">
                  {boxesDraft.map((box, boxIndex) => (
                    <div key={box.id || `box-tab-${boxIndex}`} className="surface-note order-detail-box-draft-card">
                      <div className="flex justify-between items-start order-detail-box-draft-head">
                        <div className="order-detail-box-draft-grid">
                          <Input
                            label="ШК короба"
                            value={box.box_code}
                            onChange={(event) => updateBoxDraft(boxIndex, 'box_code', event.target.value)}
                          />
                          <div>
                            <label>Строка отгрузки WB</label>
                            <select
                              className="compact-input"
                              value={box.shipment_id || ''}
                              onChange={(event) => updateBoxDraft(boxIndex, 'shipment_id', event.target.value)}
                            >
                              <option value="">Без привязки</option>
                              {wbShipmentOptions.map((shipment) => (
                                <option key={shipment.id} value={shipment.id}>{shipment.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => removeBoxDraft(boxIndex)}>Удалить короб</Button>
                      </div>

                      <div className="order-detail-box-draft-items">
                        {(box.items || []).map((item, itemIndex) => {
                          const itemMeta = boxItemOptions.find((row) => row.id === item.order_item_id);
                          const currentRemaining = getDraftRemainingForItem(item.order_item_id, boxIndex, itemIndex);
                          return (
                            <div
                              key={`${box.id || boxIndex}-tab-${itemIndex}`}
                              className="order-detail-box-draft-item-row"
                            >
                              <div>
                                <label>Товар</label>
                                <select
                                  className="compact-input"
                                  value={item.order_item_id || ''}
                                  onChange={(event) => updateBoxItemDraft(boxIndex, itemIndex, 'order_item_id', event.target.value)}
                                >
                                  <option value="">Выберите товар</option>
                                  {boxItemOptions.map((option) => (
                                    <option key={option.id} value={option.id}>
                                      {option.label} · осталось {fmt(getDraftRemainingForItem(option.id, boxIndex, itemIndex))}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <Input
                                label="Кол-во"
                                type="number"
                                min="1"
                                className="compact-number-input"
                                value={item.quantity}
                                onChange={(event) => updateBoxItemDraft(boxIndex, itemIndex, 'quantity', event.target.value)}
                              />
                              <Input
                                label="Срок годности"
                                value={item.expiry_date || ''}
                                onChange={(event) => updateBoxItemDraft(boxIndex, itemIndex, 'expiry_date', event.target.value)}
                                placeholder="ДД.ММ.ГГГГ"
                              />
                              <Button variant="secondary" size="sm" onClick={() => removeBoxItemDraft(boxIndex, itemIndex)}>Убрать</Button>
                              {itemMeta && (
                                <div className="text-xs text-muted order-detail-box-draft-item-meta">
                                  Принято к отгрузке: {fmt(itemMeta.ready_qty)} · ещё не разложено: {fmt(currentRemaining)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex justify-between items-center order-detail-box-draft-footer">
                        <div className="text-sm text-muted">
                          В коробе: <strong>{fmt((box.items || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0))}</strong> ед.
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => addBoxItemDraft(boxIndex)}>+ Добавить товар</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'consumables' && (
            <>
              {consumableError && <div className="alert alert-error mb-4">{consumableError}</div>}
              {canManageConsumables && (
                <div className="services-editor order-consumable-editor" style={{ marginBottom: 14 }}>
                  <div className="services-editor-head">
                    <h3>Добавить расходник в этап</h3>
                  </div>
                  <div className="order-consumable-inline">
                    <div className="services-search-wrap" ref={consumableDropdownRef}>
                      <label>Расходник</label>
                      <input
                        value={consumableQuery}
                        onFocus={() => setIsConsumableMenuOpen(true)}
                        onChange={(event) => {
                          setConsumableQuery(event.target.value);
                          setSelectedConsumableId('');
                          setIsConsumableMenuOpen(true);
                        }}
                        placeholder="Начните вводить расходник..."
                      />
                      {showConsumableSuggestions && (
                        <div className="services-search-dropdown">
                          {availableConsumables.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className="services-search-option"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                pickConsumable(item);
                              }}
                            >
                              {item.name} {item.code ? `(${item.code})` : ''}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <Input
                      label="Кол-во"
                      type="number"
                      min="1"
                      className="compact-number-input"
                      value={consumableQuantity}
                      onChange={(event) => setConsumableQuantity(event.target.value)}
                    />
                    <Input
                      label="Цена за ед."
                      type="number"
                      min="0"
                      step="0.01"
                      className="compact-number-input"
                      value={consumablePrice}
                      onChange={(event) => setConsumablePrice(event.target.value)}
                    />
                    <Input
                      label="Комментарий"
                      value={consumableComment}
                      onChange={(event) => setConsumableComment(event.target.value)}
                    />
                    <Button
                      className="order-consumable-add-btn"
                      onClick={addConsumableToOrder}
                      disabled={!selectedConsumableId || addOrderConsumable.isPending}
                    >
                      Добавить
                    </Button>
                  </div>
                  <div className="services-editor-total order-consumable-total">
                    {selectedConsumable ? `Выбрано: ${selectedConsumable.name}` : 'Выберите расходник из списка'}
                  </div>
                </div>
              )}

              {!order.consumables?.length ? <Empty text="Расходники по заявке не добавлены" /> : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Расходник</th>
                        <th>Категория</th>
                        <th>Ед.</th>
                        <th style={{ textAlign: 'right' }}>Цена</th>
                        <th style={{ textAlign: 'right' }}>Кол-во</th>
                        <th>Комментарий</th>
                        <th style={{ textAlign: 'right' }}>Сумма</th>
                        {canManageConsumables && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {order.consumables.map((item) => {
                        const draft = consumablesDrafts[item.id] || {
                          quantity: Number(item.quantity || 1),
                          unit_price: Number(item.unit_price || 0),
                          comment: item.comment || '',
                        };
                        return (
                          <tr key={item.id}>
                            <td><div className="order-detail-table-name-medium">{item.name}</div></td>
                            <td className="text-muted">{item.category || '—'}</td>
                            <td className="text-muted">{item.unit || '—'}</td>
                            <td className="text-right">
                              {canManageConsumables ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="table-number-input"
                                  value={draft.unit_price}
                                  onChange={(event) => handleConsumableDraftChange(item.id, 'unit_price', event.target.value)}
                                />
                              ) : formatMoney(item.unit_price)}
                            </td>
                            <td className="text-right">
                              {canManageConsumables ? (
                                <input
                                  type="number"
                                  min="1"
                                  className="table-number-input tiny"
                                  value={draft.quantity}
                                  onChange={(event) => handleConsumableDraftChange(item.id, 'quantity', event.target.value)}
                                />
                              ) : fmt(item.quantity)}
                            </td>
                            <td>
                              {canManageConsumables ? (
                                <input
                                  type="text"
                                  className="compact-input"
                                  value={draft.comment}
                                  placeholder="Комментарий"
                                  onChange={(event) => handleConsumableDraftChange(item.id, 'comment', event.target.value)}
                                />
                              ) : <span className="text-muted">{item.comment || '—'}</span>}
                            </td>
                            <td className="text-right order-detail-table-value-strong">
                              {formatMoney(Number(draft.quantity || 0) * Number(draft.unit_price || 0))}
                            </td>
                            {canManageConsumables && (
                              <td className="text-right">
                                <div className="flex gap-2 justify-end">
                                  <Button size="sm" variant="secondary" onClick={() => saveConsumable(item)} disabled={updateOrderConsumable.isPending}>Сохранить</Button>
                                  <Button size="sm" variant="secondary" onClick={() => deleteConsumable(item)} disabled={removeOrderConsumable.isPending}>Удалить</Button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {activeTab === 'charges' && (
            chargesLoading ? <Spinner /> : (
              <>
              {canManageCharges && (
                  <div className="services-editor" ref={serviceDropdownRef}>
                  <div className="services-editor-head">
                    <h3>Оказанные услуги</h3>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => {
                        const next = serviceDrafts[0];
                        if (!next) {
                          addServiceDraftRow();
                          return;
                        }
                        setManualServiceMode(next.localId, true);
                      }}>
                        Своя услуга
                      </Button>
                      <Button variant="secondary" size="sm" onClick={addServiceDraftRow}>+ Добавить услугу</Button>
                    </div>
                  </div>

                    <div className="service-drafts-list">
                      {serviceDrafts.map((draft, index) => {
                        const pricing = getServicePricing(draft);
                        const options = getServiceOptions(draft.serviceQuery);
                        const selectedTariff = pricing.selectedTariff;
                        const showSuggestions = activeServiceMenuIndex === index && !!options.length;
                        const canSave = createCharge.isPending
                          || (draft.isManualServiceMode
                            ? !draft.customServiceName || Number(draft.customServicePrice || 0) <= 0
                            : !selectedTariff);

                        return (
                          <div key={draft.localId} className="service-draft-row">
                            <div className="services-editor-grid">
                              <div className="services-search-wrap">
                                <label>Услуга</label>
                                <input
                                  value={draft.serviceQuery}
                                  onFocus={() => setActiveServiceMenuIndex(index)}
                                  onChange={(event) => {
                                    updateServiceDraft(draft.localId, {
                                      serviceQuery: event.target.value,
                                      selectedTariffCode: '',
                                      isManualServiceMode: false,
                                    });
                                    setActiveServiceMenuIndex(index);
                                  }}
                                  placeholder="Начните вводить или выберите из списка..."
                                />
                                {showSuggestions && (
                                  <div className="services-search-dropdown">
                                    {options.map((tariff) => (
                                      <button
                                        key={tariff.code}
                                        type="button"
                                        className="services-search-option"
                                        onMouseDown={(event) => {
                                          event.preventDefault();
                                          pickTariff(draft.localId, tariff);
                                        }}
                                      >
                                        <div>
                                          <div>{tariff.name}</div>
                                          <div className="text-muted text-xs">
                                            {tariff.description ? `(${tariff.description})` : 'Без описания'}
                                          </div>
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {activeServiceMenuIndex === index && draft.serviceQuery.trim() && !options.length && (
                                  <div className="services-search-dropdown">
                                    <div className="services-search-option order-detail-search-empty">
                                      Ничего не найдено
                                    </div>
                                  </div>
                                )}
                              </div>

                              <Input
                                label="Количество"
                                type="number"
                                min="1"
                                value={draft.serviceQuantity}
                                onChange={(event) => updateServiceDraft(draft.localId, { serviceQuantity: event.target.value })}
                              />
                            </div>

                            {draft.isManualServiceMode && (
                              <div className="form-grid order-detail-manual-service-grid">
                                <Input
                                  label="Своя услуга"
                                  value={draft.customServiceName}
                                  onChange={(event) => updateServiceDraft(draft.localId, { customServiceName: event.target.value })}
                                />
                                <Input
                                  label="Цена за единицу"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={draft.customServicePrice}
                                  onChange={(event) => updateServiceDraft(draft.localId, { customServicePrice: event.target.value })}
                                />
                              </div>
                            )}

                            {(selectedTariff || draft.isManualServiceMode) && (
                              <>
                                <div className="table-wrap">
                                  <table>
                                    <thead>
                                      <tr>
                                        <th>Название услуги</th>
                                        <th style={{ textAlign: 'right' }}>Цена за единицу</th>
                                        <th style={{ textAlign: 'right' }}>Количество</th>
                                        <th style={{ textAlign: 'right' }}>Скидка %</th>
                                        <th style={{ textAlign: 'right' }}>Сумма скидки</th>
                                        <th style={{ textAlign: 'right' }}>Итого</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      <tr>
                                        <td>
                                          <div className="order-detail-table-name-strong">{draft.customServiceName || selectedTariff?.name}</div>
                                          <div className="text-muted text-sm">{draft.isManualServiceMode ? 'Ручная услуга' : selectedTariff?.description}</div>
                                        </td>
                                        <td className="text-right">{formatMoney(draft.isManualServiceMode ? draft.customServicePrice : selectedTariff?.price)}</td>
                                        <td className="text-right">
                                          <input
                                            type="number"
                                            min="1"
                                            value={draft.serviceQuantity}
                                            className="qty-input"
                                            onChange={(event) => updateServiceDraft(draft.localId, { serviceQuantity: event.target.value })}
                                          />
                                        </td>
                                        <td className="text-right">
                                          <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={draft.discountPercent}
                                            className="qty-input"
                                            onChange={(event) => updateServiceDraft(draft.localId, { discountPercent: event.target.value })}
                                          />
                                        </td>
                                        <td className="text-right">{formatMoney(pricing.discountAmount)}</td>
                                        <td className="text-right order-detail-table-value-bold">{formatMoney(pricing.total)}</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>

                                <div className="services-editor-footer">
                                <div className="services-editor-total">
                                    Общая сумма <strong>{formatMoney(pricing.total)}</strong>
                                  </div>
                                  <div className="flex gap-2">
                                    {serviceDrafts.length > 1 && (
                                      <Button variant="secondary" onClick={() => removeServiceDraftRow(draft.localId)}>
                                        Удалить строку
                                      </Button>
                                    )}
                                    <Button
                                      variant="secondary"
                                      onClick={() => updateServiceDraft(draft.localId, buildServiceDraft({ localId: draft.localId }))}
                                    >
                                      Очистить
                                    </Button>
                                    <Button
                                      onClick={() => saveServiceDraft(draft)}
                                      disabled={canSave}
                                    >
                                      Сохранить
                                    </Button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {chargeError && (
                  <div className="alert alert-error order-detail-charge-error">
                    {chargeError}
                  </div>
                )}

                {chargeItems.length ? (
                <>
                  <div className="stats-grid order-detail-charge-stats">
                    <div className="stat-card">
                      <div className="stat-label">Начислено</div>
                      <div className="stat-value">{formatMoney(chargesSummary.total)}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Оплачено</div>
                      <div className="stat-value">{formatMoney(chargesSummary.paid)}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">К оплате</div>
                      <div className="stat-value">{formatMoney(chargesSummary.pending)}</div>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Услуга</th>
                          <th>Статус</th>
                          <th style={{ textAlign: 'right' }}>Кол-во</th>
                          <th style={{ textAlign: 'right' }}>Цена</th>
                          <th style={{ textAlign: 'right' }}>Сумма</th>
                          {canManageCharges && <th></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {chargeItems.map((charge) => (
                          <tr key={charge.id}>
                            <td>
                              <div className="order-detail-table-name-strong">{charge.description || charge.tariff_code}</div>
                            </td>
                            <td>
                              <Badge variant={charge.status === 'paid' ? 'green' : charge.status === 'confirmed' ? 'blue' : 'amber'}>
                                {charge.status === 'paid' ? 'Оплачено' : charge.status === 'confirmed' ? 'Подтверждено' : 'Ожидает'}
                              </Badge>
                            </td>
                            <td className="text-right">
                              {canManageCharges ? (
                                <input
                                  type="number"
                                  min="1"
                                  value={chargeDrafts[charge.id]?.quantity ?? charge.quantity}
                                  className="table-number-input"
                                  onChange={(event) => handleChargeDraftChange(charge.id, 'quantity', event.target.value)}
                                />
                              ) : fmt(charge.quantity)}
                            </td>
                            <td className="text-right">
                              {canManageCharges ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={chargeDrafts[charge.id]?.unit_price ?? charge.unit_price}
                                  className="table-number-input"
                                  onChange={(event) => handleChargeDraftChange(charge.id, 'unit_price', event.target.value)}
                                />
                              ) : formatMoney(charge.unit_price)}
                            </td>
                            <td className="text-right order-detail-table-value-strong">
                              {formatMoney(
                                canManageCharges
                                  ? Number((Number(chargeDrafts[charge.id]?.quantity ?? charge.quantity) * Number(chargeDrafts[charge.id]?.unit_price ?? charge.unit_price)).toFixed(2))
                                  : charge.total
                              )}
                            </td>
                            {canManageCharges && (
                              <td className="text-right">
                                <div className="flex gap-2 justify-end">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => saveCharge(charge)}
                                    disabled={updateCharge.isPending}
                                  >
                                    Сохранить
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => deleteChargeRow(charge)}
                                    disabled={deleteCharge.isPending}
                                  >
                                    Удалить
                                  </Button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <Empty text="По заявке пока нет начислений" />
              )}
              </>
            )
          )}

          {activeTab === 'stages' && (
            order.stages?.length ? (
              <div className="order-stage-list">
                {order.stages.map((stage) => (
                  <div key={stage.id} className="order-stage-row">
                    <div className="order-stage-dot" />
                    <div>
                      <div className="flex items-center gap-2">
                        <StageBadge stage={stage.stage} />
                        <span className="text-xs text-muted">{formatDateTime(stage.created_at)}</span>
                        {stage.changed_by_name && <span className="text-xs text-muted">— {stage.changed_by_name}</span>}
                      </div>
                      {stage.note && <div className="text-sm text-muted order-detail-stage-history-note">{stage.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty text="История этапов пуста" />
            )
          )}
        </div>
      </div>

      </div>

      <Modal
        open={Boolean(itemEditModal)}
        onClose={() => setItemEditModal(null)}
        title="Быстрое редактирование товара"
        size="lg"
      >
        {itemEditModal && (
          <div className="space-y-4">
            <div className="text-sm text-muted">
              {itemEditModal.product_name}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input
                label="Заявлено"
                type="number"
                min="1"
                step="1"
                value={itemEditModal.quantity}
                onChange={(event) => updateItemEditDraft('quantity', event.target.value)}
              />
              <Input
                label="Готово"
                type="number"
                min="0"
                step="1"
                value={itemEditModal.ready_qty}
                onChange={(event) => updateItemEditDraft('ready_qty', event.target.value)}
              />
              <Input
                label="Брак"
                type="number"
                min="0"
                step="1"
                value={itemEditModal.defect_qty}
                onChange={(event) => updateItemEditDraft('defect_qty', event.target.value)}
              />
            </div>
            <div className="modal-footer order-detail-modal-footer-reset">
              <Button variant="secondary" onClick={() => setItemEditModal(null)}>Отмена</Button>
              <Button onClick={saveItemFromModal} disabled={updateItem.isPending}>Сохранить</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={stageModal} onClose={() => setStageModal(false)} title="Сменить этап">
        <div className="type-cards type-cards-compact">
          {stageList.filter((stage) => stage !== displayStage).map((stage) => (
            <button
              key={stage}
              onClick={() => setNewStage(stage)}
              className={`type-card ${newStage === stage ? 'selected' : ''}`}
            >
              <div className="type-card-title">{STAGE_LABELS[stage]}</div>
            </button>
          ))}
        </div>
        <div className="form-group">
          <label>Комментарий</label>
          <textarea value={stageNote} onChange={(event) => setStageNote(event.target.value)} rows={3} />
        </div>
        <div className="modal-footer order-detail-modal-footer-reset">
          <Button variant="secondary" onClick={() => setStageModal(false)}>Отмена</Button>
          <Button onClick={handleMoveStage} disabled={!newStage || moveStage.isPending}>
            {moveStage.isPending ? 'Сохраняем...' : 'Сохранить'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
