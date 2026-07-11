# Supabase JS Client & Auth Foundation

## 개요

현재 정적 HTML/JavaScript 웹앱에 나중에 연결할 수 있는 Supabase 브라우저 클라이언트와
인증 서비스 기반을 만든다.

**중요: 이번 단계에서는 기존 웹앱 화면, 라우터, localStorage DB,
상품·주문·고객 기능을 Supabase로 전환하지 않는다.**

원격 Supabase 프로젝트에도 연결하지 않는다.

## 현재 상태

- 앱은 여전히 localStorage 기반으로 동작
- 신규 JS 파일은 아직 index.html에서 로드하지 않음
- 현재 운영 화면과 동작은 변경되지 않음
- 실제 원격 Supabase 프로젝트 연결은 하지 않음
- 실제 로그인 화면은 아직 표시되지 않음

## 신규 파일

| 파일 | 용도 | 로드 상태 |
|---|---|---|
| `js/config.example.js` | Supabase 설정 예제 (git tracked) | 미로드 |
| `js/supabase-client.js` | Supabase 클라이언트 어댑터 (LESOULSupabase) | 미로드 |
| `js/auth-service.js` | 인증 서비스 (LESOULAuth) | 미로드 |
| `tests/supabase-client.test.js` | 클라이언트 단위 테스트 (6 test) | Node test runner |
| `tests/auth-service.test.js` | 인증 서비스 단위 테스트 (9 test) | Node test runner |

## 예정 로딩 순서 (향후 적용)

향후 실제 연결 단계에서 index.html에 다음 순서로 스크립트를 추가할 예정:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="js/config.js"></script>
<script src="js/supabase-client.js"></script>
<script src="js/auth-service.js"></script>
```

**이번 단계에서는 위 태그를 index.html에 추가하지 않는다.**

## 설정 파일 정책

### `js/config.example.js` (tracked)
- 실제 URL 없음
- 실제 publishable key 없음
- 실제 anon key 없음
- secret/service_role key 없음
- `SUPABASE_ENABLED` 기본값 `false`
- `Object.freeze` 사용

### `js/config.js` (git ignored)
- 실제 로컬 설정은 이 파일에만 저장
- 이 파일은 절대 commit하지 않음
- `.gitignore`에 이미 포함됨

## Secret / Service Role Key 브라우저 사용 금지

- `sb_secret_`로 시작하는 key는 명시적으로 거부
- JWT payload에 `role=service_role`이 포함된 key는 거부
- key 전체 또는 일부를 console/error message에 출력하지 않음
- service_role key는 서버 사이드에서만 사용

## LESOULSupabase 공개 API

```javascript
LESOULSupabase.init(config)        // 초기화, client 반환 (또는 null)
LESOULSupabase.isEnabled()         // SUPABASE_ENABLED 값
LESOULSupabase.isInitialized()     // client가 생성됐는지 여부
LESOULSupabase.getClient()         // Supabase client 반환
LESOULSupabase.getStatus()         // 상태 객체 반환
```

### 상태 객체 예시
```javascript
{
    enabled: false,
    initialized: false,
    errorCode: null
}
```

### 오류 코드
- `SUPABASE_DISABLED` — 설정에서 비활성화됨
- `SUPABASE_CONFIG_MISSING` — 설정 없음
- `SUPABASE_URL_INVALID` — URL 형식 오류
- `SUPABASE_KEY_MISSING` — client key가 빔
- `SUPABASE_SECRET_KEY_FORBIDDEN` — secret/service_role key 거부
- `SUPABASE_LIBRARY_MISSING` — supabase-js 라이브러리 로드 안 됨
- `SUPABASE_NOT_INITIALIZED` — 초기화되지 않음

## LESOULAuth 공개 API

```javascript
LESOULAuth.init()                               // 초기화
LESOULAuth.getSession()                         // 세션 + 사용자 조회
LESOULAuth.getCurrentUser()                     // 현재 사용자만 반환
LESOULAuth.signInWithPassword(email, password)  // 이메일/비밀번호 로그인
LESOULAuth.signOut()                            // 로그아웃
LESOULAuth.subscribe(callback)                  // 인증 상태 변경 구독
LESOULAuth.ensureUserProfile(displayName, lang) // 프로필 보장 (RPC)
LESOULAuth.getActiveMemberships()               // 활성 매장 멤버십 조회
LESOULAuth.bootstrapAuthenticatedUser(opts)     // 인증 사용자 부트스트랩
LESOULAuth.createInitialStore(opts)             // 초기 매장 생성 (RPC)
```

## 로그인 상태 흐름

```
1. LESOULSupabase.init(config)
   ↓
2. LESOULAuth.bootstrapAuthenticatedUser()
   ├─ 세션 없음 → status: 'signed_out'
   └─ 세션 있음 → ensureUserProfile → getActiveMemberships
       ├─ membership 있음 → status: 'ready'
       └─ membership 없음 → status: 'needs_store_onboarding'
```

## Owner Onboarding vs Manager/Staff Membership

### Owner (매장 소유자)
- `createInitialStore()`를 명시적으로 호출하여 매장 생성
- 자동으로 매장을 생성하지 않음
- 회원가입(signUp) 기능은 이번 단계에서 구현하지 않음

### Manager / Staff
- 초대를 통해 이미 존재하는 매장에 멤버로 추가됨
- 로그인 후 `getActiveMemberships()`에서 기존 매장이 보임
- **자동으로 새 매장을 생성하지 않음** (중요)
- `createInitialStore`를 호출해도 되지만, 일반적으로 필요 없음

## 자동 Store 생성 금지 이유

1. manager/staff가 로그인했을 때 실수로 새 매장이 생기는 것을 방지
2. 매장 생성은 명시적인 owner onboarding 과정에서만 발생
3. 기존 매장에 초대된 직원은 별도의 매장이 필요 없음
4. 데이터 파편화 방지

## 기존 localStorage DB와의 관계

- 아직 연결되지 않음
- 기존 DB 전역 객체를 참조하지 않음
- localStorage에 직접 읽기/쓰기하지 않음
- Supabase 라이브러리 자체의 persistSession 처리만 사용

## 단위 테스트

- Node 내장 test runner 사용
- 외부 package 설치 불필요
- mock client만 사용
- 실제 네트워크 호출 없음
- 실제 URL/key/email/password 사용하지 않음

### 실행 방법
```bash
node --test tests/supabase-client.test.js tests/auth-service.test.js
```

### 결과
- tests: 15
- pass: 15
- fail: 0

## 다음 단계

- feature flag 기반 로그인 화면 연결
- 로그인 후 현재 localStorage 데이터 마이그레이션 전략 수립
- 실제 원격 Supabase 프로젝트 설정 및 연결
- 각 업무 모듈(상품/주문/고객)의 점진적 Supabase 전환
