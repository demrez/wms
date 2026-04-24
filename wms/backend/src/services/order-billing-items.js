const db = require('../db/knex');
const { getTariffPrice } = require('./billing');
const { formatWarehouseLabel } = require('./logistics-reference');
let orderConsumablesHasCreatedBy = null;

async function hasOrderConsumablesCreatedBy() {
  if (orderConsumablesHasCreatedBy === null) {
    orderConsumablesHasCreatedBy = await db.schema.hasColumn('order_consumables', 'created_by');
  }
  return orderConsumablesHasCreatedBy;
}

function mapServiceUnit(unit) {
  switch (unit) {
    case 'per_unit': return 'ед.';
    case 'per_order': return 'заявка';
    case 'per_kg': return 'кг';
    case 'per_m3': return 'м³';
    case 'per_day': return 'дн.';
    default: return unit || 'ед.';
  }
}

function mapSupplyUnit(unit) {
  switch (unit) {
    case 'pcs': return 'шт.';
    case 'm': return 'м';
    case 'kg': return 'кг';
    case 'roll': return 'рул.';
    case 'pack': return 'упак.';
    default: return unit || 'ед.';
  }
}

function marketplaceLabel(marketplace) {
  switch ((marketplace || '').toLowerCase()) {
    case 'wb': return 'WB';
    case 'ozon': return 'Ozon';
    case 'yandex': return 'Яндекс.Маркет';
    default: return marketplace || 'Маркетплейс';
  }
}

function resolveShipmentTariffCode(shipment) {
  const marketplace = String(shipment?.marketplace || '').toLowerCase();
  const warehouse = String(shipment?.warehouse_name || '').toLowerCase();

  if (marketplace === 'wb' && /(тула|алексин)/i.test(warehouse)) {
    return 'logistics_wb_tula';
  }
  if (marketplace === 'wb') return 'logistics_wb_order';
  if (marketplace === 'ozon') return 'logistics_ozon_order';
  if (marketplace === 'yandex') return 'logistics_yandex_order';
  return 'logistics_per_unit';
}

async function loadOrderBillingBundle(orderId) {
  const order = await db('orders')
    .join('companies', 'companies.id', 'orders.company_id')
    .where('orders.id', orderId)
    .select(
      'orders.*',
      'companies.name as company_name',
      'companies.inn as company_inn'
    )
    .first();

  if (!order) return null;

  const hasConsumableCreatedBy = await hasOrderConsumablesCreatedBy();

  const servicesQuery = db('order_services')
      .join('service_templates', 'service_templates.id', 'order_services.service_id')
      .leftJoin('users', 'users.id', 'order_services.created_by')
      .where('order_services.order_id', orderId)
      .select(
        'order_services.*',
        'service_templates.name as service_name',
        'service_templates.unit as service_unit',
        'service_templates.category',
        'users.full_name as created_by_name'
      )
      .orderBy('order_services.created_at');

  const consumablesQuery = db('order_consumables')
      .join('consumables', 'consumables.id', 'order_consumables.consumable_id')
      .where('order_consumables.order_id', orderId)
      .orderBy('order_consumables.created_at');
  if (hasConsumableCreatedBy) {
    consumablesQuery.leftJoin('users', 'users.id', 'order_consumables.created_by');
  }
  consumablesQuery.select(
    'order_consumables.*',
    'consumables.code',
    'consumables.name as consumable_name',
    'consumables.category',
    'consumables.unit as consumable_unit',
    ...(hasConsumableCreatedBy
      ? ['users.full_name as created_by_name']
      : [db.raw('null as created_by_name')])
  );

  const [services, consumables, shipments, charges] = await Promise.all([
    servicesQuery,
    consumablesQuery,
    db('order_marketplace_shipments')
      .leftJoin('users', 'users.id', 'order_marketplace_shipments.created_by')
      .where('order_marketplace_shipments.order_id', orderId)
      .select(
        'order_marketplace_shipments.*',
        'users.full_name as created_by_name'
      )
      .orderBy('order_marketplace_shipments.created_at'),
    db('charges')
      .where({ order_id: orderId, company_id: order.company_id })
      .orderBy('created_at', 'asc'),
  ]);

  return {
    order,
    company: {
      name: order.company_name,
      inn: order.company_inn,
    },
    services,
    consumables,
    shipments,
    charges,
  };
}

