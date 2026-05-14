import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompleteOrder, useMoveStage } from '../hooks/queries';
import { STAGE_LABELS, TYPE_LABELS, fmt } from './ui';

const STAGE_FLOW = {
  supply: ['new', 'approval', 'pickup', 'in_transit', 'receiving', 'accepted', 'mp_shipping', 'done'],
  processing: ['new', 'waiting', 'in_progress', 'done'],
  logistics: ['new', 'approval', 'pickup', 'in_transit', 'delivered', 'mp_shipping', 'done'],
};

const TYPE_CLASS = {
  supply: 'supply',
  processing: 'processing',
  logistics: 'logistics',
};

const TYPE_LOCATION_ICON = {
  supply: '⌂',
  processing: '☰',
  logistics: '⌂',
};

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU');
}

function buildMeta(order) {
  if (order.type === 'logistics') {
    return [
      { label: 'к отгрузке', value: fmt(order.shipment_qty || order.total_qty || 0), tone: 'blue' },
      { label: 'короба', value: fmt(order.boxes_count || 0) },
      { label: 'услуги', value: order.services_total != null ? `${fmt(order.services_total)} ₽` : '—', tone: 'plain' },
    ];
  }

  if (order.type === 'processing') {
    return [
      { label: 'позиции', value: fmt(order.total_qty || 0) },
      { label: 'обработано', value: fmt(order.handled_qty_total || order.ready_qty_total || 0), tone: 'amber' },
      { label: 'брак', value: fmt(order.defect_qty_total || 0), tone: Number(order.defect_qty_total || 0) > 0 ? 'red' : 'muted' },
    ];
  }

  return [
    { label: order.type === 'processing' ? 'всего' : 'заявлено', value: fmt(order.total_qty || 0) },
    { label: order.type === 'processing' ? 'обработано' : 'принято', value: fmt(order.ready_qty_total || 0), tone: 'green' },
    { label: 'брак', value: fmt(order.defect_qty_total || 0), tone: Number(order.defect_qty_total || 0) > 0 ? 'red' : 'muted' },
  ];
}

function buildInfoBanner(order) {
  if (order.type === 'processing' && Number(order.defect_qty_total || 0) > 0) {
    return {
      variant: 'alert',
      left: `Обнаружен брак — ${fmt(order.defect_qty_total || 0)} ед. ожидает решения`,
    };
  }

  if (order.type === 'logistics') {
    return {
      variant: 'info',
      left: `Поставка WB ${order.shipping_warehouse ? `· ${order.shipping_warehouse}` : ''}`.trim(),
      right: order.stage === 'done' ? 'Завершена ✓' : 'Создана ✓',
    };
  }

  return null;
}

function buildPrimaryAction(order, stages) {
  if (!order || order.status === 'done' || order.stage === 'done') return null;
  const currentIndex = stages.indexOf(order.stage);
  const nextStage = currentIndex >= 0 ? stages[currentIndex + 1] : null;

  if (order.type === 'supply') {
    if (order.stage === 'receiving') return { kind: 'stage', stage: 'accepted', label: 'Принять' };
    if (order.stage === 'accepted') return { kind: 'stage', stage: 'mp_shipping', label: 'На МП' };
    if (order.stage === 'mp_shipping') return { kind: 'complete', label: 'Готово' };
  }

  if (order.type === 'processing') {
    if (order.stage === 'waiting') return { kind: 'stage', stage: 'in_progress', label: 'В работу' };
    if (order.stage === 'in_progress') return { kind: 'complete', label: 'Готово' };
  }

  if (order.type === 'logistics') {
    if (order.stage === 'delivered') return { kind: 'stage', stage: 'mp_shipping', label: 'На МП' };
    if (order.stage === 'mp_shipping') return { kind: 'complete', label: 'Готово' };
  }

  if (!nextStage) return null;
  if (nextStage === 'done') return { kind: 'complete', label: 'Готово' };
  return { kind: 'stage', stage: nextStage, label: STAGE_LABELS[nextStage] || 'Следующий этап' };
}

function buildActions(order, primaryAction) {
  if (order.type === 'supply' && order.stage === 'receiving') {
    return [
      { key: 'defect', label: '△ Брак', kind: 'open', tone: 'warning' },
      { key: 'stage', label: 'Сменить этап', kind: 'open', tone: 'secondary' },
      primaryAction ? { key: 'primary', label: primaryAction.label, kind: 'primary', tone: 'primary' } : null,
    ].filter(Boolean);
  }

  if (order.type === 'processing') {
    return [
      { key: 'defect', label: 'Оформить брак', kind: 'open', tone: 'warning' },
      primaryAction ? { key: 'primary', label: primaryAction.kind === 'complete' ? 'Завершить' : primaryAction.label, kind: 'primary', tone: 'primary' } : null,
    ].filter(Boolean);
  }

  if (order.type === 'logistics') {
    return [
      { key: 'details', label: 'Детали', kind: 'open', tone: 'secondary' },
      primaryAction
        ? {
            key: 'primary',
            label: primaryAction.kind === 'complete' ? 'WB принял → Готово' : primaryAction.label,
            kind: 'primary',
            tone: 'blue',
          }
        : null,
    ].filter(Boolean);
  }

  return [
    { key: 'details', label: 'Редактировать', kind: 'open', tone: 'secondary' },
    primaryAction ? { key: 'primary', label: primaryAction.label, kind: 'primary', tone: 'primary' } : null,
  ].filter(Boolean);
}

