import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

const rootDir = path.join(path.dirname(new URL(import.meta.url).pathname), '..');

const productsJs = fs.readFileSync(path.join(rootDir, 'js/products.js'), 'utf8');
const dbJs = fs.readFileSync(path.join(rootDir, 'js/db.js'), 'utf8');
const configExampleJs = fs.readFileSync(path.join(rootDir, 'js/config.example.js'), 'utf8');
const gitIgnore = fs.readFileSync(path.join(rootDir, '.gitignore'), 'utf8');

describe('Products Batch Actions Supabase Compatibility Contract (3-5P)', function () {

    describe('B1: batchDelete does not use setProductsAsync', function () {
        it('B1.1: batchDelete does not use setProductsAsync', function () {
            const batchDeleteMatch = productsJs.match(/async batchDelete\(\)/);
            const batchDeleteStart = batchDeleteMatch ? batchDeleteMatch.index : -1;
            const nextMethodStart = productsJs.indexOf('async delete(', batchDeleteStart);
            const batchDeleteEnd = nextMethodStart >= 0 ? nextMethodStart : productsJs.length;
            const batchDeleteCode = batchDeleteStart >= 0
                ? productsJs.substring(batchDeleteStart, batchDeleteEnd)
                : '';
            assert.ok(!batchDeleteCode.includes('setProductsAsync'),
                'batchDelete should not use setProductsAsync');
        });

        it('B1.2: batchDelete uses deleteProductAsync', function () {
            const batchDeleteMatch = productsJs.match(/async batchDelete\(\)/);
            const batchDeleteStart = batchDeleteMatch ? batchDeleteMatch.index : -1;
            const nextMethodStart = productsJs.indexOf('async delete(', batchDeleteStart);
            const batchDeleteEnd = nextMethodStart >= 0 ? nextMethodStart : productsJs.length;
            const batchDeleteCode = batchDeleteStart >= 0
                ? productsJs.substring(batchDeleteStart, batchDeleteEnd)
                : '';
            assert.ok(batchDeleteCode.includes('DB.deleteProductAsync'),
                'batchDelete should use DB.deleteProductAsync');
        });

        it('B1.3: batchDelete uses sequential for loop', function () {
            const batchDeleteMatch = productsJs.match(/async batchDelete\(\)/);
            const batchDeleteStart = batchDeleteMatch ? batchDeleteMatch.index : -1;
            const nextMethodStart = productsJs.indexOf('async delete(', batchDeleteStart);
            const batchDeleteEnd = nextMethodStart >= 0 ? nextMethodStart : productsJs.length;
            const batchDeleteCode = batchDeleteStart >= 0
                ? productsJs.substring(batchDeleteStart, batchDeleteEnd)
                : '';
            assert.ok(batchDeleteCode.includes('for (const'),
                'batchDelete should use sequential for loop');
        });
    });

    describe('B2: batchReclassify does not use setProductsAsync', function () {
        it('B2.1: batchReclassify does not use setProductsAsync', function () {
            const batchReclassifyMatch = productsJs.match(/async batchReclassify\(\)/);
            const batchReclassifyStart = batchReclassifyMatch ? batchReclassifyMatch.index : -1;
            const nextMethodStart = productsJs.indexOf('async batchMonthChange(', batchReclassifyStart);
            const batchReclassifyEnd = nextMethodStart >= 0 ? nextMethodStart : productsJs.length;
            const batchReclassifyCode = batchReclassifyStart >= 0
                ? productsJs.substring(batchReclassifyStart, batchReclassifyEnd)
                : '';
            assert.ok(!batchReclassifyCode.includes('setProductsAsync'),
                'batchReclassify should not use setProductsAsync');
        });

        it('B2.2: batchReclassify uses updateProductAsync', function () {
            const batchReclassifyMatch = productsJs.match(/async batchReclassify\(\)/);
            const batchReclassifyStart = batchReclassifyMatch ? batchReclassifyMatch.index : -1;
            const nextMethodStart = productsJs.indexOf('async batchMonthChange(', batchReclassifyStart);
            const batchReclassifyEnd = nextMethodStart >= 0 ? nextMethodStart : productsJs.length;
            const batchReclassifyCode = batchReclassifyStart >= 0
                ? productsJs.substring(batchReclassifyStart, batchReclassifyEnd)
                : '';
            assert.ok(batchReclassifyCode.includes('DB.updateProductAsync'),
                'batchReclassify should use DB.updateProductAsync');
        });

        it('B2.3: batchReclassify uses sequential for loop', function () {
            const batchReclassifyMatch = productsJs.match(/async batchReclassify\(\)/);
            const batchReclassifyStart = batchReclassifyMatch ? batchReclassifyMatch.index : -1;
            const nextMethodStart = productsJs.indexOf('async batchMonthChange(', batchReclassifyStart);
            const batchReclassifyEnd = nextMethodStart >= 0 ? nextMethodStart : productsJs.length;
            const batchReclassifyCode = batchReclassifyStart >= 0
                ? productsJs.substring(batchReclassifyStart, batchReclassifyEnd)
                : '';
            assert.ok(batchReclassifyCode.includes('for (const'),
                'batchReclassify should use sequential for loop');
        });
    });

    describe('B3: batchMonthChange does not use setProductsAsync', function () {
        it('B3.1: batchMonthChange does not use setProductsAsync', function () {
            const batchMonthChangeMatch = productsJs.match(/async batchMonthChange\(\)/);
            const batchMonthChangeStart = batchMonthChangeMatch ? batchMonthChangeMatch.index : -1;
            const nextMethodStart = productsJs.indexOf('async batchDelete(', batchMonthChangeStart);
            const batchMonthChangeEnd = nextMethodStart >= 0 ? nextMethodStart : productsJs.length;
            const batchMonthChangeCode = batchMonthChangeStart >= 0
                ? productsJs.substring(batchMonthChangeStart, batchMonthChangeEnd)
                : '';
            assert.ok(!batchMonthChangeCode.includes('setProductsAsync'),
                'batchMonthChange should not use setProductsAsync');
        });

        it('B3.2: batchMonthChange uses updateProductAsync', function () {
            const batchMonthChangeMatch = productsJs.match(/async batchMonthChange\(\)/);
            const batchMonthChangeStart = batchMonthChangeMatch ? batchMonthChangeMatch.index : -1;
            const nextMethodStart = productsJs.indexOf('async batchDelete(', batchMonthChangeStart);
            const batchMonthChangeEnd = nextMethodStart >= 0 ? nextMethodStart : productsJs.length;
            const batchMonthChangeCode = batchMonthChangeStart >= 0
                ? productsJs.substring(batchMonthChangeStart, batchMonthChangeEnd)
                : '';
            assert.ok(batchMonthChangeCode.includes('DB.updateProductAsync'),
                'batchMonthChange should use DB.updateProductAsync');
        });

        it('B3.3: batchMonthChange uses sequential for loop', function () {
            const batchMonthChangeMatch = productsJs.match(/async batchMonthChange\(\)/);
            const batchMonthChangeStart = batchMonthChangeMatch ? batchMonthChangeMatch.index : -1;
            const nextMethodStart = productsJs.indexOf('async batchDelete(', batchMonthChangeStart);
            const batchMonthChangeEnd = nextMethodStart >= 0 ? nextMethodStart : productsJs.length;
            const batchMonthChangeCode = batchMonthChangeStart >= 0
                ? productsJs.substring(batchMonthChangeStart, batchMonthChangeEnd)
                : '';
            assert.ok(batchMonthChangeCode.includes('for (const'),
                'batchMonthChange should use sequential for loop');
        });
    });

    describe('B4: SupabaseProductsDataSource.setProducts is disabled', function () {
        it('B4.1: SupabaseProductsDataSource.setProducts throws error', function () {
            assert.ok(dbJs.includes("throw new Error(_setProductsDisabledMsg)"),
                'SupabaseProductsDataSource.setProducts should throw error');
        });

        it('B4.2: setProducts disabled message exists', function () {
            assert.ok(dbJs.includes('setProducts is not enabled for SupabaseProductsDataSource'),
                'SupabaseProductsDataSource.setProducts should be disabled with error message');
        });
    });

    describe('B5: No Promise.all bulk parallel calls in batch methods', function () {
        it('B5.1: batchDelete does not use Promise.all', function () {
            const batchDeleteMatch = productsJs.match(/async batchDelete\(\)/);
            const batchDeleteStart = batchDeleteMatch ? batchDeleteMatch.index : -1;
            const nextMethodStart = productsJs.indexOf('async delete(', batchDeleteStart);
            const batchDeleteEnd = nextMethodStart >= 0 ? nextMethodStart : productsJs.length;
            const batchDeleteCode = batchDeleteStart >= 0
                ? productsJs.substring(batchDeleteStart, batchDeleteEnd)
                : '';
            assert.ok(!batchDeleteCode.includes('Promise.all'),
                'batchDelete should not use Promise.all');
        });

        it('B5.2: batchReclassify does not use Promise.all', function () {
            const batchReclassifyMatch = productsJs.match(/async batchReclassify\(\)/);
            const batchReclassifyStart = batchReclassifyMatch ? batchReclassifyMatch.index : -1;
            const nextMethodStart = productsJs.indexOf('async batchMonthChange(', batchReclassifyStart);
            const batchReclassifyEnd = nextMethodStart >= 0 ? nextMethodStart : productsJs.length;
            const batchReclassifyCode = batchReclassifyStart >= 0
                ? productsJs.substring(batchReclassifyStart, batchReclassifyEnd)
                : '';
            assert.ok(!batchReclassifyCode.includes('Promise.all'),
                'batchReclassify should not use Promise.all');
        });

        it('B5.3: batchMonthChange does not use Promise.all', function () {
            const batchMonthChangeMatch = productsJs.match(/async batchMonthChange\(\)/);
            const batchMonthChangeStart = batchMonthChangeMatch ? batchMonthChangeMatch.index : -1;
            const nextMethodStart = productsJs.indexOf('async batchDelete(', batchMonthChangeStart);
            const batchMonthChangeEnd = nextMethodStart >= 0 ? nextMethodStart : productsJs.length;
            const batchMonthChangeCode = batchMonthChangeStart >= 0
                ? productsJs.substring(batchMonthChangeStart, batchMonthChangeEnd)
                : '';
            assert.ok(!batchMonthChangeCode.includes('Promise.all'),
                'batchMonthChange should not use Promise.all');
        });
    });

    describe('B6: Products RPC paths', function () {
        it('B6.1: createProduct uses client.rpc("create_product")', function () {
            assert.ok(dbJs.includes("client.rpc('create_product'"),
                'SupabaseProductsDataSource.createProduct should use create_product RPC');
        });

        it('B6.2: updateProduct uses client.rpc("update_product")', function () {
            assert.ok(dbJs.includes("client.rpc('update_product'"),
                'SupabaseProductsDataSource.updateProduct should use update_product RPC');
        });

        it('B6.3: deleteProduct uses client.rpc("soft_delete_product")', function () {
            assert.ok(dbJs.includes("client.rpc('soft_delete_product'"),
                'SupabaseProductsDataSource.deleteProduct should use soft_delete_product RPC');
        });
    });

    describe('B7: Runtime defaults', function () {
        it('B7.1: PRODUCTS_SUPABASE_ENABLED default is false', function () {
            assert.ok(configExampleJs.includes('PRODUCTS_SUPABASE_ENABLED: false'),
                'PRODUCTS_SUPABASE_ENABLED should default to false');
        });

        it('B7.2: getProductsDataSource defaults to LocalProductsDataSource', function () {
            assert.ok(dbJs.includes('_createLocalProductsDataSource()'),
                'getProductsDataSource should default to LocalProductsDataSource');
        });

        it('B7.3: localStorage prefix remains lesoul_gh_', function () {
            assert.ok(dbJs.includes("prefix: 'lesoul_gh_'"),
                'localStorage prefix should remain lesoul_gh_');
        });
    });

    describe('B8: Security and constraints', function () {
        it('B8.1: products.js does not reference Supabase client directly', function () {
            assert.ok(!productsJs.includes('supabase') && !productsJs.includes('LESOULSupabase'),
                'products.js should not reference Supabase client directly');
        });

        it('B8.2: products.js has no service_role/token/key console.log', function () {
            const hasSensitiveLog = /console\.log.*(service_role|token|key|JWT)/i.test(productsJs);
            assert.ok(!hasSensitiveLog,
                'products.js should not have service_role/token/key/JWT console.log');
        });

        it('B8.3: js/config.js exists and is in .gitignore', function () {
            const configExists = fs.existsSync(path.join(rootDir, 'js/config.js'));
            assert.ok(configExists, 'js/config.js should exist for local testing');
            assert.ok(gitIgnore.includes('js/config.js'),
                'js/config.js should be in .gitignore');
        });

        it('B8.4: data_export.json is not included in changes', function () {
            assert.ok(!productsJs.includes('data_export.json'),
                'products.js should not reference data_export.json');
            assert.ok(!dbJs.includes('data_export.json'),
                'db.js should not reference data_export.json');
        });

        it('B8.5: remote supabase.co URL is not allowed', function () {
            assert.ok(!productsJs.includes('supabase.co'),
                'products.js should not contain supabase.co URL');
            assert.ok(!dbJs.includes('supabase.co'),
                'db.js should not contain supabase.co URL');
        });
    });

    describe('B9: UI/CSS constraints', function () {
        it('B9.1: css/style.css unchanged (no batch action CSS changes)', function () {
            const styleCss = fs.readFileSync(path.join(rootDir, 'css/style.css'), 'utf8');
            assert.ok(!styleCss.includes('batch'),
                'style.css should not have new batch-related CSS');
        });

        it('B9.2: index.html unchanged (no batch action HTML changes)', function () {
            const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
            assert.ok(!indexHtml.includes('batch'),
                'index.html should not have new batch-related HTML');
        });
    });

    describe('B10: DB batch helpers', function () {
        it('B10.1: DB.batchDeleteProductsAsync exists', function () {
            assert.ok(dbJs.includes('async batchDeleteProductsAsync(ids)'),
                'DB.batchDeleteProductsAsync should exist');
        });

        it('B10.2: DB.batchUpdateProductsAsync exists', function () {
            assert.ok(dbJs.includes('async batchUpdateProductsAsync(ids, updates)'),
                'DB.batchUpdateProductsAsync should exist');
        });

        it('B10.3: batch helpers use sequential for loop', function () {
            assert.ok(dbJs.includes('for (const id of ids)'),
                'batch helpers should use sequential for loop');
        });

        it('B10.4: batch helpers track success/failed counts', function () {
            assert.ok(dbJs.includes('success: []') && dbJs.includes('failed: []'),
                'batch helpers should track success and failed counts');
        });
    });

});
