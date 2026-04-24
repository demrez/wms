export function Badge({ children, variant = 'gray' }) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}

export function Stat({ label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Button({ children, onClick, variant = 'primary', size, disabled, type = 'button', className = '' }) {
  const sz = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '';
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`btn btn-${variant} ${sz} ${className}`}>
      {children}
    </button>
  );
}

export function Input({ label, error, type = 'text', className = '', ...props }) {
  return (
    <div className="form-group">
      {label && <label>{label}</label>}
      <input type={type} className={`${error ? 'error ' : ''}${className}`.trim()} {...props} />
      {error && <span className="text-xs text-red">{error}</span>}
    </div>
  );
}

export function Select({ label, children, ...props }) {
  return (
    <div className="form-group">
      {label && <label>{label}</label>}
      <select {...props}>{children}</select>
    </div>
  );
}

export function Modal({ open, onClose, title, children, size }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${size === 'lg' ? 'modal-lg' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Spinner() {
  return <div className="spinner-wrap"><div className="spinner" /></div>;
}

export function Empty({ text = 'Данных пока нет' }) {
  return <div className="empty">{text}</div>;
}

export function PageHeader({ title, children }) {
  return (
    <div className="page-header">
      <h1 className="page-title">{title}</h1>
      <div style={{ display: 'flex', gap: 8 }}>{children}</div>
    </div>
  );
}

const STAGE_LABELS = {
  new: 'Новая', approval: 'Согласование', pickup: 'Забор груза',
  in_transit: 'В пути', receiving: 'Приёмка', accepted: 'Принято',
  waiting: 'Ожидает', in_progress: 'В работе', delivered: 'Доставлено', mp_shipping: 'Отгрузка на МП', done: 'Готово',
};
const STAGE_VARIANTS = {
  new: 'gray', approval: 'amber', pickup: 'blue', in_transit: 'blue',
  receiving: 'purple', accepted: 'green', waiting: 'amber',
  in_progress: 'purple', delivered: 'blue', mp_shipping: 'blue', done: 'green',
};
const TYPE_LABELS   = { supply: 'Поставка', processing: 'Обработка', logistics: 'Логистика' };
const TYPE_VARIANTS = { supply: 'green', processing: 'blue', logistics: 'gray' };

export const StageBadge = ({ stage }) => (
  <Badge variant={STAGE_VARIANTS[stage] || 'gray'}>{STAGE_LABELS[stage] || stage}</Badge>
);
export const TypeBadge = ({ type }) => (
  <Badge variant={TYPE_VARIANTS[type] || 'gray'}>{TYPE_LABELS[type] || type}</Badge>
);

export const fmt = (n) => Number(n || 0).toLocaleString('ru-RU');
