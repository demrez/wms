import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrders, useCompanies } from '../hooks/queries';
import { PageHeader, Button, TypeBadge, StageBadge, fmt, Spinner, Empty, Select } from '../components/ui';

const STAGE_OPTIONS = [
  ['', 'Все этапы'],
  ['new', 'Новая'],
  ['approval', 'Согласование'],
  ['pickup', 'Забор груза'],
  ['in_transit', 'В пути'],
  ['receiving', 'Приёмка'],
  ['accepted', 'Принято'],
  ['waiting', 'Ожидает'],
  ['in_progress', 'В работе'],
  ['delivered', 'Доставлено'],
  ['done', 'Готово'],
];

export default function Orders() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('active');
  const [stage, setStage] = useState('');
  const [companyId, setCompanyId] = useState('');
  const { data: companies } = useCompanies();
  const { data: orders, isLoading } = useOrders({ search, type, status, stage, company_id: companyId });
  const companyOptions = Array.isArray(companies) ? companies : [];
  const orderRows = Array.isArray(orders) ? orders : [];

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
          {[['active','В работе'],['done','Завершено'],['','Все']].map(([v,l]) => (
            <button key={v} className={`filter-tab${status===v?' active':''}`} onClick={() => setStatus(v)}>{l}</button>
          ))}
        </div>
        <Select value={stage} onChange={e => setStage(e.target.value)}>
          {STAGE_OPTIONS.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}
        </Select>
        <Select value={companyId} onChange={e => setCompanyId(e.target.value)}>
          <option value="">Все компании</option>
          {companyOptions.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
        </Select>
      </div>

      <div className="card">
        {isLoading ? <Spinner /> : orderRows.length === 0 ? <Empty /> : (
          <>
            <div className="desktop-only table-wrap">
              <table>
                <thead><tr>
                  <th>#</th><th>Клиент</th><th>Тип</th>
                  <th style={{textAlign:'right'}}>Кол-во</th>
                  <th>Этап</th><th>Дата</th>
                </tr></thead>
                <tbody>
                  {orderRows.map(o => (
                    <tr key={o.id} className="clickable" onClick={() => navigate(`/orders/${o.id}`)}>
                      <td className="text-muted text-sm mono">{o.number}</td>
                      <td style={{ fontWeight: 500 }}>{o.company_name}</td>
                      <td><TypeBadge type={o.type} /></td>
                      <td className="text-right">{fmt(o.total_qty)}</td>
                      <td><StageBadge stage={o.stage} /></td>
                      <td className="text-muted text-sm">{new Date(o.created_at).toLocaleDateString('ru-RU')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-only admin-orders-mobile-list">
              {orderRows.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="admin-order-mobile-card"
                  onClick={() => navigate(`/orders/${o.id}`)}
                >
                  <div className="admin-order-mobile-head">
                    <div>
                      <div className="admin-order-mobile-number">Заявка #{o.number}</div>
                      <div className="admin-order-mobile-date">
                        {new Date(o.created_at).toLocaleDateString('ru-RU')}
                      </div>
                    </div>
                    <StageBadge stage={o.stage} />
                  </div>

                  <div className="admin-order-mobile-company">{o.company_name}</div>

                  <div className="admin-order-mobile-grid">
                    <div className="admin-order-mobile-chip">
                      <span>Тип</span>
                      <strong>{o.type === 'supply' ? 'Поставка' : o.type === 'processing' ? 'Обработка' : 'Логистика'}</strong>
                    </div>
                    <div className="admin-order-mobile-chip">
                      <span>Кол-во</span>
                      <strong>{fmt(o.total_qty)}</strong>
                    </div>
                    <div className="admin-order-mobile-chip admin-order-mobile-chip-wide">
                      <span>Статус</span>
                      <strong>{o.status === 'active' ? 'В работе' : o.status === 'done' ? 'Завершено' : 'Все'}</strong>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
