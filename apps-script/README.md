# Google Apps Script API

1. 스프레드시트에서 **확장 프로그램 → Apps Script**를 열고 `Code.gs`를 붙여 넣습니다.
2. 프로젝트 설정 → 스크립트 속성에 아래 값을 등록합니다.
   - `SPREADSHEET_ID`: 데이터 스프레드시트 ID
   - `GOOGLE_CLIENT_ID`: 웹 앱 OAuth Client ID (프런트엔드 값과 동일)
3. 웹 앱으로 배포합니다. 실행 계정은 스프레드시트 소유자, 액세스 권한은 모든 사용자로 설정합니다. `/exec` URL을 Worker 설정에 입력합니다.
4. 첫 관리자 계정은 `사용자목록` 시트 첫 행에 `userId, name, email, passwordHash, role, active` 헤더를 추가해 직접 입력합니다. 역할은 `admin`, 상태는 `TRUE`입니다. 아이디 로그인 비밀번호는 10자 이상으로 설정하고 `hashPasswordForSetup()`이 출력하는 PBKDF2 해시를 입력합니다.
5. 연도 시트의 첫 행에는 `graduationYear, studentId, name, gender, phone, address, status, company, field, detail, gpa, updatedAt`을 둡니다.

`사용자목록`과 `logs` 시트는 API가 필요할 때 생성합니다. 관리자만 계정 및 로그 API를 사용할 수 있고, 세션은 Apps Script 캐시에 저장됩니다.
