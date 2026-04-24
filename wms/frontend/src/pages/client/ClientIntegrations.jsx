import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { Button, Empty, Input, Modal, Select, Spinner } from '../../components/ui';
import { useCompanies } from '../../hooks/queries';

const MP_LABELS = { wb: 'Wildberries', ozon: 'Ozon' };

function IntegrationModal({ open, onClose, initial, companies }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(
    initial || {
      company_id: companies?.[0]?.id || '',
      marketplace: 'wb',
      api_key: '',
      client_id: '',
      auto_import_products: true,
    }
  );
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');

  const set = (key, value) => setForm((curr) => ({ ...curr, [key]: value }));

  useEffect(() => {
    if (!open) return;
    setForm(
      initial || {
        company_id: companies?.[0]?.id || '',
        marketplace: 'wb',
        api_key: '',
        client_id: '',
        auto_import_products: true,
      }
    );
    setError('');
    setTestResult(null);
  }, [open, initial, companies]);

  const saveMutation = useMutation({
    mutationFn: (payload) =>
      initial?.id
        ? api.patch(`/mp/connections/${initial.id}`, payload).then((r) => r.data)
        : api.post('/mp/connections', payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', 'mp-connections'] });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form };
      const saved = await saveMutation.mutateAsync(payload);
      return api.post(`/mp/connections/${saved.id}/test`).then((r) => r.data);
    },
    onSuccess: (data) => setTestResult(data),
    onError: (e) => setError(e.response?.data?.error || 'Не удалось проверить подключение'),
  });

  const onSave = async () => {
    setError('');
    setTestResult(null);
    try {
      await saveMutation.mutateAsync(form);
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || 'Не удалось сохранить подключение');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Редактировать подключение' : 'Подключить WB/Ozon'} size="lg">
      <Select label="Компания" value={form.company_id} onChange={(e) => set('company_id', e.target.value)}>
        <option value="">Выберите компанию</option>
        {(companies || []).map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </Select>

      <Select label="Маркетплейс" value={form.marketplace} onChange={(e) => set('marketplace', e.target.value)}>
        <option value="wb">Wildberries</option>
        <option value="ozon">Ozon</option>
      </Select>

      <Input
        label={form.marketplace === 'wb' ? 'API токен WB' : 'API ключ Ozon'}
        value={form.api_key}
        onChange={(e) => set('api_key', e.target.value)}
        placeholder="Вставьте токен из личного кабинета маркетплейса"
      />

      {form.marketplace === 'ozon' && (
        <Input
          label="Client ID Ozon"
          value={form.client_id}
          onChange={(e) => set('client_id', e.target.value)}
        />
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 13, color: '#6E6C66' }}>
        <input
          type="checkbox"
          checked={Boolean(form.auto_import_products)}
          onChange={(e) => set('auto_import_products', e.target.checked)}
        />
        Автоматически добавлять новые товары из маркетплейса
      </label>

      {testResult && (
        <div style={{
          marginTop: 10,
          padding: '10px 12px',
          borderRadius: 10,
          background: testResult.ok ? '#E1F5EE' : '#FCEBEB',
          color: testResult.ok ? '#0F6E56' : '#A32D2D',
          fontSize: 13,
        }}>
          {testResult.ok ? 'Подключение работает' : `Ошибка проверки: ${testResult.error || 'неизвестно'}`}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: '#FCEBEB', color: '#A32D2D', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div className="modal-footer" style={{ padding: 0, border: 'none', marginTop: 16 }}>
        <Button variant="secondary" onClick={onClose}>Отмена</Button>
        <Button
          variant="secondary"
          onClick={() => {
            setError('');
            setTestResult(null);
            testMutation.mutate();
          }}
          disabled={testMutation.isPending || !form.company_id || !form.api_key}
        >
          {testMutation.isPending ? 'Проверяем...' : 'Проверить'}
        </Button>
        <Button onClick={onSave} disabled={saveMutation.isPending || !form.company_id || !form.api_key}>
          {saveMutation.isPending ? 'Сохраняем...' : 'Сохранить'}
        </Button>
      </div>
    </Modal>
  );
}

export default function ClientIntegrations() {
  const qc = useQueryClient();
  const { data: companies } = useCompanies();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [result, setResult] = useState('');

  const { data: connections, isLoading } = useQuery({
    queryKey: ['client', 'mp-connections'],
    queryFn: () => api.get('/mp/connections').then((r) => r.data),
  });

  const importMutation = useMutation({
    mutationFn: (connectionId) => api.post(`/mp/connections/${connectionId}/import-products`).then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['client', 'mp-connections'] });
      setResult(`Импорт завершен: найдено ${data?.total || 0}, новых ${data?.created || 0}, сопоставлено ${data?.matched || 0}`);
    },
    onError: (e) => setResult(e.response?.data?.error || 'Не удалось импортировать товары'),
  });

  const deleteMutation = useMutation({
    mutationFn: (connectionId) => api.delete(`/mp/connections/${connectionId}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', 'mp-connections'] });
    },
  });

  const rows = useMemo(() => {
    const list = Array.isArray(connections) ? connections : [];
    return list.filter((item) => ['wb', 'ozon'].includes(item.marketplace));
  }, [connections]);

  return (
    <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', fontSize: 13 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1A1A18' }}>Интеграции WB/Ozon</div>
          <div style={{ marginTop: 4, color: '#9E9C95' }}>Подключите кабинет маркетплейса, импортируйте товары и используйте их в заявках.</div>
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>+ Подключить</Button>
      </div>

      {result && (
        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: '#F8F8F6', color: '#3D3D3A' }}>
          {result}
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E4E2DA', borderRadius: 14, overflow: 'hidden' }}>
        {isLoading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <div style={{ padding: 24 }}>
            <Empty text="Подключений пока нет" />
          </div>
        ) : (
          rows.map((conn) => (
            <div key={conn.id} style={{ padding: '14px 16px', borderBottom: '1px solid #F1EFE8', display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A18' }}>
                  {MP_LABELS[conn.marketplace] || conn.marketplace} · {conn.company_name}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: '#9E9C95' }}>
                  Токен: {conn.api_key || 'не задан'} {conn.client_id ? `· Client ID: ${conn.client_id}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => importMutation.mutate(conn.id)}
                  disabled={importMutation.isPending}
                >
                  {importMutation.isPending ? 'Импорт...' : 'Импорт товаров'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setEditing(conn); setModalOpen(true); }}
                >
                  Изменить
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMutation.mutate(conn.id)}
                  disabled={deleteMutation.isPending}
                >
                  Удалить
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <IntegrationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initial={editing}
        companies={companies}
      />
    </div>
  );
}
