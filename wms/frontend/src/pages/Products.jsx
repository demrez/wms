import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useProducts,
  useCompanies,
  useCreateProduct,
  useUpdateProduct,
  useUpdateBarcodes,
  useDeleteProduct,
} from '../hooks/queries';
import { PageHeader, Button, Modal, Input, Select, fmt, Spinner, Empty } from '../components/ui';

const MP = { wb: 'WB', ozon: 'Ozon', yandex: 'Яндекс', ff: 'Фулфилмент' };

function ProductModal({ open, onClose, product, companies }) {
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const updateBarcodes = useUpdateBarcodes();
  const [form, setForm] = useState({
    name: '',
    article: '',
    brand: '',
    color: '',
    size: '',
    company_id: '',
    weight_g: '',
    country: '',
    composition: '',
    dim_l: '',
    dim_w: '',
    dim_h: '',
  });
  const [barcodes, setBarcodes] = useState([{ marketplace: 'ozon', barcode: '', article_mp: '' }]);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    setForm({
      name: product?.name || '',
      article: product?.article || '',
      brand: product?.brand || '',
      color: product?.color || '',
      size: product?.size || '',
      company_id: product?.company_id || '',
      weight_g: product?.weight_g || '',
      country: product?.country || '',
      composition: product?.composition || '',
      dim_l: product?.dim_l || '',
      dim_w: product?.dim_w || '',
      dim_h: product?.dim_h || '',
    });
    setBarcodes(product?.barcodes?.length ? product.barcodes : [{ marketplace: 'ozon', barcode: '', article_mp: '' }]);
  }, [product, open]);

  const handleSave = async () => {
    const payload = {
      ...form,
      weight_g: form.weight_g ? Number(form.weight_g) : undefined,
      dim_l: form.dim_l ? Number(form.dim_l) : undefined,
      dim_w: form.dim_w ? Number(form.dim_w) : undefined,
      dim_h: form.dim_h ? Number(form.dim_h) : undefined,
    };

    const saved = product?.id
      ? await update.mutateAsync({ id: product.id, ...payload })
      : await create.mutateAsync(payload);

    await updateBarcodes.mutateAsync({
      id: saved.id,
      barcodes: barcodes.filter((barcode) => barcode.barcode || barcode.article_mp),
    });

    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={product ? 'Редактировать товар' : 'Добавить товар'} size="lg">
      <div className="form-grid col-span-2">
        <div className="col-span-2">
          <Input label="Название" value={form.name} onChange={(event) => set('name', event.target.value)} />
        </div>
        <Select label="Компания" value={form.company_id} onChange={(event) => set('company_id', event.target.value)}>
          <option value="">Выберите компанию</option>
          {companies?.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
        </Select>
        <Input label="Артикул" value={form.article} onChange={(event) => set('article', event.target.value)} />
        <Input label="Бренд" value={form.brand} onChange={(event) => set('brand', event.target.value)} />
        <Input label="Цвет" value={form.color} onChange={(event) => set('color', event.target.value)} />
        <div className="form-group">
          <label>Размер</label>
          <input className="compact-input" value={form.size} onChange={(event) => set('size', event.target.value)} />
        </div>
        <div className="form-group">
          <label>Вес (г)</label>
          <input className="compact-number-input" type="number" value={form.weight_g} onChange={(event) => set('weight_g', event.target.value)} />
        </div>
        <Input label="Страна" value={form.country} onChange={(event) => set('country', event.target.value)} />
        <Input label="Состав" value={form.composition} onChange={(event) => set('composition', event.target.value)} />
        <div className="form-group col-span-2">
          <label>Габариты (см)</label>
          <div className="inline-dimensions">
            <input className="compact-number-input tiny" type="number" placeholder="Длина" value={form.dim_l} onChange={(event) => set('dim_l', event.target.value)} />
            <input className="compact-number-input tiny" type="number" placeholder="Ширина" value={form.dim_w} onChange={(event) => set('dim_w', event.target.value)} />
            <input className="compact-number-input tiny" type="number" placeholder="Высота" value={form.dim_h} onChange={(event) => set('dim_h', event.target.value)} />
          </div>
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--gray-500)' }}>Связи с маркетплейсами</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setBarcodes((current) => [...current, { marketplace: 'ozon', barcode: '', article_mp: '' }])}
          >
            + Добавить
          </Button>
        </div>
        {barcodes.map((barcode, index) => (
          <div key={index} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ width: 110 }}>
              {index === 0 && <label>Площадка</label>}
              <select
                value={barcode.marketplace}
                onChange={(event) => setBarcodes((current) => current.map((item, itemIndex) => (
                  itemIndex === index ? { ...item, marketplace: event.target.value } : item
                )))}
              >
                {Object.entries(MP).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              {index === 0 && <label>Штрихкод</label>}
              <input
                placeholder="Штрихкод"
                value={barcode.barcode || ''}
                onChange={(event) => setBarcodes((current) => current.map((item, itemIndex) => (
                  itemIndex === index ? { ...item, barcode: event.target.value } : item
                )))}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              {index === 0 && <label>Артикул МП</label>}
              <input
                placeholder="Артикул"
                value={barcode.article_mp || ''}
                onChange={(event) => setBarcodes((current) => current.map((item, itemIndex) => (
                  itemIndex === index ? { ...item, article_mp: event.target.value } : item
                )))}
              />
            </div>
            <Button size="sm" variant="danger" onClick={() => setBarcodes((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
              ✕
            </Button>
          </div>
        ))}
      </div>

      <div className="modal-footer" style={{ padding: 0, border: 'none', marginTop: 4 }}>
        <Button variant="secondary" onClick={onClose}>Отмена</Button>
        <Button onClick={handleSave} disabled={!form.name || !form.company_id || create.isPending || update.isPending}>Сохранить</Button>
      </div>
    </Modal>
  );
}

export default function Products() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [marketplace, setMarketplace] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [modalOpen, setModalOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const { data: products, isLoading } = useProducts({ search, marketplace, company_id: companyId, page, limit: pageSize });
  const { data: companies } = useCompanies();
  const deleteProduct = useDeleteProduct();
  const productRows = Array.isArray(products) ? products : products?.items || [];
  const totalRows = Array.isArray(products) ? productRows.length : Number(products?.total || 0);
  const totalPages = Array.isArray(products) ? 1 : Number(products?.totalPages || 1);
  const companyRows = Array.isArray(companies) ? companies : [];

  const openEdit = (product) => {
    setEditProduct(product);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditProduct(null);
  };

  const handleDelete = async (event, productId) => {
    event.stopPropagation();
    if (!window.confirm('Удалить товар?')) return;
    try {
      await deleteProduct.mutateAsync(productId);
    } catch (error) {
      window.alert(error.response?.data?.error || 'Не удалось удалить товар');
    }
  };

  const totalQty = productRows.reduce((sum, product) => sum + Number(product.quantity || 0), 0);
  const totalDefect = productRows.reduce((sum, product) => sum + Number(product.defect_qty || 0), 0);

  useEffect(() => {
    setPage(1);
  }, [search, marketplace, companyId, pageSize]);

  return (
    <div>
      <PageHeader title="Товары">
        <Button onClick={() => setModalOpen(true)}>+ Добавить товар</Button>
      </PageHeader>

      <div className="desktop-only stats-grid">
        <div className="stat-card"><div className="stat-label">Товаров</div><div className="stat-value">{fmt(productRows.length)}</div></div>
        <div className="stat-card"><div className="stat-label">Остаток</div><div className="stat-value">{fmt(totalQty)}</div></div>
        <div className="stat-card"><div className="stat-label">Брак</div><div className="stat-value" style={{ color: 'var(--red-400)' }}>{fmt(totalDefect)}</div></div>
        <div className="stat-card"><div className="stat-label">Компаний</div><div className="stat-value">{fmt(companyRows.length)}</div></div>
      </div>
      <div className="mobile-only" style={{ marginBottom: 18 }}>
        <div className="mobile-stat-strip">
          <div className="mobile-stat-card"><div className="mobile-stat-card-label">Товаров</div><div className="mobile-stat-card-value">{fmt(productRows.length)}</div></div>
          <div className="mobile-stat-card"><div className="mobile-stat-card-label">Остаток</div><div className="mobile-stat-card-value">{fmt(totalQty)}</div></div>
          <div className="mobile-stat-card"><div className="mobile-stat-card-label">Брак</div><div className="mobile-stat-card-value mobile-stat-card-value-red">{fmt(totalDefect)}</div></div>
          <div className="mobile-stat-card"><div className="mobile-stat-card-label">Компаний</div><div className="mobile-stat-card-value">{fmt(companyRows.length)}</div></div>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="search-input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск по названию, артикулу, штрихкоду..."
        />
        <div className="filter-tabs">
          {[['', 'Все'], ['ff', 'Фулфилмент'], ['wb', 'WB'], ['ozon', 'Ozon'], ['yandex', 'Яндекс']].map(([value, label]) => (
            <button key={value} className={`filter-tab${marketplace === value ? ' active' : ''}`} onClick={() => setMarketplace(value)}>
              {label}
            </button>
          ))}
        </div>
        <Select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
          <option value="">Все компании</option>
          {companyRows.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
        </Select>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="text-muted text-sm">На странице</span>
          <div className="page-size-toggle">
            {[25, 50, 100].map((size) => (
              <button
                key={size}
                type="button"
                className={`page-size-btn${pageSize === size ? ' active' : ''}`}
                onClick={() => setPageSize(size)}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        {isLoading ? <Spinner /> : productRows.length === 0 ? <Empty /> : (
          <>
            <div className="desktop-only table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Компания</th>
                  <th>Баркод</th>
                  <th>Артикул</th>
                  <th>Цвет</th>
                  <th style={{ textAlign: 'right' }}>Остаток</th>
                  <th style={{ textAlign: 'right' }}>Брак</th>
                  <th style={{ textAlign: 'right' }}>Доступно</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {productRows.map((product) => (
                  <tr key={product.id} className="clickable" onClick={() => navigate(`/products/${product.id}`)}>
                    <td className="product-name-cell">
                      <div style={{ fontWeight: 500 }} className="truncate">{product.name}</div>
                      {product.brand && <div className="text-muted text-sm">{product.brand}</div>}
                    </td>
                    <td className="text-muted product-company-cell">{companyRows.find((company) => company.id === product.company_id)?.name || '—'}</td>
                    <td className="mono text-muted product-barcode-cell">
                      {product.barcode || '—'}
                      {Number(product.barcodes_count || 0) > 1 ? (
                        <span className="badge badge-gray" style={{ marginLeft: 8 }}>
                          +{Number(product.barcodes_count || 0) - 1}
                        </span>
                      ) : null}
                    </td>
                    <td className="product-article-cell"><span className="mono">{product.article}</span></td>
                    <td className="text-muted product-color-cell">{product.color || '—'}</td>
                    <td className="text-right text-teal">{fmt(product.quantity)}</td>
                    <td
                      className="text-right"
                      style={{ color: product.defect_qty > 0 ? 'var(--red-400)' : 'var(--gray-300)', fontWeight: product.defect_qty > 0 ? 600 : 400 }}
                    >
                      {fmt(product.defect_qty)}
                    </td>
                    <td className="text-right">{fmt(product.available_qty)}</td>
                    <td className="product-actions-cell">
                      <div className="product-actions-stack">
                        <button className="btn btn-ghost btn-sm product-action-btn" onClick={(event) => { event.stopPropagation(); openEdit(product); }}>Изменить</button>
                        <button className="btn btn-ghost btn-sm text-red product-action-btn" onClick={(event) => handleDelete(event, product.id)}>Удалить</button>
                      </div>
                    </td>
                  </tr>
                ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-only admin-products-mobile-list">
              <div className="mobile-entity-list">
                {productRows.map((product) => (
                  <div key={product.id} className="admin-product-mobile-card" role="button" tabIndex={0} onClick={() => navigate(`/products/${product.id}`)} onKeyDown={(event) => event.key === 'Enter' && navigate(`/products/${product.id}`)}>
                    <div className="mobile-entity-head">
                      <div>
                        <div className="mobile-entity-title">{product.name}</div>
                        <div className="mobile-entity-sub">
                          {companyRows.find((company) => company.id === product.company_id)?.name || '—'}
                          {product.brand ? ` · ${product.brand}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="mobile-entity-grid">
                      <div className="mobile-entity-pill">
                        <div className="mobile-entity-pill-label">Баркод</div>
                        <div className="mobile-entity-pill-value mono">{product.barcode || '—'}</div>
                      </div>
                      <div className="mobile-entity-pill">
                        <div className="mobile-entity-pill-label">Артикул</div>
                        <div className="mobile-entity-pill-value mono">{product.article || '—'}</div>
                      </div>
                      <div className="mobile-entity-pill">
                        <div className="mobile-entity-pill-label">Остаток</div>
                        <div className="mobile-entity-pill-value" style={{ color: 'var(--teal-400)' }}>{fmt(product.quantity)}</div>
                      </div>
                      <div className="mobile-entity-pill">
                        <div className="mobile-entity-pill-label">Доступно</div>
                        <div className="mobile-entity-pill-value">{fmt(product.available_qty)}</div>
                      </div>
                      <div className="mobile-entity-pill">
                        <div className="mobile-entity-pill-label">Брак</div>
                        <div className="mobile-entity-pill-value" style={{ color: product.defect_qty > 0 ? 'var(--red-400)' : 'var(--gray-400)' }}>{fmt(product.defect_qty)}</div>
                      </div>
                      <div className="mobile-entity-pill">
                        <div className="mobile-entity-pill-label">Цвет</div>
                        <div className="mobile-entity-pill-value">{product.color || '—'}</div>
                      </div>
                    </div>
                    <div className="mobile-entity-actions">
                      <button className="btn btn-ghost btn-sm product-action-btn" onClick={(event) => { event.stopPropagation(); openEdit(product); }}>Изменить</button>
                      <button className="btn btn-ghost btn-sm text-red product-action-btn" onClick={(event) => handleDelete(event, product.id)}>Удалить</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {!isLoading && totalPages > 1 && (
        <div className="pagination-bar">
          <div className="text-muted text-sm">
            Показано {Math.min((page - 1) * pageSize + 1, totalRows)}–{Math.min(page * pageSize, totalRows)} из {totalRows}
          </div>
          <div className="pagination-controls">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
            >
              Назад
            </button>
            <span className="text-muted text-sm">Страница {page} из {totalPages}</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
            >
              Вперёд
            </button>
          </div>
        </div>
      )}

      <ProductModal open={modalOpen} onClose={closeModal} product={editProduct} companies={companyRows} />
    </div>
  );
}
