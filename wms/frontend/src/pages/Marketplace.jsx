import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { PageHeader, Button, Input, Select, Modal, fmt, Spinner, Empty, Badge } from '../components/ui';
import { useCompanies } from '../hooks/queries';

const MP_LABELS = { wb: 'Wildberries', ozon: 'Ozon', yandex: 'Яндекс.Маркет' };
const MP_COLORS = {
  wb:     { bg: '#F5E6F5', color: '#7B0E6B', dot: '#CB11AB' },
  ozon:   { bg: '#E6EDFF', color: '#002699', dot: '#005BFF' },
  yandex: { bg: '#FFF0E6', color: '#CC2900', dot: '#FF6600' },
};
const STATUS_V = { ok: 'green', error: 'red' };

const useConnections = (params = {}) => useQuery({
  queryKey: ['mp-connections', params],
  queryFn: () => api.get('/mp/connections', { params }).then(r => r.data),
});

const useSyncLog = (params = {}) => useQuery({
  queryKey: ['mp-sync-log', params],
  queryFn: () => api.get('/mp/sync-log', { params }).then(r => r.data),
});

const useMpProducts = (params = {}) => useQuery({
  queryKey: ['mp-products', params],
  queryFn: () => api.get('/mp/products', { params }).then(r => r.data),
  enabled: !!params.connection_id,
});

