# 데이터 노출 보안 사고 조치 보고서

**문서 작성일**: 2026-07-10
**사고 유형**: 공개 GitHub 저장소에 운영 데이터 및 고객 식별정보 노출
**조치 상태**: 기록 정리 완료, 원격 반영 예정

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
- ✅ Git history 정리 완료 (전체 기록)
- ✅ 태그 기록 제거 완료
- ✅ 애플리케이션 코드 파일 보존
- ✅ 1단계 분석 문서 4개 보존
- ✅ .gitignore에 정확한 패턴 추가

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
- `docs/RISK_ANALYSIS.md` - 위험 분석 (3.1 data_export.json 노출 위험 항목에 해결 상태 추가)
- `docs/BASELINE_STATUS.md` - 0단계 기준 상태 문서
