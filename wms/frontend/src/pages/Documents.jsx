import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { PageHeader, Button, Empty, Spinner, Badge, Select, fmt, Stat } from '../components/ui';
import { useBillingDocuments, useCompanies } from '../hooks/queries';
import { useAuthStore } from '../store/auth';
import { formatDateTime, formatMoney } from '../lib/documents';
import { openOrderDocument } from '../lib/orderDocuments';

const STATUS_VARIANTS = {
  draft: 'gray',
  pending: 'amber',
  confirmed: 'blue',
  issued: 'purple',
  paid: 'green',
};

const STATUS_LABELS = {
  draft: 'Черновик',
  pending: 'Ожидает оплаты',
  confirmed: 'Подтвержден',
  issued: 'Выставлен',
  paid: 'Оплачен',
};

async function downloadExport(path, filename) {
  const response = await api.get(path, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}

export default function Documents() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [busyId, setBusyId] = useState('');
  const { data: companies } = useCompanies();
  const { data: documents, isLoading, error } = useBillingDocuments({
    search,
    type,
    company_id: companyId,
    payment_status: paymentStatus,
  });

  const isManager = ['admin', 'manager'].includes(user?.role);

  const summary = useMemo(() => {
    const rows = Array.isArray(documents) ? documents : [];
    return rows.reduce((acc, row) => {
      acc.orders += 1;
      acc.total += Number(row.total_amount || 0);
      acc.pending += Number(row.pending_amount || 0);
      acc.paid += Number(row.paid_amount || 0);
      return acc;
    }, { orders: 0, total: 0, pending: 0, paid: 0 });
  }, [documents]);

  const handleOpenDocument = async (kind, row) => {
    setBusyId(`${kind}:${row.order_id}`);
    try {
      await openOrderDocument(row.order_id, kind);
    } catch (error) {
      window.alert(error?.response?.data?.error || error?.message || 'Не удалось подготовить документ');
    } finally {
      setBusyId('');
    }
  };

  const rows = Array.isArray(documents) ? documents : [];

  return (
    <div>
      <PageHeader title="Документы">
        <div className="flex gap-2 admin-documents-page-actions">
          {isManager && <Button variant="secondary" onClick={() => navigate('/invoices')}>Счета</Button>}
          {isManager && (
            <Button variant="secondary" onClick={() => downloadExport('/export/charges', 'charges_export.csv')}>Экспорт начислений</Button>
          )}
          {isManager && <Button variant="secondary" onClick={() => downloadExport('/export/orders', 'orders_export.csv')}>Экспорт заявок</Button>}
        </div>
      </PageHeader>

      <div className="desktop-only stats-grid">
        <Stat label="Заявок с документами" value={fmt(summary.orders)} />
        <Stat label="Начислено" value={formatMoney(summary.total)} />
        <Stat label="К оплате" value={formatMoney(summary.pending)} />
        <Stat label="Оплачено" value={formatMoney(summary.paid)} />
      </div>
      <div className="mobile-only" style={{ marginBottom: 18 }}>
        <div className="mobile-stat-strip">
          <div className="mobile-stat-card">
            <div className="mobile-stat-card-label">Заявок с документами</div>
            <div className="mobile-stat-card-value">{fmt(summary.orders)}</div>
          </div>
          <div className="mobile-stat-card">
            <div className="mobile-stat-card-label">Начислено</div>
            <div className="mobile-stat-card-value">{formatMoney(summary.total)}</div>
          </div>
          <div className="mobile-stat-card">
            <div className="mobile-stat-card-label">К оплате</div>
            <div className="mobile-stat-card-value mobile-stat-card-value-amber">{formatMoney(summary.pending)}</div>
          </div>
          <div className="mobile-stat-card">
            <div className="mobile-stat-card-label">Оплачено</div>
            <div className="mobile-stat-card-value">{formatMoney(summary.paid)}</div>
          </div>
        </div>
      </div>

      <div className="toolbar admin-documents-toolbar">
        <input
          className="search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по компании или номеру заявки..."
        />
        <div className="filter-tabs">
          {[['', 'Все'], ['supply', 'Поставка'], ['processing', 'Обработка'], ['logistics', 'Логистика']].map(([value, label]) => (
            <button key={value || 'all'} className={`filter-tab${type === value ? ' active' : ''}`} onClick={() => setType(value)}>{label}</button>
          ))}
        </div>
        <Select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
          <option value="">Все статусы документов</option>
          <option value="draft">Черновик</option>
          <option value="pending">Ожидает оплаты</option>
          <option value="confirmed">Подтвержден</option>
          <option value="issued">Выставлен</option>
          <option value="paid">Оплачен</option>
        </Select>
        {isManager && (
          <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">Все компании</option>
            {(companies || []).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </Select>
        )}
      </div>

      <div className="card">
        {isLoading ? <Spinner /> : error ? <Empty text="Не удалось загрузить документы" /> : rows.length === 0 ? <Empty text="Документов пока нет" /> : (
          <>
          <div className="desktop-only table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Заявка</th>
                  <th>Клиент</th>
                  <th>Статус</th>
                  <th style={{ textAlign: 'right' }}>Начислено</th>
                  <th style={{ textAlign: 'right' }}>К оплате</th>
                  <th style={{ textAlign: 'right' }}>Оплачено</th>
                  <th>Последнее начисление</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.order_id}>
                    <td>
                      <div className="font-semibold mono">#{row.order_number}</div>
                      <div className="text-muted text-sm">{formatDateTime(row.created_at)}</div>
                    </td>
                    <td style={{ maxWidth: 240 }}>{row.company_name}</td>
                    <td><Badge variant={STATUS_VARIANTS[row.doc_status] || 'gray'}>{STATUS_LABELS[row.doc_status] || row.doc_status}</Badge></td>
                    <td className="text-right" style={{ whiteSpace: 'nowrap' }}>{formatMoney(row.total_amount)}</td>
                    <td className="text-right" style={{ whiteSpace: 'nowrap' }}>{formatMoney(row.pending_amount)}</td>
                    <td className="text-right" style={{ whiteSpace: 'nowrap' }}>{formatMoney(row.paid_amount)}</td>
                    <td className="text-muted text-sm">{row.last_charge_at ? formatDateTime(row.last_charge_at) : '—'}</td>
                    <td>
                      <div className="docs-actions">
                        <Button size="sm" variant="secondary" onClick={() => navigate(`/orders/${row.order_id}`)}>Открыть</Button>
                        <Button size="sm" variant="secondary" disabled={busyId === `acceptance_sheet:${row.order_id}`} onClick={() => handleOpenDocument('acceptance_sheet', row)}>Лист</Button>
                        <Button size="sm" variant="secondary" disabled={busyId === `technical_task:${row.order_id}`} onClick={() => handleOpenDocument('technical_task', row)}>ТЗ</Button>
                        <Button size="sm" variant="secondary" disabled={busyId === `invoice:${row.order_id}`} onClick={() => handleOpenDocument('invoice', row)}>Счет</Button>
                        <Button size="sm" variant="secondary" disabled={busyId === `act:${row.order_id}`} onClick={() => handleOpenDocument('act', row)}>Акт</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mobile-only admin-invoices-mobile-list">
            <div className="admin-documents-mobile-list">
              {rows.map((row) => (
                <div key={row.order_id} className="admin-invoice-mobile-card">
                  <div className="admin-invoice-mobile-head">
                    <div>
                      <div className="admin-invoice-mobile-number">Заявка #{row.order_number}</div>
                      <div className="admin-invoice-mobile-company">{row.company_name}</div>
                    </div>
                    <Badge variant={STATUS_VARIANTS[row.doc_status] || 'gray'}>{STATUS_LABELS[row.doc_status] || row.doc_status}</Badge>
                  </div>
                  <div className="admin-invoice-mobile-grid">
                    <div className="admin-invoice-mobile-chip">
                      <span>Начислено</span>
                      <strong>{formatMoney(row.total_amount)}</strong>
                    </div>
                    <div className="admin-invoice-mobile-chip">
                      <span>К оплате</span>
                      <strong style={{ color: 'var(--amber-400)' }}>{formatMoney(row.pending_amount)}</strong>
                    </div>
                    <div className="admin-invoice-mobile-chip">
                      <span>Оплачено</span>
                      <strong style={{ color: 'var(--teal-400)' }}>{formatMoney(row.paid_amount)}</strong>
                    </div>
                    <div className="admin-invoice-mobile-chip">
                      <span>Последнее начисление</span>
                      <strong>{row.last_charge_at ? formatDateTime(row.last_charge_at) : '—'}</strong>
                    </div>
                  </div>
                  <div className="mobile-entity-actions admin-documents-mobile-actions">
                    <Button size="sm" variant="secondary" onClick={() => navigate(`/orders/${row.order_id}`)}>Открыть</Button>
                    <Button size="sm" variant="secondary" disabled={busyId === `invoice:${row.order_id}`} onClick={() => handleOpenDocument('invoice', row)}>Счёт</Button>
                    <Button size="sm" variant="secondary" disabled={busyId === `act:${row.order_id}`} onClick={() => handleOpenDocument('act', row)}>Акт</Button>
                    <Button size="sm" variant="secondary" disabled={busyId === `acceptance_sheet:${row.order_id}`} onClick={() => handleOpenDocument('acceptance_sheet', row)}>Лист</Button>
                    <Button size="sm" variant="secondary" disabled={busyId === `technical_task:${row.order_id}`} onClick={() => handleOpenDocument('technical_task', row)}>ТЗ</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
