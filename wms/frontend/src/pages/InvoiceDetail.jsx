import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useInvoice, useUpdateInvoice, useUpdateInvoiceItems } from '../hooks/queries';
import { Badge, Button, PageHeader, Spinner, fmt } from '../components/ui';

const STATUS_OPTIONS = [
  ['draft', 'Черновик'],
  ['sent', 'Отправлено'],
  ['paid', 'Оплачено'],
  ['deferred', 'Отсрочка'],
  ['cancelled', 'Отменено'],
];

const STATUS_VARIANTS = {
  draft: 'gray',
  sent: 'blue',
  paid: 'green',
  deferred: 'amber',
  cancelled: 'red',
};

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: invoice, isLoading } = useInvoice(id);
  const updateInvoice = useUpdateInvoice();
  const updateItems = useUpdateInvoiceItems();
  const [pdfLoading, setPdfLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [itemsDraft, setItemsDraft] = useState([]);

  useEffect(() => {
    if (invoice?.items) {
      setItemsDraft(invoice.items.map((item) => ({
        ...item,
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
      })));
    }
  }, [invoice?.id, invoice?.items]);

  const totals = useMemo(() => {
    const subtotal = itemsDraft.reduce((sum, item) => sum + (toNumber(item.quantity) * toNumber(item.unit_price)), 0);
    const taxRate = Number(invoice?.tax_rate || 0);
    const total = subtotal * (1 + taxRate / 100);
    return { subtotal, total };
  }, [itemsDraft, invoice?.tax_rate]);

  const updateItemField = (index, key, value) => {
    setItemsDraft((current) =>
      current.map((item, i) => (i === index ? { ...item, [key]: value } : item))
    );
  };

  const addRow = () => {
    setItemsDraft((current) => ([
      ...current,
      { description: '', quantity: 1, unit: 'шт', unit_price: 0, source_type: 'manual', source_id: null },
    ]));
  };

  const removeRow = (index) => {
    setItemsDraft((current) => current.filter((_, i) => i !== index));
  };

  const saveItems = async () => {
    const payload = itemsDraft.map((item) => ({
      description: String(item.description || '').trim(),
      quantity: toNumber(item.quantity),
      unit: String(item.unit || '').trim() || 'шт',
      unit_price: toNumber(item.unit_price),
      source_type: item.source_type || 'manual',
      source_id: item.source_id || null,
    }));

    if (payload.some((item) => !item.description)) {
      alert('Заполните описание у всех позиций');
      return;
    }

    await updateItems.mutateAsync({ id, items: payload });
  };

  const generatePdf = async () => {
    setPdfLoading(true);
    try {
      const { data } = await api.get(`/invoices/${id}/pdf`);
      window.open(data.url, '_blank');
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoice', id] });
    } catch (error) {
      alert(error?.response?.data?.error || 'Не удалось сформировать PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  const deleteInvoice = async () => {
    if (!window.confirm('Удалить счет/акт? Это действие нельзя отменить.')) {
      return;
    }

    setDeleting(true);
    try {
      await api.delete(`/invoices/${id}`);
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoice', id] });
      navigate('/invoices');
    } catch (error) {
      alert(error?.response?.data?.error || 'Не удалось удалить документ');
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading) return <Spinner />;
  if (!invoice) return <div className="card" style={{ padding: 24 }}>Счёт не найден</div>;

  return (
    <div>
      <PageHeader title={`Счёт №${invoice.number}`}>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate('/invoices')}>Назад</Button>
          <Button variant="secondary" onClick={generatePdf} disabled={pdfLoading}>{pdfLoading ? '...' : '↓ PDF'}</Button>
          <Button variant="danger" onClick={deleteInvoice} disabled={deleting}>
            {deleting ? 'Удаляем...' : 'Удалить'}
          </Button>
        </div>
      </PageHeader>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr' }}>
            <div>
              <div className="text-muted text-sm">Компания</div>
              <div className="font-semibold">{invoice.company_name}</div>
            </div>
            <div>
              <div className="text-muted text-sm">Тип</div>
              <div>{invoice.type === 'invoice' ? 'Счёт' : 'Акт'}</div>
            </div>
            <div>
              <div className="text-muted text-sm">Статус</div>
              <div style={{ marginTop: 4 }}>
                <Badge variant={STATUS_VARIANTS[invoice.status] || 'gray'}>
                  {STATUS_OPTIONS.find(([key]) => key === invoice.status)?.[1] || invoice.status}
                </Badge>
              </div>
            </div>
            <div>
              <div className="text-muted text-sm">Изменить статус</div>
              <select
                value={invoice.status}
                onChange={(event) => updateInvoice.mutate({ id, status: event.target.value })}
                style={{ marginTop: 4, minHeight: 36 }}
              >
                {STATUS_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
            <div>
              <div className="text-muted text-sm">Период</div>
              <div>
                {invoice.period_from
                  ? `${new Date(invoice.period_from).toLocaleDateString('ru-RU')} — ${new Date(invoice.period_to).toLocaleDateString('ru-RU')}`
                  : 'По дате создания'}
              </div>
            </div>
            <div>
              <div className="text-muted text-sm">Поставка</div>
              <div>
                {invoice.order_id ? (
                  <Link to={`/orders/${invoice.order_id}`} style={{ color: 'var(--teal-500)', fontWeight: 600 }}>
                    Заявка #{invoice.order_number || '—'}
                  </Link>
                ) : 'Не привязано к конкретной поставке'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Позиции счёта</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={addRow}>+ Позиция</Button>
            <Button onClick={saveItems} disabled={updateItems.isPending}>
              {updateItems.isPending ? 'Сохраняем...' : 'Сохранить позиции'}
            </Button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th>
                <th>Услуга / позиция</th>
                <th style={{ width: 110 }}>Ед.</th>
                <th style={{ width: 120 }}>Кол-во</th>
                <th style={{ width: 140 }}>Цена</th>
                <th style={{ width: 140 }}>Сумма</th>
                <th style={{ width: 54 }}></th>
              </tr>
            </thead>
            <tbody>
              {itemsDraft.map((item, index) => {
                const rowTotal = toNumber(item.quantity) * toNumber(item.unit_price);
                return (
                  <tr key={item.id || `row-${index}`}>
                    <td className="text-muted">{index + 1}</td>
                    <td>
                      <input
                        value={item.description || ''}
                        onChange={(event) => updateItemField(index, 'description', event.target.value)}
                        placeholder="Наименование услуги"
                      />
                    </td>
                    <td>
                      <input
                        value={item.unit || ''}
                        onChange={(event) => updateItemField(index, 'unit', event.target.value)}
                        placeholder="шт"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={item.quantity}
                        onChange={(event) => updateItemField(index, 'quantity', event.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unit_price}
                        onChange={(event) => updateItemField(index, 'unit_price', event.target.value)}
                      />
                    </td>
                    <td style={{ fontWeight: 700 }}>{fmt(Math.round(rowTotal * 100) / 100)} ₽</td>
                    <td>
                      <Button size="sm" variant="secondary" onClick={() => removeRow(index)}>×</Button>
                    </td>
                  </tr>
                );
              })}
              {itemsDraft.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--gray-500)' }}>
                    Нет позиций
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700 }}>Итого</td>
                <td style={{ fontWeight: 800 }}>{fmt(Math.round(totals.total * 100) / 100)} ₽</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
