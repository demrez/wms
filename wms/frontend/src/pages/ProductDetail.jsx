import { useNavigate, useParams } from 'react-router-dom';
import { useProduct } from '../hooks/queries';
import { Button, Badge, fmt, Spinner, Empty } from '../components/ui';

const OP_LABELS = {
  in: 'Приход',
  out: 'Расход',
  defect: 'Брак',
  defect_return: 'Возврат из брака',
  write_off: 'Списание',
  move: 'Перемещение',
};

const OP_VARIANTS = {
  in: 'green',
  out: 'red',
  defect: 'red',
  defect_return: 'amber',
  write_off: 'gray',
  move: 'blue',
};

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU');
}

export default function ProductDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { data: product, isLoading } = useProduct(id);

  if (isLoading) return <Spinner />;
  if (!product) return <Empty text="Товар не найден" />;

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/products')}>← Назад</button>
          <div>
            <h1 className="page-title">{product.name}</h1>
            <div className="text-muted text-sm">{product.company_name || 'Без компании'}</div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate('/warehouse')}>Склад</Button>
          <Button onClick={() => navigate('/new-order')}>Новая заявка</Button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Остаток</div>
          <div className="stat-value">{fmt(product.quantity)}</div>
          <div className="stat-sub">на складе</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Брак</div>
          <div className="stat-value" style={{ color: 'var(--red-400)' }}>{fmt(product.defect_qty)}</div>
          <div className="stat-sub">ед. в браке</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Резерв</div>
          <div className="stat-value">{fmt(product.reserved_qty)}</div>
          <div className="stat-sub">под заявки</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Доступно</div>
          <div className="stat-value">{fmt(product.available_qty)}</div>
          <div className="stat-sub">к использованию</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header"><span className="card-title">Карточка товара</span></div>
          <div className="card-body company-meta">
            <div className="company-meta-row"><span>Артикул</span><strong>{product.article || '—'}</strong></div>
            <div className="company-meta-row"><span>Бренд</span><strong>{product.brand || '—'}</strong></div>
            <div className="company-meta-row"><span>Цвет</span><strong>{product.color || '—'}</strong></div>
            <div className="company-meta-row"><span>Размер</span><strong>{product.size || '—'}</strong></div>
            <div className="company-meta-row"><span>Вес</span><strong>{product.weight_g ? `${product.weight_g} г` : '—'}</strong></div>
            <div className="company-meta-row"><span>Страна</span><strong>{product.country || '—'}</strong></div>
            <div className="company-meta-row"><span>Состав</span><strong>{product.composition || '—'}</strong></div>
            <div className="company-meta-row">
              <span>Габариты</span>
              <strong>{product.dim_l || 0} × {product.dim_w || 0} × {product.dim_h || 0} см</strong>
            </div>
            <div className="company-meta-row"><span>Платное хранение</span><strong>{product.paid_storage ? 'Да' : 'Нет'}</strong></div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Штрихкоды и площадки</span></div>
          {product.barcodes?.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Площадка</th>
                    <th>Штрихкод</th>
                    <th>Артикул МП</th>
                  </tr>
                </thead>
                <tbody>
                  {product.barcodes.map((barcode) => (
                    <tr key={barcode.id}>
                      <td><Badge variant="blue">{barcode.marketplace}</Badge></td>
                      <td className="mono">{barcode.barcode || '—'}</td>
                      <td className="mono text-muted">{barcode.article_mp || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty text="Связи с маркетплейсами пока не заполнены" />
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><span className="card-title">История складских операций</span></div>
        {product.ops?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Тип</th>
                  <th style={{ textAlign: 'right' }}>Количество</th>
                  <th>Заявка</th>
                  <th>Кто провёл</th>
                  <th>Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {product.ops.map((operation) => (
                  <tr key={operation.id}>
                    <td className="text-muted text-sm">{formatDateTime(operation.created_at)}</td>
                    <td><Badge variant={OP_VARIANTS[operation.op_type] || 'gray'}>{OP_LABELS[operation.op_type] || operation.op_type}</Badge></td>
                    <td
                      className="text-right"
                      style={{ color: ['in', 'defect_return'].includes(operation.op_type) ? 'var(--teal-400)' : 'var(--red-400)', fontWeight: 600 }}
                    >
                      {['in', 'defect_return'].includes(operation.op_type) ? '+' : '−'}{fmt(operation.quantity)}
                    </td>
                    <td className="text-muted text-sm">{operation.order_number ? `#${operation.order_number}` : '—'}</td>
                    <td className="text-muted text-sm">{operation.created_by_name || '—'}</td>
                    <td className="text-muted text-sm">{operation.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="По товару пока нет складских операций" />
        )}
      </div>
    </div>
  );
}
