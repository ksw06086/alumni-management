# 프로젝트 기술 스택

## 개요

졸업생 관리 웹 앱은 React 프론트엔드와 Google Apps Script API를 사용합니다. 데이터는 Google Sheets에 저장하고, Cloudflare Worker가 브라우저와 Apps Script API 사이의 요청을 중계합니다. 프론트엔드는 GitHub Pages에 배포하도록 구성되어 있습니다.

## 구성 요소

| 영역 | 기술 | 용도 |
| --- | --- | --- |
| 프론트엔드 | React, JavaScript (ES modules) | 화면 구성과 사용자 상호작용 |
| 빌드·개발 서버 | Vite | 로컬 개발 서버와 배포용 정적 파일 생성 |
| 스타일 | CSS | 반응형 레이아웃과 화면 디자인 |
| 아이콘 | Lucide React | 메뉴와 화면 아이콘 |
| API·인증 | Google Apps Script (JavaScript) | 로그인, 권한 확인, 학생·상담·일정 API |
| 데이터 저장 | Google Sheets | 사용자, 졸업생, 상담 이력, 일정 데이터 저장 |
| API 프록시 | Cloudflare Workers | Apps Script 요청 중계와 CORS 정책 적용 |
| 정적 호스팅 | GitHub Pages | 빌드된 프론트엔드 배포 |
| 자동 배포 | GitHub Actions | 저장소 변경 시 빌드 후 GitHub Pages 배포 |
| 테스트 | Node.js 내장 `node:test` | API, 프록시, 취업 통계, 달력 로직 검증 |

## 주요 디렉터리

- `src/`: React 앱, 화면 스타일, 취업 통계 및 달력 로직
- `apps-script/`: Google Apps Script API와 설정 안내
- `cloudflare-worker/`: API 프록시 Worker
- `test/`: 자동화 테스트
- `.github/workflows/`: GitHub Pages 빌드·배포 워크플로

## 자주 쓰는 명령

```bash
npm install       # 의존성 설치
npm run dev       # 로컬 개발 서버 실행
npm test          # 자동화 테스트 실행
npm run build     # 배포용 파일을 dist/에 생성
npm run preview   # 빌드 결과 미리보기
```

## 설정 참고

프론트엔드의 Google OAuth 클라이언트 ID와 API 주소는 Vite 환경변수로 전달합니다. 배포 워크플로에서는 GitHub Actions Secrets를 사용하도록 구성되어 있습니다. Apps Script의 스프레드시트 ID와 OAuth 클라이언트 ID는 Apps Script Script Properties에서 설정합니다. 실제 키와 비밀 값은 이 문서에 기록하지 않습니다.

