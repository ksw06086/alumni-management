const ENGLISH_DATE_TO_STRING = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+GMT[+-]\d{4}(?:\s+\(.+\))?$/i;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

function validYmd(year, month, day) {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function koreanParts(date, includeTime) {
  const options = {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    ...(includeTime ? { weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true } : {}),
  };
  const parts = Object.fromEntries(new Intl.DateTimeFormat('ko-KR', options).formatToParts(date).map(part => [part.type, part.value]));
  const result = `${parts.year}년 ${parts.month}월 ${parts.day}일`;
  const period = /^AM$/i.test(parts.dayPeriod || '') ? '오전' : /^PM$/i.test(parts.dayPeriod || '') ? '오후' : parts.dayPeriod;
  return includeTime ? `${result} (${parts.weekday}) ${period} ${parts.hour}시 ${parts.minute}분 ${parts.second}초` : result;
}

export function formatKoreanPreservedDate(value, { dateOnly = false } = {}) {
  if (value == null || value === '') return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? String(value) : koreanParts(value, !dateOnly);
  const text = String(value).trim();
  if (!text) return '';

  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  const separated = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const dateMatch = compact || separated;
  if (dateMatch) {
    const [, y, m, d] = dateMatch;
    const year = Number(y), month = Number(m), day = Number(d);
    if (!validYmd(year, month, day)) return text;
    return `${y}년 ${m}월 ${d}일`;
  }

  if (!ISO_DATE_TIME.test(text) && !ENGLISH_DATE_TO_STRING.test(text)) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return koreanParts(date, !dateOnly && ISO_DATE_TIME.test(text) || !dateOnly && ENGLISH_DATE_TO_STRING.test(text));
}

export function formatTransferDetailForDisplay(value) {
  if (!value) return '';
  return String(value).split(/\r?\n/).map(line => {
    const match = /^(생년월일|재학생 최초 등록일|재학생 최종 수정일|재학생 졸업 전환일):\s*(.*)$/.exec(line);
    if (!match || !match[2]) return line;
    const dateOnly = match[1] === '생년월일';
    const formatted = formatKoreanPreservedDate(match[2], { dateOnly });
    return `${match[1]}: ${formatted}`;
  }).join('\n');
}
