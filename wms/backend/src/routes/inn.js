const express = require('express');
const { auth, role } = require('../middleware/auth');
const db = require('../db/knex');

const router = express.Router();
router.use(auth, role(['admin', 'manager']));

// Нормализуем ответ из разных источников в единый формат
function buildResult(data) {
  return {
    inn: data.inn || '',
    kpp: data.kpp || '',
    ogrn: data.ogrn || '',
    name: data.name || '',           // краткое название / ФИО для ИП
    full_name: data.full_name || '', // полное название с ОПФ
    address: data.address || '',
    director_name: data.director_name || '',
    director_post: data.director_post || '',
    type: data.type || 'LEGAL',      // LEGAL | INDIVIDUAL
    status: data.status || '',       // ACTIVE | LIQUIDATED
    okved: data.okved || '',
  };
}

// Источник 1: api-fns.ru — полностью бесплатно, без токена
async function fetchFromFNS(inn) {
  try {
    const url = `https://api-fns.ru/api/egr?req=${inn}&key=free`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json = await res.json();

    const items = json?.items || [];
    if (!items.length) return null;

    const item = items[0];

    // ЮЛ
    if (item.ЮЛ) {
      const ul = item.ЮЛ;
      return buildResult({
        inn: ul.ИНН,
        kpp: ul.КПП,
        ogrn: ul.ОГРН,
        name: ul.НаимСокрЮЛ || ul.НаимПолнЮЛ,
        full_name: ul.НаимПолнЮЛ,
        address: ul.Адрес?.АдресПолн || '',
        director_name: ul.РукНаимДолжн ? `${ul.РукФИО?.Фамилия || ''} ${ul.РукФИО?.Имя || ''} ${ul.РукФИО?.Отчество || ''}`.trim() : '',
        director_post: ul.РукНаимДолжн || '',
        type: 'LEGAL',
        status: ul.СтатусЮЛ === 'Действующее' ? 'ACTIVE' : ul.СтатусЮЛ || '',
        okved: ul.ОснОКВЭД?.КодОКВЭД || '',
      });
    }

    // ИП
    if (item.ИП) {
      const ip = item.ИП;
      const fio = ip.ФИОПолн || `${ip.Фамилия || ''} ${ip.Имя || ''} ${ip.Отчество || ''}`.trim();
      return buildResult({
        inn: ip.ИННФЛ,
        ogrn: ip.ОГРНИП,
        name: `ИП ${fio}`,
        full_name: `Индивидуальный предприниматель ${fio}`,
        address: ip.Адрес?.АдресПолн || '',
        director_name: fio,
        director_post: 'Индивидуальный предприниматель',
        type: 'INDIVIDUAL',
        status: ip.СтатусИП === 'Действующий' ? 'ACTIVE' : ip.СтатусИП || '',
        okved: ip.ОснОКВЭД?.КодОКВЭД || '',
      });
    }
  } catch (e) {
    // Молча падаем — пробуем следующий источник
  }
  return null;
}

// Источник 2: DaData (если есть токен в env)
function getDaDataToken() {
  const candidates = [
    process.env.DADATA_TOKEN,
    process.env.DADATA_API_KEY,
    process.env.DADATA_KEY,
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean);

  if (!candidates.length) return null;

  const raw = candidates[0];

  // Поддержка "грязных" форматов:
  // DADATA_TOKEN=$token = "abc...";  -> abc...
  // DADATA_TOKEN="abc..."            -> abc...
  const match = raw.match(/[A-Za-z0-9_-]{20,}/);
  return match ? match[0] : null;
}

async function fetchFromDadata(inn) {
  const token = getDaDataToken();
  if (!token) return null;

  try {
    const res = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${token}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query: inn }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const s = json?.suggestions?.[0];
    if (!s) return null;

    const d = s.data;
    const isIP = d.type === 'INDIVIDUAL';
    const fio = d.name?.full || d.fio ? `${d.fio?.surname || ''} ${d.fio?.name || ''} ${d.fio?.patronymic || ''}`.trim() : '';

    return buildResult({
      inn: d.inn,
      kpp: d.kpp || '',
      ogrn: d.ogrn,
      name: isIP ? `ИП ${fio}` : (d.name?.short_with_opf || s.value),
      full_name: isIP ? `Индивидуальный предприниматель ${fio}` : (d.name?.full_with_opf || s.value),
      address: d.address?.value || '',
      director_name: d.management?.name || (isIP ? fio : ''),
      director_post: d.management?.post || (isIP ? 'Индивидуальный предприниматель' : ''),
      type: d.type || 'LEGAL',
      status: d.state?.status === 'ACTIVE' ? 'ACTIVE' : d.state?.status || '',
      okved: d.okved || '',
    });
  } catch (e) {
    return null;
  }
}

