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
| `tests/supabase-client.test.js` | 클라이언트 단위 테스트 (7 test) | Node test runner |
| `tests/auth-service.test.js` | 인증 서비스 단위 테스트 (15 test) | Node test runner |

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

## 브라우저 JWT decode 검증 (base64url 패딩 보완)

`_decodeJwtPayload(token)`는 service_role JWT payload의 `role` 값을 검사하기 위해
JWT를 클라이언트 측에서 decode한다. Supabase JS가 JWT를 base64url로 인코딩하므로,
Node `Buffer` 경로와 브라우저 `atob` 경로가 동일하게 동작하도록 명시적 패딩을 추가했다.

```javascript
var base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
var remainder = base64.length % 4;
if (remainder === 2) {
    base64 += '==';
} else if (remainder === 3) {
    base64 += '=';
} else if (remainder === 1) {
    return null; // base64 length % 4 === 1 은 잘못된 입력
}
```

규칙:
- `remainder === 1`인 입력은 즉시 `null` 반환 (잘못된 base64 길이)
- 나머지 경우 표준 base64 패딩(`=` 또는 `==`)을 추가
- `atob` 우선, `Buffer` 차선, 둘 다 없으면 `null` 반환
- decode 중 오류가 발생해도 key 내용을 오류 메시지에 포함하지 않음
- service_role JWT는 `SUPABASE_SECRET_KEY_FORBIDDEN` 오류로 거부됨

이 검증은 브라우저 환경에서 `service_role` 키가 anon 키로 위장해 들어오는 것을
방어한다. (T22 단위 테스트에서 `atob` 경로만 활성화한 상태로 검증)

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

## Auth Client Lifecycle 보완 (3-4A.1)

Supabase JS v2의 실제 반환 구조에 맞춰 인증 구독, 세션 조회, 로그아웃 처리를
정확하게 수정했다. 이번 단계에서는 로그인 UI나 기존 앱 연결을 하지 않는다.

### `LESOULAuth.init` 검증 강화

`init()`는 다음 4가지 조건을 모두 확인한다.

1. `LESOULSupabase` 객체 존재
2. `isInitialized` 함수 존재
3. `isInitialized() === true`
4. `getClient` 함수 존재

조건을 하나라도 만족하지 않으면 `SUPABASE_NOT_INITIALIZED` 오류 발생.
성공 시 `_initialized = true` 반환. 별도의 Supabase client를 생성하지 않는다.

### onAuthStateChange 반환 구조

Supabase JS v2의 `client.auth.onAuthStateChange()`는 다음 구조를 반환한다.

```javascript
{
    data: {
        subscription: {
            unsubscribe: function
        }
    }
}
```

`LESOULAuth.subscribe(callback)`는 위 구조에서 `result.data.subscription`을
꺼내 저장하고, 반환하는 `unsubscribe` 함수가 해당 `subscription.unsubscribe()`를
호출하도록 한다.

```javascript
var result = client.auth.onAuthStateChange(function (event, session) {
    try {
        callback({
            event: event,
            session: session,
            user: (session && session.user) || null
        });
    } catch (e) {
        // callback 예외는 listener를 중단시키지 않음
    }
});

var authSubscription =
    result && result.data && result.data.subscription;

return function unsubscribe() {
    if (authSubscription) {
        try {
            authSubscription.unsubscribe();
        } catch (e) {
            // ignore
        }
        authSubscription = null;
    }
};
```

### unsubscribe idempotent 처리

- 첫 번째 `unsubscribe()` 호출이 실제 `subscription.unsubscribe()`를 실행
- 호출 후 내부 `authSubscription` 참조를 `null`로 만든다
- 이후 추가 호출은 아무 동작도 하지 않는다 (여러 번 호출해도 안전)
- 과거의 비표준 `data.unsubscribe` fallback은 제거됨

### callback 검증

`callback`이 함수가 아니면 `AUTH_CALLBACK_INVALID` 오류 발생.
메시지: `Auth callback must be a function`.

### getSession 오류 정규화

`client.auth.getSession()`이 `error`를 반환하면 `AUTH_SESSION_FAILED` 오류 발생.
세션이 정상적으로 없는 경우(`session === null`)는 오류가 아니다.

