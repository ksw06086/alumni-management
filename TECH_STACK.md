# 프로젝트 기술 스택 및 개발 구조

## 기술 스택

| 영역 | 기술 | 역할 |
| --- | --- | --- |
| UI | React 19, JavaScript ES Modules | 화면 및 상호작용 |
| 개발·빌드 | Vite 8 | 로컬 개발 서버와 정적 번들 생성 |
| 스타일·아이콘 | 자체 CSS, Lucide React | 반응형 디자인과 아이콘 |
| 업무 API | Google Apps Script V8 | 로그인, 권한 검증, Sheets·Drive 처리 |
| 저장소 | Google Sheets, Google Drive | 학생·상담·일정·자료실 메타데이터 및 첨부파일 |
| 프록시·업로드 상태 | Cloudflare Workers, KV | 브라우저 요청 중계, CORS, 자료실 업로드 상태 |
| 웹 호스팅 | GitHub Pages | Vite 정적 빌드 배포 |
| CI/CD | GitHub Actions | Node.js 20 빌드 및 Pages 배포 |
| 테스트 | Node.js 내장 `node:test` | Apps Script/Worker 모의 테스트와 순수 로직 테스트 |

## 코드 경계

```text
src/
  main.jsx
  components/
  services/                API 통신 경계
  features/
    archive/
    auth/
    dashboard/
    graduates/
    schedule/
    students/
  shared/
apps-script/
  Code.gs
  appsscript.json
cloudflare-worker/
  src/index.js
  wrangler.toml
test/
.github/workflows/
```

- `src/main.jsx`는 React 진입점, 인증/세션, 전역 데이터와 화면 분기를 담당합니다.
- `src/features/`는 기능별 페이지와 해당 도메인 로직을 가까이 둡니다.
- `src/components/`는 복수 기능에서 사용하는 UI 컴포넌트용입니다.
- `src/shared/`는 날짜 포맷처럼 기능에 종속되지 않는 공통 유틸리티용입니다.
- `apps-script/Code.gs`는 Apps Script 웹 앱의 `doGet`/`doPost` 실행 환경에서 동작하는 단일 전역 진입 파일입니다. 별도 번들 단계 없이 배포하므로 파일 이동이나 모듈 import를 임의로 적용하지 않습니다.
- `cloudflare-worker/src/index.js`는 `wrangler.toml`이 지정하는 Worker 진입 파일입니다. 외부 요청·응답, CORS, KV, 업로드 흐름의 계약을 유지합니다.

## 개발 및 검증

Node.js 20.19 이상 또는 지원되는 최신 LTS를 권장합니다. Vite 8의 런타임 요구사항과 GitHub Actions의 Node.js 20 환경을 확인하세요.

```bash
npm install
npm run dev
npm test
npm run build
npm run preview
```

`npm test`는 `test/run.js`를 통해 기존 `node:test` 테스트 모음을 실행합니다. 빌드 명령은 `vite build --base=./`를 사용해 GitHub Pages 상대 경로 배포를 지원합니다.

## 런타임 설정

- 프런트엔드 빌드 변수: `VITE_GOOGLE_CLIENT_ID`, `VITE_API_BASE_URL`
- Apps Script Script Properties: `SPREADSHEET_ID`, `GOOGLE_CLIENT_ID` 등 기존 서버 설정
- Worker bindings/variables: `APPS_SCRIPT_URL`, `ALLOWED_ORIGINS`, `ARCHIVE_UPLOADS`

실제 Secret 값은 저장소 문서나 프런트엔드 코드에 기록하지 않습니다. 시트 이름·헤더, API 요청/응답, 사용자 권한, OAuth scope, KV binding을 변경할 때는 양쪽 런타임과 배포 설정을 함께 검토해야 합니다.
