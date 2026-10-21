# 졸업생관리프로그램

컴퓨터소프트웨어공학과 졸업생 현황을 Google Sheets에 저장하고 웹에서 관리하는 React + Google Apps Script 앱입니다. 프런트엔드는 GitHub Pages, API 중계는 Cloudflare Worker를 사용합니다.

## 기능

- 관리자 등록 계정 기반 Google OAuth 및 아이디 로그인
- 연도별 졸업생 조회, 검색, 상태 필터, 등록, 수정, 삭제
- 학생별 상담 기록 작성, 조회, 수정, 삭제 (작성자와 등록·수정일 기록)
- 개인 일정 월간 달력, 카테고리 필터, 반복 일정과 일정별 CRUD
- 대시보드 취업 현황 원형 그래프와 연도별 취업률 집계
- 연도별 학생 수 통계 및 CSV 내보내기
- 관리자 전용 계정 관리와 기존 감사 로그 보존
- 세션 만료, 로그아웃 시 토큰 폐기, 역할 및 입력값 검증
- 같은 탭 새로고침 시 세션 복원 (탭을 닫으면 브라우저 세션 저장소가 정리됨)
- 모바일 반응형 화면

## 로컬 실행

1. `.env.example`을 `.env.local`로 복사한 다음 `VITE_GOOGLE_CLIENT_ID`와 `VITE_API_BASE_URL`을 채웁니다.
2. `.env.local`의 Google OAuth Client ID와 `apps-script`의 `GOOGLE_CLIENT_ID` 스크립트 속성에 같은 값을 사용합니다.
3. `npm install` 후 `npm run dev`로 실행합니다.

앱은 Google Sheets를 브라우저에서 직접 호출하지 않습니다. 스프레드시트 ID는 Apps Script의 `SPREADSHEET_ID` 스크립트 속성에만 설정합니다.

## Google Sheets 초기 설정

1. 사용할 스프레드시트에서 **확장 프로그램 → Apps Script**를 열고 `apps-script/Code.gs`를 붙여 넣습니다.
2. Apps Script **프로젝트 설정 → 스크립트 속성**에 `SPREADSHEET_ID`, `GOOGLE_CLIENT_ID`를 등록합니다.
3. 웹 앱으로 배포하고 실행 계정은 스프레드시트 소유자, 액세스 권한은 모든 사용자로 설정합니다. API 접근은 앱 세션으로 통제하므로 사용자 시트와 스프레드시트 자체는 외부에 공유하지 않습니다.
4. Google 로그인으로 사용할 계정을 첫 관리자로 등록하려면 `사용자목록` 시트를 만들고 1행에 아래 헤더를 둡니다. 첫 행의 사용자는 본인이 지정한 이메일, `admin`, `TRUE`를 사용합니다. 비밀번호 로그인도 쓸 경우 `hashPasswordForSetup()`을 실행해 만든 PBKDF2 해시를 `passwordHash`에 입력합니다. 아이디 로그인 비밀번호는 10자 이상을 권장합니다.

```text
userId, name, email, passwordHash, role, active
```

5. 졸업연도별 시트를 만들고 1행에 아래 헤더를 입력합니다. 이름은 연도(예: `2025`)로 지정합니다. `사용자목록`, `logs`, `counselings` 이외의 시트가 연도 데이터 시트로 취급됩니다.

```text
graduationYear, studentId, name, gender, phone, address, status, company, field, detail, gpa, updatedAt
```

상태 선택지는 `취업자`, `진학자`, `미취업자`, `군입대자`, `기타`입니다. 취업률은 선택된 연도 시트에서 취업자를 분자로, 전체 학생에서 진학자와 군입대자를 제외한 인원을 분모로 계산합니다. 기존 데이터의 `국비교육자`, `조사자`·`미조사자`, 빈 상태와 알 수 없는 값은 삭제하지 않고 그래프에서 `기타·미분류`로 집계하며 취업자로 간주하지 않습니다. 사용자 목록, 감사 로그, 상담 기록 시트는 앱이 필요할 때 생성합니다.

Personal schedules use the `스케줄` and `스케줄설정` tabs. Ownership is checked against the authenticated session, and recurrence is stored as type, interval, and end date. Use these exact headers:

```text
일정ID, 사용자ID, 작성자명, 일정제목, 카테고리ID, 시작일시, 종료일시, 종일여부, 장소, 상세설명, 반복유형, 반복간격, 반복종료일, 등록일시, 수정일시
```

The `스케줄설정` tab uses this header: `카테고리ID, 카테고리명, 색상코드, 사용여부, 정렬순서`. Birthday categories are not included.
## Cloudflare Worker 설정

1. `cloudflare-worker/wrangler.toml`의 `APPS_SCRIPT_URL`을 Apps Script 배포 URL(`/exec`)로 변경합니다.
2. `ALLOWED_ORIGINS`에 실제 GitHub Pages Origin을 쉼표로 구분해 입력합니다. 이 값에는 저장소 경로를 붙이지 않습니다. 이 저장소의 기본 Pages Origin은 `https://ksw06086.github.io`입니다. 개발 주소가 필요하면 `http://localhost:5173`도 추가합니다.
3. `cd cloudflare-worker` 후 `npx wrangler deploy`로 배포합니다. 로컬 실행은 `npx wrangler dev`를 사용합니다.

Worker는 등록한 Origin의 POST JSON 요청만 중계합니다. 토큰·학생 데이터가 캐시되지 않도록 응답에 `Cache-Control: no-store`를 설정합니다.

## GitHub Pages 배포

저장소의 **Settings → Secrets and variables → Actions**에 다음 저장소 시크릿을 등록합니다.

| 이름 | 값 |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth 웹 클라이언트 ID |
| `VITE_API_BASE_URL` | 배포한 Cloudflare Worker URL |

`main` 브랜치에 push하면 `.github/workflows/deploy-pages.yml`에서 빌드하고 Pages에 배포합니다. Google Cloud Console OAuth 설정의 승인된 JavaScript 원본에는 로컬 주소와 Pages 사이트 Origin을 등록합니다.

## 사용자 권한

- 일반 사용자: 학생 조회·등록·수정·삭제와 연도별 집계를 사용할 수 있습니다.
- 관리자: 위 기능, 작업 기록 열람, 계정 등록·수정·비활성화를 사용할 수 있습니다.
- 계정 비활성화 또는 역할 변경은 기존 로그인 세션에도 다음 요청부터 적용됩니다.

Apps Script 캐시 기반 세션은 최대 6시간 유지되며 활동 중 연장됩니다. 개인 정보가 포함된 CSV는 내려받는 사용자 단말에 남으므로 필요한 사용자만 사용하고 안전하게 관리하세요.

## 자동 테스트

`npm test`는 Apps Script와 Cloudflare Worker 동작을 모의 환경에서 검증합니다. Google 계정 및 실제 배포 연결은 테스트용 스프레드시트와 Worker로 수동 확인해야 합니다. `npm run build`로 Pages용 빌드도 확인할 수 있습니다.
