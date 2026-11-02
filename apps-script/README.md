# Google Apps Script API

1. 스프레드시트에서 **확장 프로그램 → Apps Script**를 열고 `Code.gs`를 붙여 넣습니다.
2. 프로젝트 설정 → 스크립트 속성에 아래 값을 등록합니다.
   - `SPREADSHEET_ID`: 데이터 스프레드시트 ID
   - `GOOGLE_CLIENT_ID`: 웹 앱 OAuth Client ID (프런트엔드 값과 동일)
3. 웹 앱으로 배포합니다. 실행 계정은 스프레드시트 소유자, 액세스 권한은 모든 사용자로 설정합니다. `/exec` URL을 Worker 설정에 입력합니다.
4. 첫 관리자 계정은 `사용자목록` 시트에 `userId, name, email, passwordHash, role, active` 헤더와 관리자 계정 행을 입력합니다. 실제 Google 이메일, 역할 `admin`, 상태 `TRUE`를 사용합니다. 일반 사용자는 역할을 `user`로 등록합니다. 로그인은 Google OAuth 전용이며 서버가 검증한 이메일로 이 시트의 역할을 확인합니다.
5. 연도 시트의 첫 행에는 `graduationYear, studentId, name, gender, phone, address, status, company, field, detail, gpa, updatedAt`을 둡니다.

6. 관리자 재학생관리에는 `재학생` 시트를 만들고 첫 행에 다음 열을 정확히 이 순서로 둡니다. 이 시트는 연도별 졸업생 목록에서 제외됩니다.

```text
student_id, name, birth_date, gender, phone, email, affiliation, enrollment_status, notes, created_at, updated_at
```

`사용자목록`, `logs`, `counselings` 시트는 API가 필요할 때 생성합니다. `재학생` 탭은 API가 생성하지 않으므로 먼저 만들어야 합니다. `counselings`는 학생 상담 이력을 별도로 저장하며, 재학생 기록은 구분값 `재학생`으로 저장합니다. 기존 `logs` 감사 기록은 변경하지 않습니다. 재학생 및 재학생 상담 API는 관리자만 사용할 수 있고, 작성자는 서버 세션에서 결정합니다. 세션은 Apps Script 캐시에 저장됩니다.

Personal schedules use the user-created `스케줄` and `스케줄설정` tabs. Set the first row to these exact Korean headers. The API maps them to internal English field names and takes the owner ID from the authenticated session.

```text
스케줄: 일정ID, 사용자ID, 작성자명, 일정제목, 카테고리ID, 시작일시, 종료일시, 종일여부, 장소, 상세설명, 반복유형, 반복간격, 반복종료일, 등록일시, 수정일시
스케줄설정: 카테고리ID, 카테고리명, 색상코드, 사용여부, 정렬순서
```