```javascript
async function getSession() {
    var client = _getClient();
    try {
        var result = await client.auth.getSession();
        if (result && result.error) {
            throw _makeError(
                'AUTH_SESSION_FAILED',
                'Failed to read authentication session'
            );
        }
        var session = result && result.data && result.data.session
            ? result.data.session : null;
        return {
            session: session,
            user: session && session.user ? session.user : null
        };
    } catch (error) {
        if (error && error.code === 'AUTH_SESSION_FAILED') {
            throw error;
        }
        throw _makeError(
            'AUTH_SESSION_FAILED',
            'Failed to read authentication session'
        );
    }
}
```

### signOut 오류 정규화

`client.auth.signOut()`이 `error`를 반환하면 `AUTH_SIGN_OUT_FAILED` 오류 발생.
성공했을 때만 `true`를 반환한다. 오류를 숨기지 않으며, Supabase 원본 오류 객체나
메시지를 외부에 노출하지 않는다.

### 신규 오류 코드

| 코드 | 의미 |
|---|---|
| `AUTH_CALLBACK_INVALID` | `subscribe(callback)`의 callback이 함수가 아님 |
| `AUTH_SESSION_FAILED` | `getSession()`에서 error 반환 또는 예외 발생 |
| `AUTH_SIGN_OUT_FAILED` | `signOut()`에서 error 반환 또는 예외 발생 |
| `SUPABASE_NOT_INITIALIZED` | `init()`에서 client가 초기화되지 않았음 |

### 보안 규칙

- session이나 token을 console에 출력하지 않는다
- Supabase 원본 오류 객체나 메시지를 외부에 노출하지 않는다
- callback 예외는 listener를 중단시키지 않는다 (try/catch로 무시)
- 별도의 Supabase client를 생성하지 않는다

### 앱 미연결 상태 유지

이 코드는 여전히 `index.html`에서 로드되지 않는다.
실제 앱 화면, 라우터, localStorage DB에는 영향을 주지 않는다.

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
- `global.atob`를 mock한 테스트는 반드시 원래 상태로 복원
- 테스트 간 global 상태가 누출되지 않게 `resetGlobals()`로 reset

### 실행 방법
```bash
node --test tests/supabase-client.test.js tests/auth-service.test.js
```

### 결과
- tests: 22
- pass: 22
- fail: 0
- 실제 네트워크 호출: 0

### 테스트 목록

| # | 테스트 | 결과 |
|---|---|---|
| T1 | disabled config에서 client를 생성하지 않음 | PASS |
| T2 | enabled 상태의 잘못된 URL 차단 | PASS |
| T3 | enabled 상태의 빈 client key 차단 | PASS |
| T4 | sb_secret_ key와 service_role JWT 차단 | PASS |
| T5 | 정상 mock config에서 client 정확히 1회 생성 | PASS |
| T6 | createClient에 auth persistence 옵션 전달 확인 | PASS |
| T7 | 빈 email/password 로그인 차단 | PASS |
| T8 | signInWithPassword에 정제된 email과 password 전달 | PASS |
| T9 | getSession이 session/user 반환 | PASS |
| T10 | signOut 호출 및 true 반환 | PASS |
| T11 | subscribe가 auth 이벤트 전달하고 unsubscribe 가능 | PASS |
| T12 | ensureUserProfile이 정확한 RPC 이름과 인자 사용 | PASS |
| T13 | bootstrapAuthenticatedUser가 세션 없을 때 signed_out 반환 | PASS |
| T14 | 세션은 있지만 membership이 없으면 needs_store_onboarding 반환 | PASS |
| T15 | createInitialStore가 정확한 RPC 이름과 인자 사용 | PASS |
| T16 | subscribe가 data.subscription.unsubscribe를 호출 | PASS |
| T17 | unsubscribe를 두 번 호출해도 실제 해제는 한 번만 실행 (idempotent) | PASS |
| T18 | 함수가 아닌 callback 차단 — AUTH_CALLBACK_INVALID | PASS |
| T19 | getSession 반환 error 차단 — AUTH_SESSION_FAILED | PASS |
| T20 | signOut 반환 error 차단 — AUTH_SIGN_OUT_FAILED | PASS |
| T21 | LESOULAuth.init이 초기화되지 않은 client를 차단 | PASS |
| T22 | 브라우저 atob 경로에서 service_role JWT 차단 | PASS |

## 다음 단계

- feature flag 기반 로그인 화면 연결
- 로그인 후 현재 localStorage 데이터 마이그레이션 전략 수립
- 실제 원격 Supabase 프로젝트 설정 및 연결
- 각 업무 모듈(상품/주문/고객)의 점진적 Supabase 전환
