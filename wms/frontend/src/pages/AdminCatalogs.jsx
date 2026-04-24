import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useTariffs,
  useCreateTariff,
  useUpdateTariff,
  useDeleteTariff,
  useConsumables,
  useCreateConsumable,
  useUpdateConsumable,
  useDeleteConsumable,
  useLogisticsWarehouses,
  useCreateLogisticsWarehouse,
  useUpdateLogisticsWarehouse,
  useDeleteLogisticsWarehouse,
} from '../hooks/queries';
import { PageHeader, Button, Modal, Input, fmt, Empty, Spinner, Badge } from '../components/ui';

const SERVICE_FORM = { code: '', name: '', description: '', unit: 'шт', price: '0' };
const CONSUMABLE_FORM = { code: '', name: '', category: 'Упаковка', unit: 'шт', price: '0', stock_qty: '0', min_qty: '0', comment: '' };
const LOGISTICS_FORM = {
  marketplace: 'wb',
  name: '',
  price_per_unit: '0',
  price_per_pallet: '0',
  sort_order: '0',
  is_active: true,
};

const LOGISTICS_MARKETPLACE_LABELS = {
  wb: 'WB',
  wb_region: 'WB Регион',
  yandex: 'Яндекс',
  ozon: 'Ozon',
  other: 'Прочее',
};

const formatMoney = (value) =>
  Number(value || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ServiceModal({ open, onClose, initial, onSubmit, pending }) {
  const [form, setForm] = useState(initial || SERVICE_FORM);
  useEffect(() => {
    setForm(initial || SERVICE_FORM);
  }, [initial, open]);

  if (!open) return null;

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Редактировать услугу' : 'Новая услуга'}>
      <Input label="Код" value={form.code} onChange={(e) => set('code', e.target.value)} disabled={!!initial} />
      <Input label="Название" value={form.name} onChange={(e) => set('name', e.target.value)} />
      <Input label="Описание" value={form.description} onChange={(e) => set('description', e.target.value)} />
      <Input label="Ед. измерения" value={form.unit} onChange={(e) => set('unit', e.target.value)} />
      <Input label="Цена" className="compact-number-input" type="number" min="0" step="0.01" value={form.price} onChange={(e) => set('price', e.target.value)} />
      <div className="modal-footer" style={{ padding: 0, border: 'none', marginTop: 16 }}>
        <Button variant="secondary" onClick={onClose}>Отмена</Button>
        <Button
          onClick={() => onSubmit({
            ...form,
            price: Number(form.price || 0),
          })}
          disabled={pending}
        >
          {initial ? 'Сохранить' : 'Добавить'}
        </Button>
      </div>
    </Modal>
  );
}

function ConsumableModal({ open, onClose, initial, onSubmit, pending }) {
  const [form, setForm] = useState(initial || CONSUMABLE_FORM);
  useEffect(() => {
    setForm(initial || CONSUMABLE_FORM);
  }, [initial, open]);

  if (!open) return null;

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Редактировать расходник' : 'Новый расходник'}>
      <Input label="Код" value={form.code} onChange={(e) => set('code', e.target.value)} disabled={!!initial} />
      <Input label="Название" value={form.name} onChange={(e) => set('name', e.target.value)} />
      <Input label="Категория" value={form.category} onChange={(e) => set('category', e.target.value)} />
      <Input label="Ед. измерения" value={form.unit} onChange={(e) => set('unit', e.target.value)} />
      <Input label="Цена" className="compact-number-input" type="number" min="0" step="0.01" value={form.price} onChange={(e) => set('price', e.target.value)} />
      <Input label="Остаток" className="compact-number-input" type="number" min="0" value={form.stock_qty} onChange={(e) => set('stock_qty', e.target.value)} />
      <Input label="Мин. остаток" className="compact-number-input" type="number" min="0" value={form.min_qty} onChange={(e) => set('min_qty', e.target.value)} />
      <Input label="Комментарий" value={form.comment} onChange={(e) => set('comment', e.target.value)} />
      <div className="modal-footer" style={{ padding: 0, border: 'none', marginTop: 16 }}>
        <Button variant="secondary" onClick={onClose}>Отмена</Button>
        <Button
          onClick={() => onSubmit({
            ...form,
            price: Number(form.price || 0),
            stock_qty: Number(form.stock_qty || 0),
            min_qty: Number(form.min_qty || 0),
          })}
          disabled={pending}
        >
          {initial ? 'Сохранить' : 'Добавить'}
        </Button>
      </div>
    </Modal>
  );
}

