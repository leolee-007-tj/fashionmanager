#!/usr/bin/env bash
# Remote Deployment Preflight Script (3-5T)
#
# 이 script는 실제 remote Supabase 명령을 실행하지 않고 사전 검사만 수행한다.
# supabase login / link / db push는 절대 실행하지 않는다.
# 실패 조건이 있으면 non-zero exit.
# 민감값(service_role key, anon key, token, password)은 출력하지 않는다.
#
# 사용법: bash scripts/remote-deployment-preflight.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PASS_TAG="[PASS]"
FAIL_TAG="[FAIL]"
INFO_TAG="[INFO]"
WARN_TAG="[WARN]"

fail_count=0

print_pass() { echo "$PASS_TAG $1"; }
print_info() { echo "$INFO_TAG $1"; }
print_warn() { echo "$WARN_TAG $1"; }
print_fail() { echo "$FAIL_TAG $1"; fail_count=$((fail_count + 1)); }

echo "=== Remote Deployment Preflight (3-5T) ==="
echo "Repo root: $REPO_ROOT"
echo ""

# --- 1. Branch 검사 ---
print_info "Checking current branch..."
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
print_info "Current branch: $CURRENT_BRANCH"

if [[ "$CURRENT_BRANCH" == "main" || "$CURRENT_BRANCH" == "gh-pages" ]]; then
    print_fail "Must not run on main/gh-pages branch. Use feature/supabase-cloud-migration."
    exit 1
fi

if [[ "$CURRENT_BRANCH" != "feature/supabase-cloud-migration" ]]; then
    print_warn "Expected branch: feature/supabase-cloud-migration"
fi
print_pass "Branch check"
echo ""

# --- 2. main/gh-pages force push 금지 경고 ---
print_warn "GitHub purge ticket: main/gh-pages force push is forbidden until GitHub Support completes purge."
print_warn "git filter-repo re-run is also forbidden."
echo ""

# --- 3. Staged 파일 검사 ---
print_info "Checking staged files for forbidden paths..."
STAGED_FILES="$(git diff --cached --name-only 2>/dev/null || true)"

if echo "$STAGED_FILES" | grep -E '^js/config\.js$' >/dev/null 2>&1; then
    print_fail "js/config.js is staged. Unstage it immediately."
fi
if echo "$STAGED_FILES" | grep -E '^data_export\.json$' >/dev/null 2>&1; then
    print_fail "data_export.json is staged. Unstage it immediately."
fi
if echo "$STAGED_FILES" | grep -E '^supabase/config\.toml$' >/dev/null 2>&1; then
    print_fail "supabase/config.toml is staged."
fi
if echo "$STAGED_FILES" | grep -E '^\.env$' >/dev/null 2>&1; then
    print_fail ".env is staged. Unstage it immediately."
fi
if echo "$STAGED_FILES" | grep -E '^supabase/migrations/' >/dev/null 2>&1; then
    print_fail "supabase/migrations/* changes are staged."
fi
if echo "$STAGED_FILES" | grep -E '^supabase/tests/' >/dev/null 2>&1; then
    print_fail "supabase/tests/* changes are staged."
fi
if echo "$STAGED_FILES" | grep -E '^css/style\.css$' >/dev/null 2>&1; then
    print_fail "css/style.css is staged."
fi
if echo "$STAGED_FILES" | grep -E '^index\.html$' >/dev/null 2>&1; then
    print_fail "index.html is staged."
fi
print_pass "Staged files check"
echo ""

# --- 4. Tracked 민감 파일 검사 ---
print_info "Checking tracked forbidden files..."
if git ls-files --error-unmatch js/config.js >/dev/null 2>&1; then
    print_fail "js/config.js is tracked by git."
fi
if git ls-files --error-unmatch data_export.json >/dev/null 2>&1; then
    print_fail "data_export.json is tracked by git."
fi
print_pass "Tracked forbidden files check"
echo ""

# --- 5. JS runtime 파일 service_role / sb_secret_ 검사 ---
print_info "Checking JS runtime files for service_role / sb_secret_..."
JS_RUNTIME_FILES=(
    js/db.js
    js/products.js
    js/orders.js
    js/customers.js
    js/analytics.js
    js/expenses.js
    js/excel.js
    js/settings.js
    js/auth-ui.js
    js/supabase-client.js
    js/auth-service.js
    js/app-bootstrap.js
    js/config.example.js
)
for f in "${JS_RUNTIME_FILES[@]}"; do
    if [[ -f "$f" ]]; then
        # service_role 또는 sb_secret_ 값이 실제 secret 형태로 들어있는지 검사
        # 주석/문구가 아닌 실제 값 할당 형태만 검출
        if grep -E "(service_role|sb_secret_)[A-Za-z0-9_]{20,}" "$f" >/dev/null 2>&1; then
            print_fail "Potential service_role/sb_secret_ value found in $f"
        fi
    fi
done
print_pass "service_role / sb_secret_ scan"
echo ""

