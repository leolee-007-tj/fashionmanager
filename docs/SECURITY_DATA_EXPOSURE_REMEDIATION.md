# 데이터 노출 보안 사고 조치 보고서

**문서 작성일**: 2026-07-10
**최종 업데이트**: 2026-07-10 (GitHub cached data 제거 요청 준비)
**사고 유형**: 공개 GitHub 저장소에 운영 데이터 및 고객 식별정보 노출
**조치 상태**: **진행 중**
- ✅ 기록 재작성 완료 (git filter-repo)
- ✅ 원격 force push 완료 (main, gh-pages, feature, tags)
- ✅ 현재 브랜치/태그 파일 제거 완료
- ⚠️ 과거 SHA 직접 접근 잔존 (GitHub cached views / dangling objects)
- ⏳ GitHub Support 서버 purge 요청 필요
- 최종 해결: 진행 중 (GitHub Support 처리 후 완료)

---

## 1. 발견 개요

### 발견 파일
- 경로: `data_export.json` (저장소 루트)
- 최초 발견: 2026-07-10 (1단계 코드 분석 중)
- Git 추적 상태: 발견 당시 추적 중

### 포함됐던 데이터 유형
- **상품 데이터**: 약 3,032건 (상품명, 브랜드, 원가, 판매가, 재고 등)
- **주문 데이터**: 약 682건 (판매가, 수익, 고객 연결 정보 등)
- **고객 데이터**: 약 132건 (고객명)
- **경비 데이터**: 약 2건
- **분류 키워드**: 약 160건
- **설정 데이터**: 환율, 가격 계산 설정 등

> **참고**: 고객 데이터 중 전화번호, 이메일, 주소, 위챗닉네임 등은 포함되지 않은 것으로 확인됨. 고객명만 노출됨.

### 공개 노출 가능 기간
- 파일이 추가된 커밋: `9cf0a0d` (구매데이터 업로드 cost 오류 수정 확인)
- 대략적인 노출 기간: 해당 커밋 시점 ~ 2026-07-10 조치 시점
- 노출 범위: 공개 GitHub 저장소 (leolee-007-tj/fashionmanager)

---

## 2. 조치 내용

### 2.1 안전 백업
Git 기록 변경 전에 로컬에 mirror 백업을 생성했습니다.
- 백업 경로: `/Users/lesoul888/Documents/fashionmanager-security-backup-20260710.git`
- 백업 형식: `git clone --mirror` (전체 기록 + 모든 브랜치 + 태그)
- **주의**: 이 백업에는 실제 운영 데이터와 고객명이 포함되어 있으므로 절대 외부 공유 금지.

### 2.2 .gitignore 수정
`.gitignore`에 다음 항목을 추가하여 향후 유사 사고를 예방합니다:
```
# Private operational data exports
data_export.json
data_export*.json
data-export*.json
exports/
private-data/
*.sqlite
*.db
```

### 2.3 Git 전체 기록에서 제거
`git filter-repo`를 사용하여 모든 브랜치와 태그의 전체 Git 기록에서 `data_export.json`을 제거했습니다.
- 사용 도구: `git filter-repo --path data_export.json --invert-paths --force`
- 재작성된 커밋 수: 55개
- 대상: main, gh-pages, feature/supabase-cloud-migration 브랜치 및 모든 태그

### 2.4 기록 재작성 전후 SHA

| 브랜치/태그 | 재작성 전 SHA | 재작성 후 SHA |
|---|---|---|
| main | `9890548489b8ad236a6924c3748e3b3daba4826d` | `489e0e8c17f00595f91bc8a91a3381159b400274` |
| gh-pages | `9890548489b8ad236a6924c3748e3b3daba4826d` | `489e0e8c17f00595f91bc8a91a3381159b400274` |
| feature/supabase-cloud-migration | `93b46569b4c01596a92738df660b16ceef6f26ae` | `4bdd61e2bed0f379ad4d6d094dff097aa363eb83` |
| backup/pre-supabase-20260710 | `8159c36b5b358c9f6832cde60d6e8ec7fb9a68a3` | `92edcd00932e3f20b5ffd94d4d9e248f544551c3` |

---

## 3. 검증