function LogisticsModal({ open, onClose, initial, onSubmit, pending }) {
  const [form, setForm] = useState(initial || LOGISTICS_FORM);
  useEffect(() => {
    setForm(initial || LOGISTICS_FORM);
  }, [initial, open]);

  if (!open) return null;

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Редактировать склад' : 'Новый склад'}>
      <div className="form-group">
        <label>Маркетплейс</label>
        <select value={form.marketplace} onChange={(e) => set('marketplace', e.target.value)}>
          <option value="wb">WB</option>
          <option value="wb_region">WB Регион</option>
          <option value="yandex">Яндекс</option>
          <option value="ozon">Ozon</option>
          <option value="other">Прочее</option>
        </select>
      </div>
      <Input label="Название склада" value={form.name} onChange={(e) => set('name', e.target.value)} />
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <Input label="Цена за короб" className="compact-number-input" type="number" min="0" step="0.01" value={form.price_per_unit} onChange={(e) => set('price_per_unit', e.target.value)} />
        <Input label="Цена за палет" className="compact-number-input" type="number" min="0" step="0.01" value={form.price_per_pallet} onChange={(e) => set('price_per_pallet', e.target.value)} />
      </div>
      <Input label="Порядок сортировки" className="compact-number-input" type="number" min="0" value={form.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
      <label className="flex items-center gap-2" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={form.is_active !== false} onChange={(e) => set('is_active', e.target.checked)} />
        <span>Активен</span>
      </label>
      <div className="modal-footer" style={{ padding: 0, border: 'none', marginTop: 16 }}>
        <Button variant="secondary" onClick={onClose}>Отмена</Button>
        <Button
          onClick={() => onSubmit({
            ...form,
            price_per_unit: Number(form.price_per_unit || 0),
            price_per_pallet: Number(form.price_per_pallet || 0),
            sort_order: Number(form.sort_order || 0),
            is_active: form.is_active !== false,
          })}
          disabled={pending}
        >
          {initial ? 'Сохранить' : 'Добавить'}
        </Button>
      </div>
    </Modal>
  );
}