async function suggestFromDadata(query) {
  const token = getDaDataToken();
  if (!token) return [];

  try {
    const res = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${token}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query, count: 10 }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const rows = Array.isArray(json?.suggestions) ? json.suggestions : [];
    return rows.map((s) => {
      const d = s.data || {};
      const isIP = d.type === 'INDIVIDUAL';
      const fio = d.name?.full || d.fio ? `${d.fio?.surname || ''} ${d.fio?.name || ''} ${d.fio?.patronymic || ''}`.trim() : '';

      return {
        value: s.value || '',
        ...buildResult({
          inn: d.inn,
          kpp: d.kpp || '',
          ogrn: d.ogrn,
          name: isIP ? `ИП ${fio}` : (d.name?.short_with_opf || s.value || ''),
          full_name: isIP ? `Индивидуальный предприниматель ${fio}` : (d.name?.full_with_opf || s.value || ''),
          address: d.address?.value || '',
          director_name: d.management?.name || (isIP ? fio : ''),
          director_post: d.management?.post || (isIP ? 'Индивидуальный предприниматель' : ''),
          type: d.type || 'LEGAL',
          status: d.state?.status === 'ACTIVE' ? 'ACTIVE' : d.state?.status || '',
          okved: d.okved || '',
        }),
      };
    });
  } catch (e) {
    return [];
  }
}

