# Google Apps Script API

## 자료실 Google Drive 설정

자료실 파일은 **현재 Apps Script 웹 앱 배포 계정** 소유의 비공개 Drive 폴더에 저장합니다. 파일 본문은 8 MiB 단위로 Cloudflare Worker에서 Google Drive resumable upload로 전달하며, 다운로드는 로그인 세션을 확인한 Worker가 Drive에서 스트리밍합니다. 브라우저에는 장기 OAuth 토큰을 보내지 않습니다.

1. Apps Script 편집기에서 **프로젝트 설정 → `appsscript.json` 매니페스트 파일 표시**를 켭니다.
2. 이 폴더의 `appsscript.json`에 있는 OAuth scope를 Apps Script 프로젝트 매니페스트에 반영합니다. 기존 매니페스트가 있다면 기존 설정을 보존하면서 `oauthScopes` 3개를 추가합니다.
3. Apps Script를 저장하고, `Code.gs`와 매니페스트 변경으로 새 배포 버전을 만듭니다. 배포 계정이 Drive 접근 권한을 요청하면 승인합니다.
4. 연결된 Google Cloud 프로젝트에서 **Google Drive API**를 활성화합니다.
5. Apps Script **프로젝트 설정 → 스크립트 속성**에 `ARCHIVE_BRIDGE_SECRET`을 등록합니다. 충분히 길고 임의인 값(최소 32자)을 사용합니다. 같은 값을 Cloudflare Worker Secret에도 등록합니다. 그 값은 코드나 채팅에 넣지 않습니다.
6. Worker 폴더에서 `npx wrangler kv namespace create ARCHIVE_UPLOADS`를 실행합니다. 반환된 Namespace ID를 `cloudflare-worker/wrangler.toml`의 KV binding 설정에 넣고 주석을 해제합니다.
7. Worker 폴더에서 `npx wrangler secret put ARCHIVE_BRIDGE_SECRET`을 실행하고 Apps Script 스크립트 속성과 동일한 값을 입력합니다.
8. 기존 Apps Script URL과 허용 Origin 설정은 유지하고 `npx wrangler deploy`로 Worker를 재배포합니다. KV는 업로드 세션 URI와 5분 만료 다운로드 티켓을 저장하며, Google access token은 보관하지 않습니다.

Drive 업로드 세션은 서버가 만들고 Worker가 KV에 보관합니다. 앱 관리자가 선택한 파일은 브라우저에서 8 MiB 조각으로 Worker에 보내며, Worker가 각 조각을 Google Drive로 전달합니다. 비동영상 업로드 합계는 200,000,000 bytes, 동영상 업로드 합계는 500,000,000 bytes입니다. 게시글과 첨부 메타데이터는 `archive_posts`, `archive_files` 시트에 저장됩니다.

1. 스프레드시트에서 **확장 프로그램 → Apps Script**를 열고 `Code.gs`를 붙여 넣습니다.
2. 프로젝트 설정 → 스크립트 속성에 아래 값을 등록합니다.
   - `SPREADSHEET_ID`: 데이터 스프레드시트 ID
   - `GOOGLE_CLIENT_ID`: 웹 앱 OAuth Client ID (프런트엔드 값과 동일)
3. 웹 앱으로 배포합니다. 실행 계정은 스프레드시트 소유자, 액세스 권한은 모든 사용자로 설정합니다. `/exec` URL을 Worker 설정에 입력합니다.
4. 첫 관리자 계정은 `사용자목록` 시트에 `userId, name, email, passwordHash, role, active` 헤더와 관리자 계정 행을 입력합니다. 실제 Google 이메일, 역할 `admin`, 상태 `TRUE`를 사용합니다. 일반 사용자는 역할을 `user`로 등록합니다. 로그인은 Google OAuth 전용이며 서버가 검증한 이메일로 이 시트의 역할을 확인합니다.
5. 졸업생 데이터는 이름이 4자리 연도인 시트에 저장합니다. 재학생 전환 시 서버가 Asia/Seoul 기준 현재 연도를 정하고, 학번 중복을 모든 연도에서 검사합니다. 현재 연도 시트가 없으면 가장 최근 연도 시트를 복제해 내용만 비운 뒤 헤더·서식·유효성 검사를 유지합니다. 연도 시트가 하나도 없으면 코드의 `DATA_HEADERS` 표준 헤더로 생성합니다. 전환 상태는 `미취업자`로 저장됩니다. 일반 학생 추가/수정은 기존 시트를 대상으로만 동작합니다.

6. 관리자 재학생관리에는 `재학생` 시트를 만들고 첫 행에 다음 열을 정확히 이 순서로 둡니다. 이 시트는 연도별 졸업생 목록에서 제외됩니다.

```text
student_id, name, birth_date, gender, phone, email, affiliation, enrollment_status, notes, created_at, updated_at
```

`사용자목록`, `logs`, `counselings`, `student_transfers` 시트는 API가 필요할 때 생성합니다. `student_transfers`는 전환 단계와 실패 복구 상태를 기록하는 내부 장부이며 졸업생 데이터 시트가 아닙니다. 별도의 `졸업생전환` 시트는 생성하지 않습니다. `재학생` 탭은 API가 생성하지 않으므로 먼저 만들어야 합니다. `counselings`는 학생 상담 이력을 별도로 저장하며, 재학생 기록은 구분값 `재학생`으로 저장합니다. 졸업생 전환 시 기존 학생 ID를 유지하고 상담의 연도 참조를 대상 졸업 연도로 변경합니다. 졸업생 시트에 전용 컬럼이 없는 생년월일, 이메일, 소속, 재학 상태, 참고사항 및 등록·수정 시각은 졸업생 `detail` 필드에 항목별로 보존합니다. 기존 `logs` 감사 기록은 변경하지 않습니다. 재학생·전환·재학생 상담 API는 관리자만 사용할 수 있고, 작성자는 서버 세션에서 결정합니다. 세션은 Apps Script 캐시에 저장됩니다.

Personal schedules use the user-created `스케줄` and `스케줄설정` tabs. Set the first row to these exact Korean headers. The API maps them to internal English field names and takes the owner ID from the authenticated session.

```text
스케줄: 일정ID, 사용자ID, 작성자명, 일정제목, 카테고리ID, 시작일시, 종료일시, 종일여부, 장소, 상세설명, 반복유형, 반복간격, 반복종료일, 등록일시, 수정일시
스케줄설정: 카테고리ID, 카테고리명, 색상코드, 사용여부, 정렬순서
```
