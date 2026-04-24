import { useEffect, useMemo, useState } from 'react';
import { useSettingsProfile, useUpdateSettingsProfile } from '../hooks/queries';
import { PageHeader, Button, Input, Spinner, Empty, Badge } from '../components/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

const DEFAULT_FORM = {
  brand_name: '',
  company_name: '',
  legal_name: '',
  inn: '',
  kpp: '',
  ogrn: '',
  address: '',
  phone: '',
  email: '',
  bank_name: '',
  bik: '',
  checking_account: '',
  correspondent_account: '',
  signer_name: '',
  signer_title: '',
  site_url: '',
  signature_url: '',
};

const MP_LABELS = { wb: 'Wildberries', ozon: 'Ozon', yandex: 'Яндекс.Маркет' };

const MANAGEMENT_LINKS = [
  { title: 'Каталог услуг', text: 'Настройка своих услуг и тарифов фулфилмента.', href: '/services', button: 'Открыть услуги' },
  { title: 'Расходники', text: 'Коробки, пленка, скотч, этикетки и склад расходников.', href: '/supplies', button: 'Открыть расходники' },
  { title: 'Логистика', text: 'Склады маркетплейсов и цены за короб или палет.', href: '/admin?tab=logistics', button: 'Открыть логистику' },
  { title: 'Маркетплейсы', text: 'Токены, склады, синхронизация остатков и заказов.', href: '/marketplace', button: 'Открыть интеграции' },
  { title: 'Коммерческие предложения', text: 'Шаблоны и список КП для клиентов.', href: '/kp', button: 'Открыть КП' },
  { title: 'Онбординг клиентов', text: 'Заведение компании по ИНН и первичная настройка.', href: '/onboarding', button: 'Открыть онбординг' },
  { title: 'Справочники', text: 'Служебные настройки и административные справочники.', href: '/admin', button: 'Открыть справочники' },
];

