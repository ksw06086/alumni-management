const SEOUL_TIME_ZONE = 'Asia/Seoul';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function validYmd(year, month, day) {
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dateOnlyResult(year, month, day) {
  if (!validYmd(year, month, day)) return null;
  // Noon UTC is midday in Seoul and preserves the civil date for weekday calculation.
  return { date: new Date(Date.UTC(year, month - 1, day, 12)), dateOnly: true };
}

function parseSeoulDateTime(year, month, day, hour, minute, second = 0, millisecond = 0) {
  if (!validYmd(year, month, day) || hour > 23 || minute > 59 || second > 59) return null;
  const date = new Date(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.${String(millisecond).padStart(3, '0')}+09:00`);
  return Number.isNaN(date.getTime()) ? null : { date, dateOnly: false };
}

/** Parse known project, Sheets, ISO, and legacy JavaScript date strings without guessing unknown formats. */
export function parseStoredDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : { date: value, dateOnly: false };
  const text = String(value).trim();
  if (!text) return null;

  let match = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (match) return dateOnlyResult(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match) return dateOnlyResult(Number(match[1]), Number(match[2]), Number(match[3]));

  // The display form is also accepted so already formatted counseling values stay editable.
  match = /^(\d{4})\.(\d{2})\.(\d{2})\(([월화수목금토일])\)(?: (\d{2}):(\d{2}):(\d{2}))?$/.exec(text);
  if (match) {
    const [, y, m, d, , h, min, sec] = match;
    return h === undefined
      ? dateOnlyResult(Number(y), Number(m), Number(d))
      : parseSeoulDateTime(Number(y), Number(m), Number(d), Number(h), Number(min), Number(sec));
  }

  // Date-only strings with a time but no zone come from existing Apps Script values; interpret them as Seoul time.
  match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(text);
  if (match) {
    const [, y, m, d, h, min, sec = '0', ms = '0'] = match;
    return parseSeoulDateTime(Number(y), Number(m), Number(d), Number(h), Number(min), Number(sec), Number(ms.padEnd(3, '0')));
  }

  const isoDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/i;
  const legacyDateString = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+GMT[+-]\d{4}(?:\s+\([^)]*\))?$/i;
  if (!isoDateTime.test(text) && !legacyDateString.test(text)) return null;
  if (isoDateTime.test(text)) {
    const [dateText, timeText] = text.split('T');
    const [year, month, day] = dateText.split('-').map(Number);
    const [hour, minute, second = '0'] = timeText.match(/^\d{2}:\d{2}(?::\d{2})?/)[0].split(':').map(Number);
    if (!validYmd(year, month, day) || hour > 23 || minute > 59 || second > 59) return null;
  }
  const normalized = text.replace(/\s+\([^)]*\)$/, '');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : { date, dateOnly: false };
}

function dateParts(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('ko-KR', {
    timeZone: SEOUL_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(part => [part.type, part.value]));
  const weekday = WEEKDAYS.find(day => parts.weekday.startsWith(day)) || '';
  return { year: parts.year, month: parts.month, day: parts.day, weekday, hour: parts.hour, minute: parts.minute, second: parts.second };
}

function formatParts(parts) { return `${parts.year}.${parts.month}.${parts.day}(${parts.weekday})`; }

export function formatKoreanDate(value) {
  if (value == null || value === '') return '';
  const parsed = parseStoredDate(value);
  if (!parsed) return String(value);
  return formatParts(dateParts(parsed.date));
}

export function formatKoreanDateTime(value) {
  if (value == null || value === '') return '';
  const parsed = parseStoredDate(value);
  if (!parsed) return String(value);
  const parts = dateParts(parsed.date);
  return parsed.dateOnly ? formatParts(parts) : `${formatParts(parts)} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function toDateInputValue(value) {
  const parsed = parseStoredDate(value);
  if (!parsed) return '';
  const parts = dateParts(parsed.date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function hasStoredTime(value) {
  const parsed = parseStoredDate(value);
  return Boolean(parsed && !parsed.dateOnly);
}

// Backward-compatible export used by transfer detail rendering.
export function formatKoreanPreservedDate(value, { dateOnly = false } = {}) {
  if (value == null || value === '') return '';
  const parsed = parseStoredDate(value);
  if (!parsed) return String(value);
  const parts = dateParts(parsed.date);
  return dateOnly || parsed.dateOnly ? formatParts(parts) : `${formatParts(parts)} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function formatTransferDetailForDisplay(value) {
  if (!value) return '';
  return String(value).split(/\r?\n/).map(line => {
    const match = /^(생년월일|재학생 최초 등록일|재학생 최종 수정일|재학생 졸업 전환일):\s*(.*)$/.exec(line);
    if (!match || !match[2]) return line;
    return `${match[1]}: ${formatKoreanPreservedDate(match[2], { dateOnly: match[1] === '생년월일' })}`;
  }).join('\n');
}
