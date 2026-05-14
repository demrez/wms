import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWarehouseSummary, useWarehouseOps, useDefects, useWarehouseOp, useProducts, useCompanies, useTogglePaidStorage } from '../hooks/queries';
import { PageHeader, Button, Modal, Select, Input, fmt, Spinner, Empty, Badge } from '../components/ui';
import useDismissibleDropdown from '../hooks/useDismissibleDropdown';

const OP_LABELS = { in:'Приход', out:'Расход', defect:'Брак', defect_return:'Возврат из брака', write_off:'Списание' };
const OP_VARIANTS = { in:'green', out:'red', defect:'red', defect_return:'amber', write_off:'gray' };
const normalizeProductList = (data) => (Array.isArray(data) ? data : data?.items || []);

function OpModal({ open, onClose }) {
  const [companyId, setCompanyId] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const productDropdownRef = useDismissibleDropdown(productMenuOpen, () => setProductMenuOpen(false));
  const { data: companies } = useCompanies();
  const { data: products } = useProducts(companyId ? { company_id: companyId } : {});
  const op = useWarehouseOp();
  const [form, setForm] = useState({ product_id:'', op_type:'in', quantity:1, note:'' });
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setCompanyId('');
    setProductQuery('');
    setProductMenuOpen(false);
    setForm({ product_id:'', op_type:'in', quantity:1, note:'' });
    setError('');
  }, [open]);

  const productRows = useMemo(() => normalizeProductList(products), [products]);
  const selectedProduct = useMemo(
    () => productRows.find((item) => item.id === form.product_id) || null,
    [productRows, form.product_id]
  );

  const filteredProducts = useMemo(() => {
    if (!productRows?.length) return [];
    const query = productQuery.trim().toLowerCase();
    if (!query) return productRows.slice(0, 8);
    return productRows
      .filter((item) =>
        item.name?.toLowerCase().includes(query) ||
        item.article?.toLowerCase().includes(query) ||
        String(item.barcode || '').toLowerCase().includes(query)
      )
      .slice(0, 8);
  }, [productRows, productQuery]);

  const handleSave = async () => {
    setError('');
    try {
      await op.mutateAsync({ ...form, quantity: Number(form.quantity) });
      onClose();
    } catch(e) { setError(e.response?.data?.error || 'Ошибка'); }
  };

  const pickProduct = (product) => {
    set('product_id', product.id);
    setProductQuery(product.name);
    setProductMenuOpen(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Складская операция">
      <Select label="Компания" value={companyId} onChange={e => { setCompanyId(e.target.value); set('product_id', ''); }}>
        <option value="">Все компании</option>
        {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <div className="form-group">
        <label>Товар</label>
        <div className="services-search-wrap" ref={productDropdownRef}>
          <input
            value={selectedProduct && productQuery === selectedProduct.name ? productQuery : productQuery}
            onFocus={() => setProductMenuOpen(true)}
            onChange={(e) => {
              setProductQuery(e.target.value);
              set('product_id', '');
              setProductMenuOpen(true);
            }}
            placeholder="Название, артикул или штрихкод (можно сканером)..."
          />
          {productMenuOpen && !!filteredProducts.length && (
            <div className="services-search-dropdown">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="services-search-option"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pickProduct(product);
                  }}
                >
                  {product.name}{product.article ? ` (${product.article})` : ''}{product.barcode ? ` · ${product.barcode}` : ''} — ост. {fmt(product.quantity)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <Select label="Тип операции" value={form.op_type} onChange={e => set('op_type', e.target.value)}>
        {Object.entries(OP_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
      </Select>
      <Input label="Количество" className="compact-number-input" type="number" min="1" value={form.quantity} onChange={e => set('quantity', e.target.value)} />
      <Input label="Комментарий" value={form.note} onChange={e => set('note', e.target.value)} />
      {error && <div className="alert alert-error">{error}</div>}
      <div className="modal-footer" style={{ padding:0, border:'none' }}>
        <Button variant="secondary" onClick={onClose}>Отмена</Button>
        <Button onClick={handleSave} disabled={op.isPending || !form.product_id}>Провести</Button>
      </div>
    </Modal>
  );
}

export default function Warehouse() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState('summary');
  const [opModal, setOpModal] = useState(false);
  const [opsFilter, setOpsFilter] = useState('');
  const [summarySearch, setSummarySearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { data: summary } = useWarehouseSummary();
  const { data: companies } = useCompanies();
  const { data: filterProducts } = useProducts(companyFilter ? { company_id: companyFilter } : {});
  const filterProductRows = useMemo(() => normalizeProductList(filterProducts), [filterProducts]);
  const opsParams = {
    ...(opsFilter ? { op_type: opsFilter } : {}),
    ...(companyFilter ? { company_id: companyFilter } : {}),
    ...(productFilter ? { product_id: productFilter } : {}),
    ...(dateFrom ? { from: dateFrom } : {}),
    ...(dateTo ? { to: dateTo } : {}),
  };
  const { data: ops, isLoading: ol } = useWarehouseOps(opsParams);
  const { data: defects } = useDefects();
  const togglePaidStorage = useTogglePaidStorage();

  const totalQty = summary?.reduce((s,r) => s + Number(r.quantity), 0) || 0;
  const totalDefects = defects?.reduce((s,r) => s + Number(r.defect_qty), 0) || 0;
  const totalProducts = summary?.reduce((s, r) => s + Number(r.products_count), 0) || 0;
  const filteredSummary = summary?.filter((row) =>
    !summarySearch || row.name.toLowerCase().includes(summarySearch.toLowerCase())
  );
  const defectPaidCount = defects?.filter((row) => row.paid_storage).length || 0;
  const maxSummaryQty = Math.max(...(summary || []).map((row) => Number(row.quantity) || 0), 0);
  const defectPositionCount = defects?.length || 0;
  const defectPercent = totalQty > 0 ? (totalDefects / totalQty) * 100 : 0;
  const summaryCards = filteredSummary || [];
  const opsCards = ops || [];
  const defectCards = defects || [];
  const formatDate = (value) => new Date(value).toLocaleDateString('ru-RU');
  const formatDateTime = (value) => new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const resetOpsFilters = () => {
    setOpsFilter('');
    setCompanyFilter('');
    setProductFilter('');
    setDateFrom('');
    setDateTo('');
  };

  useEffect(() => {
    const nextTab = searchParams.get('tab');
    if (nextTab && ['summary', 'ops', 'defects'].includes(nextTab)) {
      setTab(nextTab);
    }
  }, [searchParams]);

  const handleTabChange = (nextTab) => {
    setTab(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    if (nextTab === 'summary') nextParams.delete('tab');
    else nextParams.set('tab', nextTab);
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <div className="warehouse-page">
      <PageHeader title="Склад">
        <Button onClick={() => setOpModal(true)}>+ Провести операцию</Button>
      </PageHeader>

      <div className="desktop-only warehouse-stats-grid">
        <div className="warehouse-stat-card">
          <div className="warehouse-stat-label">Компаний</div>
          <div className="warehouse-stat-value">{fmt(summary?.length || 0)}</div>
          <div className="warehouse-stat-sub">с товарами на складе</div>
        </div>
        <div className="warehouse-stat-card">
          <div className="warehouse-stat-label">Единиц</div>
          <div className="warehouse-stat-value warehouse-stat-value-teal">{fmt(totalQty)}</div>
          <div className="warehouse-stat-sub">на складе всего</div>
        </div>
        <div className="warehouse-stat-card">
          <div className="warehouse-stat-label">Брак</div>
          <div className="warehouse-stat-value warehouse-stat-value-red">{fmt(totalDefects)}</div>
          <div className="warehouse-stat-sub">{defectPercent.toFixed(1)}% от остатка</div>
        </div>
        <div className="warehouse-stat-card">
          <div className="warehouse-stat-label">Платное хран.</div>
          <div className="warehouse-stat-value warehouse-stat-value-amber">{fmt(defectPaidCount)}</div>
          <div className="warehouse-stat-sub">товаров на особых условиях</div>
        </div>
      </div>
      <div className="mobile-only" style={{ marginBottom: 18 }}>
        <div className="mobile-stat-strip">
          <div className="mobile-stat-card"><div className="mobile-stat-card-label">Компаний</div><div className="mobile-stat-card-value">{fmt(summary?.length || 0)}</div></div>
          <div className="mobile-stat-card"><div className="mobile-stat-card-label">Единиц</div><div className="mobile-stat-card-value">{fmt(totalQty)}</div></div>
          <div className="mobile-stat-card"><div className="mobile-stat-card-label">Брак</div><div className="mobile-stat-card-value mobile-stat-card-value-red">{fmt(totalDefects)}</div></div>
          <div className="mobile-stat-card"><div className="mobile-stat-card-label">Платное хран.</div><div className="mobile-stat-card-value mobile-stat-card-value-amber">{fmt(defectPaidCount)}</div></div>
        </div>
      </div>

      <div className="card warehouse-card">
        <div className="tab-bar warehouse-tab-bar">
          {[['summary',`Учёт (${summary?.length||0})`],['ops',`Операции (${ops?.length||0})`],['defects',`Брак (${defects?.length||0})`]].map(([k,l]) => (
            <button key={k} className={`tab-btn${tab===k?' active':''}`} onClick={() => handleTabChange(k)}>{l}</button>
          ))}
        </div>

        {tab === 'summary' && (
          <>
            <div className="warehouse-search-row">
              <input
                className="search-input"
                value={summarySearch}
                onChange={e => setSummarySearch(e.target.value)}
                placeholder="Поиск по компании..."
              />
            </div>
            <div className="desktop-only table-wrap warehouse-table-wrap">
              <table className="warehouse-table">
                <thead><tr><th style={{ width: 44 }}>№</th><th>Компания</th><th style={{ width: 220 }}>Распределение</th><th className="tr-right">Остаток</th><th className="tr-right">Брак</th><th className="tr-right">Товаров</th></tr></thead>
                <tbody>
                  {summaryCards.map((r,i) => (
                    <tr key={r.id}>
                      <td className="text-muted text-sm">{i + 1}</td>
                      <td className="warehouse-table-company">{r.name}</td>
                      <td>
                        <div className="warehouse-distribution">
                          <div className="warehouse-distribution-track">
                            <div className="warehouse-distribution-fill" style={{ width: `${maxSummaryQty ? Math.max(6, Math.round((Number(r.quantity) / maxSummaryQty) * 100)) : 0}%` }} />
                          </div>
                          <span className="warehouse-distribution-pct">
                            {maxSummaryQty ? Math.round((Number(r.quantity) / maxSummaryQty) * 100) : 0}%
                          </span>
                        </div>
                      </td>
                      <td className="tr-right warehouse-number-teal">{fmt(r.quantity)}</td>
                      <td className="tr-right" style={{ color: Number(r.defect_qty) > 0 ? 'var(--red-400)' : 'var(--gray-500)', fontWeight: 600 }}>{fmt(r.defect_qty)}</td>
                      <td className="tr-right text-muted">{fmt(r.products_count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-only admin-warehouse-mobile-list">
              {!summaryCards.length ? <Empty /> : (
                <div className="mobile-entity-list">
                  {summaryCards.map((r, i) => (
                    <div key={r.id} className="admin-warehouse-mobile-card">
                      <div className="mobile-entity-head">
                        <div>
                          <div className="mobile-entity-title">{r.name}</div>
                          <div className="mobile-entity-sub">#{i + 1}</div>
                        </div>
                      </div>
                      <div className="mobile-entity-grid">
                        <div className="mobile-entity-pill">
                          <div className="mobile-entity-pill-label">Количество</div>
                          <div className="mobile-entity-pill-value" style={{ color: 'var(--teal-400)' }}>{fmt(r.quantity)}</div>
                        </div>
                        <div className="mobile-entity-pill">
                          <div className="mobile-entity-pill-label">Брак</div>
                          <div className="mobile-entity-pill-value" style={{ color: Number(r.defect_qty) > 0 ? 'var(--red-400)' : 'var(--gray-500)' }}>{fmt(r.defect_qty)}</div>
                        </div>
                        <div className="mobile-entity-pill">
                          <div className="mobile-entity-pill-label">Товаров</div>
                          <div className="mobile-entity-pill-value">{r.products_count}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'ops' && <>
          <div className="warehouse-filter-row">
            <div className="filter-tabs">
              {[['','Все'],['in','Приход'],['out','Расход'],['defect','Брак'],['write_off','Списание']].map(([v,l]) => (
                <button key={v} className={`filter-tab${opsFilter===v?' active':''}`} onClick={() => setOpsFilter(v)}>{l}</button>
              ))}
            </div>
            <div className="toolbar admin-warehouse-ops-toolbar warehouse-ops-toolbar" style={{ marginBottom: 0 }}>
              <select value={companyFilter} onChange={e => { setCompanyFilter(e.target.value); setProductFilter(''); }}>
                <option value="">Все компании</option>
                {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={productFilter} onChange={e => setProductFilter(e.target.value)}>
                <option value="">Все товары</option>
                {filterProductRows.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="datetime-local" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              <span className="warehouse-filter-sep">—</span>
              <input type="datetime-local" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              <Button variant="secondary" size="sm" onClick={resetOpsFilters}>Сбросить</Button>
            </div>
          </div>
          {ol ? <Spinner /> : opsCards.length === 0 ? <Empty /> : (
            <>
              <div className="desktop-only table-wrap warehouse-table-wrap">
              <table className="warehouse-table">
                <thead><tr><th>Дата / Кто</th><th>Товар</th><th>Компания</th><th>Тип</th><th className="tr-right">Кол-во</th><th>Заявка</th><th>Комментарий</th></tr></thead>
                <tbody>
                  {opsCards.map(o => (
                    <tr key={o.id}>
                      <td>
                        <div className="warehouse-cell-primary">{formatDate(o.created_at)}</div>
                        <div className="warehouse-cell-sub">{o.created_by_name || 'Система'}</div>
                      </td>
                      <td><div className="warehouse-cell-primary warehouse-product-cell">{o.product_name}</div><div className="text-muted text-sm mono">{o.article}</div></td>
                      <td className="text-muted warehouse-company-cell">{o.company_name}</td>
                      <td><Badge variant={OP_VARIANTS[o.op_type]||'gray'}>{OP_LABELS[o.op_type]}</Badge></td>
                      <td className="tr-right" style={{ fontWeight:600, color: ['in','defect_return'].includes(o.op_type) ? 'var(--teal-400)' : 'var(--red-400)' }}>
                        {['in','defect_return'].includes(o.op_type) ? '+' : '−'}{fmt(o.quantity)}
                      </td>
                      <td className="text-muted text-sm">{o.order_number ? `#${o.order_number}` : '—'}</td>
                      <td className="warehouse-comment-cell">{o.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <div className="mobile-only admin-warehouse-mobile-list">
                <div className="mobile-entity-list">
                  {opsCards.map((o) => (
                    <div key={o.id} className="admin-warehouse-mobile-card">
                      <div className="mobile-entity-head">
                        <div>
                          <div className="mobile-entity-title">{o.product_name}</div>
                          <div className="mobile-entity-sub">{o.company_name}</div>
                        </div>
                      </div>
                      <div className="mobile-entity-badges">
                        <Badge variant={OP_VARIANTS[o.op_type] || 'gray'}>{OP_LABELS[o.op_type]}</Badge>
                        <span className="badge badge-gray">{o.order_number ? `#${o.order_number}` : 'Без заявки'}</span>
                      </div>
                      <div className="mobile-entity-grid">
                        <div className="mobile-entity-pill">
                          <div className="mobile-entity-pill-label">Дата</div>
                          <div className="mobile-entity-pill-value">{new Date(o.created_at).toLocaleDateString('ru-RU')}</div>
                        </div>
                        <div className="mobile-entity-pill">
                          <div className="mobile-entity-pill-label">Кол-во</div>
                          <div className="mobile-entity-pill-value" style={{ color: ['in','defect_return'].includes(o.op_type) ? 'var(--teal-400)' : 'var(--red-400)' }}>
                            {['in','defect_return'].includes(o.op_type) ? '+' : '−'}{fmt(o.quantity)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>}

        {tab === 'defects' && (
          defectCards.length === 0 ? <Empty text="Брака нет 🎉" /> : (
            <>
              <div className="desktop-only warehouse-defect-top">
                <div className="warehouse-defect-stat">
                  <div className="warehouse-defect-label">Позиций с браком</div>
                  <div className="warehouse-defect-value">{fmt(defectPositionCount)}</div>
                </div>
                <div className="warehouse-defect-stat">
                  <div className="warehouse-defect-label">Единиц брака</div>
                  <div className="warehouse-defect-value">{fmt(totalDefects)}</div>
                </div>
                <div className="warehouse-defect-stat">
                  <div className="warehouse-defect-label">% от остатка</div>
                  <div className="warehouse-defect-value">{defectPercent.toFixed(1)}%</div>
                </div>
              </div>
              <div className="desktop-only table-wrap warehouse-table-wrap">
              <table className="warehouse-table">
                <thead><tr><th>Товар</th><th>Компания</th><th className="tr-right">Брак</th><th className="tr-right">Остаток</th><th className="tr-right">% брака</th><th>Платное хранение</th><th style={{ width: 90 }} /></tr></thead>
                <tbody>
                  {defectCards.map(d => {
                    const defectPct = Number(d.quantity) > 0 ? Math.round((Number(d.defect_qty) / Number(d.quantity)) * 100) : 0;
                    return (
                    <tr key={d.id}>
                      <td><div className="warehouse-cell-primary">{d.product_name}</div><div className="text-muted text-sm mono">{d.article}</div></td>
                      <td className="text-muted">{d.company_name}</td>
                      <td className="tr-right" style={{fontWeight:600,color:'var(--red-400)'}}>{fmt(d.defect_qty)}</td>
                      <td className="tr-right text-muted">{fmt(d.quantity)}</td>
                      <td className="tr-right">
                        <span className={`warehouse-pct-badge${defectPct >= 10 ? ' warehouse-pct-badge-high' : ''}`}>{defectPct}%</span>
                      </td>
                      <td>
                        <label className="switch-inline warehouse-paid-switch">
                          <input
                            type="checkbox"
                            checked={Boolean(d.paid_storage)}
                            onChange={(event) => togglePaidStorage.mutate({ productId: d.product_id, paid_storage: event.target.checked })}
                          />
                          <span>{d.paid_storage ? 'Включено' : 'Выключено'}</span>
                        </label>
                      </td>
                      <td className="tr-right">
                        <Button variant="secondary" size="sm" disabled>Списать</Button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
              <div className="mobile-only admin-warehouse-mobile-list">
                <div className="mobile-entity-list">
                  {defectCards.map((d) => (
                    <div key={d.id} className="admin-warehouse-mobile-card">
                      <div className="mobile-entity-head">
                        <div>
                          <div className="mobile-entity-title">{d.product_name}</div>
                          <div className="mobile-entity-sub">{d.company_name}</div>
                        </div>
                      </div>
                      <div className="mobile-entity-grid">
                        <div className="mobile-entity-pill">
                          <div className="mobile-entity-pill-label">Брак</div>
                          <div className="mobile-entity-pill-value" style={{ color:'var(--red-400)' }}>{fmt(d.defect_qty)}</div>
                        </div>
                        <div className="mobile-entity-pill">
                          <div className="mobile-entity-pill-label">Всего</div>
                          <div className="mobile-entity-pill-value">{fmt(d.quantity)}</div>
                        </div>
                      </div>
                      <div style={{ marginTop:10 }}>
                        <label className="switch-inline">
                          <input
                            type="checkbox"
                            checked={Boolean(d.paid_storage)}
                            onChange={(event) => togglePaidStorage.mutate({ productId: d.product_id, paid_storage: event.target.checked })}
                          />
                          <span>{d.paid_storage ? 'Вкл. платное хранение' : 'Выкл. платное хранение'}</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )
        )}
      </div>
      <OpModal open={opModal} onClose={() => setOpModal(false)} />
    </div>
  );
}