function SettingsForm({ profile, onSave, isSaving }) {
  const [form, setForm] = useState({ ...DEFAULT_FORM, ...(profile || {}) });
  useEffect(() => {
    setForm({ ...DEFAULT_FORM, ...(profile || {}) });
  }, [profile]);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Реквизиты для документов</span>
      </div>
      <div className="card-body">
        <div className="form-grid">
          <Input label="Бренд" value={form.brand_name} onChange={(e) => set('brand_name', e.target.value)} />
          <Input label="Название компании *" value={form.company_name} onChange={(e) => set('company_name', e.target.value)} />
          <Input label="Юридическое название" value={form.legal_name || ''} onChange={(e) => set('legal_name', e.target.value)} />
          <Input label="ИНН" value={form.inn || ''} onChange={(e) => set('inn', e.target.value)} />
          <Input label="КПП" value={form.kpp || ''} onChange={(e) => set('kpp', e.target.value)} />
          <Input label="ОГРН" value={form.ogrn || ''} onChange={(e) => set('ogrn', e.target.value)} />
          <Input label="Телефон" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} />
          <Input label="Email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} />
          <Input label="Банк" value={form.bank_name || ''} onChange={(e) => set('bank_name', e.target.value)} />
          <Input label="БИК" value={form.bik || ''} onChange={(e) => set('bik', e.target.value)} />
          <Input label="Расчётный счёт" value={form.checking_account || ''} onChange={(e) => set('checking_account', e.target.value)} />
          <Input label="Корреспондентский счёт" value={form.correspondent_account || ''} onChange={(e) => set('correspondent_account', e.target.value)} />
          <Input label="Подписант" value={form.signer_name || ''} onChange={(e) => set('signer_name', e.target.value)} />
          <Input label="Должность подписанта" value={form.signer_title || ''} onChange={(e) => set('signer_title', e.target.value)} />
          <Input label="Сайт" value={form.site_url || ''} onChange={(e) => set('site_url', e.target.value)} />
        </div>
        <div className="form-group" style={{ marginTop: 14 }}>
          <label>Адрес</label>
          <textarea rows={3} value={form.address || ''} onChange={(e) => set('address', e.target.value)} />
        </div>
        <div className="form-group" style={{ marginTop: 14 }}>
          <label>Подпись (PNG)</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {form.signature_url ? (
              <img
                src={form.signature_url}
                alt="Подпись"
                style={{
                  maxHeight: 72,
                  maxWidth: 180,
                  objectFit: 'contain',
                  background: '#fff',
                  border: '1px solid var(--gray-200)',
                  borderRadius: 10,
                  padding: 8,
                }}
              />
            ) : (
              <div className="text-muted text-sm">Подпись не загружена</div>
            )}
          </div>
          <input
            type="file"
            accept="image/png"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              onSave?.(null, file);
              event.target.value = '';
            }}
            style={{ marginTop: 10 }}
          />
        </div>
        <div className="modal-footer" style={{ padding: 0, border: 'none', marginTop: 18 }}>
          <Button onClick={() => onSave(form)} disabled={isSaving}>{isSaving ? 'Сохраняем...' : 'Сохранить реквизиты'}</Button>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const [tab, setTab] = useState('profile');
  const { data: profile, isLoading } = useSettingsProfile();
  const updateProfile = useUpdateSettingsProfile();
  const qc = useQueryClient();
  const { data: integrations, isLoading: integrationsLoading } = useQuery({
    queryKey: ['mp-connections', 'settings'],
    queryFn: () => api.get('/mp/connections').then((r) => r.data),
  });

  const groupedIntegrations = useMemo(() => {
    const rows = integrations || [];
    return rows.reduce((acc, item) => {
      if (!acc[item.company_name]) acc[item.company_name] = [];
      acc[item.company_name].push(item);
      return acc;
    }, {});
  }, [integrations]);

  const uploadSignature = async (file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('signature', file);
    await api.post('/settings/profile/signature', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    await qc.invalidateQueries({ queryKey: ['settings', 'profile'] });
  };

  if (isLoading) return <Spinner />;

  return (
    <div>
      <PageHeader title="Настройки">
        <div className="filter-tabs">
          <button className={`filter-tab${tab === 'profile' ? ' active' : ''}`} onClick={() => setTab('profile')}>Реквизиты</button>
          <button className={`filter-tab${tab === 'integrations' ? ' active' : ''}`} onClick={() => setTab('integrations')}>Интеграции</button>
          <button className={`filter-tab${tab === 'management' ? ' active' : ''}`} onClick={() => setTab('management')}>Система</button>
        </div>
      </PageHeader>

      {tab === 'profile' ? (
        <SettingsForm
          profile={profile}
          onSave={(form, file) => {
            if (file) {
              return uploadSignature(file);
            }
            return updateProfile.mutate(form);
          }}
          isSaving={updateProfile.isPending}
        />
      ) : tab === 'integrations' ? (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Интеграции маркетплейсов</span>
          </div>
          <div className="card-body">
            <div className="text-muted text-sm" style={{ marginBottom: 16 }}>
              Здесь видно все ваши подключения. Полные настройки токенов и складов доступны в разделе «Маркетплейсы».
            </div>
            {integrationsLoading ? <Spinner /> : Object.keys(groupedIntegrations).length === 0 ? (
              <Empty text="Подключений пока нет" />
            ) : (
              <div style={{ display: 'grid', gap: 14 }}>
                {Object.entries(groupedIntegrations).map(([companyName, rows]) => (
                  <div key={companyName} className="card" style={{ marginBottom: 0 }}>
                    <div className="card-header">
                      <span className="card-title">{companyName}</span>
                    </div>
                    <div className="card-body">
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {rows.map((item) => (
                          <div key={item.id} style={{ border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', padding: '10px 12px', minWidth: 220 }}>
                            <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                              <span className="font-semibold">{MP_LABELS[item.marketplace] || item.marketplace}</span>
                              <Badge variant={item.is_active ? 'green' : 'gray'}>{item.is_active ? 'Активно' : 'Отключено'}</Badge>
                            </div>
                            <div className="text-muted text-sm">API: {item.api_key || '—'}</div>
                            <div className="text-muted text-sm">Склад: {item.warehouse_name || item.warehouse_id || '—'}</div>
                            <div className="text-muted text-sm">Автосинхронизация: {item.auto_sync_stocks ? 'включена' : 'выключена'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-footer" style={{ padding: 0, border: 'none', marginTop: 18 }}>
              <Button onClick={() => (window.location.href = '/marketplace')}>Открыть полные настройки интеграций</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Служебные разделы</span>
          </div>
          <div className="card-body">
            <div className="text-muted text-sm" style={{ marginBottom: 18 }}>
              Всё, что не нужно в ежедневной операционной работе, вынесено сюда: справочники, услуги, расходники, интеграции и финансовые разделы.
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              {MANAGEMENT_LINKS.map((item) => (
                <div key={item.href} className="surface-note">
                  <div className="flex items-center justify-between gap-3" style={{ flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="font-semibold" style={{ marginBottom: 4 }}>{item.title}</div>
                      <div className="text-muted text-sm">{item.text}</div>
                    </div>
                    <Button variant="secondary" onClick={() => { window.location.href = item.href; }}>
                      {item.button}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
