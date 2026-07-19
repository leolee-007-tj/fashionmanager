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

- 로컬 Supabase 스택이 실행 중이어야 한다 (사용자가 직접 `supabase start` 실행)
- Node.js 20 이상 (native Node만 사용, Docker Node fallback 없음)
- `supabase`, `node`, `docker` 명령 사용 가능
- `feature/supabase-cloud-migration` 브랜치
- runner는 자동으로 `supabase start`를 실행하지 않는다
- runner는 `--ignore-health-check`를 사용하지 않는다
- runner는 `docker run` / `docker pull`을 실행하지 않는다

## 5. 실행 명령 (3-4C1.1 — Deterministic Preflight)

명시적 모드를 사용한다. 인자 없이 실행하면 usage만 출력하고 종료한다.

```bash
# 읽기 전용 preflight (Supabase/설정 변경 금지)
bash scripts/run-local-auth-rpc-integration.sh --preflight

# 통합 테스트 실행 (preflight PASS 후에만 실행)
bash scripts/run-local-auth-rpc-integration.sh --run
```

### --preflight 모드 (읽기 전용)

금지 사항:
- `supabase start` / `supabase stop` / `supabase restart`
- `supabase db reset`
- `docker run` / `docker pull` / `docker stop` / `docker restart`
- `supabase/config.toml` 수정
- `js/config.js` 생성
- 설정 파일 쓰기

검사 항목:
1. 저장소 경로 확인
2. 현재 branch 확인
3. Supabase CLI 경로와 버전 확인
4. native Node 경로와 버전 확인
5. Docker CLI 경로와 버전 확인
6. `docker info` 실행 (15초 timeout)
7. `supabase status -o env` 실행 (20초 timeout)
8. API_URL 존재 여부 확인
9. API_URL이 localhost인지 확인
10. `supabase/config.toml` 존재 여부만 확인

각 명령의 `command`, `exit_code`, `elapsed_seconds`를 기록한다.
key/token/JWT 값은 출력하지 않는다.

### --run 모드

`--preflight` 검사가 모두 성공한 경우에만 실행된다.

1. `supabase db reset --local` (600초 timeout)
2. 즉시 `supabase status -o env` 재확인 (20초 timeout, 고정 sleep 없음)
3. native Node로 통합 테스트 실행 (180초 timeout)
4. cleanup `supabase db reset --local` (600초 timeout)

실패 숨김 금지:
- `|| true` 패턴 사용 금지
- `&>/dev/null || true` 패턴 사용 금지
- 중요 명령(`supabase status`, `supabase db reset`, `node --test`, `docker info`) 실패 시 즉시 중단

timeout 메시지는 사실만 출력한다:
- `supabase db reset --local exceeded 600 seconds`
- `node --test tests/local-auth-rpc.integration.mjs exceeded 180 seconds`

Docker 리소스 부족, 디스크 I/O 병목, 환경 손상 등은 가능성으로만 적고 단정하지 않는다.

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

## 14. 실행 결과 (3-4C1.1 — 2026-07-19)

| 항목 | 값 |
|---|---|
| 실행 날짜 | 2026-07-19 |
| native Node 경로 | /Users/lesoul888/.nvm/versions/node/v24.18.0/bin/node |
| native Node 버전 | v24.18.0 |
| Supabase CLI 경로 | /Users/lesoul888/.supabase/bin/supabase |
| Supabase CLI 버전 | 2.109.1 |
| Docker CLI 경로 | /Applications/Docker.app/Contents/Resources/bin/docker |
| docker info exit code | 0 |
| supabase status exit code | 0 |
| API hostname | 127.0.0.1 |
| preflight 결과 | PASS (12s) |
| db reset elapsed | 139s |
| integration test elapsed | 4s |
| cleanup db reset elapsed | 91s |
| run 총 소요 | 244s |
| 통합 subtests | 14 (12 시나리오 + 1 parent + 1 보안 검증) |
| pass | 14 |
| fail | 0 |
| timeout 발생 | 없음 |
| 자동 supabase start 실행 수 | 0 |
| Docker restart 실행 수 | 0 |
| Docker Node fallback 실행 수 | 0 |
| Docker image pull 실행 수 | 0 |
| 설정 파일 변경 수 | 0 |
| localhost 실제 네트워크 사용 | Yes |
| 원격 요청 | 0 |
| secret 출력 | 0 |
| GitHub Actions | 아님 (로컬 검증) |

## 15. 브라우저 UI 검증 미실행

- 이번 단계는 Node.js 기반 통합 테스트만 진행한다.
- 실제 브라우저 UI 통합 테스트는 다음 단계에서 진행한다.

## 16. 다음 단계

- 3-4C2: 브라우저 로그인 smoke test
- 실제 브라우저 환경에서 인증 게이트 UI와 로컬 Supabase 연동 검증
