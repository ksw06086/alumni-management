# Google Sheets · Worker · GitHub Pages 설정

## 1. Apps Script

- `apps-script/Code.gs` 내용을 Apps Script 편집기에 복사합니다.
- 프로젝트 설정의 스크립트 속성에 `SPREADSHEET_ID`와 `GOOGLE_CLIENT_ID`를 등록합니다.
- 웹 앱으로 배포합니다. 실행 계정은 스프레드시트 소유자, 액세스 권한은 모든 사용자로 선택합니다.
- `GOOGLE_CLIENT_ID`는 프런트엔드 OAuth 클라이언트 ID와 동일해야 합니다.
- 아이디 로그인 해시는 `hashPasswordForSetup()`으로 PBKDF2 형식으로 생성합니다. 이전 SHA-256 해시는 로그인에 성공하면 자동으로 새 형식으로 전환됩니다.
- `사용자목록` 첫 행: `userId, name, email, passwordHash, role, active`. 최초 관리자 계정을 직접 추가하세요.
- 연도 시트 첫 행: `graduationYear, studentId, name, gender, phone, address, status, company, field, detail, gpa, updatedAt`.

## 2. Cloudflare Worker

- `cloudflare-worker/wrangler.toml`의 `APPS_SCRIPT_URL`을 실제 `/exec` 배포 URL로 설정합니다.
- `ALLOWED_ORIGINS`를 GitHub Pages Origin으로 바꿉니다. Origin에는 경로를 포함하지 않습니다. 예: `https://example.github.io`.
- 로컬 개발도 허용할 경우 `http://localhost:5173`을 쉼표로 추가합니다.
- `cloudflare-worker`에서 `npx wrangler deploy`를 실행하고 Worker URL을 기록합니다.

## 3. GitHub Pages

저장소 **Settings → Secrets and variables → Actions → New repository secret**에서 등록합니다.

- `VITE_GOOGLE_CLIENT_ID`: OAuth 웹 클라이언트 ID
- `VITE_API_BASE_URL`: 배포된 Cloudflare Worker URL

저장소 **Settings → Pages**에서 Build and deployment source를 **GitHub Actions**로 설정합니다. 이후 `main` 또는 `master`에 push하거나 Actions의 `workflow_dispatch`로 실행할 수 있습니다.

Google Cloud Console의 승인된 JavaScript 원본에 Pages Origin 및 `http://localhost:5173`을 등록합니다. 스프레드시트 ID는 프런트엔드 시크릿이 아니라 Apps Script 스크립트 속성에 둡니다.
