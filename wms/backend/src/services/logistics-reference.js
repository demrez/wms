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

const GROUP_ORDER = new Map(DEFAULT_WAREHOUSE_GROUPS.map((group, index) => [group.key, index]));
const GROUP_META = {
  wb: { key: 'wb', label: 'WB' },
  wb_region: { key: 'wb_region', label: 'WB Регион' },
  yandex: { key: 'yandex', label: 'Яндекс' },
  ozon: { key: 'ozon', label: 'Ozon' },
  other: { key: 'other', label: 'Прочее' },
};

function normalize(values = []) {
  return Array.from(
    new Set(values.map((value) => String(value || '').trim()).filter(Boolean))
  );
}

function detectGroupKey(name) {
  const value = String(name || '').trim().toLowerCase();
  if (!value) return 'other';
  if (value.startsWith('ям') || value.startsWith('яндекс')) return 'yandex';
  if (value.startsWith('wb регион') || value.startsWith('wb region')) return 'wb_region';
  if (value.startsWith('wb')) return 'wb';
  if (value.startsWith('ozon')) return 'ozon';
  return 'other';
}

function getGroupMeta(key) {
  return GROUP_META[key] || GROUP_META.other;
}

function formatWarehouseLabel(marketplace, name) {
  const trimmedName = String(name || '').trim();
  const meta = getGroupMeta(String(marketplace || '').trim().toLowerCase());
  if (!trimmedName) return '';
  if (meta.key === 'other') return trimmedName;
  if (trimmedName.toLowerCase().startsWith(`${meta.label.toLowerCase()} —`)) return trimmedName;
  return `${meta.label} — ${trimmedName}`;
}

function buildWarehouseReference({
  warehouseNames = [],
  warehouseRecords = [],
  fallbackGroups = DEFAULT_WAREHOUSE_GROUPS,
} = {}) {
  const groups = new Map();
  const catalog = new Map();

  const add = (key, label, item) => {
    if (!item) return;
    if (!groups.has(key)) {
      groups.set(key, { key, label, items: [] });
    }
    const group = groups.get(key);
    if (!group.items.includes(item)) {
      group.items.push(item);
    }
  };

  const addCatalog = (record, source = 'db') => {
    const marketplace = String(record.marketplace || '').trim().toLowerCase() || 'other';
    const name = String(record.name || '').trim();
    const label = String(record.label || formatWarehouseLabel(marketplace, name)).trim();
    if (!name && !label) return;
    const key = `${marketplace}|${label}`.toLowerCase();
    if (!catalog.has(key)) {
      catalog.set(key, {
        marketplace,
        name,
        label,
        price_per_unit: Number(record.price_per_unit || 0),
        price_per_pallet: Number(record.price_per_pallet || 0),
        is_active: record.is_active !== false,
        source,
      });
    }
  };

  fallbackGroups.forEach((group) => {
    group.items.forEach((item) => add(group.key, group.label, item));
  });

  (warehouseRecords || []).forEach((record) => {
    const marketplace = String(record.marketplace || '').trim().toLowerCase() || 'other';
    const label = formatWarehouseLabel(marketplace, record.name);
    const meta = getGroupMeta(marketplace);
    add(meta.key, meta.label, label);
    addCatalog({ ...record, marketplace, label });
  });

  normalize(warehouseNames).forEach((item) => {
    const key = detectGroupKey(item);
    if (key === 'wb_region') add('wb_region', 'WB Регион', item);
    else if (key === 'wb') add('wb', 'WB', item);
    else if (key === 'yandex') add('yandex', 'Яндекс', item);
    else if (key === 'ozon') add('ozon', 'Ozon', item);
    else add('other', 'Прочее', item);
    addCatalog({ marketplace: key, name: item, label: item, price_per_unit: 0, price_per_pallet: 0, source: 'fallback' });
  });

  const orderedGroups = Array.from(groups.values()).sort((a, b) => {
    const ai = GROUP_ORDER.has(a.key) ? GROUP_ORDER.get(a.key) : 999;
    const bi = GROUP_ORDER.has(b.key) ? GROUP_ORDER.get(b.key) : 999;
    if (ai !== bi) return ai - bi;
    return a.label.localeCompare(b.label, 'ru');
  });

  return {
    warehouse_groups: orderedGroups.map((group) => ({
      key: group.key,
      label: group.label,
      items: normalize(group.items),
    })),
    warehouses: normalize(orderedGroups.flatMap((group) => group.items)),
    warehouse_catalog: Array.from(catalog.values()).sort((a, b) => {
      const ai = GROUP_ORDER.has(detectGroupKey(a.label)) ? GROUP_ORDER.get(detectGroupKey(a.label)) : 999;
      const bi = GROUP_ORDER.has(detectGroupKey(b.label)) ? GROUP_ORDER.get(detectGroupKey(b.label)) : 999;
      if (ai !== bi) return ai - bi;
      return a.label.localeCompare(b.label, 'ru');
    }),
  };
}

module.exports = {
  DEFAULT_WAREHOUSE_GROUPS,
  buildWarehouseReference,
  formatWarehouseLabel,
  normalize,
};
