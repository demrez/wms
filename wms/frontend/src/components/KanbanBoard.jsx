import { useKanban } from '../hooks/queries';
import { Spinner } from './ui';
import AdminOrderCard from './AdminOrderCard';

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
  return <AdminOrderCard order={order} compact />;
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
