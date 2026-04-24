import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompanies, useCreateCompany, useUpdateCompany } from '../hooks/queries';
import { PageHeader, Button, Input, Modal, Spinner, Empty } from '../components/ui';
import api from '../api/client';
import useDismissibleDropdown from '../hooks/useDismissibleDropdown';

function CompanyModal({ open, onClose, company }) {
  const create = useCreateCompany();
  const update = useUpdateCompany();
  const [form, setForm] = useState({
    name:'', legal_name:'', inn:'', contact_name:'', phone:'', address:'',
    client_email:'', client_password:'',
    telegram_notifications:false, telegram_chat_id:'',
  });
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [lookupInfo, setLookupInfo] = useState(null);
  const [innHint, setInnHint] = useState(null);
  const [nameLoading, setNameLoading] = useState(false);
  const [nameSuggestions, setNameSuggestions] = useState([]);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [lookupLabel, setLookupLabel] = useState('ИНН');
  const [telegramError, setTelegramError] = useState('');
  const nameDropdownRef = useDismissibleDropdown(showNameSuggestions, () => setShowNameSuggestions(false));
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setForm({
      name: company?.name || '',
      legal_name: company?.legal_name || '',
      inn: company?.inn || '',
      contact_name: company?.contact_name || '',
      phone: company?.phone || '',
      address: company?.address || '',
      client_email: company?.client_email || '',
      client_password: company?.client_password || '',
      telegram_notifications: Boolean(company?.telegram_notifications),
      telegram_chat_id: company?.telegram_chat_id || '',
    });
    setLookupLoading(false);
    setLookupError('');
    setLookupInfo(null);
    setInnHint(null);
    setNameLoading(false);
    setNameSuggestions([]);
    setShowNameSuggestions(false);
    setTelegramError('');
  }, [company, open]);

  const applySuggestion = (suggestion) => {
    setForm((current) => ({
      ...current,
      name: suggestion.name || current.name || '',
      legal_name: suggestion.full_name || current.legal_name || '',
      inn: suggestion.inn || current.inn || '',
      contact_name: current.contact_name || suggestion.director_name || '',
      address: suggestion.address || current.address || '',
    }));
    setLookupInfo(suggestion);
    setLookupError('');
    setShowNameSuggestions(false);
  };

  const lookupByDocument = async (docValue) => {
    const clean = docValue.replace(/\D/g, '').slice(0, 15);
    if (![10, 12, 13, 15].includes(clean.length)) return;
    const label = clean.length >= 13 ? 'ОГРН' : 'ИНН';

    setLookupLabel(label);
    setLookupError('');
    setLookupLoading(true);

    try {
      const { data } = await api.get('/inn/lookup', { params: { inn: clean } });
      setLookupInfo(data);
      setForm((current) => ({
        ...current,
        inn: clean,
        name: current.name || data.name || '',
        legal_name: current.legal_name || data.full_name || '',
        contact_name: current.contact_name || data.director_name || '',
        address: current.address || data.address || '',
      }));
      setNameSuggestions(data ? [{ value: data.name || data.full_name || clean, ...data }] : []);
      setShowNameSuggestions(false);
    } catch (error) {
      setLookupError(error.response?.data?.error || `Не удалось получить данные по ${label}`);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleNameChange = async (value) => {
    set('name', value);
    setLookupError('');

    const numericValue = value.replace(/\D/g, '');
    if ([10, 12, 13, 15].includes(numericValue.length) && numericValue === value.trim()) {
      await lookupByDocument(numericValue);
      return;
    }

    if (value.trim().length < 3) {
      setNameSuggestions([]);
      setShowNameSuggestions(false);
      return;
    }
    setNameLoading(true);
    try {
      const { data } = await api.get('/inn/suggest', { params: { query: value.trim() } });
      const rows = Array.isArray(data) ? data : [];
      setNameSuggestions(rows);
      setShowNameSuggestions(rows.length > 0);
    } catch (error) {
      setNameSuggestions([]);
      setShowNameSuggestions(false);
    } finally {
      setNameLoading(false);
    }
  };

  const handleInnChange = async (value) => {
    const clean = value.replace(/\D/g, '').slice(0, 15);
    set('inn', clean);
    setLookupError('');
    setLookupInfo(null);
    const label = clean.length >= 13 ? 'ОГРН' : 'ИНН';
    setLookupLabel(label);

    if (clean.length >= 2) {
      const { data } = await api.get(`/inn/hint?inn=${clean}`).catch(() => ({ data: null }));
      setInnHint(data);
    } else {
      setInnHint(null);
    }

    if (![10, 12, 13, 15].includes(clean.length)) return;

    setLookupLoading(true);
    try {
      const { data } = await api.get('/inn/lookup', { params: { inn: clean } });
      setLookupInfo(data);
      setForm((current) => ({
        ...current,
        inn: clean,
        name: current.name || data.name || '',
        legal_name: current.legal_name || data.full_name || '',
        contact_name: current.contact_name || data.director_name || '',
        address: current.address || data.address || '',
      }));
    } catch (error) {
      setLookupError(error.response?.data?.error || `Не удалось получить данные по ${label}`);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSave = async () => {
    const payload = { ...form };
    if (!payload.client_email) payload.client_email = undefined;
    if (!payload.client_password) payload.client_password = undefined;
    if (payload.telegram_notifications) {
      const chatId = String(payload.telegram_chat_id || '').trim();
      if (!chatId) {
        setTelegramError('Укажите chat_id чата для Telegram-уведомлений');
        return;
      }
      payload.telegram_chat_id = chatId;
    } else {
      payload.telegram_chat_id = undefined;
    }
    if (payload.client_email && !payload.client_password && !company?.id) {
      payload.client_password = generatePassword();
      setForm((current) => ({ ...current, client_password: payload.client_password }));
    }
    if (company?.id) {
      await update.mutateAsync({ id:company.id, ...payload });
    } else {
      await create.mutateAsync(payload);
    }
    onClose();
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let out = '';
    for (let i = 0; i < 12; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  };

  const fillGeneratedPassword = () => {
    const next = generatePassword();
    set('client_password', next);
  };
  return (
    <Modal open={open} onClose={onClose} title={company ? 'Редактировать' : 'Добавить компанию'}>
      <div className="form-group" style={{ position: 'relative' }} ref={nameDropdownRef}>
        <label>Название</label>
        <input
          value={form.name}
          onChange={e => handleNameChange(e.target.value)}
          onFocus={() => setShowNameSuggestions(nameSuggestions.length > 0)}
          placeholder="Начните вводить название компании..."
        />
        {nameLoading && <div className="text-sm text-muted" style={{ marginTop: 6 }}>Ищем по названию в DaData…</div>}
        {showNameSuggestions && (
          <div style={{
            position: 'absolute',
            zIndex: 20,
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 6,
            background: '#fff',
            border: '1px solid var(--gray-200)',
            borderRadius: 10,
            boxShadow: 'var(--shadow-md)',
            maxHeight: 240,
            overflowY: 'auto',
          }}>
            {nameSuggestions.map((item, index) => (
              <button
                key={`${item.inn || item.value}-${index}`}
                type="button"
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  background: '#fff',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  borderBottom: index < nameSuggestions.length - 1 ? '1px solid var(--gray-100)' : 'none',
                }}
                onMouseDown={() => applySuggestion(item)}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>{item.name || item.value || 'Без названия'}</div>
                <div className="text-sm text-muted">
                  ИНН: {item.inn || '—'}{item.address ? ` · ${item.address}` : ''}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <Input label="Юридическое название" value={form.legal_name||''} onChange={e => set('legal_name', e.target.value)} />
      <Input
        label="ИНН / ОГРН"
        value={form.inn||''}
        onChange={e => handleInnChange(e.target.value)}
        placeholder="Введите ИНН (10/12) или ОГРН (13/15)"
      />
      {lookupLoading && <div className="text-sm text-muted">Ищем организацию в DaData по {lookupLabel}…</div>}
      {innHint?.region && (
        <div className="text-sm text-muted">
          Регион: <strong>{innHint.region}</strong>{innHint.type ? <> · <strong>{innHint.type}</strong></> : null}
        </div>
      )}
      {lookupInfo && (
        <div className="alert" style={{ background:'var(--teal-bg)', color:'var(--teal-700)', border:'1px solid rgba(29,158,117,.18)', marginTop:4 }}>
          Найдено: <strong>{lookupInfo.name || lookupInfo.full_name}</strong>
          {lookupInfo.address ? <> · {lookupInfo.address}</> : null}
        </div>
      )}
      {lookupError && <div className="alert alert-error">{lookupError}</div>}
      <Input label="Контактное лицо" value={form.contact_name||''} onChange={e => set('contact_name', e.target.value)} />
      <Input label="Телефон" value={form.phone||''} onChange={e => set('phone', e.target.value)} />
      <div className="form-group">
        <label>Адрес</label>
        <textarea value={form.address || ''} onChange={e => set('address', e.target.value)} rows={3} />
      </div>
      <div className="card" style={{ marginTop: 8 }}>
        <div className="card-header"><span className="card-title">Доступ в клиентский кабинет</span></div>
        <div className="card-body">
          <Input
            label="E-mail клиента"
            type="email"
            value={form.client_email || ''}
            onChange={e => set('client_email', e.target.value)}
            placeholder="client@company.ru"
          />
          <div className="grid-2">
            <Input
              label="Пароль"
              type="text"
              value={form.client_password || ''}
              onChange={e => set('client_password', e.target.value)}
              placeholder={company?.id ? 'Оставьте пустым, чтобы не менять' : 'Введите пароль'}
            />
            <div className="form-group">
              <label>&nbsp;</label>
              <Button type="button" variant="secondary" onClick={fillGeneratedPassword}>Сгенерировать пароль</Button>
            </div>
          </div>
          <div className="text-sm text-muted">
            После сохранения используйте адрес входа: <strong>https://www.smart-wms.ru/client/login</strong>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 8 }}>
        <div className="card-header"><span className="card-title">Telegram-уведомления</span></div>
        <div className="card-body" style={{ display: 'grid', gap: 12 }}>
          <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={Boolean(form.telegram_notifications)}
              onChange={e => {
                set('telegram_notifications', e.target.checked);
                if (telegramError) setTelegramError('');
              }}
            />
            <span>Присылать уведомления в Telegram</span>
          </label>
          <Input
            label="Chat ID чата"
            value={form.telegram_chat_id || ''}
            onChange={e => {
              set('telegram_chat_id', e.target.value);
              if (telegramError) setTelegramError('');
            }}
            placeholder="-5270193897"
          />
          <div className="text-sm text-muted">
            Укажите chat_id личного или группового чата компании. Уведомления о смене этапа будут приходить туда.
          </div>
          {telegramError && <div className="alert alert-error">{telegramError}</div>}
        </div>
      </div>
      <div className="modal-footer" style={{padding:0,border:'none'}}>
        <Button variant="secondary" onClick={onClose}>Отмена</Button>
        <Button onClick={handleSave} disabled={!form.name}>Сохранить</Button>
      </div>
    </Modal>
  );
}

export default function Companies() {
  const navigate = useNavigate();
  const { data: companies, isLoading } = useCompanies();
  const [modal, setModal] = useState(false);
  const [editCompany, setEditCompany] = useState(null);
  const [search, setSearch] = useState('');

  const companyRows = Array.isArray(companies) ? companies : [];
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = companyRows.filter((c) => {
    if (!normalizedSearch) return true;
    const name = String(c?.name || '').toLowerCase();
    const legalName = String(c?.legal_name || '').toLowerCase();
    const inn = String(c?.inn || '');
    return (
      name.includes(normalizedSearch) ||
      legalName.includes(normalizedSearch) ||
      inn.includes(normalizedSearch)
    );
  });

  return (
    <div>
      <PageHeader title="Компании">
        <Button onClick={() => setModal(true)}>+ Добавить</Button>
      </PageHeader>
      <div className="toolbar">
        <input className="search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по названию или ИНН..." />
      </div>
      <div className="card">
        {isLoading ? <Spinner /> : filtered?.length === 0 ? <Empty /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Компания</th><th>ИНН</th><th>Телефон</th><th></th></tr></thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="clickable" onClick={() => navigate(`/companies/${c.id}`)}>
                    <td style={{fontWeight:500}}>{c.name}</td>
                    <td className="mono text-muted">{c.inn||'—'}</td>
                    <td className="text-muted">{c.phone||'—'}</td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditCompany(c);
                          setModal(true);
                        }}
                      >
                        Изменить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <CompanyModal open={modal} onClose={() => { setModal(false); setEditCompany(null); }} company={editCompany} />
    </div>
  );
}
