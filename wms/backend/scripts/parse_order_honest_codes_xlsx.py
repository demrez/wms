#!/usr/bin/env python3
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from decimal import Decimal, InvalidOperation

NS = {
    'a': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'rel': 'http://schemas.openxmlformats.org/package/2006/relationships',
}

HEADER_ALIASES = {
    'barcode': {'barcode', 'баркод', 'штрихкод', 'ean'},
    'code': {'code', 'киз', 'честныйзнак', 'чз', 'честный знак'},
    'article': {'article', 'артикул'},
    'name': {'name', 'товар', 'название'},
    'qty': {'qty', 'колво', 'кол-во', 'количество'},
}


def col_index(cell_ref: str) -> int:
    letters = re.sub(r'\d+', '', cell_ref or '')
    result = 0
    for ch in letters:
        result = result * 26 + (ord(ch.upper()) - 64)
    return max(result - 1, 0)


def plain_text(value: str) -> str:
    if value is None:
        return ''
    value = str(value).strip()
    if not value:
        return ''
    try:
        number = Decimal(value)
    except InvalidOperation:
        return value
    if number == number.to_integral():
        return format(number.quantize(Decimal('1')), 'f')
    return format(number.normalize(), 'f').rstrip('0').rstrip('.')


def read_shared_strings(zf: zipfile.ZipFile):
    if 'xl/sharedStrings.xml' not in zf.namelist():
        return []
    root = ET.fromstring(zf.read('xl/sharedStrings.xml'))
    shared = []
    for item in root.findall('.//a:si', NS):
        texts = [node.text or '' for node in item.findall('.//a:t', NS)]
        shared.append(''.join(texts))
    return shared


def sheet_path(zf: zipfile.ZipFile):
    workbook = ET.fromstring(zf.read('xl/workbook.xml'))
    rels = ET.fromstring(zf.read('xl/_rels/workbook.xml.rels'))
    rel_map = {
        rel.attrib['Id']: rel.attrib['Target']
        for rel in rels.findall('rel:Relationship', NS)
    }
    first_sheet = workbook.find('a:sheets/a:sheet', NS)
    if first_sheet is None:
        raise RuntimeError('В книге не найдено ни одного листа')
    rel_id = first_sheet.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
    target = rel_map.get(rel_id)
    if not target:
        raise RuntimeError('Не удалось найти лист в книге')
    if target.startswith('/'):
        target = target.lstrip('/')
    if not target.startswith('xl/'):
        target = f'xl/{target}'
    return target


def normalize_header(value: str) -> str:
    return re.sub(r'[^a-zA-Zа-яА-ЯёЁ0-9]+', '', str(value or '').strip().lower())


def resolve_headers(header_row):
    mapping = {}
    normalized = [normalize_header(cell) for cell in header_row]
    for idx, header in enumerate(normalized):
        for key, aliases in HEADER_ALIASES.items():
            if header in aliases and key not in mapping:
                mapping[key] = idx
                break
    return mapping


def read_rows(file_path: str):
    with zipfile.ZipFile(file_path) as zf:
        shared_strings = read_shared_strings(zf)
        root = ET.fromstring(zf.read(sheet_path(zf)))
        rows = []
        header_map = None

        for row in root.findall('.//a:sheetData/a:row', NS):
            row_number = int(row.attrib.get('r', '0') or '0')
            cells = {}
            for cell in row.findall('a:c', NS):
                ref = cell.attrib.get('r', '')
                idx = col_index(ref)
                cell_type = cell.attrib.get('t')
                value = ''

                if cell_type == 's':
                    shared_idx = cell.findtext('a:v', default='', namespaces=NS)
                    if shared_idx.isdigit():
                        pos = int(shared_idx)
                        value = shared_strings[pos] if pos < len(shared_strings) else ''
                elif cell_type == 'inlineStr':
                    texts = [node.text or '' for node in cell.findall('.//a:t', NS)]
                    value = ''.join(texts)
                else:
                    value = cell.findtext('a:v', default='', namespaces=NS) or ''

                cells[idx] = plain_text(value)

            if not cells:
                continue

            ordered = [cells.get(i, '') for i in range(max(cells.keys()) + 1)]

            if header_map is None:
                header_map = resolve_headers(ordered)
                if 'barcode' not in header_map or 'code' not in header_map:
                    raise RuntimeError('В файле не найдены обязательные колонки Штрихкод и КИЗ')
                continue

            payload = {
                'row_number': row_number,
                'barcode': ordered[header_map['barcode']].strip() if header_map.get('barcode') is not None and len(ordered) > header_map['barcode'] else '',
                'code': ordered[header_map['code']].strip() if header_map.get('code') is not None and len(ordered) > header_map['code'] else '',
                'article': ordered[header_map['article']].strip() if header_map.get('article') is not None and len(ordered) > header_map['article'] else '',
                'name': ordered[header_map['name']].strip() if header_map.get('name') is not None and len(ordered) > header_map['name'] else '',
                'qty': ordered[header_map['qty']].strip() if header_map.get('qty') is not None and len(ordered) > header_map['qty'] else '',
            }
            if not any(payload.values()):
                continue
            rows.append(payload)

        return rows


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Не указан файл'}))
        return 1

    file_path = sys.argv[1]
    rows = read_rows(file_path)
    print(json.dumps(rows, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