# --- 6. token/session/key console.log 검사 ---
print_info "Checking JS runtime files for token/session/key console.log..."
for f in "${JS_RUNTIME_FILES[@]}"; do
    if [[ -f "$f" ]]; then
        if grep -E "console\.log.*([Tt]oken|[Ss]ession|[Kk]ey|password|secret)" "$f" >/dev/null 2>&1; then
            print_fail "Potential token/session/key console.log in $f"
        fi
    fi
done
print_pass "token/session/key console.log scan"
echo ""

# --- 7. config.example.js 기본값 검사 ---
print_info "Checking config.example.js default flags..."
CONFIG_EXAMPLE="js/config.example.js"
if [[ ! -f "$CONFIG_EXAMPLE" ]]; then
    print_fail "js/config.example.js not found"
else
    if ! grep -E "SUPABASE_ENABLED:\s*false" "$CONFIG_EXAMPLE" >/dev/null 2>&1; then
        print_fail "SUPABASE_ENABLED default is not false"
    fi
    if ! grep -E "PRODUCTS_SUPABASE_ENABLED:\s*false" "$CONFIG_EXAMPLE" >/dev/null 2>&1; then
        print_fail "PRODUCTS_SUPABASE_ENABLED default is not false"
    fi
    if ! grep -E "PRODUCTS_SUPABASE_REMOTE_ENABLED:\s*false" "$CONFIG_EXAMPLE" >/dev/null 2>&1; then
        print_fail "PRODUCTS_SUPABASE_REMOTE_ENABLED default is not false"
    fi
    if ! grep -E "APP_BRAND_NAME:\s*['\"]LESOUL['\"]" "$CONFIG_EXAMPLE" >/dev/null 2>&1; then
        print_fail "APP_BRAND_NAME is not LESOUL"
    fi
fi
print_pass "config.example.js default flags"
echo ""

# --- 8. .gitignore 검사 ---
print_info "Checking .gitignore..."
if ! grep -E "js/config\.js" .gitignore >/dev/null 2>&1; then
    print_fail "js/config.js is not in .gitignore"
fi
if ! grep -E "data_export\.json" .gitignore >/dev/null 2>&1; then
    print_fail "data_export.json is not in .gitignore"
fi
print_pass ".gitignore check"
echo ""

# --- 9. supabase migrations/tests staged 검사 (재확인) ---
print_info "Checking supabase migrations/tests staged..."
if echo "$STAGED_FILES" | grep -E '^(supabase/migrations|supabase/tests)/' >/dev/null 2>&1; then
    print_fail "supabase/migrations or supabase/tests changes are staged."
fi
print_pass "supabase migrations/tests check"
echo ""

# --- 10. git filter-repo 실행 금지 경고 ---
print_warn "git filter-repo re-run is forbidden (GitHub purge ticket pending)."
echo ""

# --- 결과 요약 ---
echo "=== Preflight Result ==="
if [[ $fail_count -gt 0 ]]; then
    print_fail "$fail_count issue(s) found. Fix them before proceeding."
    exit 1
fi
print_pass "All preflight checks passed."
echo ""

# --- 수동 검증 명령 안내 ---
echo "=== Manual Verification Commands ==="
print_info "Run the following commands before actual remote deployment:"
echo ""
echo "# 1. Full JS test suite"
echo "    node --test \\"
echo "      tests/supabase-client.test.js \\"
echo "      tests/auth-service.test.js \\"
echo "      tests/auth-ui.test.js \\"
echo "      tests/app-bootstrap.test.js \\"
echo "      tests/local-runner-contract.test.mjs \\"
echo "      tests/browser-auth-smoke-contract.test.mjs \\"
echo "      tests/browser-auth-recovery-contract.test.mjs \\"
echo "      tests/data-gateway-async-contract.test.mjs \\"
echo "      tests/products-read-async-contract.test.mjs \\"
echo "      tests/products-write-async-contract.test.mjs \\"
echo "      tests/products-datasource-contract.test.mjs \\"
echo "      tests/products-supabase-mapping-contract.test.mjs \\"
echo "      tests/products-supabase-datasource-skeleton-contract.test.mjs \\"
echo "      tests/products-supabase-read-contract.test.mjs \\"
echo "      tests/products-supabase-write-contract.test.mjs \\"
echo "      tests/products-runtime-feature-flag-contract.test.mjs \\"
echo "      tests/products-batch-actions-contract.test.mjs \\"
echo "      tests/brand-setting-contract.test.mjs \\"
echo "      tests/remote-deployment-readiness-contract.test.mjs \\"
echo "      tests/remote-config-secret-safety-contract.test.mjs \\"
echo "      tests/remote-deployment-command-gate-contract.test.mjs"
echo ""
echo "# 2. Products runtime local integration"
echo "    RUN_LOCAL_SUPABASE_INTEGRATION=1 node --test tests/products-runtime-local.integration.mjs"
echo ""
echo "# 3. DB lint"
echo "    supabase db lint --local --level error --fail-on error"
echo ""
echo "# 4. pgTAP"
echo "    supabase test db --local"
echo ""
print_warn "This script does NOT execute supabase login / link / db push."
print_warn "Those commands are for manual execution only after all checks pass."
echo ""
echo "=== Preflight Complete ==="
