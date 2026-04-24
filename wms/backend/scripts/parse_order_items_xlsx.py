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
    'barcode': {'баркод', 'штрихкод', 'шк', 'barcode', 'ean'},
    'quantity': {'количество', 'количество, шт.', 'кол-во', 'qty', 'quantity'},
    'name': {'предмет', 'товар', 'наименование', 'название', 'subject', 'name'},
    'article': {'артикул поставщика', 'артикул', 'supplier article', 'article', 'sku'},
    'brand': {'бренд', 'brand'},
    'size': {'размер', 'size'},
    'color': {'цвет', 'color'},
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


def first_sheet_path(zf: zipfile.ZipFile):
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
    return re.sub(r'\s+', ' ', str(value or '').strip().lower())


def detect_header_map(header_row):
    mapping = {}
    for idx, value in enumerate(header_row):
        normalized = normalize_header(value)
        if not normalized:
            continue
        for key, aliases in HEADER_ALIASES.items():
            if normalized in aliases:
                mapping[key] = idx
                break
    return mapping


def parse_quantity(value: str) -> int:
    text = plain_text(value)
    if not text:
        return 0
    try:
        quantity = int(Decimal(text))
    except InvalidOperation:
        return 0
    return quantity


def read_rows(file_path: str):
    with zipfile.ZipFile(file_path) as zf:
        shared_strings = read_shared_strings(zf)
        root = ET.fromstring(zf.read(first_sheet_path(zf)))
        rows = []

        for row in root.findall('.//a:sheetData/a:row', NS):
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
            rows.append(ordered)

    if not rows:
        return []

    header_map = detect_header_map(rows[0])
    if 'name' not in header_map or 'quantity' not in header_map:
        raise RuntimeError('Не удалось распознать колонки файла. Нужны как минимум "Предмет/Товар" и "Количество".')

    result = []
    for ordered in rows[1:]:
        name = str(ordered[header_map['name']] if header_map.get('name') is not None and header_map['name'] < len(ordered) else '').strip()
        article = str(ordered[header_map['article']] if header_map.get('article') is not None and header_map['article'] < len(ordered) else '').strip()
        barcode = str(ordered[header_map['barcode']] if header_map.get('barcode') is not None and header_map['barcode'] < len(ordered) else '').strip()
        brand = str(ordered[header_map['brand']] if header_map.get('brand') is not None and header_map['brand'] < len(ordered) else '').strip()
        size = str(ordered[header_map['size']] if header_map.get('size') is not None and header_map['size'] < len(ordered) else '').strip()
        color = str(ordered[header_map['color']] if header_map.get('color') is not None and header_map['color'] < len(ordered) else '').strip()
        quantity_value = ordered[header_map['quantity']] if header_map.get('quantity') is not None and header_map['quantity'] < len(ordered) else ''
        quantity = parse_quantity(quantity_value)

        if not (name or article or barcode):
            continue
        if quantity <= 0:
            continue

        result.append({
            'name': name,
            'article': article,
            'barcode': barcode,
            'brand': brand,
            'size': size,
            'color': color,
            'quantity': quantity,
        })

    return result


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Не указан файл'}))
        return 1

    try:
        rows = read_rows(sys.argv[1])
        print(json.dumps(rows, ensure_ascii=False))
        return 0
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