export default function AdminOrderCard({ order, compact = false }) {
  const navigate = useNavigate();
  const moveStage = useMoveStage();
  const completeOrder = useCompleteOrder();
  const stages = STAGE_FLOW[order.type] || STAGE_FLOW.supply;
  const currentStageIndex = Math.max(0, stages.indexOf(order.stage));
  const meta = useMemo(() => buildMeta(order), [order]);
  const primaryAction = useMemo(() => buildPrimaryAction(order, stages), [order, stages]);
  const actions = useMemo(() => buildActions(order, primaryAction), [order, primaryAction]);
  const infoBanner = useMemo(() => buildInfoBanner(order), [order]);
  const titleWarehouse = order.shipping_warehouse || 'Без склада';
  const titleDate = formatDate(order.shipping_date || order.created_at);
  const progressLabel = order.type === 'processing' ? 'Выполнено' : order.type === 'logistics' ? 'Отгрузка' : 'Разобрано';
  const progressNumerator = order.type === 'logistics'
    ? Number(order.shipment_qty || order.total_qty || 0)
    : Number(order.handled_qty_total || order.ready_qty_total || 0);
  const progressValue = order.type === 'logistics'
    ? `${fmt(progressNumerator)} шт.`
    : `${fmt(progressNumerator)} / ${fmt(order.total_qty || 0)} шт.`;

  const isActionPending = moveStage.isPending || completeOrder.isPending;

  const handleCardClick = () => navigate(`/orders/${order.id}`);
  const handlePrimaryAction = async (event) => {
    event.stopPropagation();
    if (!primaryAction || isActionPending) return;
    if (primaryAction.kind === 'complete') {
      await completeOrder.mutateAsync(order.id);
      return;
    }
    await moveStage.mutateAsync({ id: order.id, stage: primaryAction.stage, note: '' });
  };
  const handleActionClick = async (event, action) => {
    event.stopPropagation();
    if (!action || isActionPending) return;
    if (action.kind === 'open') {
      navigate(`/orders/${order.id}`);
      return;
    }
    await handlePrimaryAction(event);
  };

  if (compact) {
    return (
      <button type="button" className={`admin-order-card admin-order-card-compact ${TYPE_CLASS[order.type] || ''}`} onClick={handleCardClick}>
        <div className="admin-order-card-head">
          <span className="admin-order-card-num">#{order.number}</span>
          <div className="admin-order-card-badges">
            <span className={`admin-order-card-badge type ${TYPE_CLASS[order.type] || ''}`}>{TYPE_LABELS[order.type] || order.type}</span>
          </div>
        </div>
        <div className="admin-order-card-client">{order.company_name}</div>
        <div className="admin-order-card-warehouse">{titleWarehouse}{titleDate ? ` · ${titleDate}` : ''}</div>
        <div className="admin-order-card-progress compact">
          <div className="admin-order-card-progress-bar">
            <div className={`admin-order-card-progress-fill ${TYPE_CLASS[order.type] || ''}`} style={{ width: `${order.progress_percent || 0}%` }} />
          </div>
        </div>
      </button>
    );
  }

  return (
    <div
      className={`admin-order-card ${TYPE_CLASS[order.type] || ''}`}
      onClick={handleCardClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleCardClick();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="admin-order-card-head">
        <div>
          <div className="admin-order-card-num">#{order.number}</div>
          <div className="admin-order-card-date">{formatDate(order.created_at)}</div>
        </div>
        <div className="admin-order-card-badges">
          <span className={`admin-order-card-badge type ${TYPE_CLASS[order.type] || ''}`}>{TYPE_LABELS[order.type] || order.type}</span>
          <span className="admin-order-card-badge stage">{STAGE_LABELS[order.stage] || order.stage}</span>
        </div>
      </div>

      <div className="admin-order-card-client">{order.company_name}</div>
      <div className="admin-order-card-warehouse"><span>{TYPE_LOCATION_ICON[order.type] || '⌂'}</span>{titleWarehouse}{titleDate ? ` · ${titleDate}` : ''}</div>

      <div className="admin-order-card-stages">
        {stages.map((stage, index) => {
          const stateClass = index < currentStageIndex ? 'done' : index === currentStageIndex ? 'current' : 'todo';
          return (
            <div key={stage} className="admin-order-card-stage">
              <div className={`admin-order-card-stage-dot ${stateClass}`}>
                {index < currentStageIndex ? '✓' : index + 1}
              </div>
              {index < stages.length - 1 && (
                <div className={`admin-order-card-stage-line ${index < currentStageIndex ? 'done' : ''}`} />
              )}
            </div>
          );
        })}
      </div>

      {infoBanner ? (
        <div className={`admin-order-card-banner ${infoBanner.variant}`}>
          <span>{infoBanner.left}</span>
          {infoBanner.right ? <strong>{infoBanner.right}</strong> : null}
        </div>
      ) : null}

      <div className="admin-order-card-progress">
        <div className="admin-order-card-progress-head">
          <span className="admin-order-card-progress-title">{progressLabel}</span>
          <strong className="admin-order-card-progress-total">{progressValue}</strong>
        </div>
        <div className="admin-order-card-progress-bar">
          <div className={`admin-order-card-progress-fill ${TYPE_CLASS[order.type] || ''}`} style={{ width: `${order.progress_percent || 0}%` }} />
        </div>
      </div>

      <div className="admin-order-card-meta">
        {meta.map((item) => (
          <div key={item.label} className="admin-order-card-meta-item">
            <strong className={item.tone ? `tone-${item.tone}` : ''}>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      <div className="admin-order-card-actions">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            className={`admin-order-card-action ${action.tone || 'secondary'}`}
            onClick={(event) => handleActionClick(event, action)}
            disabled={isActionPending && action.kind === 'primary'}
          >
            {isActionPending && action.kind === 'primary' ? 'Сохраняем...' : action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
