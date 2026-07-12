# Supabase Auth Gate UI (3-4B)

## 개요

Supabase 인증이 활성화된 경우에만 로그인·초기 매장 생성 화면을 표시하는
인증 게이트를 기존 정적 웹앱에 연결한다.

**기본 설정은 `SUPABASE_ENABLED=false`로 유지된다.**
따라서 기본 상태에서는 현재 localStorage 웹앱이 기존과 완전히 동일하게 실행된다.

## 현재 상태

- 기본 feature flag: `SUPABASE_ENABLED=false`
- 비활성 모드에서는 기존 앱과 100% 동일하게 동작
- 활성 모드에서는 인증 게이트가 동작
- 실제 원격 Supabase 프로젝트 연결은 하지 않음
- 신규 DB migration 없음
- 기존 업무 데이터 계층(localStorage)은 전환하지 않음

## Feature Flag 기본값

`js/config.example.js`에서 안전 기본값을 유지한다.

```javascript
SUPABASE_ENABLED: false
SUPABASE_URL: ''
SUPABASE_CLIENT_KEY: ''
```

이미 `LESOUL_CONFIG`가 주입된 경우(`js/config.js` 로드 등) 덮어쓰지 않도록
가드를 추가했다. 이번 단계에서는 `index.html`에 `js/config.js`를 로드하지 않는다.
`index.html`은 tracked 안전 기본값인 `js/config.example.js`만 로드한다.

## 비활성 모드 (기본)

`SUPABASE_ENABLED !== true`인 경우:

1. Supabase CDN 요청 0건
2. `LESOULSupabase.init` 호출 0건
3. `LESOULAuth.init` 호출 0건
4. `#auth-root` 숨김
5. `#app` 표시
6. 인증 badge/logout 버튼 숨김
7. `App.init()` 정확히 한 번 호출
8. 상태: `legacy`
9. 현재 웹앱 동작과 화면이 동일

이 경로가 이번 단계의 기본 실행 경로다.

## 활성 모드 인증 State Machine

`SUPABASE_ENABLED=true`인 경우:

```
start()
  ↓
loading (CDN 로드 + init)
  ↓
bootstrapAuthenticatedUser()
  ↓
┌─────────────────────────────────────────┐
│ signed_out                              │
│   → 로그인 화면                          │
│   → App.init 호출 금지                   │
│   → #app 숨김                            │
├─────────────────────────────────────────┤
│ needs_store_onboarding                  │
│   → 매장 생성 화면                       │
│   → App.init 호출 금지                   │
│   → #app 숨김                            │
├─────────────────────────────────────────┤
│ ready + membership 0개                  │
│   → needs_store_onboarding으로 처리     │
├─────────────────────────────────────────┤
│ ready + membership 1개                  │
│   → activeMembership 저장                │
│   → 앱 진입 (App.init 1회)              │
│   → badge/logout 표시                    │
├─────────────────────────────────────────┤
│ ready + membership 2개 이상             │
│   → needs_store_selection 화면          │
│   → 사용자 선택 후 앱 진입               │
├─────────────────────────────────────────┤
│ error                                   │
│   → 오류 화면 + 재시도 버튼              │
│   → legacy fallback 금지                │
└─────────────────────────────────────────┘
```

## 로그인 화면

필드:
- 이메일 (필수, `@` 포함)
- 비밀번호 (필수)

버튼:
- 로그인

추가하지 않은 기능:
- 회원가입
- 비밀번호 재설정
- OAuth
- 자동 로그인 체크박스
- 관리자 로그인
- legacy 모드 진입 버튼

submit 동작:
- `handlers.onSignIn({ email, password })` 호출
- 검증: 이메일 trim, 빈 이메일 차단, `@` 없는 이메일 차단, 빈 비밀번호 차단
- 비밀번호는 submit 후 변수 외 별도 저장 금지
- submit 후 비밀번호 입력 필드 즉시 비움

오류 문구:
> 로그인할 수 없습니다. 이메일과 비밀번호를 확인해 주세요.

사용자 존재 여부나 비밀번호 오류 여부를 구분하지 않는다.

## 초기 매장 생성 화면

`bootstrap` 결과가 `needs_store_onboarding`일 때 표시한다.

필드:
- 매장 이름 (필수, 1~100자)
- 매장 부제 (선택, 공백은 `null`)
- 기본 언어 (`ko`/`zh`/`en`/`ja`)

버튼:
- 매장 만들기
- 로그아웃

규칙:
- 자동 생성 금지
- 화면 표시만으로 `createInitialStore`를 호출하지 않는다
- 사용자가 "매장 만들기" 버튼을 눌렀을 때만 호출
- manager/staff의 로그인 과정에서 자동 매장 생성 금지

## 여러 매장 선택 화면

membership이 2개 이상이면 앱에 즉시 진입하지 않는다.

각 membership을 버튼 방식으로 표시한다.
표시 값:
- `storeName` (textContent)
- `role` (textContent)

선택:
- `handlers.onSelectMembership(membership)` 호출

