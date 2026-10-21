# 코드 수정부터 배포까지

이 문서는 로컬에서 코드를 수정하고 테스트한 뒤, 변경된 계층만 운영 환경에 반영하는 절차를 설명합니다.

## 1. 배포 구조와 수정 위치

```text
브라우저
  └─ GitHub Pages: React + Vite 정적 웹 앱
       └─ Cloudflare Worker: Origin/CORS 검사와 API 프록시
            └─ Google Apps Script: 인증, 권한, 업무 로직
                 └─ Google Sheets: 영구 데이터
```

| 수정 대상 | 주로 확인할 위치 | 운영 반영 방법 |
| --- | --- | --- |
| 화면, React 상태, CSS | `src/main.jsx`, `src/SchedulePage.jsx`, `src/styles.css` | GitHub Actions가 GitHub Pages에 자동 배포 |
| 취업률·달력 계산 | `src/employment.js`, `src/schedules.js` | 테스트와 빌드 후 GitHub Pages 배포 |
| API, 인증, 권한, 시트 매핑 | `apps-script/Code.gs` | Apps Script에 코드 반영 후 새 버전 배포 |
| CORS, 요청 제한, 프록시 | `cloudflare-worker/src/index.js`, `cloudflare-worker/wrangler.toml` | Cloudflare Worker 배포 |
| 시트 탭/컬럼 구조 | Google Sheets 및 `apps-script/Code.gs` 헤더 상수 | 시트와 API 코드를 함께 변경하고 실제 데이터로 확인 |

프론트엔드와 백엔드는 별도로 배포됩니다. GitHub Pages에 코드를 올려도 Apps Script나 Worker 변경이 자동 배포되지는 않습니다.

## 2. 수정 시작 전

1. 최신 코드를 받고 작업 브랜치를 확인합니다.

   ```bash
   git status
   git pull
   git switch -c fix/short-description
   ```

   이미 작업 브랜치에서 작업 중이면 새 브랜치를 만들 필요는 없습니다. 기존 수정 파일과 미추적 파일은 삭제하거나 덮어쓰지 말고, 내가 수정한 파일만 구분합니다.

2. 로컬 환경 파일을 설정합니다. `.env.example`을 참고해 `.env.local`을 만들고 다음 값을 설정합니다.

   ```text
   VITE_GOOGLE_CLIENT_ID=Google_OAuth_클라이언트_ID
   VITE_API_BASE_URL=로컬_또는_배포된_Cloudflare_Worker_URL
   ```

   `.env.local`, 비밀번호, 토큰, 서비스 계정 키를 Git에 추가하지 않습니다. 저장소의 GitHub Actions에는 `VITE_GOOGLE_CLIENT_ID`, `VITE_API_BASE_URL`을 Repository Secrets로 등록합니다.

3. 의존성과 로컬 서버를 준비합니다.

   ```bash
   npm ci
   npm run dev
   ```

   개발 서버가 출력한 주소(기본값 `http://localhost:5173`)로 접속합니다. 로컬 API를 호출한다면 Worker의 `ALLOWED_ORIGINS`에도 이 Origin이 포함되어야 합니다.

## 3. 수정 및 로컬 검증

1. 동작 책임을 가진 계층에서 수정합니다. 예를 들어 취업률 계산 기준은 화면 컴포넌트 안에 중복 구현하지 말고 `src/employment.js`와 `apps-script/Code.gs`의 관련 기준을 함께 확인합니다.
2. API 요청·응답 형태, 시트 컬럼 순서, 권한 검증을 변경했다면 프론트엔드와 Apps Script 양쪽의 데이터 계약을 맞춥니다.
3. 기존 자동 검증을 실행합니다.

   ```bash
   npm test
   npm run build
   git diff --check
   ```

4. 브라우저에서 변경한 흐름을 확인합니다. 신규·수정·삭제 기능은 테스트 데이터로 확인하고, 실제 학생 데이터를 임의로 수정하거나 삭제하지 않습니다.
5. 최종 변경 범위를 확인합니다.

   ```bash
   git status --short
   git diff --stat
   git diff
   ```

   환경 파일, 빌드 결과 `dist/`, 이미지 등 이번 작업과 무관한 파일이 커밋 대상에 들어가지 않도록 확인합니다.

## 4. 배포 순서

변경한 구성 요소만 아래 절차로 배포합니다. API 주소가 새로 바뀌는 경우에는 순서가 중요합니다.

### A. Apps Script API 변경

1. `apps-script/Code.gs` 변경분을 Apps Script 편집기에 반영합니다.
2. **프로젝트 설정 > 스크립트 속성**에서 `SPREADSHEET_ID`, `GOOGLE_CLIENT_ID`가 기존 값으로 유지되는지 확인합니다.
3. **배포 > 배포 관리**에서 웹 앱 배포를 수정하고 새 버전을 선택해 배포합니다. 실행 계정과 접근 권한은 현재 앱 정책을 유지합니다.
4. 배포된 `/exec` URL을 확인합니다.
5. 배포 URL이 바뀌었다면 Worker의 `APPS_SCRIPT_URL`을 새 `/exec` URL로 바꾸고, 아래 Worker 배포도 수행합니다. URL이 유지됐다면 Worker를 다시 배포할 필요는 없습니다.
6. 로그인, 학생 조회, 변경한 API를 확인합니다.

