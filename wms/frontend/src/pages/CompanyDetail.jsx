import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCompany, useDeleteCompany, useImportCompanyProducts, useUpdateCompany } from '../hooks/queries';
import { Button, TypeBadge, StageBadge, fmt, Spinner, Empty, Input } from '../components/ui';

function companyDisplayName(company) {
  return company?.legal_name || company?.name || 'Компания';
}

export default function CompanyDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { data: company, isLoading, isError, error } = useCompany(id);
  const updateCompany = useUpdateCompany();
  const deleteCompany = useDeleteCompany();
  const importCompanyProducts = useImportCompanyProducts();
  const importInputRef = useRef(null);
  const [accessForm, setAccessForm] = useState({
    client_email: '',
    client_password: '',
    telegram_notifications: false,
    telegram_chat_id: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [accessError, setAccessError] = useState('');

  useEffect(() => {
    setAccessForm({
      client_email: company?.client_email || '',
      client_password: company?.client_password || '',
      telegram_notifications: Boolean(company?.telegram_notifications),
      telegram_chat_id: company?.telegram_chat_id || '',
    });
    setImportStatus('');
    setAccessError('');
  }, [company?.client_email, company?.client_password, id]);

  const accessChanged = useMemo(() => {
    if (!company) return false;
    return (
      accessForm.client_email !== (company.client_email || '')
      || accessForm.client_password !== (company.client_password || '')
      || Boolean(accessForm.telegram_notifications) !== Boolean(company.telegram_notifications)
      || (accessForm.telegram_chat_id || '') !== (company.telegram_chat_id || '')
    );
  }, [
    accessForm.client_email,
    accessForm.client_password,
    accessForm.telegram_notifications,
    accessForm.telegram_chat_id,
    company?.client_email,
    company?.client_password,
    company?.telegram_notifications,
    company?.telegram_chat_id,
  ]);

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let out = '';
    for (let i = 0; i < 12; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  };

  const saveAccess = async () => {
    if (accessForm.telegram_notifications && !String(accessForm.telegram_chat_id || '').trim()) {
      setAccessError('Укажите chat_id чата для Telegram-уведомлений');
      return;
    }
    setAccessError('');
    await updateCompany.mutateAsync({
      id,
      client_email: accessForm.client_email || undefined,
      client_password: accessForm.client_password || undefined,
      telegram_notifications: Boolean(accessForm.telegram_notifications),
      telegram_chat_id: String(accessForm.telegram_chat_id || '').trim() || undefined,
    });
  };

  const handleDeleteCompany = async () => {
    const confirmed = window.confirm(
      `Удалить компанию «${companyDisplayName(company)}» и все её товары? ` +
        'Если по компании уже есть заявки, удаление будет заблокировано.'
    );
    if (!confirmed) return;
    try {
      await deleteCompany.mutateAsync(id);
      navigate('/companies');
    } catch (deleteError) {
      window.alert(deleteError?.response?.data?.error || deleteError?.message || 'Не удалось удалить компанию');
    }
  };

  const triggerImport = () => {
    importInputRef.current?.click();
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setImportStatus('');
    try {
      const result = await importCompanyProducts.mutateAsync({ id, file });
      setImportStatus(`Импортировано: ${result.created || 0}, обновлено: ${result.updated || 0}, пропущено: ${result.skipped || 0}`);
    } catch (importError) {
      setImportStatus(importError?.response?.data?.error || importError?.message || 'Не удалось импортировать файл');
    }
  };

  if (isLoading) return <Spinner />;
  if (isError) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Не удалось загрузить компанию</div>
        <div className="text-muted" style={{ marginBottom: 16 }}>
          {error?.response?.data?.error || error?.message || 'Проверьте доступ или обновите страницу'}
        </div>
        <Button variant="secondary" onClick={() => navigate('/companies')}>Вернуться к списку</Button>
      </div>
    );
  }
  if (!company) return <Empty text="Компания не найдена" />;

  const totalQty = Number(company.stock?.total_qty || 0);
  const totalDefect = Number(company.stock?.defect_qty || 0);
  const productsCount = Number(company.stock?.products_count || 0);
  const totalOrders = Number(company.orders?.total_orders || 0);
  const activeOrders = Number(company.orders?.active_orders || 0);
  const totalInvoices = Number(company.invoices?.total_invoices || 0);
  const activeInvoices = Number(company.invoices?.active_invoices || 0);

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3 company-detail-page-head">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/companies')}>← Назад</button>
          <div>
            <h1 className="page-title">{company.name}</h1>
            <div className="text-muted text-sm">{companyDisplayName(company)}</div>
          </div>
        </div>
        <div className="flex gap-2 company-detail-page-actions">
          <Button variant="secondary" onClick={() => navigate('/products')}>Товары</Button>
          <Button onClick={() => navigate('/new-order')}>Новая заявка</Button>
          <Button
            variant="danger"
            onClick={handleDeleteCompany}
            disabled={deleteCompany.isPending}
          >
            {deleteCompany.isPending ? 'Удаляем...' : 'Удалить компанию'}
          </Button>
        </div>
      </div>

      <div className="stats-grid company-detail-stats-grid">
        <button className="stat-card stat-card-clickable" type="button" onClick={() => navigate('/products')}>
          <div className="stat-label">Товаров</div>
          <div className="stat-value">{fmt(productsCount)}</div>
          <div className="stat-sub">в каталоге компании</div>
        </button>
        <button className="stat-card stat-card-clickable" type="button" onClick={() => navigate('/warehouse')}>
          <div className="stat-label">На складе</div>
          <div className="stat-value">{fmt(totalQty)}</div>
          <div className="stat-sub">текущий остаток</div>
        </button>
        <button className="stat-card stat-card-clickable" type="button" onClick={() => navigate('/warehouse?tab=defects')}>
          <div className="stat-label">Брак</div>
          <div className="stat-value" style={{ color: 'var(--red-400)' }}>{fmt(totalDefect)}</div>
          <div className="stat-sub">ед. на проверке</div>
        </button>
        <button className="stat-card stat-card-clickable" type="button" onClick={() => navigate(`/orders?company_id=${id}`)}>
          <div className="stat-label">Заявок</div>
          <div className="stat-value">{fmt(totalOrders)}</div>
          <div className="stat-sub">{fmt(activeOrders)} активных</div>
        </button>
        <button className="stat-card stat-card-clickable" type="button" onClick={() => navigate(`/invoices?company_id=${id}`)}>
          <div className="stat-label">Счетов</div>
          <div className="stat-value">{fmt(totalInvoices)}</div>
          <div className="stat-sub">{fmt(activeInvoices)} активных</div>
        </button>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Реквизиты</span>
          </div>
          <div className="card-body company-meta">
            <div className="company-meta-row">
              <span>Название</span>
              <strong>{company.name}</strong>
            </div>
            <div className="company-meta-row">
              <span>Юр. лицо</span>
              <strong>{company.legal_name || '—'}</strong>
            </div>
            <div className="company-meta-row">
              <span>ИНН</span>
              <strong>{company.inn || '—'}</strong>
            </div>
            <div className="company-meta-row">
              <span>Телефон</span>
              <strong>{company.phone || '—'}</strong>
            </div>
            <div className="company-meta-row">
              <span>Адрес</span>
              <strong>{company.address || '—'}</strong>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Доступ в клиентский кабинет</span>
          </div>
          <div className="card-body">
            <div className="text-muted text-sm" style={{ marginBottom: 12 }}>
              Логин и пароль клиента для входа в кабинет: https://www.smart-wms.ru/client/login
              . Пароль можно заменить и сразу сохранить здесь.
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <Input
                label="Логин (e-mail)"
                type="email"
                value={accessForm.client_email}
                onChange={(event) => setAccessForm((current) => ({ ...current, client_email: event.target.value }))}
                placeholder="client@company.ru"
              />
              <div className="grid-2 company-detail-access-grid">
                <Input
                  label="Пароль"
                  type={showPassword ? 'text' : 'password'}
                  value={accessForm.client_password}
                  onChange={(event) => setAccessForm((current) => ({ ...current, client_password: event.target.value }))}
                  placeholder="Введите новый пароль"
                />
                <div className="form-group">
                  <label>&nbsp;</label>
                  <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                    <Button variant="secondary" onClick={() => setShowPassword((current) => !current)}>
                      {showPassword ? 'Скрыть' : 'Показать'}
                    </Button>
                    <Button variant="secondary" onClick={() => setAccessForm((current) => ({ ...current, client_password: generatePassword() }))}>
                      Сгенерировать
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 company-detail-access-actions" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <Button
                  variant="secondary"
                  onClick={() => setAccessForm({
                    client_email: company.client_email || '',
                    client_password: company.client_password || '',
                    telegram_notifications: Boolean(company.telegram_notifications),
                    telegram_chat_id: company.telegram_chat_id || '',
                  })}
                  disabled={!accessChanged}
                >
                  Сбросить
                </Button>
                <Button onClick={saveAccess} disabled={!accessChanged || updateCompany.isPending}>
                  {updateCompany.isPending ? 'Сохраняем...' : 'Сохранить доступ'}
                </Button>
              </div>
              <div style={{ borderTop: '1px solid var(--gray-100)', paddingTop: 12, display: 'grid', gap: 12 }}>
                <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(accessForm.telegram_notifications)}
                    onChange={(event) => {
                      setAccessForm((current) => ({
                        ...current,
                        telegram_notifications: event.target.checked,
                      }));
                      if (accessError) setAccessError('');
                    }}
                  />
                  <span>Присылать уведомления в Telegram</span>
                </label>
                <Input
                  label="Chat ID чата"
                  value={accessForm.telegram_chat_id}
                  onChange={(event) => {
                    setAccessForm((current) => ({
                      ...current,
                      telegram_chat_id: event.target.value,
                    }));
                    if (accessError) setAccessError('');
                  }}
                  placeholder="-5270193897"
                />
                <div className="text-muted text-sm">
                  Уведомления о смене этапа заявки будут приходить в указанный чат.
                </div>
                {accessError && <div className="alert alert-error">{accessError}</div>}
              </div>
              <div className="text-muted text-sm">
                Если пароль оставлен пустым, он не изменится. После сохранения клиент сразу сможет войти в кабинет.
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Последние заявки</span>
          </div>
          {company.recent_orders?.length ? (
            <>
              <div className="desktop-only table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Тип</th>
                      <th>Этап</th>
                      <th>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {company.recent_orders.map((order) => (
                      <tr key={order.id} className="clickable" onClick={() => navigate(`/orders/${order.id}`)}>
                        <td className="mono text-muted">{order.number}</td>
                        <td><TypeBadge type={order.type} /></td>
                        <td><StageBadge stage={order.stage} /></td>
                        <td className="text-muted text-sm">{order.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mobile-only admin-orders-mobile-list">
                {company.recent_orders.map((order) => (
                  <div
                    key={order.id}
                    className="admin-order-mobile-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/orders/${order.id}`)}
                    onKeyDown={(event) => event.key === 'Enter' && navigate(`/orders/${order.id}`)}
                  >
                    <div className="admin-order-mobile-head">
                      <div>
                        <div className="admin-order-mobile-number">#{order.number}</div>
                        <div className="admin-order-mobile-date">{order.status || '—'}</div>
                      </div>
                      <StageBadge stage={order.stage} />
                    </div>
                    <div className="admin-order-mobile-grid">
                      <div className="admin-order-mobile-chip">
                        <span>Тип</span>
                        <strong><TypeBadge type={order.type} /></strong>
                      </div>
                      <div className="admin-order-mobile-chip">
                        <span>Статус</span>
                        <strong>{order.status || '—'}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Empty text="У компании пока нет заявок" />
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <span className="card-title">Товары компании</span>
          <div className="flex gap-2" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button variant="secondary" size="sm" onClick={triggerImport} disabled={importCompanyProducts.isPending}>
              {importCompanyProducts.isPending ? 'Импортируем...' : 'Импорт из Excel'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => navigate('/products')}>Открыть весь каталог</Button>
          </div>
        </div>
        <input
          ref={importInputRef}
          type="file"
          accept=".xlsx"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />
        <div className="text-muted text-sm" style={{ padding: '0 20px 12px' }}>
          Загрузите XLSX с колонками: <strong>Артикул</strong>, <strong>Название</strong>, <strong>Баркод</strong>.
        </div>
        {importStatus && (
          <div style={{
            margin: '0 20px 16px',
            padding: '10px 14px',
            borderRadius: 12,
            background: importStatus.startsWith('Импортировано') ? 'rgba(32, 163, 118, 0.08)' : 'rgba(220, 38, 38, 0.08)',
            color: importStatus.startsWith('Импортировано') ? 'var(--green-700)' : 'var(--red-600)',
            fontSize: 13,
          }}>
            {importStatus}
          </div>
        )}
        {company.products?.length ? (
          <>
            <div className="desktop-only table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Название</th>
                    <th>Артикул</th>
                    <th>Баркод</th>
                    <th>Бренд</th>
                    <th>Цвет</th>
                    <th style={{ textAlign: 'right' }}>Остаток</th>
                    <th style={{ textAlign: 'right' }}>Брак</th>
                    <th style={{ textAlign: 'right' }}>Доступно</th>
                  </tr>
                </thead>
                <tbody>
                  {company.products.map((product) => (
                    <tr key={product.id}>
                      <td style={{ fontWeight: 500 }}>{product.name}</td>
                      <td className="mono text-muted">{product.article || '—'}</td>
                      <td className="mono text-muted">
                        {product.barcode || '—'}
                        {Number(product.barcodes_count || 0) > 1 ? (
                          <span className="badge badge-gray" style={{ marginLeft: 8 }}>
                            +{Number(product.barcodes_count || 0) - 1}
                          </span>
                        ) : null}
                      </td>
                      <td className="text-muted">{product.brand || '—'}</td>
                      <td className="text-muted">{product.color || '—'}</td>
                      <td className="text-right text-teal">{fmt(product.quantity)}</td>
                      <td className="text-right" style={{ color: Number(product.defect_qty) > 0 ? 'var(--red-400)' : 'var(--gray-400)' }}>
                        {fmt(product.defect_qty)}
                      </td>
                      <td className="text-right">{fmt(product.available_qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-only admin-products-mobile-list">
              {company.products.map((product) => (
                <div key={product.id} className="admin-product-mobile-card">
                  <div className="admin-order-mobile-company" style={{ fontSize: 15, marginBottom: 10 }}>{product.name}</div>
                  <div className="admin-order-mobile-grid">
                    <div className="admin-order-mobile-chip">
                      <span>Артикул</span>
                      <strong>{product.article || '—'}</strong>
                    </div>
                    <div className="admin-order-mobile-chip">
                      <span>Баркод</span>
                      <strong>{product.barcode || '—'}</strong>
                    </div>
                    <div className="admin-order-mobile-chip">
                      <span>Остаток</span>
                      <strong className="text-teal">{fmt(product.quantity)}</strong>
                    </div>
                    <div className="admin-order-mobile-chip">
                      <span>Доступно</span>
                      <strong>{fmt(product.available_qty)}</strong>
                    </div>
                    <div className="admin-order-mobile-chip">
                      <span>Брак</span>
                      <strong style={{ color: Number(product.defect_qty) > 0 ? 'var(--red-400)' : '#f7f9fc' }}>{fmt(product.defect_qty)}</strong>
                    </div>
                    <div className="admin-order-mobile-chip">
                      <span>Бренд / Цвет</span>
                      <strong>{product.brand || '—'} / {product.color || '—'}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <Empty text="У компании пока нет товаров" />
        )}
      </div>
    </div>
  );
}
