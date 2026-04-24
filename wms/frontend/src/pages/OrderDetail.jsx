import { useEffect, useMemo, useState } from 'react';
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
import { Button, TypeBadge, StageBadge, fmt, Spinner, Modal, Empty, Badge, Input } from '../components/ui';
import { useAuthStore } from '../store/auth';
import { formatDateTime, formatMoney } from '../lib/documents';
import { openOrderDocument } from '../lib/orderDocuments';
import api from '../api/client';
import useDismissibleDropdown from '../hooks/useDismissibleDropdown';
import { useThemeStore } from '../store/theme';

const SUPPLY_STAGES = ['new', 'approval', 'pickup', 'in_transit', 'receiving', 'accepted', 'mp_shipping', 'done'];
const PROCESS_STAGES = ['new', 'waiting', 'in_progress', 'done'];
const LOGISTICS_STAGES = ['new', 'approval', 'pickup', 'in_transit', 'delivered', 'mp_shipping', 'done'];
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

  const totals = useMemo(() => {
    const items = order?.items || [];
    return {
      quantity: items.reduce((sum, item) => sum + Number((itemsDraft[item.id]?.quantity ?? item.quantity) || 0), 0),
      ready: items.reduce((sum, item) => sum + Number((itemsDraft[item.id]?.ready_qty ?? item.ready_qty) || 0), 0),
      defect: items.reduce((sum, item) => sum + Number((itemsDraft[item.id]?.defect_qty ?? item.defect_qty) || 0), 0),
    };
  }, [order, itemsDraft]);

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
        ship_date: row.ship_date ? String(row.ship_date).slice(0, 16) : '',
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
  const canManageShipments = (
    isManager
    && order.status === 'active'
    && ['supply', 'logistics'].includes(order.type)
    && order.stage === 'mp_shipping'
  );
  const acceptedTotal = Number(
    (order.items || []).reduce((sum, item) => sum + Number(item.ready_qty || 0), 0)
  );
  const shipmentsTotal = Number(
    (shipmentsDraft || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0)
  );
  const shipmentsAmountTotal = Number(
    (shipmentsDraft || []).reduce(
      (sum, row) => sum + Number(row.places_count || 0) * Number(row.unit_price || 0),
      0,
    )
  );
  const shippingRemain = Math.max(0, acceptedTotal - shipmentsTotal);
  const currentStageIndex = stageList.indexOf(order.stage);
  const mobileTabs = [
    ['items', itemsTabLabel],
    ['consumables', 'Расходники'],
    ['charges', 'Услуги'],
    ['stages', 'История'],
  ];
  const orderMetaRows = [
    ['Тип заявки', order.type === 'supply' ? 'Поставка' : order.type === 'processing' ? 'Обработка' : 'Логистика'],
    ['Этап', STAGE_LABELS[order.stage] || order.stage],
    ['Создана', formatDateTime(order.created_at)],
    ...(order.comment ? [['Комментарий', order.comment]] : []),
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
            ['Дата отгрузки', order.details?.ship_date ? formatDateTime(order.details?.ship_date) : null],
            ['Пропуск', order.details?.pass_number || null],
          ]
        : [
            ['Обработка', 'По составу позиций заявки'],
          ]
  ).filter(([, value]) => value);
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

  const renderHonestSignModeSwitch = (mobile = false) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: mobile ? 0 : 8 }}>
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
    <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
      <div className={mobile ? 'mobile-order-card-sub' : 'text-muted text-sm'}>
        Один Excel-файл на всю заявку: колонки <strong>Штрихкод</strong> и <strong>КИЗ</strong> обязательны.
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        <input
          id={`honest-sign-file-input-${id}`}
          type="file"
          accept=".xlsx"
          onChange={(event) => setHonestCodeImportFile(event.target.files?.[0] || null)}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={honestCodeImportReplace}
            onChange={(event) => setHonestCodeImportReplace(event.target.checked)}
          />
          Заменить КИЗы только по совпавшим позициям из файла
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
        <div className="surface-note" style={{ marginTop: 4 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Результат импорта</div>
          <div className={mobile ? 'mobile-order-card-sub' : 'text-muted text-sm'}>
            Обработано {fmt(honestCodeFileImportResult.processed_total || 0)} ·
            Загружено {fmt(honestCodeFileImportResult.imported_total || 0)} ·
            Ошибки структуры {fmt(honestCodeFileImportResult.structure_errors_total || 0)} ·
            Не сопоставлено {fmt(honestCodeFileImportResult.unmatched_total || 0)} ·
            Неоднозначно {fmt(honestCodeFileImportResult.ambiguous_total || 0)} ·
            Дубли {fmt(honestCodeFileImportResult.duplicate_total || 0)}
          </div>
          {honestCodeFileImportResult.issues?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 500, marginBottom: 6 }}>Проблемные строки</div>
              <div style={{ display: 'grid', gap: 4 }}>
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
          ship_date: '',
          places_count: 0,
          quantity: 0,
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
          ship_date: row.ship_date || null,
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
    if (total > acceptedTotal) {
      setShipmentError(`Нельзя отгрузить больше принятого: доступно ${acceptedTotal}, указано ${total}`);
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
          <div className={`mobile-order-kpi${mobileDarkMode ? ' mobile-order-kpi-dark' : ''}`}>
            <span className="mobile-order-kpi-label">Позиций</span>
            <strong className="mobile-order-kpi-value">{fmt(order.items?.length || 0)}</strong>
            <span className="mobile-order-kpi-sub">в составе</span>
          </div>
          <div className={`mobile-order-kpi${mobileDarkMode ? ' mobile-order-kpi-dark' : ''}`}>
            <span className="mobile-order-kpi-label">Заявлено</span>
            <strong className="mobile-order-kpi-value mobile-order-kpi-value-blue">{fmt(totals.quantity)}</strong>
            <span className="mobile-order-kpi-sub">единиц</span>
          </div>
          <div className={`mobile-order-kpi${mobileDarkMode ? ' mobile-order-kpi-dark' : ''}`}>
            <span className="mobile-order-kpi-label">Готово</span>
            <strong className="mobile-order-kpi-value mobile-order-kpi-value-green">{fmt(totals.ready)}</strong>
            <span className="mobile-order-kpi-sub">подтверждено</span>
          </div>
          <div className={`mobile-order-kpi${mobileDarkMode ? ' mobile-order-kpi-dark' : ''}`}>
            <span className="mobile-order-kpi-label">Брак</span>
            <strong className="mobile-order-kpi-value mobile-order-kpi-value-red">{fmt(totals.defect)}</strong>
            <span className="mobile-order-kpi-sub">требует разбора</span>
          </div>
        </div>

        <div className={`mobile-order-section${mobileDarkMode ? ' mobile-order-section-dark' : ''}`}>
          <div className="mobile-order-section-title">Параметры заявки</div>
          <div className="mobile-order-meta-list">
            {orderMetaRows.map(([label, value]) => (
              <div key={label} className="mobile-order-meta-row">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className={`mobile-order-section${mobileDarkMode ? ' mobile-order-section-dark' : ''}`}>
          <div className="mobile-order-section-title">Детали</div>
          <div className="mobile-order-meta-list">
            {orderDetailRows.map(([label, value]) => (
              <div key={label} className="mobile-order-meta-row">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </div>

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
                      <div className="services-search-option" style={{ cursor: 'default' }}>
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
                {itemAddError && <div className="alert alert-error" style={{ marginTop: 12 }}>{itemAddError}</div>}
              </div>
            )}

            {isManager && (
              shouldShowHonestSignTools ? (
                <div className={`mobile-order-stack-card${mobileDarkMode ? ' mobile-order-stack-card-dark' : ''}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                    <div>
                      <div className="mobile-order-card-title">Честный знак / КИЗ</div>
                      <div className="mobile-order-card-sub" style={{ marginBottom: 12 }}>
                        Ожидается {fmt(order.honest_sign_summary?.expected_total || 0)} ·
                        Отсканировано {fmt(order.honest_sign_summary?.scanned_total || 0)} ·
                        Осталось {fmt(order.honest_sign_summary?.remaining_total || 0)}
                      </div>
                    </div>
                    {!hasHonestSignActivity && (
                      <button
                        type="button"
                        className="text-xs text-muted"
                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                        onClick={() => setShowHonestSignTools(false)}
                      >
                        Скрыть
                      </button>
                    )}
                  </div>
                  {renderHonestSignModeSwitch(true)}
                  <div className="mobile-order-inline-grid">
                    <Input
                      label="Скан КИЗа"
                      value={honestCodeScanValue}
                      onChange={(event) => setHonestCodeScanValue(event.target.value)}
                    />
                    <Button
                      onClick={handleHonestCodeScan}
                      disabled={scanOrderHonestCode.isPending || !String(honestCodeScanValue || '').trim()}
                      className={mobileDarkMode ? 'mobile-btn-primary' : ''}
                    >
                      {scanOrderHonestCode.isPending ? 'Проверяем...' : 'Пикнуть'}
                    </Button>
                  </div>
                  <div className="mobile-order-meta-grid" style={{ marginTop: 10 }}>
                    <div className="mobile-order-meta-pill">
                      <span>Дубли</span>
                      <strong>{fmt(order.honest_sign_summary?.duplicate_total || 0)}</strong>
                    </div>
                    <div className="mobile-order-meta-pill">
                      <span>Чужие коды</span>
                      <strong>{fmt(order.honest_sign_summary?.unexpected_total || 0)}</strong>
                    </div>
                  </div>
                  {honestCodeScanResult?.message && (
                    <div className={`alert ${honestCodeScanResult.result === 'matched' ? 'alert-success' : honestCodeScanResult.result === 'duplicate' ? 'alert-error' : honestCodeScanResult.result === 'unexpected' ? 'alert-error' : 'alert-error'}`} style={{ marginTop: 12 }}>
                      {honestCodeScanResult.message}
                      {honestCodeScanResult.product_name ? ` · ${honestCodeScanResult.product_name}` : ''}
                    </div>
                  )}
                  {honestCodeMode === 'file' && renderHonestSignFileImport(true)}
                  {honestCodeImportError && <div className="alert alert-error" style={{ marginTop: 12 }}>{honestCodeImportError}</div>}
                </div>
              ) : (
                <div className={`mobile-order-stack-card${mobileDarkMode ? ' mobile-order-stack-card-dark' : ''}`}>
                  <div className="mobile-order-card-title">Честный знак / КИЗ</div>
                  <div className="mobile-order-card-sub" style={{ marginBottom: 12 }}>
                    Для этой заявки КИЗы не загружены. Откройте блок только если по товару реально нужен Честный знак.
                  </div>
                  <Button onClick={() => setShowHonestSignTools(true)} className={mobileDarkMode ? 'mobile-btn-primary' : ''}>
                    Показать блок ЧЗ
                  </Button>
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
                <div className="text-muted text-sm" style={{ marginTop: 4 }}>
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
                        <div className="mobile-order-product-head">
                          {item.photo_url
                            ? <img src={item.photo_url} alt="" className="product-thumb" />
                            : <div className="product-thumb">📦</div>}
                          <div className="mobile-order-product-info">
                            <div className="mobile-order-card-title">{item.product_name}</div>
                            <div className="mobile-order-card-sub">
                              {item.article || 'Без артикула'} · {item.barcode || 'Без баркода'}
                            </div>
                          </div>
                        </div>

                        {canEditReceiving && (
                          <div className="mobile-receiving-status-row">
                            <div className={`mobile-receiving-qty mobile-receiving-qty-${status.className}`}>{status.qtyText}</div>
                            <div className={`mobile-receiving-badge mobile-receiving-badge-${status.className}`}>{status.label}</div>
                          </div>
                        )}

                        <div className="mobile-order-meta-grid">
                          <div className="mobile-order-meta-pill">
                            <span>Цвет</span>
                            <strong>{item.color || '—'}</strong>
                          </div>
                          <div className="mobile-order-meta-pill">
                            <span>Размер</span>
                            <strong>{item.size || '—'}</strong>
                          </div>
                        </div>

                        <div className="mobile-order-qty-grid">
                          <Input
                            label="Заявлено"
                            type="number"
                            min="1"
                            step="1"
                            value={canManageItems ? (draft.quantity ?? item.quantity) : item.quantity}
                            className="compact-number-input"
                            onChange={(event) => canManageItems && handleDraftChange(item.id, 'quantity', event.target.value)}
                            disabled={!canManageItems}
                          />
                          <Input
                            label="Готово"
                            type="number"
                            min="0"
                            step="1"
                            max={draftQuantity}
                            value={canEditReceiving ? draft.ready_qty : item.ready_qty}
                            className="compact-number-input"
                            onChange={(event) => canEditReceiving && handleDraftChange(item.id, 'ready_qty', event.target.value)}
                            disabled={!canEditReceiving}
                          />
                          <Input
                            label="Брак"
                            type="number"
                            min="0"
                            step="1"
                            max={draftQuantity}
                            value={canEditReceiving ? draft.defect_qty : item.defect_qty}
                            className="compact-number-input"
                            onChange={(event) => canEditReceiving && handleDraftChange(item.id, 'defect_qty', event.target.value)}
                            disabled={!canEditReceiving}
                          />
                        </div>

                        {isManager && honestCodeMode === 'manual' && (
                          <div style={{ marginTop: 12 }}>
                            <Input
                              label={`КИЗы / ЧЗ (${fmt(item.honest_sign_expected || 0)} загружено, ${fmt(item.honest_sign_scanned || 0)} отсканировано)`}
                              value={honestCodeDrafts[item.id] || ''}
                              onChange={(event) => updateHonestCodeDraft(item.id, event.target.value)}
                              placeholder="Вставьте список кодов: один код в строке"
                            />
                            <div className="mobile-order-actions-row" style={{ marginTop: 8 }}>
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
            {isManager && order.status === 'active' && (
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
                          value={isManager && order.status === 'active' ? draft.unit_price : item.unit_price}
                          onChange={(event) => handleConsumableDraftChange(item.id, 'unit_price', event.target.value)}
                          disabled={!(isManager && order.status === 'active')}
                        />
                        <Input
                          label="Кол-во"
                          type="number"
                          min="1"
                          className="compact-number-input"
                          value={isManager && order.status === 'active' ? draft.quantity : item.quantity}
                          onChange={(event) => handleConsumableDraftChange(item.id, 'quantity', event.target.value)}
                          disabled={!(isManager && order.status === 'active')}
                        />
                      </div>
                      <Input
                        label="Комментарий"
                        type="text"
                        className="compact-input"
                        value={isManager && order.status === 'active' ? draft.comment : item.comment || '—'}
                        onChange={(event) => handleConsumableDraftChange(item.id, 'comment', event.target.value)}
                        disabled={!(isManager && order.status === 'active')}
                      />
                      <div className="mobile-order-actions-row">
                        <div className="mobile-order-sum">Сумма: {formatMoney(Number(draft.quantity || 0) * Number(draft.unit_price || 0))}</div>
                        {isManager && (
                          <div className="flex gap-2">
                            {order.status === 'active' && (
                              <Button size="sm" variant={mobileDarkMode ? 'primary' : 'secondary'} className={mobileDarkMode ? 'mobile-btn-primary' : ''} onClick={() => saveConsumable(item)} disabled={updateOrderConsumable.isPending}>Сохранить</Button>
                            )}
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
            {charges?.items?.length ? (
              <>
                <div className="mobile-order-kpis mobile-order-kpis-compact">
                  <div className="mobile-order-kpi">
                    <span className="mobile-order-kpi-label">Начислено</span>
                    <strong className="mobile-order-kpi-value">{formatMoney(charges.summary.total)}</strong>
                  </div>
                  <div className="mobile-order-kpi">
                    <span className="mobile-order-kpi-label">Оплачено</span>
                    <strong className="mobile-order-kpi-value mobile-order-kpi-value-green">{formatMoney(charges.summary.paid)}</strong>
                  </div>
                  <div className="mobile-order-kpi">
                    <span className="mobile-order-kpi-label">К оплате</span>
                    <strong className="mobile-order-kpi-value mobile-order-kpi-value-amber">{formatMoney(charges.summary.pending)}</strong>
                  </div>
                </div>
                <div className="mobile-order-card-list">
                  {charges.items.map((charge) => (
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
                          value={isManager ? (chargeDrafts[charge.id]?.quantity ?? charge.quantity) : charge.quantity}
                          onChange={(event) => handleChargeDraftChange(charge.id, 'quantity', event.target.value)}
                          disabled={!isManager}
                        />
                        <Input
                          label="Цена"
                          type="number"
                          min="0"
                          step="0.01"
                          className="compact-number-input"
                          value={isManager ? (chargeDrafts[charge.id]?.unit_price ?? charge.unit_price) : charge.unit_price}
                          onChange={(event) => handleChargeDraftChange(charge.id, 'unit_price', event.target.value)}
                          disabled={!isManager}
                        />
                      </div>
                      {isManager && (
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
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/orders')} className="btn btn-ghost btn-sm">← Назад</button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">Заявка #{order.number}</h1>
              <TypeBadge type={order.type} />
              <StageBadge stage={order.stage} />
            </div>
            <div className="text-muted text-sm">Клиент: {order.company_name}</div>
          </div>
        </div>
        <div className="flex gap-2">
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

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Позиций</div>
          <div className="stat-value">{fmt(order.items?.length || 0)}</div>
          <div className="stat-sub">в составе заявки</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Заявлено</div>
          <div className="stat-value">{fmt(totals.quantity)}</div>
          <div className="stat-sub">единиц товара</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Готово</div>
          <div className="stat-value">{fmt(totals.ready)}</div>
          <div className="stat-sub">подтверждено</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Брак</div>
          <div className="stat-value" style={{ color: 'var(--red-400)' }}>{fmt(totals.defect)}</div>
          <div className="stat-sub">требует разбора</div>
        </div>
      </div>

      {canManageItems && (
        <div className="card order-detail-compact-card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Добавить товар в заявку</span>
          </div>
          <div className="card-body order-detail-compact-body">
            <div className="services-editor order-detail-add-item-editor" style={{ marginBottom: 0, padding: 0, border: 'none' }}>
              <div
                className="services-editor-grid order-detail-add-item-grid"
                style={{ gridTemplateColumns: 'minmax(0, 1fr) 88px 104px', alignItems: 'end', marginBottom: 0 }}
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
                      <div className="services-search-option" style={{ cursor: 'default' }}>
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
              {itemAddError && <div className="alert alert-error" style={{ marginTop: 12 }}>{itemAddError}</div>}
            </div>
            <div className="text-muted text-sm" style={{ marginTop: 10 }}>
              Можно добавить товар по названию, артикулу или баркоду. Если отсканирован баркод и найден один товар, он подставится в заявку.
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div className="stage-progress">
            {stageList.map((stage, index) => {
              const currentIndex = stageList.indexOf(order.stage);
              const past = index < currentIndex;
              const current = index === currentIndex;
              return (
                <div key={stage} className="flex items-start">
                  {index > 0 && <div className={`stage-connector ${past || current ? 'done' : ''}`} />}
                  <div className="stage-step">
                    <div className={`stage-dot ${past ? 'done' : ''} ${current ? 'current' : ''}`}>
                      {past ? '✓' : index + 1}
                    </div>
                    <div className={`stage-label ${current ? 'current' : ''}`}>{STAGE_LABELS[stage]}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid-2 mb-5">
        <div className="card">
          <div className="card-header"><span className="card-title">{order.type === 'supply' && order.stage === 'pickup' ? 'Данные забора груза' : 'Параметры заявки'}</span></div>
          <div className="card-body company-meta">
            {order.type === 'supply' && order.stage === 'pickup' && isManager ? (
              <>
                <Input
                  label="Количество мест"
                  type="number"
                  min="0"
                  className="compact-number-input"
                  value={pickupDetails.places_count}
                  onChange={(event) => setPickupDetails((current) => ({ ...current, places_count: event.target.value }))}
                />
                <Input
                  label="Вес (кг)"
                  type="number"
                  min="0"
                  step="0.1"
                  className="compact-number-input"
                  value={pickupDetails.weight_kg}
                  onChange={(event) => setPickupDetails((current) => ({ ...current, weight_kg: event.target.value }))}
                />
                <Input
                  label="Номер накладной"
                  value={pickupDetails.cargo_number}
                  onChange={(event) => setPickupDetails((current) => ({ ...current, cargo_number: event.target.value }))}
                />
                <Input
                  label="Откуда забираем"
                  value={pickupDetails.pickup_address}
                  onChange={(event) => setPickupDetails((current) => ({ ...current, pickup_address: event.target.value }))}
                />
                <Input
                  label="Кто поедет"
                  value={pickupDetails.contact_name}
                  onChange={(event) => setPickupDetails((current) => ({ ...current, contact_name: event.target.value }))}
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={savePickupDetails} disabled={updateOrderDetails.isPending}>
                    Сохранить данные забора
                  </Button>
                </div>
              </>
            ) : (
              <>
                {orderMetaRows.map(([label, value]) => (
                  <div key={label} className="company-meta-row"><span>{label}</span><strong>{value}</strong></div>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Детали</span></div>
          <div className="card-body company-meta">
            {orderDetailRows.map(([label, value]) => (
              <div key={label} className="company-meta-row"><span>{label}</span><strong>{value}</strong></div>
            ))}
          </div>
        </div>
      </div>

      {canManageShipments && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Отгрузка на склады маркетплейсов</span>
          </div>
          <div className="card-body">
            <div className="alert alert-info mb-3">
              Принято к отгрузке: <strong>{fmt(acceptedTotal)}</strong> ед. Распределено: <strong>{fmt(shipmentsTotal)}</strong> ед.
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
                    <th>Тариф</th>
                    <th>Дата отгрузки</th>
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
                      <td colSpan={10} className="text-muted" style={{ padding: '14px 16px' }}>
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
                              value={row.ship_date || ''}
                            onChange={(event) => updateShipmentRow(idx, 'ship_date', event.target.value)}
                          />
                        </td>
                        <td className="text-right">
                          <input
                            type="number"
                            min="0"
                            className="table-number-input tiny"
                            value={row.places_count}
                            onChange={(event) => updateShipmentRow(idx, 'places_count', event.target.value)}
                          />
                        </td>
                        <td className="text-right">
                          <input
                            type="number"
                            min="1"
                            max={acceptedTotal}
                            className="table-number-input tiny"
                            value={row.quantity}
                            onChange={(event) => updateShipmentRow(idx, 'quantity', event.target.value)}
                          />
                        </td>
                        <td className="text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="table-number-input tiny"
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
                            value={row.note || ''}
                            onChange={(event) => updateShipmentRow(idx, 'note', event.target.value)}
                            placeholder="Комментарий"
                          />
                        </td>
                        <td className="text-right">
                          <Button variant="secondary" size="sm" onClick={() => removeShipmentRow(idx)}>Удалить</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between mt-3">
              <Button variant="secondary" size="sm" onClick={addShipmentRow}>+ Добавить склад</Button>
              <Button onClick={saveShipments} disabled={updateOrderShipments.isPending}>
                {updateOrderShipments.isPending ? 'Сохраняем...' : 'Сохранить распределение'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {canManageShipments && (
        <div className="card" style={{ marginBottom: 16 }}>
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

            <div className="flex justify-between items-center mb-3" style={{ gap: 8, flexWrap: 'wrap' }}>
              <div className="text-sm text-muted">
                Используйте латиницу для ШК короба. Формат по умолчанию: <strong>SW-000001</strong>.
              </div>
              <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
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
                <div className="text-muted text-sm" style={{ marginTop: 4 }}>
                  Укажите места в строках отгрузки WB и нажмите «Автосоздать короба», либо добавьте короб вручную.
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {boxesDraft.map((box, boxIndex) => (
                  <div key={box.id || `box-${boxIndex}`} className="surface-note" style={{ padding: 14 }}>
                    <div className="flex justify-between items-start" style={{ gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                      <div style={{ display: 'grid', gap: 10, flex: '1 1 720px', gridTemplateColumns: 'minmax(180px, 220px) minmax(220px, 1fr)' }}>
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

                    <div style={{ display: 'grid', gap: 10 }}>
                      {(box.items || []).map((item, itemIndex) => {
                        const itemMeta = boxItemOptions.find((row) => row.id === item.order_item_id);
                        const currentRemaining = getDraftRemainingForItem(item.order_item_id, boxIndex, itemIndex);
                        return (
                          <div
                            key={`${box.id || boxIndex}-${itemIndex}`}
                            style={{
                              display: 'grid',
                              gap: 10,
                              gridTemplateColumns: 'minmax(280px, 1fr) 120px 180px 120px',
                              alignItems: 'end',
                            }}
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
                              <div className="text-xs text-muted" style={{ gridColumn: '1 / -1', marginTop: -2 }}>
                                Принято к отгрузке: {fmt(itemMeta.ready_qty)} · ещё не разложено: {fmt(currentRemaining)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex justify-between items-center" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
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
          {[['items', itemsTabLabel], ['consumables', 'Расходники'], ['charges', 'Оказанные услуги'], ['stages', 'История этапов']].map(([key, label]) => (
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
              {isManager && (
                shouldShowHonestSignTools ? (
                  <div className="services-editor" style={{ marginBottom: 16 }}>
                    <div className="services-editor-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <h3>Честный знак / КИЗ</h3>
                      {!hasHonestSignActivity && (
                        <button
                          type="button"
                          className="text-xs text-muted"
                          style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                          onClick={() => setShowHonestSignTools(false)}
                        >
                          Скрыть блок
                        </button>
                      )}
                    </div>
                    {renderHonestSignModeSwitch(false)}
                    <div className="services-editor-grid order-detail-add-item-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 104px', alignItems: 'end' }}>
                      <Input
                        label="Скан КИЗа"
                        value={honestCodeScanValue}
                        onChange={(event) => setHonestCodeScanValue(event.target.value)}
                      />
                      <div className="flex items-end order-detail-add-item-action">
                        <Button onClick={handleHonestCodeScan} disabled={scanOrderHonestCode.isPending || !String(honestCodeScanValue || '').trim()}>
                          {scanOrderHonestCode.isPending ? 'Проверяем...' : 'Пикнуть'}
                        </Button>
                      </div>
                    </div>
                    <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginTop: 14 }}>
                      <div className="stat-card">
                        <div className="stat-label">Ожидается</div>
                        <div className="stat-value">{fmt(order.honest_sign_summary?.expected_total || 0)}</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-label">Отсканировано</div>
                        <div className="stat-value">{fmt(order.honest_sign_summary?.scanned_total || 0)}</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-label">Осталось</div>
                        <div className="stat-value">{fmt(order.honest_sign_summary?.remaining_total || 0)}</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-label">Дубли</div>
                        <div className="stat-value" style={{ color: 'var(--red-400)' }}>{fmt(order.honest_sign_summary?.duplicate_total || 0)}</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-label">Чужие</div>
                        <div className="stat-value" style={{ color: 'var(--red-400)' }}>{fmt(order.honest_sign_summary?.unexpected_total || 0)}</div>
                      </div>
                    </div>
                    {honestCodeScanResult?.message && (
                      <div className={`alert ${honestCodeScanResult.result === 'matched' ? 'alert-success' : 'alert-error'}`} style={{ marginTop: 14 }}>
                        {honestCodeScanResult.message}
                        {honestCodeScanResult.product_name ? ` · ${honestCodeScanResult.product_name}` : ''}
                      </div>
                    )}
                    {honestCodeMode === 'file' && renderHonestSignFileImport(false)}
                    {honestCodeImportError && <div className="alert alert-error" style={{ marginTop: 14 }}>{honestCodeImportError}</div>}
                  </div>
                ) : (
                  <div className="surface-note" style={{ marginBottom: 16 }}>
                    <div className="font-medium">Честный знак / КИЗ</div>
                    <div className="text-muted text-sm" style={{ marginTop: 4 }}>
                      Для этой заявки блок ЧЗ скрыт, потому что по товарам нет загруженных КИЗов и нет сканов.
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <Button variant="secondary" onClick={() => setShowHonestSignTools(true)}>
                        Показать блок ЧЗ
                      </Button>
                    </div>
                  </div>
                )
              )}

              {canEditReceiving && (
                <div className="alert alert-info mb-4">
                  Приемка заполняется здесь: внесите фактические значения в поля <strong>Готово</strong> и <strong>Брак</strong> по каждой позиции и нажмите «Сохранить».
                </div>
              )}
              {itemError && <div className="alert alert-error mb-4">{itemError}</div>}
              {(order.items?.length || 0) === 0 ? (
                <div className="surface-note">
                  <div className="font-medium">Товары не добавлены</div>
                  <div className="text-muted text-sm" style={{ marginTop: 4 }}>
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
                        <th style={{ textAlign: 'right', width: 88, whiteSpace: 'nowrap' }}>Заявлено</th>
                        <th style={{ textAlign: 'right', width: 88, whiteSpace: 'nowrap' }}>Готово</th>
                        <th style={{ textAlign: 'right', width: 88, whiteSpace: 'nowrap' }}>Брак</th>
                        {isManager && shouldShowHonestSignTools && honestCodeMode === 'manual' && <th style={{ minWidth: 240 }}>КИЗ / ЧЗ</th>}
                        {canEditReceiving && <th style={{ width: 112 }}></th>}
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
                                  <div style={{ fontWeight: 600 }}>{item.product_name}</div>
                                  {(canManageItems || canEditReceiving) && (
                                    <button
                                      type="button"
                                      className="text-xs text-teal"
                                      style={{
                                        border: 'none',
                                        background: 'none',
                                        padding: 0,
                                        marginTop: 2,
                                        cursor: 'pointer',
                                      }}
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
                            <td className="text-right" style={{ width: 88, whiteSpace: 'nowrap' }}>
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
                            <td className="text-right" style={{ width: 88, whiteSpace: 'nowrap' }}>
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
                            <td className="text-right" style={{ width: 88, whiteSpace: 'nowrap' }}>
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
                              <td style={{ minWidth: 240 }}>
                                <div style={{ display: 'grid', gap: 8 }}>
                                  <div className="text-xs text-muted">
                                    Загружено: <strong>{fmt(item.honest_sign_expected || 0)}</strong> ·
                                    Отсканировано: <strong>{fmt(item.honest_sign_scanned || 0)}</strong> ·
                                    Осталось: <strong>{fmt(item.honest_sign_remaining || 0)}</strong>
                                  </div>
                                  <textarea
                                    value={honestCodeDrafts[item.id] || ''}
                                    onChange={(event) => updateHonestCodeDraft(item.id, event.target.value)}
                                    rows={3}
                                    placeholder="Вставьте список КИЗов, один код в строке"
                                    style={{ resize: 'vertical' }}
                                  />
                                  <div className="flex justify-end">
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
                            {(canManageItems || canEditReceiving) && (
                              <td className="text-right" style={{ width: 112, whiteSpace: 'nowrap' }}>
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

          {activeTab === 'consumables' && (
            <>
              {consumableError && <div className="alert alert-error mb-4">{consumableError}</div>}
              {isManager && order.status === 'active' && (
                <div className="services-editor" style={{ marginBottom: 14 }}>
                  <div className="services-editor-head">
                    <h3>Добавить расходник в этап</h3>
                  </div>
                  <div className="services-editor-grid">
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
                  </div>
                  <div className="form-grid" style={{ marginTop: 12 }}>
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
                  </div>
                  <div className="services-editor-footer">
                    <div className="services-editor-total">
                      {selectedConsumable ? `Выбрано: ${selectedConsumable.name}` : 'Выберите расходник из списка'}
                    </div>
                    <Button
                      onClick={addConsumableToOrder}
                      disabled={!selectedConsumableId || addOrderConsumable.isPending}
                    >
                      Добавить
                    </Button>
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
                        {isManager && <th></th>}
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
                            <td><div style={{ fontWeight: 500 }}>{item.name}</div></td>
                            <td className="text-muted">{item.category || '—'}</td>
                            <td className="text-muted">{item.unit || '—'}</td>
                            <td className="text-right">
                              {isManager && order.status === 'active' ? (
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
                              {isManager && order.status === 'active' ? (
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
                              {isManager && order.status === 'active' ? (
                                <input
                                  type="text"
                                  className="compact-input"
                                  value={draft.comment}
                                  placeholder="Комментарий"
                                  onChange={(event) => handleConsumableDraftChange(item.id, 'comment', event.target.value)}
                                />
                              ) : <span className="text-muted">{item.comment || '—'}</span>}
                            </td>
                            <td className="text-right" style={{ fontWeight: 600 }}>
                              {formatMoney(Number(draft.quantity || 0) * Number(draft.unit_price || 0))}
                            </td>
                            {isManager && (
                              <td className="text-right">
                                <div className="flex gap-2 justify-end">
                                  {order.status === 'active' && (
                                    <Button size="sm" variant="secondary" onClick={() => saveConsumable(item)} disabled={updateOrderConsumable.isPending}>Сохранить</Button>
                                  )}
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
              {isManager && order.status === 'active' && (
                  <div className="services-editor" ref={serviceDropdownRef}>
                    <div className="services-editor-head">
                      <h3>Оказанные услуги</h3>
                      <div className="flex gap-2">
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
                                    <div className="services-search-option" style={{ cursor: 'default' }}>
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
                              <div className="form-grid" style={{ marginBottom: 14 }}>
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
                                          <div style={{ fontWeight: 600 }}>{draft.customServiceName || selectedTariff?.name}</div>
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
                                        <td className="text-right" style={{ fontWeight: 700 }}>{formatMoney(pricing.total)}</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>

                                <div className="services-editor-footer">
                                  <div className="services-editor-total">
                                    Общая сумма <strong>{formatMoney(pricing.total)}</strong>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button variant="secondary" onClick={() => setManualServiceMode(draft.localId, true)}>
                                      Своя услуга
                                    </Button>
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
                  <div className="alert alert-error" style={{ marginBottom: 16 }}>
                    {chargeError}
                  </div>
                )}

                {charges?.items?.length ? (
                <>
                  <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 16 }}>
                    <div className="stat-card">
                      <div className="stat-label">Начислено</div>
                      <div className="stat-value">{formatMoney(charges.summary.total)}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Оплачено</div>
                      <div className="stat-value">{formatMoney(charges.summary.paid)}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">К оплате</div>
                      <div className="stat-value">{formatMoney(charges.summary.pending)}</div>
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
                          {isManager && <th></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {charges.items.map((charge) => (
                          <tr key={charge.id}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{charge.description || charge.tariff_code}</div>
                            </td>
                            <td>
                              <Badge variant={charge.status === 'paid' ? 'green' : charge.status === 'confirmed' ? 'blue' : 'amber'}>
                                {charge.status === 'paid' ? 'Оплачено' : charge.status === 'confirmed' ? 'Подтверждено' : 'Ожидает'}
                              </Badge>
                            </td>
                            <td className="text-right">
                              {isManager ? (
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
                              {isManager ? (
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
                            <td className="text-right" style={{ fontWeight: 600 }}>
                              {formatMoney(
                                isManager
                                  ? Number((Number(chargeDrafts[charge.id]?.quantity ?? charge.quantity) * Number(chargeDrafts[charge.id]?.unit_price ?? charge.unit_price)).toFixed(2))
                                  : charge.total
                              )}
                            </td>
                            {isManager && (
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
                      {stage.note && <div className="text-sm text-muted" style={{ marginTop: 6 }}>{stage.note}</div>}
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
            <div className="modal-footer" style={{ padding: 0, border: 'none' }}>
              <Button variant="secondary" onClick={() => setItemEditModal(null)}>Отмена</Button>
              <Button onClick={saveItemFromModal} disabled={updateItem.isPending}>Сохранить</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={stageModal} onClose={() => setStageModal(false)} title="Сменить этап">
        <div className="type-cards type-cards-compact">
          {stageList.filter((stage) => stage !== order.stage).map((stage) => (
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
        <div className="modal-footer" style={{ padding: 0, border: 'none' }}>
          <Button variant="secondary" onClick={() => setStageModal(false)}>Отмена</Button>
          <Button onClick={handleMoveStage} disabled={!newStage || moveStage.isPending}>
            {moveStage.isPending ? 'Сохраняем...' : 'Сохранить'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