규칙:
- 선택값은 메모리에만 저장
- localStorage 저장 금지
- DB settings 수정 금지
- URL query 또는 hash에 store ID 기록 금지
- 현재 localStorage 업무 데이터의 tenant를 변경하지 않는다

membership이 정확히 1개면 자동으로 해당 membership을 메모리 context로 선택한다.

## App.init 단일 실행 보장

`LESOULAppBootstrap`은 `_appInitCalled` 플래그로 `App.init()` 호출을 보장한다.

- `start()` 두 번 호출해도 `App.init` 중복 없음
- `signed_out` / `needs_store_onboarding` / `needs_store_selection` 상태에서는 `App.init` 호출 0건
- 앱 진입 시 정확히 1회만 호출
- `destroy()` 후에만 플래그 리셋

## 동적 Supabase CDN 로딩

`SUPABASE_ENABLED=true`일 때 `app-bootstrap.js`가 동적으로 CDN을 로드한다.

```
https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
```

규칙:
- feature disabled이면 CDN 요청 0건
- 이미 `global.supabase.createClient`가 있으면 재로딩하지 않음
- `<script>` 중복 생성 금지 (`data-supabase-cdn="true"` 속성으로 검사)
- 15초 timeout 적용
- 실패 code: `SUPABASE_LIBRARY_LOAD_FAILED`
- CDN 실패 시 legacy 앱으로 자동 진입 금지
- 오류 화면과 재시도 버튼만 표시

`index.html`에 Supabase CDN을 직접 넣지 않는다.

## Enabled 오류 시 Legacy Fallback 금지

인증 기능 오류 시 legacy 앱으로 자동 우회하지 않는다.

- CDN 로드 실패 → error 상태, App.init 호출 0건
- `LESOULSupabase.init` 실패 → error 상태
- `LESOULAuth.init` 실패 → error 상태
- `bootstrapAuthenticatedUser` 예외 → error 상태
- `signInWithPassword` 실패 → signed_out + 오류 메시지
- `signOut` 실패 → error 상태 (legacy 노출 금지)

## Logout 시 localStorage 데이터 삭제 금지

로그아웃 시:
- `LESOULAuth.signOut` 호출
- 성공 시 context 초기화
- `#app` 숨김
- badge/logout 숨김
- signed_out 화면 표시
- `App` 내부 localStorage 데이터를 삭제하지 않는다
- `DB.clearAllData` 호출 금지

인증이 활성화된 상태에서 `signOut` 실패 시 legacy 앱을 계속 노출하지 않는다.

## Context는 메모리 전용

```javascript
{
    user: null,
    profile: null,
    memberships: [],
    activeMembership: null
}
```

규칙:
- context는 메모리 전용
- localStorage에 저장 금지
- access token 또는 refresh token을 context에 복사하지 않는다
- session 객체 전체를 context에 장기 보관하지 않는다
- `getContext()`는 shallow copy 반환

## 인증 이벤트 처리

구독 이벤트:
- `INITIAL_SESSION`: bootstrap 실행
- `SIGNED_IN`: bootstrap 재실행
- `SIGNED_OUT`: 즉시 앱 숨김, context 초기화, 로그인 화면
- `TOKEN_REFRESHED`: 화면 전체 재렌더링 불필요
- `USER_UPDATED`: 필요 시 profile bootstrap 재실행

규칙:
- 이벤트 이름을 console에 출력하지 않는다
- session/token을 console에 출력하지 않는다
- 동시에 하나의 bootstrap Promise만 실행 (revision 번호로 stale guard)
- 늦게 완료된 이전 요청이 최신 상태를 덮어쓰지 않도록 함

## App 미연결 상태 유지

이 코드는 `index.html`에 스크립트 태그로 로드되지만, 기본 `SUPABASE_ENABLED=false`인 한
기존 앱 동작과 화면에는 영향을 주지 않는다.

## 보안 규칙

- 사용자 입력값이나 서버 반환값을 innerHTML 문자열에 삽입하지 않는다
- 동적 값은 `createElement` + `textContent` 또는 `input.value`로 처리
- 비밀번호를 저장하거나 로그에 출력하지 않는다
- 오류 메시지는 정해진 일반 메시지만 표시
- Supabase 원본 오류 메시지를 화면에 표시하지 않는다
- submit 중 버튼 중복 클릭 방지 (`setBusy`)
- 화면 전환 시 기존 event listener 정리

## 허용된 안전 문구

UI에는 다음 안전 문구만 표시한다.

- 설정을 불러올 수 없습니다.
- 인증 서비스를 시작할 수 없습니다.
- 로그인할 수 없습니다. 이메일과 비밀번호를 확인해 주세요.
- 매장을 만들 수 없습니다.
- 로그아웃할 수 없습니다.
- 일시적인 오류가 발생했습니다.

금지:
- API URL 표시
- API key 표시
- access token 표시
- refresh token 표시
- Supabase 원본 `error.message` 표시
- stack trace 표시
- 자동 legacy fallback

