import { useNavigate } from 'react-router-dom';
import { useKanban } from '../hooks/queries';
import { TypeBadge, fmt, Spinner } from './ui';

const COLUMNS = [
  { key: 'new',         label: 'Новые' },
  { key: 'approval',    label: 'Согласование' },
  { key: 'pickup',      label: 'Забор груза' },
  { key: 'in_transit',  label: 'В пути' },
  { key: 'receiving',   label: 'Приёмка' },
  { key: 'waiting',     label: 'Ожидает' },
  { key: 'in_progress', label: 'В работе' },
];

function KanbanCard({ order }) {
  const navigate = useNavigate();
  return (
    <div className="kanban-card" onClick={() => navigate(`/orders/${order.id}`)}>
      <div className="kanban-card-num">#{order.number}</div>
      <div className="kanban-card-name">{order.company_name}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <TypeBadge type={order.type} />
        {order.total_qty > 0 && (
          <span className="kanban-card-meta">{fmt(order.total_qty)} ед.</span>
        )}
      </div>
    </div>
  );
}

export default function KanbanBoard() {
  const { data: kanban, isLoading } = useKanban();
  if (isLoading) return <Spinner />;

  const cols = COLUMNS.filter(c => (kanban?.[c.key]?.length || 0) > 0 || c.key === 'new');

  return (
    <div className="kanban-board">
      {cols.map(col => {
        const cards = kanban?.[col.key] || [];
        return (
          <div key={col.key} className="kanban-col">
            <div className="kanban-col-header">
              <span className="kanban-col-title">{col.label}</span>
              {cards.length > 0 && <span className="kanban-count">{cards.length}</span>}
            </div>
            <div className="kanban-col-body">
              {cards.length === 0
                ? <div className="kanban-empty">Пусто</div>
                : cards.map(o => <KanbanCard key={o.id} order={o} />)
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}
