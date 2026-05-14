import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOrders, useCompanies } from '../hooks/queries';
import AdminOrderCard from '../components/AdminOrderCard';
import { PageHeader, Button, TypeBadge, StageBadge, fmt, Spinner, Empty, Select } from '../components/ui';

const STAGE_OPTIONS = [
  ['', 'Все этапы'], ['new', 'Новая'], ['approval', 'Согласование'],
  ['pickup', 'Забор груза'], ['in_transit', 'В пути'], ['receiving', 'Приёмка'],
  ['accepted', 'Принято'], ['waiting', 'Ожидает'], ['in_progress', 'В работе'],
  ['delivered', 'Доставлено'], ['done', 'Готово'],
];

const SUPPLY_STAGES    = ['new','approval','pickup','in_transit','receiving','accepted','mp_shipping','done'];
const PROCESS_STAGES   = ['new','waiting','in_progress','done'];
const LOGISTICS_STAGES = ['new','approval','pickup','mp_shipping','done'];
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
  mp_shipping: 'Отгрузка МП',
  done: 'Готово',
};
const TYPE_LABELS = { supply: 'Поставка', processing: 'Обработка', logistics: 'Логистика' };
const MOBILE_ROW_TYPE_CLASS = {
  supply: 'supply',
  processing: 'processing',
  logistics: 'logistics',
};
const VIEW_OPTIONS = [
  ['kanban', 'Канбан'],
  ['list', 'Список'],
];
const KANBAN_COLUMNS = [
  ['new', 'Новые'],
  ['approval', 'Согласование'],
  ['pickup', 'Забор груза'],
  ['in_transit', 'В пути'],
  ['receiving', 'Приёмка'],
  ['waiting', 'Ожидает'],
  ['in_progress', 'В работе'],
  ['accepted', 'Принято'],
  ['mp_shipping', 'Отгрузка МП'],
  ['done', 'Готово'],
];

function formatMobileRowDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU');
}

function formatMobileRowSub(order) {
  const date = formatMobileRowDate(order.shipping_date || order.created_at);
  if (order.type === 'processing') return `${order.shipping_warehouse || 'Без склада'}${date ? ` · ${date}` : ''}`;
  if (order.type === 'logistics') return `${order.shipping_warehouse || 'WB'}${date ? ` · ${date}` : ''}`;
  return `${order.shipping_warehouse || 'Без адреса'}${date ? ` · ${date}` : ''}`;
}

function normalizeDisplayStage(order) {
  if (order?.type === 'logistics' && ['in_transit', 'delivered'].includes(order.stage)) {
    return 'mp_shipping';
  }
  return order?.stage;
}

function readStatusFromSearch(params) {
  const value = params.get('status');
  if (value === 'done' || value === 'all') return value;
  return 'active';
}