async function decorateShipmentsWithBilling(shipments = [], companyId) {
  const warehouseRows = await db('logistics_warehouses')
    .where({ is_active: true })
    .select('marketplace', 'name', 'price_per_unit', 'price_per_pallet');
  const warehouseMap = new Map(
    warehouseRows.map((row) => [
      formatWarehouseLabel(row.marketplace, row.name).toLowerCase(),
      row,
    ])
  );

  return Promise.all((shipments || []).map(async (shipment) => {
    const tariffCode = resolveShipmentTariffCode(shipment);
    const tariffPrice = Number(await getTariffPrice(companyId, tariffCode) || 0);
    const manualUnitPrice = shipment.unit_price !== null && shipment.unit_price !== undefined && shipment.unit_price !== ''
      ? Number(shipment.unit_price)
      : null;
    const warehouse = warehouseMap.get(String(shipment?.warehouse_name || '').trim().toLowerCase()) || null;
    const warehousePrice = warehouse
      ? Number(shipment.billing_rate === 'per_pallet' ? warehouse.price_per_pallet : warehouse.price_per_unit)
      : null;
    const unitPrice = Number(manualUnitPrice ?? warehousePrice ?? tariffPrice ?? 0);
    const placesCount = Number(shipment.places_count || 0);
    return {
      ...shipment,
      billing_tariff_code: tariffCode,
      billing_unit_price: unitPrice,
      billing_total: Number((unitPrice * placesCount).toFixed(2)),
    };
  }));
}

async function buildOrderBillingItems(bundle) {
  if (!bundle) return [];

  const items = [];
  let sortOrder = 0;

  for (const service of bundle.services || []) {
    const descriptionParts = [service.service_name];
    if (service.note) descriptionParts.push(service.note);
    items.push({
      description: descriptionParts.filter(Boolean).join(' — '),
      quantity: Number(service.quantity || 0),
      unit: mapServiceUnit(service.service_unit),
      unit_price: Number(service.unit_price || 0),
      total: Number(service.total || 0),
      source_type: 'service',
      source_id: service.id,
      sort_order: sortOrder++,
    });
  }

  for (const consumable of bundle.consumables || []) {
    const descriptionParts = [consumable.consumable_name];
    if (consumable.comment) descriptionParts.push(consumable.comment);
    const quantity = Number(consumable.quantity || 0);
    const unitPrice = Number(consumable.unit_price || 0);
    items.push({
      description: descriptionParts.filter(Boolean).join(' — '),
      quantity,
      unit: mapSupplyUnit(consumable.consumable_unit),
      unit_price: unitPrice,
      total: Number(consumable.total || (quantity * unitPrice)),
      source_type: 'manual',
      source_id: null,
      sort_order: sortOrder++,
    });
  }

  const pricedShipments = await decorateShipmentsWithBilling(bundle.shipments || [], bundle.order.company_id);
  for (const shipment of pricedShipments) {
    const metaParts = [];
    if (shipment.places_count) metaParts.push(`${shipment.places_count} мест`);
    if (shipment.quantity) metaParts.push(`${shipment.quantity} ед.`);
    if (shipment.ship_date) {
      const date = new Date(shipment.ship_date);
      if (!Number.isNaN(date.getTime())) {
        metaParts.push(date.toLocaleDateString('ru-RU'));
      }
    }
    if (shipment.note) metaParts.push(shipment.note);

    items.push({
      description: [
        `Логистика ${marketplaceLabel(shipment.marketplace)}`,
        shipment.warehouse_name,
        ...metaParts,
      ].filter(Boolean).join(' — '),
      quantity: Number(shipment.places_count || 0),
      unit: shipment.billing_rate === 'per_pallet' ? 'палет' : 'короб',
      unit_price: Number(shipment.billing_unit_price || 0),
      total: Number(shipment.billing_total || shipment.billing_unit_price || 0),
      source_type: 'manual',
      source_id: null,
      sort_order: sortOrder++,
    });
  }

  for (const charge of bundle.charges || []) {
    items.push({
      description: charge.description || charge.tariff_code,
      quantity: Number(charge.quantity || 0),
      unit: 'ед.',
      unit_price: Number(charge.unit_price || 0),
      total: Number(charge.total || 0),
      source_type: 'charge',
      source_id: charge.id,
      sort_order: sortOrder++,
    });
  }

  return items;
}

module.exports = {
  loadOrderBillingBundle,
  buildOrderBillingItems,
  decorateShipmentsWithBilling,
  resolveShipmentTariffCode,
  marketplaceLabel,
};
