# Supabase Remote Deployment Runbook

## 1. 현재 상태

- Products local runtime 검증 완료 (3-5M)
- Products batch actions Supabase compatibility 완료 (3-5P)
- remote guardrail flag 준비 완료 (3-5Q)
- 기본 runtime은 LocalProductsDataSource
- remote Supabase 실제 연결 전 상태
- 이 runbook은 실제 배포 전 readiness audit을 위한 문서이다.
- **이 문서를 작성하는 시점(3-5R)에서는 실제 원격 Supabase 연결을 하지 않는다.**

## 1-A. 3-5W Remote Browser Smoke Test 완료 (2026-07-22)

원격 Supabase에 대한 브라우저 smoke test가 완료됐다.

### 고정 기준점

| 항목 | 값 |
|---|---|
| Branch | `feature/supabase-cloud-migration` |
| Remote HEAD | `398cc6e` |
| Working tree | clean |
| Push | 완료 |

### Pushed commits

| SHA | 메시지 |
|---|---|
| `7d6f9de` | auth: add signup/login UI for remote smoke test |
| `398cc6e` | 3-5V: fix product update legacy_id mapping and edit UI for remote smoke test |

### 통과 항목

- signup/login PASS
- create_product PASS
- listProducts PASS
- update_product PASS
- soft_delete_product PASS
- feature branch push PASS

### 다음 작업 전 유지 사항

- GitHub Support 민감데이터 purge ticket 닫지 않기
- main/gh-pages force push 금지
- supabase db push 재실행 금지
- supabase db reset --linked 금지
- supabase db pull 금지
- js/config.js commit 금지
- data_export.json 재추가 금지
- service_role/token/key/password 출력 금지

상세 내역은 [SUPABASE_BROWSER_AUTH_SMOKE_TEST.md](./SUPABASE_BROWSER_AUTH_SMOKE_TEST.md) 20번 항목 참조.

## 1-B. 3-5X: Remote Production Readiness Freeze Audit PASS (2026-07-22)

### 감사 결과

| # | 항목 | 결과 |
|---|---|---|
| 1 | Branch = feature/supabase-cloud-migration | PASS |
| 2 | Working tree clean | PASS |
| 3 | Remote = Local | PASS (`a4ea9c6`) |
| 4 | js/config.js NOT tracked | PASS (gitignored, local-only) |
| 5 | supabase/config.toml NOT staged/committed | PASS |
| 6 | data_export.json NOT EXISTS | PASS |
| 7 | Secret exposure check | PASS |
| 8 | service_role 문자열 위치 | PASS (차단 로직과 contract test에서만) |
| 9 | Node test | PASS |
| 10 | Preflight | PASS |

### 유지 금지 사항

- GitHub Support 민감데이터 purge ticket 계속 열어둠
- main/gh-pages force push 금지
- supabase db push 재실행 금지
- supabase db reset --linked 금지
- supabase db pull 금지
- js/config.js commit 금지
- data_export.json 생성/추가 금지
- token/key/password 출력 금지

## 2. 원격 배포 전 필수 조건

### Preflight Script

**실제 remote 명령을 실행하기 전 반드시 실행해야 한다:**

```bash
bash scripts/remote-deployment-preflight.sh
```

- 이 script는 **remote 명령을 실행하지 않는다** (supabase login/link/db push 금지).
- 사전 검사만 수행: branch, staged files, tracked secrets, default flags, service_role, etc.
- 실패 조건이 있으면 non-zero exit.

### 필수 조건 체크리스트

다음 조건이 모두 충족되어야 원격 배포를 진행할 수 있다.

- [ ] Git working tree clean
- [ ] feature/supabase-cloud-migration 브랜치에서만 진행
- [ ] GitHub Support purge ticket 아직 닫지 않음 → main/gh-pages force push 금지
- [ ] git filter-repo 재실행 금지
- [ ] data_export.json 없음
- [ ] js/config.js 없음 (gitignored)
- [ ] service_role key가 JS/browser/repo에 없음
- [ ] local DB lint PASS (`supabase db lint --local --level error --fail-on error`)
- [ ] pgTAP PASS (`supabase test db --local`)
- [ ] 전체 JS 테스트 PASS
- [ ] products runtime local integration PASS