export default function AdminCatalogs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = ['services', 'consumables', 'logistics'].includes(searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'services';
  const [tab, setTab] = useState(initialTab);
  const [serviceModal, setServiceModal] = useState(null);
  const [consumableModal, setConsumableModal] = useState(null);
  const [logisticsModal, setLogisticsModal] = useState(null);
  const { data: tariffs, isLoading: tariffsLoading } = useTariffs();
  const { data: consumables, isLoading: consumablesLoading } = useConsumables();
  const { data: logisticsWarehouses, isLoading: logisticsLoading } = useLogisticsWarehouses();
  const createTariff = useCreateTariff();
  const updateTariff = useUpdateTariff();
  const deleteTariff = useDeleteTariff();
  const createConsumable = useCreateConsumable();
  const updateConsumable = useUpdateConsumable();
  const deleteConsumable = useDeleteConsumable();
  const createLogisticsWarehouse = useCreateLogisticsWarehouse();
  const updateLogisticsWarehouse = useUpdateLogisticsWarehouse();
  const deleteLogisticsWarehouse = useDeleteLogisticsWarehouse();

  const serviceRows = Array.isArray(tariffs) ? tariffs : [];
  const consumableRows = Array.isArray(consumables) ? consumables : [];
  const logisticsRows = Array.isArray(logisticsWarehouses) ? logisticsWarehouses : [];
  const activeLogisticsRows = logisticsRows.filter((row) => row.is_active !== false);
  const consumablesTotal = useMemo(
    () => consumableRows.reduce((sum, item) => sum + Number(item.stock_qty || 0), 0),
    [consumableRows]
  );
  const logisticsUnitTotal = useMemo(
    () => activeLogisticsRows.reduce((sum, row) => sum + Number(row.price_per_unit || 0), 0),
    [activeLogisticsRows]
  );
  const logisticsPalletTotal = useMemo(
    () => activeLogisticsRows.reduce((sum, row) => sum + Number(row.price_per_pallet || 0), 0),
    [activeLogisticsRows]
  );
  const logisticsStats = useMemo(() => [
    {
      label: 'Складов',
      value: fmt(logisticsRows.length),
      sub: 'в каталоге логистики',
    },
    {
      label: 'Активных',
      value: fmt(activeLogisticsRows.length),
      sub: 'доступно для заявок',
    },
    {
      label: 'Сумма цен за короб',
      value: `${formatMoney(logisticsUnitTotal)} ₽`,
      sub: 'по активным складам',
    },
    {
      label: 'Сумма цен за палет',
      value: `${formatMoney(logisticsPalletTotal)} ₽`,
      sub: 'по активным складам',
    },
  ], [activeLogisticsRows.length, logisticsPalletTotal, logisticsRows.length, logisticsUnitTotal]);

  useEffect(() => {
    const next = searchParams.get('tab');
    if (['services', 'consumables', 'logistics'].includes(next) && next !== tab) {
      setTab(next);
    }
    if (!next && tab !== 'services') {
      setTab('services');
    }
  }, [searchParams, tab]);

  const changeTab = (nextTab) => {
    setTab(nextTab);
    if (nextTab === 'services') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: nextTab }, { replace: true });
    }
  };

  return (
    <div>
      <PageHeader title="Администрирование">
        {tab === 'services' ? (
          <Button onClick={() => setServiceModal(SERVICE_FORM)}>+ Услуга</Button>
        ) : tab === 'consumables' ? (
          <Button onClick={() => setConsumableModal(CONSUMABLE_FORM)}>+ Расходник</Button>
        ) : (
          <Button onClick={() => setLogisticsModal(LOGISTICS_FORM)}>+ Склад</Button>
        )}
      </PageHeader>

      <div className="stats-grid" style={{ gridTemplateColumns: tab === 'logistics' ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)' }}>
        {tab === 'logistics' ? logisticsStats.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value">{stat.value}</div>
            <div className="stat-sub">{stat.sub}</div>
          </div>
        )) : (
          <>
            <div className="stat-card">
              <div className="stat-label">Услуг</div>
              <div className="stat-value">{fmt(serviceRows.length)}</div>
              <div className="stat-sub">доступно в справочнике</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Расходников</div>
              <div className="stat-value">{fmt(consumableRows.length)}</div>
              <div className="stat-sub">позиций склада</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Единиц расходников</div>
              <div className="stat-value">{fmt(consumablesTotal)}</div>
              <div className="stat-sub">общий остаток</div>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="tab-bar">
          <button className={`tab-btn${tab === 'services' ? ' active' : ''}`} onClick={() => changeTab('services')}>
            Услуги ({serviceRows.length})
          </button>
          <button className={`tab-btn${tab === 'consumables' ? ' active' : ''}`} onClick={() => changeTab('consumables')}>
            Расходники ({consumableRows.length})
          </button>
          <button className={`tab-btn${tab === 'logistics' ? ' active' : ''}`} onClick={() => changeTab('logistics')}>
            Логистика ({logisticsRows.length})
          </button>
        </div>

        {tab === 'services' && (
          tariffsLoading ? <Spinner /> : serviceRows.length === 0 ? <Empty text="Услуг пока нет" /> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Код</th>
                    <th>Название</th>
                    <th>Описание</th>
                    <th>Ед.</th>
                    <th style={{ textAlign: 'right' }}>Цена</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {serviceRows.map((row) => (
                    <tr key={row.code}>
                      <td className="mono text-muted">{row.code}</td>
                      <td style={{ fontWeight: 500 }}>{row.name}</td>
                      <td className="text-muted">{row.description || '—'}</td>
                      <td className="text-muted">{row.unit}</td>
                      <td className="text-right">{Number(row.price || 0).toLocaleString('ru-RU')} ₽</td>
                      <td className="text-right">
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <Button size="sm" variant="secondary" onClick={() => setServiceModal({ ...row, price: String(row.price || 0) })}>Изменить</Button>
                          <Button size="sm" variant="secondary" onClick={() => deleteTariff.mutate(row.code)}>Скрыть</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {tab === 'consumables' && (
          consumablesLoading ? <Spinner /> : consumableRows.length === 0 ? <Empty text="Расходников пока нет" /> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Код</th>
                    <th>Название</th>
                    <th>Категория</th>
                    <th>Ед.</th>
                    <th style={{ textAlign: 'right' }}>Цена</th>
                    <th style={{ textAlign: 'right' }}>Остаток</th>
                    <th style={{ textAlign: 'right' }}>Мин.</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {consumableRows.map((row) => (
                    <tr key={row.id}>
                      <td className="mono text-muted">{row.code}</td>
                      <td style={{ fontWeight: 500 }}>{row.name}</td>
                      <td className="text-muted">{row.category || '—'}</td>
                      <td className="text-muted">{row.unit}</td>
                      <td className="text-right">{Number(row.price || 0).toLocaleString('ru-RU')} ₽</td>
                      <td className="text-right">{fmt(row.stock_qty)}</td>
                      <td className="text-right">{fmt(row.min_qty)}</td>
                      <td className="text-right">
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <Button size="sm" variant="secondary" onClick={() => setConsumableModal({ ...row, price: String(row.price || 0), stock_qty: String(row.stock_qty || 0), min_qty: String(row.min_qty || 0) })}>Изменить</Button>
                          <Button size="sm" variant="secondary" onClick={() => deleteConsumable.mutate(row.id)}>Скрыть</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {tab === 'logistics' && (
          logisticsLoading ? <Spinner /> : logisticsRows.length === 0 ? <Empty text="Склады пока не добавлены" /> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Маркетплейс</th>
                    <th>Склад</th>
                    <th style={{ textAlign: 'right' }}>Цена / короб</th>
                    <th style={{ textAlign: 'right' }}>Цена / палет</th>
                    <th style={{ textAlign: 'right' }}>Порядок</th>
                    <th>Статус</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {logisticsRows.map((row) => (
                    <tr key={row.id}>
                      <td className="text-muted">{LOGISTICS_MARKETPLACE_LABELS[row.marketplace] || row.marketplace}</td>
                      <td style={{ fontWeight: 500 }}>{row.name}</td>
                      <td className="text-right">{formatMoney(row.price_per_unit)} ₽</td>
                      <td className="text-right">{formatMoney(row.price_per_pallet)} ₽</td>
                      <td className="text-right">{fmt(row.sort_order || 0)}</td>
                      <td>
                        <Badge variant={row.is_active ? 'green' : 'gray'}>{row.is_active ? 'Активен' : 'Скрыт'}</Badge>
                      </td>
                      <td className="text-right">
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setLogisticsModal({
                              ...row,
                              price_per_unit: String(row.price_per_unit ?? 0),
                              price_per_pallet: String(row.price_per_pallet ?? 0),
                              sort_order: String(row.sort_order ?? 0),
                              is_active: row.is_active !== false,
                            })}
                          >
                            Изменить
                          </Button>
                          {row.is_active ? (
                            <Button size="sm" variant="secondary" onClick={() => deleteLogisticsWarehouse.mutate(row.id)}>
                              Скрыть
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => updateLogisticsWarehouse.mutate({
                                id: row.id,
                                is_active: true,
                              })}
                            >
                              Восстановить
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      <ServiceModal
        open={!!serviceModal}
        initial={serviceModal && serviceModal.code ? serviceModal : null}
        onClose={() => setServiceModal(null)}
        pending={createTariff.isPending || updateTariff.isPending}
        onSubmit={async (data) => {
          if (serviceModal?.code) await updateTariff.mutateAsync({ code: serviceModal.code, ...data });
          else await createTariff.mutateAsync(data);
          setServiceModal(null);
        }}
      />

      <ConsumableModal
        open={!!consumableModal}
        initial={consumableModal && consumableModal.id ? consumableModal : null}
        onClose={() => setConsumableModal(null)}
        pending={createConsumable.isPending || updateConsumable.isPending}
        onSubmit={async (data) => {
          if (consumableModal?.id) await updateConsumable.mutateAsync({ id: consumableModal.id, ...data });
          else await createConsumable.mutateAsync(data);
          setConsumableModal(null);
          }}
        />

      <LogisticsModal
        open={!!logisticsModal}
        initial={logisticsModal && logisticsModal.id ? logisticsModal : null}
        onClose={() => setLogisticsModal(null)}
        pending={createLogisticsWarehouse.isPending || updateLogisticsWarehouse.isPending}
        onSubmit={async (data) => {
          if (logisticsModal?.id) await updateLogisticsWarehouse.mutateAsync({ id: logisticsModal.id, ...data });
          else await createLogisticsWarehouse.mutateAsync(data);
          setLogisticsModal(null);
        }}
      />
    </div>
  );
}
