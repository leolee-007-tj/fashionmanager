# Local Supabase Auth and RPC Integration

## 1. 목적

실제 로컬 Supabase Auth, REST API, RLS, onboarding RPC를 Node.js 내장 fetch로 통합 검증한다.

## 2. 실제 localhost Supabase 통합 테스트

이 테스트는 mock이 아니다. 실제 `localhost` Supabase 서비스에 HTTP 요청을 실행한다.

## 3. 원격 Supabase 미연결

- 원격 Supabase 프로젝트에 절대 연결하지 않는다.
- API URL은 반드시 `http://127.0.0.1:<port>` 또는 `http://localhost:<port>` 이다.
- `https` 원격 주소, `supabase.co` 주소 등은 즉시 차단한다.

## 4. 실행 전제조건

- 로컬 Supabase 스택이 실행 중이어야 한다 (`supabase start`)
- Node.js 20 이상
- `supabase`, `node` 명령 사용 가능
- `feature/supabase-cloud-migration` 브랜치

## 5. 실행 명령

```bash
bash scripts/run-local-auth-rpc-integration.sh
```

wrapper script가 다음을 자동 수행한다:
1. 로컬 Supabase 상태 확인 (실행 중이 아니면 `supabase start`)
2. `supabase db reset --local` (테스트 전)
3. 환경 변수 수집 (`supabase status -o env`)
4. API URL localhost 검증
5. Node 통합 테스트 실행
6. `supabase db reset --local` (테스트 후)
7. 임시 환경 파일 삭제 (EXIT trap)

## 6. 통합 시나리오 (12개)

| # | 시나리오 | 설명 |
|---|---|---|
| I1 | test user 생성 | admin API로 confirmed test user 생성 |
| I2 | password login | anon key + password로 실제 로그인 |
| I3 | ensure_user_profile | RPC 실행 및 profile 확인 |
| I4 | 초기 membership | active membership 0개 확인 |
| I5 | create_initial_store | store 생성 및 UUID 반환 |
| I6 | idempotency | 재호출 시 같은 store UUID 반환 |
| I7 | owner membership | 본인 owner membership 1개 확인 |
| I8 | store RLS 조회 | RLS를 통해 본인 store 조회 |
| I9 | store_settings | 기본 언어 ko 확인 |
| I10 | list_staff_products | 빈 배열 반환 |
| I11 | refresh token | 새 session 발급 |
| I12 | signOut 및 재로그인 | logout 후 같은 계정으로 재로그인 |

## 7. local service_role 사용 범위

- `service_role` key는 **I1 (test user 생성)** 에만 사용한다.
- 이후 모든 사용자 요청은 `anon` key와 사용자 `access_token`만 사용한다.

## 8. service_role은 테스트 사용자 생성에만 사용

- `service_role` key를 브라우저나 클라이언트 설정에 넣지 않는다.
- `service_role` key를 문서, 로그, stdout/stderr에 출력하지 않는다.

## 9. browser/client에는 anon key만 사용

- 브라우저 및 클라이언트 앱에는 `anon` key만 사용해야 한다.
- `service_role` key는 서버 측 또는 테스트 사용자 생성에만 사용한다.

## 10. secret 출력 및 저장 방지

- key, token, JWT, email, password를 console에 출력하지 않는다.
- 테스트 실패 메시지에도 secret 값을 포함하지 않는다.
- 임시 환경 파일은 `mktemp`로 생성하고 `chmod 600`으로 보호한다.
- EXIT trap에서 임시 파일을 삭제한다.
- `set -x` (shell tracing)을 사용하지 않는다.

## 11. 테스트 전후 db reset

- 테스트 시작 전: `supabase db reset --local`
- 테스트 종료 후: `supabase db reset --local` (성공 여부와 관계없이)
- 테스트 user, store, profile, membership, settings는 모두 제거된다.

## 12. 실제 고객 데이터 사용 0

- 실제 고객, 상품, 주문 데이터를 사용하지 않는다.
- 모든 테스트 데이터는 dummy UUID 이메일과 랜덤 비밀번호를 사용한다.

## 13. 실제 외부 네트워크 요청 0

- 모든 HTTP 요청은 `localhost` 또는 `127.0.0.1`로만 전송된다.
- 테스트 종료 시 hostname Set 검증으로 외부 요청 0건을 확인한다.
- CDN 호출은 이번 Node 통합 테스트에서 하지 않는다.

## 14. 실행 결과

- 실행 날짜: 2026-07-12
- 통합 subtests: 13 (12 시나리오 + 1 보안 검증)
- pass: 13
- fail: 0
- localhost 실제 네트워크 사용: Yes
- 원격 요청: 0
- secret 출력: 0

## 15. 브라우저 UI 검증 미실행

- 이번 단계는 Node.js 기반 통합 테스트만 진행한다.
- 실제 브라우저 UI 통합 테스트는 다음 단계에서 진행한다.

## 16. 다음 단계

- 3-4C2: 브라우저 로그인 smoke test
- 실제 브라우저 환경에서 인증 게이트 UI와 로컬 Supabase 연동 검증