### B. Cloudflare Worker 변경

1. `cloudflare-worker/wrangler.toml` 또는 Cloudflare 대시보드의 환경 변수를 확인합니다.
   - `APPS_SCRIPT_URL`: 배포된 Apps Script `/exec` URL
   - `ALLOWED_ORIGINS`: `https://ksw06086.github.io` 등 허용할 Origin 목록. 로컬 개발이 필요하면 `http://localhost:5173`도 포함합니다.
2. Cloudflare 계정 인증이 아직 안 되어 있다면 Wrangler 로그인을 먼저 완료합니다.
3. 프로젝트 루트에서 Worker를 배포합니다.

   ```bash
   cd cloudflare-worker
   npx wrangler deploy
   ```

4. 배포된 Worker URL을 확인하고 브라우저에서 로그인/API 요청이 전달되는지 확인합니다.

### C. React 프론트엔드 / GitHub Pages 변경

1. GitHub 저장소 **Settings > Secrets and variables > Actions**에서 다음 Secrets를 확인합니다.
   - `VITE_GOOGLE_CLIENT_ID`: 프론트엔드 OAuth 클라이언트 ID
   - `VITE_API_BASE_URL`: 배포된 Cloudflare Worker URL
2. 로컬 `npm test`와 `npm run build`가 통과한 변경만 커밋합니다.
3. 작업 브랜치를 원격에 push하고 Pull Request 검토를 거친 뒤 `main` 또는 `master`에 반영합니다. 저장소 정책상 직접 push하는 경우에도 먼저 브랜치와 변경 파일을 확인합니다.

   ```bash
   git add <수정한-파일>
   git commit -m "변경 내용 요약"
   git push origin <브랜치명>
   ```

4. `.github/workflows/deploy-pages.yml`의 **Build and deploy GitHub Pages** 실행 결과를 확인합니다. 이 workflow는 `main`/`master` push 또는 `workflow_dispatch`로 실행됩니다.
5. Actions가 성공하면 Pages 사이트를 열어 로그인, 메뉴 이동, 변경한 기능을 확인합니다. 프론트엔드 환경변수는 빌드 시 주입되므로 Secrets를 바꿨다면 새 workflow 실행이 필요합니다.

## 5. 변경 종류별 최소 배포

| 변경 내용 | 필요한 배포 |
| --- | --- |
| React/CSS/계산 로직만 변경 | GitHub Pages |
| Apps Script API 로직만 변경, `/exec` URL 유지 | Apps Script |
| Worker 로직 또는 Worker 환경 설정 변경 | Cloudflare Worker |
| Apps Script 배포 URL 변경 | Worker의 `APPS_SCRIPT_URL` 갱신 및 Worker 배포. 프론트엔드가 Worker URL을 그대로 쓰면 Pages 배포는 불필요 |
| 시트 컬럼 변경 | Google Sheets 구조와 Apps Script 헤더/매핑을 맞춰 반영하고 실제 API 검증. 클라이언트 데이터 형식도 바뀌면 Pages도 배포 |
| OAuth 클라이언트 ID 또는 Pages Origin 변경 | Google Cloud Console 허용 Origin과 필요한 GitHub Actions Secret을 갱신하고 Pages 재빌드. Worker Origin 정책도 함께 확인 |

## 6. 배포 후 확인

- GitHub Actions 배포 작업이 성공했는지 확인합니다.
- 배포된 웹사이트에서 로그인이 되고 올바른 Worker URL로 요청하는지 확인합니다.
- 학생 조회·등록·수정 또는 변경한 API를 확인합니다.
- 일정 기능을 수정했다면 카테고리 조회, 일정 조회, 저장·수정·삭제와 새로고침 후 데이터 유지 여부를 테스트합니다.
- 권한이 바뀐 변경이라면 일반 사용자와 관리자 계정으로 각각 확인합니다.
- 문제가 있으면 브라우저 개발자 도구의 Network/Console, Worker 로그, Apps Script 실행 기록을 순서대로 확인합니다.

## 7. 롤백

- **GitHub Pages:** 마지막 정상 커밋으로 되돌리는 변경을 만들어 `main`/`master`에 반영하면 workflow가 다시 배포합니다.
- **Apps Script:** 배포 관리에서 이전 정상 버전으로 웹 앱 배포를 되돌립니다. Apps Script 코드 편집기의 현재 저장본과 배포 버전은 다를 수 있으므로 배포된 버전을 확인합니다.
- **Cloudflare Worker:** 마지막 정상 코드/설정으로 되돌려 `npx wrangler deploy`를 다시 실행합니다.
- **Google Sheets 구조:** 컬럼 삭제·이동 전 백업합니다. 기존 데이터를 복구해야 하는 경우 백업본으로 복원하고 대응하는 API 코드도 함께 맞춥니다.

배포는 웹 코드 외부의 Google·Cloudflare 설정과 실제 스프레드시트에 영향을 줄 수 있습니다. 변경 전 현재 배포 URL과 설정 값을 안전하게 기록하되, 비밀 값은 문서나 Git에 남기지 않습니다.