// Источник 3: egrul.org — бесплатно (fallback)
async function fetchFromEgrul(inn) {
  try {
    // ЮЛ
    let res = await fetch(`https://egrul.org/${inn}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const json = await res.json();
      if (json?.НаимСокрЮЛ || json?.НаимПолнЮЛ) {
        const fioDir = json?.РукФИО ? `${json.РукФИО.Фамилия || ''} ${json.РукФИО.Имя || ''} ${json.РукФИО.Отчество || ''}`.trim() : '';
        return buildResult({
          inn: json.ИНН,
          kpp: json.КПП,
          ogrn: json.ОГРН,
          name: json.НаимСокрЮЛ || json.НаимПолнЮЛ,
          full_name: json.НаимПолнЮЛ,
          address: json.АдресПолн || '',
          director_name: fioDir,
          director_post: json.НаимДолжн || '',
          type: 'LEGAL',
          status: 'ACTIVE',
        });
      }
    }
  } catch (e) {}
  return null;
}

// Подсказки по первым цифрам ИНН (без API — локальный справочник)
const INN_REGIONS = {
  '01':'Адыгея','02':'Башкортостан','03':'Бурятия','04':'Алтай','05':'Дагестан',
  '06':'Ингушетия','07':'Кабардино-Балкария','08':'Калмыкия','09':'Карачаево-Черкессия',
  '10':'Карелия','11':'Коми','12':'Марий Эл','13':'Мордовия','14':'Саха (Якутия)',
  '15':'Северная Осетия','16':'Татарстан','17':'Тыва','18':'Удмуртия','19':'Хакасия',
  '20':'Чечня','21':'Чувашия','22':'Алтайский край','23':'Краснодарский край',
  '24':'Красноярский край','25':'Приморский край','26':'Ставропольский край',
  '27':'Хабаровский край','28':'Амурская','29':'Архангельская','30':'Астраханская',
  '31':'Белгородская','32':'Брянская','33':'Владимирская','34':'Волгоградская',
  '35':'Вологодская','36':'Воронежская','37':'Ивановская','38':'Иркутская',
  '39':'Калининградская','40':'Калужская','41':'Камчатский край','42':'Кемеровская',
  '43':'Кировская','44':'Костромская','45':'Курганская','46':'Курская','47':'Ленинградская',
  '48':'Липецкая','49':'Магаданская','50':'Московская','51':'Мурманская',
  '52':'Нижегородская','53':'Новгородская','54':'Новосибирская','55':'Омская',
  '56':'Оренбургская','57':'Орловская','58':'Пензенская','59':'Пермский край',
  '60':'Псковская','61':'Ростовская','62':'Рязанская','63':'Самарская',
  '64':'Саратовская','65':'Сахалинская','66':'Свердловская','67':'Смоленская',
  '68':'Тамбовская','69':'Тверская','70':'Томская','71':'Тульская','72':'Тюменская',
  '73':'Ульяновская','74':'Челябинская','75':'Забайкальский край','76':'Ярославская',
  '77':'Москва','78':'Санкт-Петербург','79':'Еврейская АО','86':'Ханты-Мансийский АО',
  '87':'Чукотский АО','89':'Ямало-Ненецкий АО','92':'Севастополь','95':'Чечня(новый)',
};

// GET /api/inn/lookup?inn=7707083893
router.get('/lookup', async (req, res) => {
  const value = String(req.query.inn || req.query.value || '').trim();
  if (!value) {
    return res.status(400).json({ error: 'Введите ИНН или ОГРН' });
  }
  if (!/^\d+$/.test(value)) {
    return res.status(400).json({ error: 'ИНН/ОГРН должен содержать только цифры' });
  }
  if (![10, 12, 13, 15].includes(value.length)) {
    return res.status(400).json({ error: 'Введите корректный ИНН (10/12) или ОГРН (13/15)' });
  }

  // Пробуем источники по порядку
  let result = null;
  result = await fetchFromDadata(value);      // Быстро если есть токен
  if (!result && (value.length === 10 || value.length === 12)) result = await fetchFromFNS(value);    // Бесплатно
  if (!result && (value.length === 10 || value.length === 12)) result = await fetchFromEgrul(value);  // Fallback

  if (!result) {
    return res.status(404).json({ error: 'Организация не найдена. Проверьте ИНН/ОГРН.' });
  }

  res.json(result);
});

// GET /api/inn/hint?inn=77 — подсказка региона по первым цифрам
router.get('/hint', (req, res) => {
  const { inn } = req.query;
  if (!inn || inn.length < 2) return res.json({ region: null });
  const code = inn.slice(0, 2);
  const region = INN_REGIONS[code] || null;
  const type = inn.length === 12 ? 'ИП' : inn.length === 10 ? 'ЮЛ' : null;
  res.json({ region, type, code });
});

// GET /api/inn/suggest?query=сбер
router.get('/suggest', async (req, res) => {
  const query = String(req.query.query || '').trim();
  if (query.length < 3) return res.json([]);

  // Если ввели цифры (ИНН/ОГРН) в поле названия — возвращаем прямой результат
  if (/^\d+$/.test(query) && [10, 12, 13, 15].includes(query.length)) {
    const direct = await fetchFromDadata(query);
    if (direct) return res.json([{ value: direct.name || direct.full_name || query, ...direct }]);
  }

  const suggestions = await suggestFromDadata(query);

  // Если DaData недоступна — хотя бы локальные подсказки по уже заведённым компаниям
  if (suggestions.length > 0) {
    return res.json(suggestions);
  }

  try {
    const localRows = await db('companies')
      .whereILike('name', `%${query}%`)
      .orWhereILike('legal_name', `%${query}%`)
      .select('name', 'legal_name', 'inn', 'address')
      .limit(10);

    return res.json(localRows.map((row) => ({
      value: row.name,
      name: row.name || '',
      full_name: row.legal_name || row.name || '',
      inn: row.inn || '',
      address: row.address || '',
      ogrn: '',
      kpp: '',
      type: 'LEGAL',
      status: '',
      okved: '',
      director_name: '',
      director_post: '',
    })));
  } catch (e) {
    return res.json([]);
  }
});

// GET /api/inn/status — быстрая проверка конфигурации
router.get('/status', (req, res) => {
  const token = getDaDataToken();
  res.json({
    dadata_configured: !!token,
    token_preview: token ? `${token.slice(0, 6)}...${token.slice(-4)}` : null,
  });
});

module.exports = router;
