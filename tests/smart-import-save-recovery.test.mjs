import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('save failure is shown and save controls recover for another attempt', async () => {
    const messages = [];
    const button = { disabled: false };
    const context = vm.createContext({
        window: { __LAST_SMART_EXCEL_IMPORT_PREVIEW: {} },
        document: { querySelectorAll: () => [button] },
        confirm: () => true,
        App: { flash: (message, level) => messages.push({ message, level }) }
    });
    vm.runInContext(readFileSync(new URL('../js/smart-inventory-importer.js', import.meta.url), 'utf8') +
        '\nthis.importer = SmartInventoryWorkbookImporter;', context);
    const importer = context.importer;
    importer._executeSave = async () => { throw new Error('로그인과 매장 연결을 확인하세요.'); };
    await importer.savePreview('all');
    assert.equal(messages[0].message, '로그인과 매장 연결을 확인하세요.');
    assert.equal(messages[0].level, 'danger');
    assert.equal(button.disabled, false);
    assert.equal(importer._saving, false);
    let saved = false;
    importer._executeSave = async () => { saved = true; };
    await importer.savePreview('all');
    assert.equal(saved, true);
});