### 수행한 검증 명령
```bash
# 1. 전체 기록에서 파일 존재 여부
git log --all -- data_export.json
# 결과: 0건 (통과)

# 2. 전체 Git 객체에서 파일 경로 검색
git rev-list --objects --all | grep -F "data_export.json"
# 결과: 0 matches (통과)

# 3. 각 브랜치 현재 트리 확인
git show main:data_export.json          # 없음
git show gh-pages:data_export.json      # 없음
git show feature/...:data_export.json   # 없음

# 4. 태그 트리 확인
git show backup/pre-supabase-20260710:data_export.json  # 없음

# 5. 앱 코드 파일 보존 확인
# index.html, js/db.js, js/app.js, css/style.css, 4개 분석 문서 모두 보존 확인
```

### 검증 결과
- ✅ 현재 트리 제거 완료 (모든 브랜치)
- ✅ Git history 정리 완료 (전체 기록, 55개 커밋 재작성)
- ✅ 태그 기록 제거 완료
- ✅ 애플리케이션 코드 파일 보존
- ✅ 1단계 분석 문서 4개 보존
- ✅ .gitignore에 정확한 패턴 추가
- ⚠️ 과거 SHA 직접 접근 잔존 (GitHub API로 200 OK 응답 확인 - cached views / dangling objects)

### 과거 SHA 직접 접근 현황
- **대상 커밋**: `9cf0a0d4be3714a35a0d0a5238a58562b1d1d117` (파일이 최초 추가된 커밋)
- **현재 상태**: GitHub API로 직접 접근 시 여전히 200 OK 응답
- **원인**: GitHub 서버의 cached views 및 dangling object가 아직 GC되지 않음
- **대응**: GitHub Support에 purge 요청 필요 (docs/GITHUB_SUPPORT_DATA_PURGE_REQUEST.md 참고)

---

## 4. 추가 발견 사항

### 추가 민감 파일 검사 결과
전체 저장소에 대해 다음 패턴을 검사했습니다:
- 이메일 주소: 0건 (data_export.json 제외)
- 한국 전화번호: `js/excel.js`의 템플릿 샘플 데이터 (실제 운영 데이터 아님)
- API key / secret / password: `.gitignore`의 주석 문자열 (실제 값 아님)
- SQLite / DB 파일: 0건
- CSV / XLSX 파일: 0건 (Git 추적 대상 중)

**결론**: `data_export.json` 외에 추가적인 민감 운영 데이터 파일은 발견되지 않았습니다.

---

## 5. 향후 관리 원칙

### 데이터 export 파일 보관 원칙
1. **절대 공개 저장소에 커밋하지 않음**: 운영 데이터가 담긴 모든 export 파일은 .gitignore로 관리
2. **로컬 또는 안전한 개인 저장소에 보관**: 민감 데이터는 로컬 머신 또는 접근 제한된 개인 저장소에만 보관
3. **공유 시 암호화**: 데이터를 다른 사람과 공유할 때는 암호화 후 전달
4. **최소 데이터 원칙**: 테스트나 개발용으로는 샘플/더미 데이터 사용

### 외부 캐시 잔존 가능성
- GitHub 자체 캐시나 검색 엔진(Google 등)에 과거 버전이 남아있을 수 있습니다.
- GitHub Pages CDN 캐시에도 잠시 남아있을 수 있습니다.
- 시간이 지나면 자동으로 갱신되지만, 즉시 제거가 필요한 경우 GitHub Support 또는 각 검색 엔진에 캐시 제거 요청이 필요합니다.

### 기존 clone 사용자 안내
Git 기록이 재작성되었으므로 이 저장소를 기존에 clone한 사용자는 다음과 같이 재설정해야 합니다:
```bash
# 방법 1: 새로 clone (권장)
git clone https://github.com/leolee-007-tj/fashionmanager.git

# 방법 2: 기존 clone에서 리셋
git fetch origin
git reset --hard origin/main  # 또는 해당 브랜치
```

기존 로컬 브랜치를 그대로 사용하면 이전 기록과 새 기록이 섞일 수 있으므로 주의가 필요합니다.

---

