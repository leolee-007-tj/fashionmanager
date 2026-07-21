# Supabase Remote Config Template

## 1. 목적

- 이 문서는 실제 remote deployment 전에 ignored `js/config.js`를 수동으로 만들 때 참고하는 안전 템플릿이다.
- 이 문서 자체에는 실제 key, token, project URL을 넣지 않는다.
- **실제 원격 Supabase 연결은 하지 않는다.** 이 문서는 template과 safety check 가이드일 뿐이다.

## 2. Safe Browser Config Template

실제 값 없이 placeholder만 사용한다.

```javascript
window.LESOUL_CONFIG = Object.freeze({
    APP_BRAND_NAME: 'LESOUL',

    SUPABASE_ENABLED: true,
    PRODUCTS_SUPABASE_ENABLED: true,
    PRODUCTS_SUPABASE_REMOTE_ENABLED: true,

    SUPABASE_URL: 'https://YOUR_PROJECT_REF.supabase.co',
    SUPABASE_CLIENT_KEY: 'YOUR_PUBLISHABLE_OR_ANON_KEY_ONLY'
});
```

### placeholder 설명

| Placeholder | 설명 |
|---|---|
| `YOUR_PROJECT_REF` | Supabase project reference ID (예: `abcdefghijklmnopqrst`) |
| `YOUR_PUBLISHABLE_OR_ANON_KEY_ONLY` | Supabase **publishable / anon key만** 사용 — service_role 절대 안 됨 |

## 3. Allowed Values

브라우저 config에 넣어도 안전한 값:

| Config Key | 허용 값 | 비고 |
|---|---|---|
| `APP_BRAND_NAME` | `'LESOUL'` 또는 사용자 브랜드명 | 브랜드명 |
| `SUPABASE_ENABLED` | `true` / `false` | 전체 Supabase 활성화 |
| `PRODUCTS_SUPABASE_ENABLED` | `true` / `false` | Products Supabase runtime 활성화 |
| `PRODUCTS_SUPABASE_REMOTE_ENABLED` | `true` / `false` | remote URL 허용 |
| `SUPABASE_URL` | Supabase project URL | `https://<project-ref>.supabase.co` |
| `SUPABASE_CLIENT_KEY` | publishable / anon key only | **service_role 절대 금지** |

## 4. Forbidden Values

**절대** 브라우저 config에 넣지 말 것:

- ❌ `service_role` key
- ❌ `secret` key
- ❌ database password
- ❌ JWT secret
- ❌ access token
- ❌ refresh token
- ❌ personal access token
- ❌ Supabase CLI access token
- ❌ `data_export.json` 내용
- ❌ private customer/product export
- ❌ email/password credentials
- ❌ `.env` 파일 내용 전체

## 5. Local-Only File Rule

- `js/config.js`는 **.gitignore 대상**
- **절대 commit하지 않음**
- `git status`에서 staged 되면 즉시 unstage
- 배포 환경에서는 안전한 방식으로 주입해야 함
- 개발자 로컬에서만 수동으로 생성

## 6. Preflight Checks

실제 remote smoke 테스트를 시작하기 **전에** 반드시 확인:

### Preflight Script 실행

```bash
bash scripts/remote-deployment-preflight.sh
```

이 script는 remote 명령을 실행하지 않고 사전 검사만 수행한다. `js/config.js`를 만들기 전/후 모두 실행을 권장한다.

### 수동 검사

```bash
# 1. working tree clean 확인
git status --short

# 2. staged 파일에 민감 파일 없음 확인
git diff --cached --name-only

# 3. service_role 문자열 확인 (문서의 금지 문구는 정상)
grep -RIn "service_role" . \
  --exclude-dir=.git \
  --exclude-dir=node_modules \
  --exclude=js/config.js \
  --exclude=data_export.json

# 4. data_export 확인
grep -RIn "data_export" . \
  --exclude-dir=.git \
  --exclude-dir=node_modules \
  --exclude=js/config.js

# 5. js/config.js staged 여부
git diff --cached --name-only | grep config.js || echo "config.js not staged (good)"

# 6. 테스트 통과 확인
node --test tests/remote-config-secret-safety-contract.test.mjs
```

## 7. Rollback

문제가 발생하면 즉시 다음으로 롤백:

```javascript
window.LESOUL_CONFIG = Object.freeze({
    APP_BRAND_NAME: 'LESOUL',

    SUPABASE_ENABLED: false,
    PRODUCTS_SUPABASE_ENABLED: false,
    PRODUCTS_SUPABASE_REMOTE_ENABLED: false,

    SUPABASE_URL: '',
    SUPABASE_CLIENT_KEY: ''
});
```

- 기본 DataSource: **LocalProductsDataSource**
- localStorage runtime으로 돌아감
- Git history rewrite 금지

## 8. Secret Safety Checklist

- [ ] `service_role` key가 브라우저 코드에 없음
- [ ] `secret` key가 브라우저 config에 없음
- [ ] token/session/key `console.log` 없음
- [ ] localStorage에 secret 저장 안 함
- [ ] `js/config.js`가 `.gitignore`에 있음
- [ ] `data_export.json`이 `.gitignore`에 있음
- [ ] 실제 remote 연결 전 모든 테스트 PASS
