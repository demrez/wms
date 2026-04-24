import { useEffect, useMemo, useState } from 'react';
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
  const filteredSummary = summary?.filter((row) =>
    !summarySearch || row.name.toLowerCase().includes(summarySearch.toLowerCase())
  );
  const defectPaidCount = defects?.filter((row) => row.paid_storage).length || 0;
  const summaryCards = filteredSummary || [];
  const opsCards = ops || [];
  const defectCards = defects || [];

  return (
    <div>
      <PageHeader title="Склад">
        <Button onClick={() => setOpModal(true)}>+ Провести операцию</Button>
      </PageHeader>

      <div className="desktop-only stats-grid" style={{ gridTemplateColumns:'repeat(4,1fr)' }}>
        <div className="stat-card"><div className="stat-label">Компаний</div><div className="stat-value">{summary?.length || 0}</div></div>
        <div className="stat-card"><div className="stat-label">Единиц на складе</div><div className="stat-value">{fmt(totalQty)}</div></div>
        <div className="stat-card"><div className="stat-label">Брак</div><div className="stat-value" style={{ color:'var(--red-400)' }}>{fmt(totalDefects)}</div></div>
        <div className="stat-card"><div className="stat-label">Платное хранение</div><div className="stat-value">{fmt(defectPaidCount)}</div></div>
      </div>
      <div className="mobile-only" style={{ marginBottom: 18 }}>
        <div className="mobile-stat-strip">
          <div className="mobile-stat-card"><div className="mobile-stat-card-label">Компаний</div><div className="mobile-stat-card-value">{fmt(summary?.length || 0)}</div></div>
          <div className="mobile-stat-card"><div className="mobile-stat-card-label">Единиц на складе</div><div className="mobile-stat-card-value">{fmt(totalQty)}</div></div>
          <div className="mobile-stat-card"><div className="mobile-stat-card-label">Брак</div><div className="mobile-stat-card-value mobile-stat-card-value-red">{fmt(totalDefects)}</div></div>
          <div className="mobile-stat-card"><div className="mobile-stat-card-label">Платное хранение</div><div className="mobile-stat-card-value">{fmt(defectPaidCount)}</div></div>
        </div>
      </div>

      <div className="card">
        <div className="tab-bar">
          {[['summary',`Учёт (${summary?.length||0})`],['ops',`Операции (${ops?.length||0})`],['defects',`Брак (${defects?.length||0})`]].map(([k,l]) => (
            <button key={k} className={`tab-btn${tab===k?' active':''}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        {tab === 'summary' && (
          <>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--gray-100)' }}>
              <input
                className="search-input"
                value={summarySearch}
                onChange={e => setSummarySearch(e.target.value)}
                placeholder="Поиск по компании..."
              />
            </div>
            <div className="desktop-only table-wrap">
              <table>
                <thead><tr><th>№</th><th>Компания</th><th style={{textAlign:'right'}}>Количество</th><th style={{textAlign:'right'}}>Брак</th><th style={{textAlign:'right'}}>Товаров</th></tr></thead>
                <tbody>
                  {summaryCards.map((r,i) => (
                    <tr key={r.id}>
                      <td className="text-muted text-sm">{i+1}</td>
                      <td style={{ fontWeight:500 }}>{r.name}</td>
                      <td className="text-right text-teal">{fmt(r.quantity)}</td>
                      <td className="text-right" style={{ color: Number(r.defect_qty) > 0 ? 'var(--red-400)' : 'var(--gray-400)' }}>{fmt(r.defect_qty)}</td>
                      <td className="text-right text-muted">{r.products_count}</td>
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
          <div className="admin-warehouse-ops-filters" style={{ padding:'10px 16px', borderBottom:'1px solid var(--gray-100)', display:'flex', gap:8, flexWrap:'wrap' }}>
            {[['','Все'],['in','Приход'],['out','Расход'],['defect','Брак'],['write_off','Списание']].map(([v,l]) => (
              <button key={v} className={`filter-tab${opsFilter===v?' active':''}`} style={{ background: opsFilter===v ? 'var(--teal-50)' : 'none', color: opsFilter===v ? 'var(--teal-600)' : undefined }} onClick={() => setOpsFilter(v)}>{l}</button>
            ))}
            <div className="toolbar admin-warehouse-ops-toolbar" style={{ marginBottom: 0 }}>
              <select value={companyFilter} onChange={e => { setCompanyFilter(e.target.value); setProductFilter(''); }}>
                <option value="">Все компании</option>
                {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={productFilter} onChange={e => setProductFilter(e.target.value)}>
                <option value="">Все товары</option>
                {filterProductRows.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="datetime-local" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              <input type="datetime-local" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          </div>
          {ol ? <Spinner /> : opsCards.length === 0 ? <Empty /> : (
            <>
              <div className="desktop-only table-wrap">
              <table>
                <thead><tr><th>Дата</th><th>Товар</th><th>Компания</th><th>Тип</th><th style={{textAlign:'right'}}>Кол-во</th><th>Заявка</th></tr></thead>
                <tbody>
                  {opsCards.map(o => (
                    <tr key={o.id}>
                      <td className="text-muted text-sm">{new Date(o.created_at).toLocaleDateString('ru-RU')}</td>
                      <td><div style={{fontWeight:500,maxWidth:140}} className="truncate">{o.product_name}</div><div className="text-muted text-sm mono">{o.article}</div></td>
                      <td className="text-muted truncate" style={{maxWidth:140}}>{o.company_name}</td>
                      <td><Badge variant={OP_VARIANTS[o.op_type]||'gray'}>{OP_LABELS[o.op_type]}</Badge></td>
                      <td className="text-right" style={{ fontWeight:600, color: ['in','defect_return'].includes(o.op_type) ? 'var(--teal-400)' : 'var(--red-400)' }}>
                        {['in','defect_return'].includes(o.op_type) ? '+' : '−'}{fmt(o.quantity)}
                      </td>
                      <td className="text-muted text-sm">{o.order_number ? `#${o.order_number}` : '—'}</td>
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
              <div className="desktop-only table-wrap">
              <table>
                <thead><tr><th>Товар</th><th>Компания</th><th style={{textAlign:'right'}}>Брак</th><th style={{textAlign:'right'}}>Всего</th><th>Платное хранение</th></tr></thead>
                <tbody>
                  {defectCards.map(d => (
                    <tr key={d.id}>
                      <td><div style={{fontWeight:500}}>{d.product_name}</div><div className="text-muted text-sm mono">{d.article}</div></td>
                      <td className="text-muted">{d.company_name}</td>
                      <td className="text-right" style={{fontWeight:600,color:'var(--red-400)'}}>{fmt(d.defect_qty)}</td>
                      <td className="text-right text-muted">{fmt(d.quantity)}</td>
                      <td>
                        <label className="switch-inline">
                          <input
                            type="checkbox"
                            checked={Boolean(d.paid_storage)}
                            onChange={(event) => togglePaidStorage.mutate({ productId: d.product_id, paid_storage: event.target.checked })}
                          />
                          <span>{d.paid_storage ? 'Вкл.' : 'Выкл.'}</span>
                        </label>
                      </td>
                    </tr>
                  ))}
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
