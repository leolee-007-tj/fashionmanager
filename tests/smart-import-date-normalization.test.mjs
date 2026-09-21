import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const projectDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(projectDir, 'js/smart-inventory-importer.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(`${source};globalThis.__smartImporter = SmartInventoryWorkbookImporter;`, context);
const importer = context.__smartImporter;

function format(value) {
    return importer._formatDate(importer._parseDate(value));
}

describe('smart import visible date normalization', () => {
    it('treats slash, dash, dot, compact, Korean, and Chinese text as the same day', () => {
        const samples = [
            '2026/1/1',
            '2026-1-1',
            '2026-01-01',
            '2026.1.1',
            '20260101',
            '2026년 1월 1일',
            '2026年1月1日',
            "'2026/1/1",
            '판매일: 2026/1/1'
        ];
        for (const sample of samples) {
            assert.equal(format(sample), '2026-01-01', sample);
        }
    });

    it('rejects impossible visible dates instead of rolling them into another month', () => {
        assert.equal(importer._parseDate('2026/2/30'), null);
    });

    it('corrects a one-year-back cell date to the workbook filename year', () => {
        const parsed = importer._parseDate('2025/1/9');
        const result = importer._reconcileDateYearWithFilename(parsed, { year: 2026, month: 1 });
        assert.equal(importer._formatDate(result.date), '2026-01-09');
        assert.equal(result.corrected, true);
    });

    it('does not rewrite matching or unrelated years', () => {
        const matching = importer._reconcileDateYearWithFilename(importer._parseDate('2026/1/9'), { year: 2026, month: 1 });
        const unrelated = importer._reconcileDateYearWithFilename(importer._parseDate('2024/1/9'), { year: 2026, month: 1 });
        assert.equal(importer._formatDate(matching.date), '2026-01-09');
        assert.equal(importer._formatDate(unrelated.date), '2024-01-09');
        assert.equal(matching.corrected, false);
        assert.equal(unrelated.corrected, false);
    });

    it('limits parsing to cells that contain a visible value or formula', () => {
        const calls = [];
        context.XLSX = {
            utils: {
                decode_cell(address) {
                    const match = address.match(/^([A-Z]+)(\d+)$/);
                    const letters = match[1];
                    let column = 0;
                    for (const letter of letters) column = column * 26 + letter.charCodeAt(0) - 64;
                    return { c: column - 1, r: Number(match[2]) - 1 };
                },
                sheet_to_json(ws, options) {
                    calls.push(options);
                    return [['판매일', '고객이름'], ['2026/1/1', '고객']];
                }
            }
        };
        const rows = importer._sheetToMeaningfulRows({
            A1: { v: '판매일' },
            B2: { v: '고객' },
            XFD1048576: { v: '' },
            '!ref': 'A1:XFD1048576'
        });
        assert.equal(rows.length, 2);
        assert.equal(
            JSON.stringify(calls[0].range),
            JSON.stringify({ s: { r: 0, c: 0 }, e: { r: 1, c: 1 } })
        );
    });

    it('ignores decorative and unrelated workbook sheets', () => {
        for (const sheetName of ['README', '사진', '비용관리', 'photos']) {
            assert.equal(importer._isIgnoredSheetName(sheetName), true, sheetName);
        }
        assert.equal(importer._isIgnoredSheetName('제품목록'), false);
        assert.equal(importer._isIgnoredSheetName('출고'), false);
    });
});