// ── Форма подключения ────────────────────────────────────────────
function ConnectionModal({ open, onClose, connection }) {
  const qc = useQueryClient();
  const { data: companies } = useCompanies();
  const [form, setForm] = useState(connection || {
    company_id: '', marketplace: 'wb', api_key: '', client_id: '',
    campaign_id: '', warehouse_id: '', warehouse_name: '',
    auto_sync_stocks: false, auto_import_products: false,
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: d => connection?.id
      ? api.patch(`/mp/connections/${connection.id}`, d).then(r => r.data)
      : api.post('/mp/connections', d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mp-connections'] }); onClose(); },
  });

  const testConnection = async () => {
    setTesting(true); setTestResult(null); setError('');
    try {
      // Сначала сохраняем, потом тестируем
      const saved = await save.mutateAsync(form);
      const { data } = await api.post(`/mp/connections/${saved.id}/test`);
      setTestResult(data);
      if (data.ok && data.warehouses?.length) {
        setWarehouses(data.warehouses);
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Ошибка');
    } finally { setTesting(false); }
  };

  const mpColor = MP_COLORS[form.marketplace];

  return (
    <Modal open={open} onClose={onClose} title={connection ? 'Редактировать подключение' : 'Новое подключение'} size="lg">
      <div style={{ display:'flex', gap:8, alignItems:'center', padding:'10px 14px', background: mpColor?.bg, borderRadius:8, marginBottom:4 }}>
        <div style={{ width:10, height:10, borderRadius:'50%', background: mpColor?.dot, flexShrink:0 }} />
        <span style={{ fontWeight:600, color: mpColor?.color, fontSize:14 }}>{MP_LABELS[form.marketplace]}</span>
      </div>

      <Select label="Компания" value={form.company_id} onChange={e => set('company_id', e.target.value)}>
        <option value="">Выберите компанию</option>
        {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>

      <Select label="Маркетплейс" value={form.marketplace} onChange={e => set('marketplace', e.target.value)}>
        <option value="wb">Wildberries</option>
        <option value="ozon">Ozon</option>
        <option value="yandex">Яндекс.Маркет</option>
      </Select>

      <Input label={form.marketplace === 'wb' ? 'API токен (из ЛК WB → Настройки → Доступ к API)' : form.marketplace === 'ozon' ? 'API ключ (из ЛК Ozon → API ключи)' : 'OAuth токен Яндекс.Маркет'}
        type="password"
        value={form.api_key?.startsWith('•') ? form.api_key : form.api_key}
        onChange={e => set('api_key', e.target.value)}
        placeholder="Вставьте токен..." />

      {form.marketplace === 'ozon' && (
        <Input label="Client ID (из ЛК Ozon → API ключи)"
          value={form.client_id || ''} onChange={e => set('client_id', e.target.value)} />
      )}
      {form.marketplace === 'yandex' && (
        <Input label="Campaign ID (ID кампании)"
          value={form.campaign_id || ''} onChange={e => set('campaign_id', e.target.value)} />
      )}

      {warehouses.length > 0 && (
        <Select label="Склад для FBS (выберите после проверки)" value={form.warehouse_id}
          onChange={e => {
            const wh = warehouses.find(w => String(w.id) === e.target.value);
            set('warehouse_id', e.target.value);
            if (wh) set('warehouse_name', wh.name || wh.officeName || String(wh.id));
          }}>
          <option value="">Не выбран</option>
          {warehouses.map(w => (
            <option key={w.id} value={String(w.id)}>{w.name || w.officeName || w.id}</option>
          ))}
        </Select>
      )}

      <div style={{ display:'flex', gap:16 }}>
        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer' }}>
          <input type="checkbox" checked={form.auto_sync_stocks} onChange={e => set('auto_sync_stocks', e.target.checked)} />
          Авто-обновление остатков (каждые 15 мин)
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer' }}>
          <input type="checkbox" checked={form.auto_import_products} onChange={e => set('auto_import_products', e.target.checked)} />
          Авто-импорт новых товаров
        </label>
      </div>

      {testResult && (
        <div style={{ padding:'10px 12px', borderRadius:8, background: testResult.ok ? 'var(--teal-bg)' : 'var(--red-bg)', color: testResult.ok ? 'var(--teal-700)' : 'var(--red-600)', fontSize:12 }}>
          {testResult.ok
            ? `✅ Подключение работает! Найдено складов: ${testResult.warehouses?.length || 0}`
            : `❌ Ошибка: ${testResult.error}`}
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="modal-footer" style={{ padding:0, border:'none' }}>
        <Button variant="secondary" onClick={onClose}>Отмена</Button>
        <Button variant="secondary" onClick={testConnection} disabled={testing || !form.api_key || !form.company_id}>
          {testing ? 'Проверяем...' : '🔌 Проверить и сохранить'}
        </Button>
        <Button onClick={() => save.mutate(form)} disabled={save.isPending || !form.api_key || !form.company_id}>
          Сохранить
        </Button>
      </div>
    </Modal>
  );
}

// ── Карточка подключения ─────────────────────────────────────────
function ConnectionCard({ conn, onEdit, onImport, onPushStocks, loading }) {
  const mpColor = MP_COLORS[conn.marketplace] || MP_COLORS.wb;
  const qc = useQueryClient();
  const [loadingAction, setLoadingAction] = useState(null);

  const doAction = async (action, fn) => {
    setLoadingAction(action);
    try { await fn(); }
    finally { setLoadingAction(null); }
  };

  return (
    <div style={{ background:'#fff', border:'0.5px solid var(--gray-200)', borderRadius:12, overflow:'hidden', boxShadow:'var(--shadow-sm)' }}>
      {/* Шапка */}
      <div style={{ padding:'12px 16px', borderBottom:'0.5px solid var(--gray-100)', display:'flex', alignItems:'center', gap:10, background: mpColor.bg }}>
        <div style={{ width:10, height:10, borderRadius:'50%', background: mpColor.dot, flexShrink:0 }} />
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, color: mpColor.color, fontSize:13 }}>{MP_LABELS[conn.marketplace]}</div>
          <div style={{ fontSize:11, color:'var(--gray-500)', marginTop:1 }}>{conn.company_name}</div>
        </div>
        <div style={{ display:'flex', gap:4, alignItems:'center' }}>
          {conn.last_sync_status && (
            <Badge variant={STATUS_V[conn.last_sync_status] || 'gray'}>
              {conn.last_sync_status === 'ok' ? '✓ ОК' : '✕ Ошибка'}
            </Badge>
          )}
          {conn.is_active
            ? <span style={{ fontSize:10, background:'var(--teal-bg)', color:'var(--teal-text)', padding:'1px 6px', borderRadius:20, fontWeight:500 }}>Активно</span>
            : <span style={{ fontSize:10, background:'var(--gray-100)', color:'var(--gray-500)', padding:'1px 6px', borderRadius:20, fontWeight:500 }}>Откл.</span>
          }
        </div>
      </div>

      {/* Тело */}
      <div style={{ padding:'12px 16px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:12, fontSize:12 }}>
          <div>
            <div style={{ color:'var(--gray-400)', fontSize:10.5, marginBottom:2 }}>Склад FBS</div>
            <div style={{ color:'var(--gray-700)' }}>{conn.warehouse_name || conn.warehouse_id || '—'}</div>
          </div>
          <div>
            <div style={{ color:'var(--gray-400)', fontSize:10.5, marginBottom:2 }}>Последняя синхр.</div>
            <div style={{ color:'var(--gray-700)' }}>
              {conn.last_sync_at ? new Date(conn.last_sync_at).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—'}
            </div>
          </div>
          <div>
            <div style={{ color:'var(--gray-400)', fontSize:10.5, marginBottom:2 }}>Авто-остатки</div>
            <div style={{ color: conn.auto_sync_stocks ? 'var(--teal-text)' : 'var(--gray-400)' }}>
              {conn.auto_sync_stocks ? '✓ Включено' : 'Выключено'}
            </div>
          </div>
          <div>
            <div style={{ color:'var(--gray-400)', fontSize:10.5, marginBottom:2 }}>API ключ</div>
            <div style={{ color:'var(--gray-400)', fontFamily:'monospace', fontSize:11 }}>{conn.api_key}</div>
          </div>
        </div>

        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          <Button size="sm" variant="primary"
            onClick={() => doAction('import', () => onImport(conn.id))}
            disabled={loadingAction === 'import'}>
            {loadingAction === 'import' ? '⟳ Импорт...' : '↓ Импорт товаров'}
          </Button>
          <Button size="sm" variant="secondary"
            onClick={() => doAction('stocks', () => onPushStocks(conn.id))}
            disabled={loadingAction === 'stocks'}>
            {loadingAction === 'stocks' ? '⟳ Отправка...' : '↑ Остатки → МП'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onEdit(conn)}>Настройки</Button>
        </div>
      </div>
    </div>
  );
}

// ── Главная страница ─────────────────────────────────────────────
export default function Marketplace() {
  const qc = useQueryClient();
  const { data: connections, isLoading } = useConnections();
  const { data: syncLog } = useSyncLog({ limit: 20 });
  const [modal, setModal] = useState(false);
  const [editConn, setEditConn] = useState(null);
  const [tab, setTab] = useState('connections');
  const [selectedConn, setSelectedConn] = useState(null);
  const [actionResult, setActionResult] = useState(null);
  const [mpFilter, setMpFilter] = useState('all');

  const { data: mpProducts, isLoading: mpLoading } = useMpProducts(
    selectedConn ? { connection_id: selectedConn } : {}
  );
  const connectionRows = Array.isArray(connections) ? connections : [];
  const syncRows = Array.isArray(syncLog) ? syncLog : [];
  const mpProductRows = Array.isArray(mpProducts) ? mpProducts : [];
  const filteredConnections = connectionRows.filter((conn) => mpFilter === 'all' || conn.marketplace === mpFilter);

  const doImport = async (connId) => {
    try {
      const { data } = await api.post(`/mp/connections/${connId}/import-products`);
      setActionResult({ type: 'import', ...data });
      qc.invalidateQueries({ queryKey: ['mp-products'] });
      qc.invalidateQueries({ queryKey: ['mp-sync-log'] });
      qc.invalidateQueries({ queryKey: ['mp-connections'] });
    } catch (e) {
      setActionResult({ type: 'error', error: e.response?.data?.error || 'Ошибка импорта' });
    }
  };

  const doPushStocks = async (connId) => {
    try {
      const { data } = await api.post(`/mp/connections/${connId}/push-stocks`);
      setActionResult({ type: 'stocks', ...data });
      qc.invalidateQueries({ queryKey: ['mp-sync-log'] });
      qc.invalidateQueries({ queryKey: ['mp-connections'] });
    } catch (e) {
      setActionResult({ type: 'error', error: e.response?.data?.error || 'Ошибка отправки остатков' });
    }
  };

  const totalConnections = filteredConnections.length || 0;
  const activeConnections = filteredConnections.filter(c => c.is_active).length || 0;
  const autoSync = filteredConnections.filter(c => c.auto_sync_stocks).length || 0;

  return (
    <div>
      <PageHeader title="Маркетплейсы">
        <Button onClick={() => { setEditConn(null); setModal(true); }}>+ Добавить подключение</Button>
      </PageHeader>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Интеграции WB и Ozon</div>
            <div className="text-muted text-sm">Подключайте кабинет, импортируйте товары и подтягивайте фото, артикулы и баркоды в SMART WMS.</div>
          </div>
          <div className="filter-tabs">
            {[['all', 'Все'], ['wb', 'WB'], ['ozon', 'Ozon']].map(([value, label]) => (
              <button
                key={value}
                className={`filter-tab${mpFilter === value ? ' active' : ''}`}
                onClick={() => setMpFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {actionResult && (
        <div style={{
          padding:'10px 14px', borderRadius:8, marginBottom:16, fontSize:12.5,
          background: actionResult.error ? 'var(--red-bg)' : 'var(--teal-bg)',
          color: actionResult.error ? 'var(--red-600)' : 'var(--teal-700)',
          display:'flex', alignItems:'center', justifyContent:'space-between'
        }}>
          <span>
            {actionResult.error ? `❌ ${actionResult.error}` :
             actionResult.type === 'import'
               ? `✅ Импорт завершён: всего ${actionResult.total}, найдено совпадений ${actionResult.matched}, создано новых ${actionResult.created}`
               : `✅ Остатки отправлены: обновлено ${actionResult.updated} товаров`}
          </span>
          <button onClick={() => setActionResult(null)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, opacity:.6 }}>×</button>
        </div>
      )}

      <div className="stats-grid" style={{ gridTemplateColumns:'repeat(3,1fr)', marginBottom:20 }}>
        <div className="stat-card"><div className="stat-label">Подключений</div><div className="stat-value">{totalConnections}</div></div>
        <div className="stat-card"><div className="stat-label">Активных</div><div className="stat-value">{activeConnections}</div></div>
        <div className="stat-card"><div className="stat-label">Авто-остатки</div><div className="stat-value">{autoSync}</div><div className="stat-sub">подключений</div></div>
      </div>

      {/* Табы */}
      <div className="card">
        <div className="tab-bar">
          {[['connections','Подключения'],['products','Привязанные товары'],['log','Лог синхронизаций']].map(([k,l]) => (
            <button key={k} className={`tab-btn${tab===k?' active':''}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        {/* Подключения */}
        {tab === 'connections' && (
          <div style={{ padding:16 }}>
            {isLoading ? <Spinner /> : filteredConnections.length === 0 ? (
              <div style={{ padding:'32px', textAlign:'center' }}>
                <div style={{ fontSize:32, marginBottom:12, color:'var(--gray-300)' }}>🔌</div>
                <div style={{ fontWeight:600, marginBottom:6 }}>Нет подключений</div>
                <div className="text-muted text-sm" style={{ marginBottom:16 }}>Добавьте API-ключ маркетплейса для импорта товаров и обновления остатков</div>
                <Button onClick={() => setModal(true)}>+ Добавить первое подключение</Button>
              </div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:12 }}>
                {filteredConnections.map(conn => (
                  <ConnectionCard key={conn.id} conn={conn}
                    onEdit={c => { setEditConn(c); setModal(true); }}
                    onImport={doImport}
                    onPushStocks={doPushStocks} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Товары */}
        {tab === 'products' && (
          <div>
            <div style={{ padding:'10px 16px', borderBottom:'0.5px solid var(--gray-100)', display:'flex', gap:8, alignItems:'center' }}>
              <select style={{ fontSize:12, padding:'5px 8px', border:'0.5px solid var(--gray-200)', borderRadius:6 }}
                onChange={e => setSelectedConn(e.target.value)}>
                <option value="">Выберите подключение</option>
                {filteredConnections.map(c => (
                  <option key={c.id} value={c.id}>{MP_LABELS[c.marketplace]} — {c.company_name}</option>
                ))}
              </select>
              {selectedConn && <span className="text-muted text-sm">{mpProductRows.length || 0} товаров привязано</span>}
            </div>
            {!selectedConn ? <Empty text="Выберите подключение чтобы увидеть товары" /> :
             mpLoading ? <Spinner /> :
             mpProductRows.length === 0 ? <Empty text="Нет привязанных товаров — запустите импорт" /> : (
              <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Товар</th><th>Артикул SMART WMS</th><th>Артикул МП</th><th>SKU в МП</th><th>Штрихкод МП</th>
                    <th style={{textAlign:'right'}}>Доступно</th><th style={{textAlign:'right'}}>Отправлено</th><th>Синхр.</th>
                  </tr></thead>
                  <tbody>
                    {mpProductRows.map(p => (
                      <tr key={p.id}>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            {p.photo_url
                              ? <img src={p.photo_url} alt="" style={{ width:30, height:30, borderRadius:4, objectFit:'cover' }} />
                              : <div style={{ width:30, height:30, borderRadius:4, background:'var(--gray-100)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>📦</div>
                            }
                            <div style={{ fontWeight:500, fontSize:12, maxWidth:160 }} className="truncate">{p.product_name}</div>
                          </div>
                        </td>
                        <td className="mono muted">{p.article || '—'}</td>
                        <td className="mono muted">{p.mp_article || '—'}</td>
                        <td className="mono muted">{p.mp_sku || '—'}</td>
                        <td className="mono muted">{p.mp_barcode || '—'}</td>
                        <td style={{ textAlign:'right', fontWeight:600, color:'var(--teal-400)' }}>{fmt(p.available_qty)}</td>
                        <td style={{ textAlign:'right', color:'var(--gray-400)' }}>{fmt(p.last_stock_sent)}</td>
                        <td className="muted text-sm">
                          {p.synced_at ? new Date(p.synced_at).toLocaleDateString('ru-RU') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Лог */}
        {tab === 'log' && (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Дата</th><th>МП</th><th>Компания</th><th>Действие</th>
                <th style={{textAlign:'right'}}>Кол-во</th><th>Статус</th>
              </tr></thead>
              <tbody>
                {syncRows.length === 0 ? (
                  <tr><td colSpan={6}><Empty text="Лог пуст — запустите синхронизацию" /></td></tr>
                ) : syncRows
                  .filter((entry) => mpFilter === 'all' || entry.marketplace === mpFilter)
                  .map(entry => (
                  <tr key={entry.id}>
                    <td className="muted text-sm">{new Date(entry.created_at).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</td>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                        <div style={{ width:7, height:7, borderRadius:'50%', background: MP_COLORS[entry.marketplace]?.dot || '#999' }} />
                        <span style={{ fontSize:12 }}>{MP_LABELS[entry.marketplace] || entry.marketplace}</span>
                      </div>
                    </td>
                    <td className="text-sm" style={{ maxWidth:150 }}>{entry.company_name}</td>
                    <td className="muted text-sm">{{
                      import_products: 'Импорт товаров',
                      push_stocks: 'Обновление остатков',
                      create_supply: 'Создание поставки',
                    }[entry.action] || entry.action}</td>
                    <td style={{ textAlign:'right' }}>{fmt(entry.items_count)}</td>
                    <td>
                      {entry.status === 'ok'
                        ? <Badge variant="green">✓ OK</Badge>
                        : <span title={entry.error_msg}><Badge variant="red">✕ Ошибка</Badge></span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConnectionModal
        open={modal}
        onClose={() => { setModal(false); setEditConn(null); qc.invalidateQueries({ queryKey: ['mp-connections'] }); }}
        connection={editConn}
      />
    </div>
  );
}
