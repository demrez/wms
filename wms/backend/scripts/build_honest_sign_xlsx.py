#!/usr/bin/env python3
import json
import sys
import zipfile
from xml.sax.saxutils import escape


XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'


def col_name(index: int) -> str:
    index += 1
    letters = ''
    while index > 0:
        index, rem = divmod(index - 1, 26)
        letters = chr(65 + rem) + letters
    return letters


def cell_xml(ref: str, value):
    if value is None:
        value = ''
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return f'<c r="{ref}"><v>{value}</v></c>'

    text = str(value)
    if text == '':
        return f'<c r="{ref}" t="inlineStr"><is><t></t></is></c>'
    return f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{escape(text)}</t></is></c>'


def sheet_xml(rows):
    row_parts = []
    max_cols = 0
    for row_idx, row in enumerate(rows, start=1):
        max_cols = max(max_cols, len(row))
        cells = ''.join(
            cell_xml(f'{col_name(col_idx)}{row_idx}', value)
            for col_idx, value in enumerate(row)
        )
        row_parts.append(f'<row r="{row_idx}">{cells}</row>')

    dimension = f'A1:{col_name(max(max_cols - 1, 0))}{max(len(rows), 1)}'
    return (
        f'{XML_DECL}'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<dimension ref="{dimension}"/>'
        '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
        '<sheetFormatPr defaultRowHeight="15"/>'
        f'<sheetData>{"".join(row_parts)}</sheetData>'
        '</worksheet>'
    )


def workbook_xml(sheet_names):
    sheets = ''.join(
        f'<sheet name="{escape(name[:31])}" sheetId="{idx}" r:id="rId{idx}"/>'
        for idx, name in enumerate(sheet_names, start=1)
    )
    return (
        f'{XML_DECL}'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets>{sheets}</sheets>'
        '</workbook>'
    )


def workbook_rels_xml(sheet_count):
    rels = ''.join(
        f'<Relationship Id="rId{idx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{idx}.xml"/>'
        for idx in range(1, sheet_count + 1)
    )
    return (
        f'{XML_DECL}'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'{rels}'
        '</Relationships>'
    )


def root_rels_xml():
    return (
        f'{XML_DECL}'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        '</Relationships>'
    )


def content_types_xml(sheet_count):
    overrides = [
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    ]
    overrides.extend(
        f'<Override PartName="/xl/worksheets/sheet{idx}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for idx in range(1, sheet_count + 1)
    )
    return (
        f'{XML_DECL}'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        f'{"".join(overrides)}'
        '</Types>'
    )


def build_xlsx(workbook, output_path):
    sheets = workbook.get('sheets') or []
    if not sheets:
        raise RuntimeError('В книге нет листов')

    with zipfile.ZipFile(output_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('[Content_Types].xml', content_types_xml(len(sheets)))
        zf.writestr('_rels/.rels', root_rels_xml())
        zf.writestr('xl/workbook.xml', workbook_xml([sheet.get('name') or f'Sheet {idx + 1}' for idx, sheet in enumerate(sheets)]))
        zf.writestr('xl/_rels/workbook.xml.rels', workbook_rels_xml(len(sheets)))

        for idx, sheet in enumerate(sheets, start=1):
            rows = sheet.get('rows') or []
            zf.writestr(f'xl/worksheets/sheet{idx}.xml', sheet_xml(rows))


def main():
    if len(sys.argv) < 3:
        print('Usage: build_honest_sign_xlsx.py <input.json> <output.xlsx>', file=sys.stderr)
        return 1

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    with open(input_path, 'r', encoding='utf8') as handle:
        workbook = json.load(handle)

    build_xlsx(workbook, output_path)
    return 0


if __name__ == '__main__':
    sys.exit(main())
