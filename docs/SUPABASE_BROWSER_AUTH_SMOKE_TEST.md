# Local Browser Auth Smoke Test (3-4C2)

## 1. 목적

실제 브라우저에서 로컬 Supabase Auth와 인증 게이트 UI가 연결되는지 smoke test로 확인한다.

**3-4C2는 데이터 CRUD 전환 단계가 아니다.** 로그인 → 매장 생성 → 세션 유지 → 로그아웃만 검증한다.

## 2. 로컬 Supabase 전용 테스트

- 이 테스트는 반드시 `localhost` Supabase에서 실행한다.
- 원격 Supabase 프로젝트에 연결하지 않는다.
- `supabase.co` 주소, `https` 프로토콜 사용 금지.

## 3. 원격 Supabase 미연결

- API URL은 반드시 `http://127.0.0.1:54321` 이다.
- GitHub Pages에서 js/config.js 404가 떠도 앱 실행이 중단되지 않아야 한다.
- config.example.js 기본값 `SUPABASE_ENABLED=false`로 유지된다.

## 4. service_role 브라우저 사용 금지

- `service_role` key는 로컬 테스트 사용자 생성에만 사용한다.
- 브라우저 config(js/config.js)에 `service_role` key를 넣지 않는다.
- 브라우저에서 `service_role` key를 사용하지 않는다.

## 5. js/config.js는 ignored local file

- `js/config.js`는 `.gitignore`에 이미 포함되어 있다.
- `js/config.js` 파일은 절대 commit하지 않는다.
- `js/config.js`가 없어도 기존 legacy mode는 계속 동작해야 한다.
- `js/config.js`는 `js/config.example.js`보다 먼저 로드된다.
- `config.example.js`는 `window.LESOUL_CONFIG`가 이미 있으면 덮어쓰지 않는다.

### 로컬에서만 생성할 파일: js/config.js

```javascript
(function (global) {
    'use strict';

    global.LESOUL_CONFIG = Object.freeze({
        SUPABASE_ENABLED: true,
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_CLIENT_KEY: '<LOCAL_ANON_KEY_ONLY>'
    });
})(typeof window !== 'undefined' ? window : globalThis);
```

**주의:**
- `LOCAL_ANON_KEY`만 사용
- `SERVICE_ROLE_KEY` 절대 사용 금지
- `js/config.js` commit 금지

## 6. 실행 전 preflight 명령

```bash
bash scripts/run-local-auth-rpc-integration.sh --preflight
```

preflight가 PASS인 경우에만 브라우저 smoke test를 진행한다.

## 7. 로컬 정적 서버 실행 명령

```bash
python3 -m http.server 4173
```

## 8. 브라우저 URL

```
http://127.0.0.1:4173/index.html
```

## 9. 테스트 계정 준비 방식

- 실제 이메일 사용 금지
- 실제 비밀번호 사용 금지
- 로컬 Auth admin API로 dummy user 생성 가능
- `service_role` key는 로컬 사용자 생성에만 사용
- 브라우저 config에는 절대 넣지 않는다
- 테스트 계정 정보는 docs에 기록하지 않는다

## 10. 브라우저 테스트 단계

| # | 단계 | 기대 결과 |
|---|---|---|
| 1 | 페이지 로드 | `SUPABASE_ENABLED=true` 상태에서 legacy app이 바로 뜨지 않음 |
| 2 | 로그인 화면 | 로그인 폼이 표시됨 |
| 3 | 로그인 시도 | dummy local test user로 로그인 가능 |
| 4 | membership 체크 | membership이 없으면 store onboarding 화면 표시 |
| 5 | 매장 생성 | 매장 이름 입력 후 "매장 만들기" 버튼 클릭 가능 |
| 6 | 앱 진입 | 매장 생성 후 앱이 표시됨 |
| 7 | auth badge | header에 auth context badge 표시 |
| 8 | 새로고침 | 세션이 유지되고 앱이 그대로 표시됨 |
| 9 | 로그아웃 | logout 버튼 클릭 시 signed-out 화면으로 돌아감 |
| 10 | 재로그인 | 다시 로그인 가능 |

## 11. 추가 검사 항목

| # | 검사 | 기대 결과 |
|---|---|---|
| 11 | token/session 출력 | console.log로 token/session 값을 출력하지 않음 |
| 12 | service_role 브라우저 | service_role key가 브라우저에 없음 |

## 12. 실패 시 판단 기준

- 로그인 화면이 표시되지 않으면: config 설정 확인
- 로그인이 실패하면: local test user가 존재하는지 확인
- 매장 생성이 실패하면: Supabase Auth session이 유지되는지 확인
- 새로고침 후 세션이 유지되지 않으면: Supabase Auth persistence 확인
- logout이 동작하지 않으면: auth-service logout lifecycle 확인

## 13. 아직 CRUD 전환 아님

- business modules(js/db.js, js/products.js, js/orders.js, js/customers.js)는 변경되지 않음
- localStorage 기반 업무 데이터는 그대로 유지
- 상품/주문/고객 모듈 Supabase 전환은 다음 단계에서 진행

## 14. 기존 업무 모듈 변경 없음

- js/db.js: 변경 없음
- js/products.js: 변경 없음
- js/orders.js: 변경 없음
- js/customers.js: 변경 없음
- js/analytics.js: 변경 없음
- js/expenses.js: 변경 없음
- js/excel.js: 변경 없음
- js/settings.js: 변경 없음
- supabase/migrations/*: 변경 없음
- supabase/tests/*: 변경 없음
- supabase/config.toml: 변경 없음

## 15. 브라우저 실행 결과

**수동 확인 결과:**

| 항목 | 값 |
|---|---|
| 실행 날짜 | 2026-07-19 |
| preflight 결과 | PASS |
| 로그인 화면 표시 | ✅ |
| 로그인 성공 | ✅ |
| onboarding 화면 표시 | ✅ |
| 매장 생성 성공 | ✅ |
| 앱 진입 | ✅ |
| auth badge 표시 | ✅ |
| 새로고침 세션 유지 | ✅ |
| logout 성공 | ✅ |
| 재로그인 가능 | ✅ |
| token console 출력 | ❌ (없음) |
| service_role 브라우저 | ❌ (없음) |
| 원격 Supabase 연결 | ❌ (없음) |

## 16. 다음 단계

- 3-4C3: Business CRUD Supabase 전환
- localStorage 데이터를 Supabase로 마이그레이션
- 상품/주문/고객 모듈 Supabase API로 전환