## 6. 관련 문서
- `docs/RISK_ANALYSIS.md` - 위험 분석 (3.1 data_export.json 노출 위험 항목)
- `docs/BASELINE_STATUS.md` - 0단계 기준 상태 문서
- `docs/GITHUB_SUPPORT_DATA_PURGE_REQUEST.md` - GitHub Support purge 요청 템플릿 및 제출 절차

---

## 7. 추가 보호 조치 (권장)

### 7.1 기존 clone 사용자 안내
- Git 기록이 재작성됐으므로 이 저장소를 기존에 clone한 사용자는 재-clone 필요
- 기존 clone에서 오염된 커밋을 재-push하지 않도록 주의
- 권장: `git fetch origin && git reset --hard origin/브랜치명` 또는 새로 clone

### 7.2 mirror 백업 관리
- mirror 백업에는 실제 운영 데이터가 포함되어 있으므로 접근 제한 필요
- 로컬 안전한 위치에만 보관, 외부 공유 절대 금지
- 장기 보관 여부: Supabase 마이그레이션 완료 및 데이터 검증 후 삭제 고려

### 7.3 향후 예방 조치
1. **테스트 데이터는 더미 데이터만 사용**: 공개 저장소에는 절대 실제 운영 데이터를 포함하지 않음
2. **export 파일 pre-commit 차단**: pre-commit hook 또는 gitleaks 등 도구 도입 권장
3. **저장소 private 전환 고려**: 운영 데이터 관련 작업은 private 저장소에서 진행
4. **정기 보안 스캔**: gitleaks, truffleHog 등 도구로 주기적으로 민감 정보 스캔
5. **코드 리뷰 시 데이터 파일 포함 여부 확인**: PR 리뷰 시 .json, .xlsx, .csv 등 데이터 파일 포함 여부 체크

### 7.4 Support 처리 후 재검증 항목
GitHub Support에서 처리 완료 통보 후 다음을 확인:
- [ ] 과거 커밋 URL 접근 시 404 반환
- [ ] 과거 파일 blob URL 접근 시 404 반환
- [ ] GitHub API로 과거 SHA 접근 시 404 반환
- [ ] GitHub 저장소 내 검색에서 data_export.json 검색 결과 없음
- [ ] 구글 등 외부 검색 엔진 캐시 확인 (필요시 별도 제거 요청)

### 7.5 3-5R: Remote Supabase Deployment Readiness Audit — 안전 주의사항 (2026-07-21)

이 단계에서는 실제 원격 Supabase 연결을 하지 않는다.

#### GitHub Purge Ticket 닫히기 전 주의사항
- **main/gh-pages force push 금지**: GitHub Support가 purge를 완료하기 전에 force push를 하면 dangling objects가 새로 생성되어 cached data 제거가 무의미해질 수 있음
- **git filter-repo 재실행 금지**: 기록 재작성 시 dangling objects가 증가하여 purge 대상이 늘어남
- **stale clone/backups 사용 금지**: 기존 clone에 포함된 과거 SHA로 작업하지 않음
- **data_export.json 재추가 금지**: 운영 데이터가 다시 노출될 위험

#### Remote Deployment 준비 상태
- **remote guardrail flag 준비 완료**: `PRODUCTS_SUPABASE_REMOTE_ENABLED` 기본값 `false`로 설정
- **deployment runbook 작성 완료**: `docs/SUPABASE_REMOTE_DEPLOYMENT_RUNBOOK.md`에 배포 전 checklist, stop criteria, rollback 기준 작성
- **readiness contract 테스트 완료**: `tests/remote-deployment-readiness-contract.test.mjs` 20/20 PASS
- **실제 원격 Supabase 연결**: ❌ 하지 않음
- **supabase login/link/db push**: ❌ 실행하지 않음

#### Remote Deployment 시 추가 안전 조치
1. **dummy data only**: 실제 배포 전 smoke 테스트는 dummy user/store/product만 사용
2. **service_role key 브라우저에 노출 금지**: 브라우저 config에는 anon/publishable key만 사용
3. **token/session/key console.log 금지**: 개발 중 console에 credentials 노출 방지
4. **RLS/RPC 권한 검증**: remote DB에 migration 적용 후 RLS 정책과 RPC 권한이 제대로 설정되었는지 확인
