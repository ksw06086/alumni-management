export const STUDENT_STATUS_COLORS = {
  '취업자': { foreground: '#167044', background: '#eaf7ef', accent: '#24945d' },
  '진학자': { foreground: '#2459a6', background: '#edf4ff', accent: '#3975d4' },
  '미취업자': { foreground: '#a8541c', background: '#fff3e8', accent: '#d97732' },
  '군입대자': { foreground: '#6741a5', background: '#f3edfc', accent: '#8057c4' },
  '기타': { foreground: '#475569', background: '#eff2f6', accent: '#718096' },
};

export function getStudentStatusColor(status) {
  return STUDENT_STATUS_COLORS[String(status || '').trim()] || STUDENT_STATUS_COLORS['기타'];
}
