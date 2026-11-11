export const EMPLOYMENT_CATEGORIES = [
  { label: '취업자', color: '#1e3a6e' },
  { label: '미취업자', color: '#e27866' },
  { label: '진학자', color: '#56a886' },
  { label: '군입대자', color: '#9b83c5' },
  { label: '기타·미분류', color: '#d3d9e2' },
];

// 입력 데이터는 졸업 연도 시트의 학생 목록입니다. 이 함수는 차트와 취업률에 필요한 집계만 반환합니다.
export function getEmploymentSummary(students = []) {
  const knownCategories = EMPLOYMENT_CATEGORIES.slice(0, -1);
  const counts = EMPLOYMENT_CATEGORIES.map(category => {
    const count = students.filter(student => {
      const status = String(student.status || '').trim();
      if (category.label === '기타·미분류') {
        return !knownCategories.some(item => item.label === status);
      }
      return status === category.label;
    }).length;

    return { ...category, count };
  });
  const total = students.length;
  // 프로젝트의 산정 기준: 군입대자와 진학자는 분모에서 제외하고, 미분류 값은 취업자로 추정하지 않습니다.
  const excludedStatuses = ['군입대자', '진학자'];
  const excluded = students.filter(student => excludedStatuses.includes(String(student.status || '').trim())).length;
  const eligible = total - excluded;
  const employed = counts.find(item => item.label === '취업자').count;
  return { counts, total, excluded, eligible, employed, rate: eligible ? employed / eligible * 100 : null };
}