## 현재 업무 데이터는 여전히 localStorage

이번 단계에서는 업무 데이터 계층을 전환하지 않는다.
상품·주문·고객 데이터는 여전히 `js/db.js`의 localStorage 기반으로 동작한다.

활성 모드에서 앱 진입 시 표시되는 badge 문구:

```
로컬 데이터 모드 · 매장명 · role
```

"로컬 데이터 모드" 문구를 반드시 포함한다.

## 원격 Supabase 미연결

- 실제 URL/key를 넣지 않는다
- `js/config.js` 생성 또는 commit 금지
- `supabase login` / `supabase link` / `supabase db push` 금지
- 원격 Supabase 프로젝트 연결 금지

## config.js는 아직 로드하지 않음

`index.html`은 `js/config.example.js`만 로드한다.
실제 프로젝트 연결 시 별도 단계에서 `js/config.js` 로딩으로 교체한다.

## 다음 단계

- 실제 Supabase 프로젝트 설정
- 브라우저 통합 테스트 (실제 Auth / REST)
- 업무 데이터 계층의 점진적 Supabase 전환
- `js/config.js` 로딩으로 실제 프로젝트 연결

## 3-4B.1 업데이트: Logout Binding & Bootstrap Concurrency

### 헤더 Logout 버튼 실제 연결

- `js/app-bootstrap.js`에 `_bindLogoutButton()` / `_unbindLogoutButton()` 추가
- `getLogoutElement()` 기본값: `document.getElementById('auth-logout-button')`
- `start()`의 enabled 경로에서 정확히 한 번 바인딩
- `destroy()`에서 반드시 언바인딩
- disabled legacy 경로에서는 listener 등록하지 않음
- 버튼 중복 바인딩 방지: 같은 element면 재등록하지 않고, 다른 element면 먼저 제거 후 등록
- click 이벤트에서 `preventDefault()` 호출
- `state === 'ready'`일 때만 `signOut()` 호출

### Logout Listener 단일 등록

- `_logoutElement`와 `_logoutClickHandler` 상태 변수로 추적
- `start()` 두 번 호출해도 listener 개수 유지
- `destroy()` 호출 시 listener 완전 제거

### signOut Single-flight

- `_signOutInFlight` 변수로 진행 중인 Promise 추적
- 동시 여러 번 호출해도 같은 Promise 반환
- 실제 `auth.signOut()`은 한 번만 호출
- 성공/실패 후 `_signOutInFlight`를 null로 복원
- Promise identity 검사로 다른 Promise를 지우지 않음

### Bootstrap Single-flight & Revision 순서 수정

- 기존: revision 증가 후 in-flight 검사 (잘못된 순서)
- 수정: in-flight 검사 후 revision 증가
  - 기존 bootstrap 실행 중 새 이벤트가 들어오면 기존 Promise 그대로 반환
  - revision을 증가시키지 않음
  - 기존 결과를 stale로 만들지 않음
  - `bootstrapAuthenticatedUser`를 동시에 두 번 실행하지 않음
- Promise 종료 시 identity 검사로 정확히 정리
  - `if (_bootstrapInFlight === trackedPromise) { _bootstrapInFlight = null; }`
  - 성공과 실패 모두에서 정리
  - unhandled rejection 발생하지 않음

### SIGNED_OUT Bootstrap Invalidation

- `_invalidateBootstrap()` 함수 추가
  - `_bootstrapRevision += 1`
  - `_bootstrapInFlight = null`
- 다음 경우에 호출:
  1. SIGNED_OUT 이벤트 수신 직후
  2. 명시적인 signOut 성공 직후
  3. `destroy()` 호출 시
- 목적:
  - 로그아웃 전에 시작된 bootstrap 결과가 나중에 ready 상태를 만들지 못하게 함
  - 로그아웃 후 App.init을 호출하지 못하게 함
  - 로그아웃 후 context를 다시 채우지 못하게 함
- Promise 자체는 취소할 수 없으므로, 완료 시 revision 불일치로 결과를 무시

### 늦은 Ready 결과 무시

- SIGNED_OUT 후 기존 bootstrap이 완료되어도:
  - `myRevision !== _bootstrapRevision`이므로 결과 무시
  - state는 `signed_out` 유지
  - context는 초기화된 상태 유지
  - `App.init` 호출 0건
  - `activeMembership`은 null 유지

### Destroy Listener 정리

- `destroy()`에서 `_unbindLogoutButton()` 호출
- `destroy()`에서 `_invalidateBootstrap()` 호출
- 진행 중인 모든 bootstrap 결과를 무효화
- `_signOutInFlight`도 null로 복원

### 실제 원격 Supabase는 아직 미연결

- 여전히 로컬 테스트만 진행
- 실제 URL/key 없음
- `js/config.js` 없음
- 원격 Supabase 연결 안 됨

### 업무 데이터는 여전히 localStorage

- 인증 게이트만 추가
- 상품·주문·고객 데이터는 여전히 `js/db.js`의 localStorage 기반
- 기존 업무 모듈 변경 0건