## 3. 브라우저에 허용되는 config

**참고**: 자세한 template은 [SUPABASE_REMOTE_CONFIG_TEMPLATE.md](./SUPABASE_REMOTE_CONFIG_TEMPLATE.md) 참고.

### 허용되는 config 값

다음 값만 브라우저 환경(config.js)에서 설정할 수 있다.

| Config Key | 허용 값 | 비고 |
|---|---|---|
| SUPABASE_ENABLED | true | 전체 Supabase 활성화 |
| PRODUCTS_SUPABASE_ENABLED | true | Products Supabase runtime 활성화 |
| PRODUCTS_SUPABASE_REMOTE_ENABLED | true | remote URL 허용 |
| SUPABASE_URL | remote project URL | supabase.co URL |
| SUPABASE_CLIENT_KEY | publishable/anon key only | service_role key 금지 |
| APP_BRAND_NAME | 'LESOUL' 또는 사용자 브랜드명 | 브랜드명 |

### 금지되는 secret

다음 값은 **절대** 브라우저 config에 넣으면 안 된다.

- service_role key
- secret key
- database password
- JWT secret
- access token
- refresh token
- personal access token
- data_export.json 내용
- 실제 고객/상품 private export
- supabase CLI access token

## 4. Remote Deployment Command Plan

**주의: 이 단계(3-5R)에서는 아래 명령을 실행하지 않는다.**
**아래 명령은 실제 배포 시 실행 예정 순서를 기록한 것이다.**

### 실제 실행 예정 순서

1. **Supabase 프로젝트 준비**
   - `supabase login`
   - `supabase link --project-ref <project-ref>`
   - `supabase db push`

2. **Schema 검증**
   - `supabase db lint`

3. **Remote smoke 테스트**
   - js/config.js에 remote URL + anon key 설정
   - 브라우저에서 로그인/상품 관리 확인
   - dummy data만 사용

## 5. Stop Criteria

다음 중 하나라도 발생하면 **즉시 중단**하고 원인을 파악한다.

- service_role이 browser config에 들어감
- js/config.js가 staged 됨
- data_export.json이 생김
- remote URL에서 PRODUCTS_SUPABASE_REMOTE_ENABLED=false인데도 SupabaseProductsDataSource가 활성화됨
- DB lint 실패
- pgTAP 실패
- JS 테스트 실패
- RLS/RPC 권한 검증 불명확
- Products batch action이 setProducts bulk overwrite 사용
- 원격 테스트에서 실제 고객 데이터 사용 위험 발생
- console.log에 token/session/key 출력됨

## 6. Rollback 기준

remote deployment에서 문제가 발생했을 때 다음 기준에 따라 rollback한다.

- remote feature flags를 false로 되돌림
  - PRODUCTS_SUPABASE_ENABLED=false
  - PRODUCTS_SUPABASE_REMOTE_ENABLED=false
- 기본 LocalProductsDataSource 유지
- remote project DB 변경 rollback은 별도 Supabase backup/restore 기준 필요
- Git history rewrite 금지
- git filter-repo 재실행 금지

## 7. Remote Smoke 계획

remote smoke 테스트 시 다음 규칙을 준수한다.

- **dummy user만 사용** — 실제 운영 계정 사용 금지
- **dummy store만 사용** — 실제 운영 store 사용 금지
- **dummy products만 사용** — 실제 운영 상품 사용 금지
- **실제 운영 데이터 사용 금지**
- **상품 목록/추가/수정/삭제/일괄 작업 확인**
- **로그아웃/재로그인 확인**
- **service_role browser 노출 없음 확인**
- **console token/key/session 출력 없음 확인**

## 8. Security Checklist

- [ ] service_role key가 브라우저 코드에 없음
- [ ] anon key 외의 secret이 브라우저 config에 없음
- [ ] token/session/key console.log 없음
- [ ] localStorage에 secret 저장 안 함
- [ ] API response에 sensitive data 노출 안 함

## 9. GitHub Support Purge Ticket 주의사항

- GitHub Support purge ticket이 아직 닫지 않았으므로 main/gh-pages force push 금지
- git filter-repo 재실행 금지
- stale clone/backups 사용 금지
- data_export.json 재추가 금지