export default function Orders() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch]       = useState('');
  const [type, setType]           = useState('');
  const [status, setStatus]       = useState(readStatusFromSearch(searchParams));
  const [stage, setStage]         = useState('');
  const [companyId, setCompanyId] = useState(searchParams.get('company_id') || '');
  const [view, setView]           = useState('kanban');
  const { data: companies } = useCompanies();
  const { data: orders, isLoading } = useOrders({ search, type, status, stage, company_id: companyId });
  const companyOptions = Array.isArray(companies) ? companies : [];
  const orderRows = Array.isArray(orders) ? orders : [];
  const kanbanColumns = useMemo(() => {
    const grouped = new Map(KANBAN_COLUMNS.map(([key, label]) => [key, { key, label, orders: [] }]));

    orderRows.forEach((order) => {
      const displayStage = normalizeDisplayStage(order);
      if (!grouped.has(displayStage)) {
        grouped.set(displayStage, { key: displayStage, label: STAGE_LABELS[displayStage] || displayStage, orders: [] });
      }
      grouped.get(displayStage).orders.push(order);
    });

    return Array.from(grouped.values()).filter((column) => {
      if (column.key === 'new') return true;
      if (stage && column.key === stage) return true;
      return column.orders.length > 0;
    });
  }, [orderRows, stage]);

  useEffect(() => {
    const nextStatus = readStatusFromSearch(searchParams);
    setStatus((current) => (current === nextStatus ? current : nextStatus));
  }, [searchParams]);

  useEffect(() => {
    const nextCompanyId = searchParams.get('company_id') || '';
    setCompanyId((current) => (current === nextCompanyId ? current : nextCompanyId));
  }, [searchParams]);

  function handleStatusChange(nextStatus) {
    setStatus(nextStatus);
    const nextParams = new URLSearchParams(searchParams);
    if (nextStatus === 'done') nextParams.set('status', 'done');
    else if (nextStatus === 'all') nextParams.set('status', 'all');
    else nextParams.delete('status');
    setSearchParams(nextParams, { replace: true });
  }

  function handleCompanyChange(nextCompanyId) {
    setCompanyId(nextCompanyId);
    const nextParams = new URLSearchParams(searchParams);
    if (nextCompanyId) nextParams.set('company_id', nextCompanyId);
    else nextParams.delete('company_id');
    setSearchParams(nextParams, { replace: true });
  }

  return (
    <div>
      <PageHeader title="Заявки">
        <Button onClick={() => navigate('/new-order')}>+ Новая заявка</Button>
      </PageHeader>

      <div className="toolbar">
        <input className="search-input" value={search}
          onChange={e => setSearch(e.target.value)} placeholder="Поиск по компании..." />
        <div className="filter-tabs">
          {[['','Все'],['supply','Поставка'],['processing','Обработка'],['logistics','Логистика']].map(([v,l]) => (
            <button key={v} className={`filter-tab${type===v?' active':''}`} onClick={() => setType(v)}>{l}</button>
          ))}
        </div>
        <div className="filter-tabs">
          {[['active','В работе'],['done','Завершено'],['all','Все']].map(([v,l]) => (
            <button key={v} className={`filter-tab${status===v?' active':''}`} onClick={() => handleStatusChange(v)}>{l}</button>
          ))}
        </div>
        <div className="orders-toolbar-select orders-toolbar-select-stage">
          <Select value={stage} onChange={e => setStage(e.target.value)}>
            {STAGE_OPTIONS.map(([value, label]) => <option key={value||'all'} value={value}>{label}</option>)}
          </Select>
        </div>
        <div className="orders-toolbar-select orders-toolbar-select-company">
          <Select value={companyId} onChange={e => handleCompanyChange(e.target.value)}>
            <option value="">Все компании</option>
            {companyOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="filter-tabs orders-toolbar-view">
          {VIEW_OPTIONS.map(([value, label]) => (
            <button key={value} className={`filter-tab${view===value?' active':''}`} onClick={() => setView(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {isLoading ? <Spinner /> : orderRows.length === 0 ? <Empty /> : (
          <>
            {/* ── ДЕСКТОП: канбан / таблица ── */}
            {view === 'kanban' ? (
              <div className="desktop-only kanban-board">
                {kanbanColumns.map((column) => (
                  <div key={column.key} className="kanban-col">
                    <div className="kanban-col-header">
                      <span className="kanban-col-title">{column.label}</span>
                      {column.orders.length > 0 ? <span className="kanban-count">{column.orders.length}</span> : null}
                    </div>
                    <div className="kanban-col-body">
                      {column.orders.length === 0 ? (
                        <div className="kanban-empty">Пусто</div>
                      ) : (
                        column.orders.map((order) => <AdminOrderCard key={order.id} order={order} compact />)
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="desktop-only table-wrap">
                <table>
                  <thead><tr>
                    <th>#</th><th>Клиент</th><th>Тип</th>
                    <th style={{ textAlign:'right' }}>Кол-во</th>
                    <th>Этап</th><th>Дата</th>
                  </tr></thead>
                  <tbody>
                    {orderRows.map((o) => {
                      const displayStage = normalizeDisplayStage(o);
                      return (
                        <tr key={o.id} className="clickable" onClick={() => navigate(`/orders/${o.id}`)}>
                          <td className="text-muted text-sm mono">{o.number}</td>
                          <td style={{ fontWeight:500 }}>{o.company_name}</td>
                          <td><TypeBadge type={o.type} /></td>
                          <td className="text-right">{fmt(o.total_qty)}</td>
                          <td><StageBadge stage={displayStage} /></td>
                          <td className="text-muted text-sm">{new Date(o.created_at).toLocaleDateString('ru-RU')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── МОБИЛЬ: карточки референсного дизайна ── */}
            <div className="mobile-only mobile-orders-screen">
              <div className="mobile-orders-counter">{orderRows.length} активных заявок</div>
              <div className="mobile-orders-redesign-list">
                {orderRows.map((order) => {
                    const displayStage = normalizeDisplayStage(order);
                    return (
                      <button
                        key={order.id}
                        type="button"
                        className={`mobile-orders-redesign-row ${MOBILE_ROW_TYPE_CLASS[order.type] || ''}`}
                        onClick={() => navigate(`/orders/${order.id}`)}
                      >
                        <span className="mobile-orders-redesign-num">#{order.number}</span>
                        <div className="mobile-orders-redesign-info">
                          <div className="mobile-orders-redesign-company">{order.company_name}</div>
                          <div className="mobile-orders-redesign-sub">{formatMobileRowSub(order)}</div>
                        </div>
                        <div className="mobile-orders-redesign-right">
                          <span className={`mobile-orders-redesign-badge ${MOBILE_ROW_TYPE_CLASS[order.type] || ''}`}>
                            {TYPE_LABELS[order.type] || order.type}
                          </span>
                          <span className="mobile-orders-redesign-stage">{STAGE_LABELS[displayStage] || displayStage}</span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
