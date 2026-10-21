const DAY_MS = 24 * 60 * 60 * 1000;

// 달력 날짜 연산은 시간대 영향을 피하기 위해 YYYY-MM-DD 문자열과 UTC 자정으로 처리합니다.
export function dateKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function calendarGridDates(monthDate) {
  // 월의 첫 일요일부터 시작하는 6주(42칸) 그리드를 만듭니다.
  const first = new Date(Date.UTC(monthDate.getFullYear(), monthDate.getMonth(), 1));
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - first.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return day;
  });
}

export function expandScheduleInstances(schedule, rangeStart, rangeEnd) {
  // 반복 규칙을 조회 범위에 해당하는 발생 일정으로 펼칩니다. 저장된 원본 일정은 수정하지 않습니다.
  const baseStart = String(schedule.start_datetime || '').slice(0, 10);
  const baseEnd = String(schedule.end_datetime || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(baseStart) || !/^\d{4}-\d{2}-\d{2}$/.test(baseEnd)) return [];
  const startMs = Date.parse(`${baseStart}T00:00:00Z`);
  const endMs = Date.parse(`${baseEnd}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return [];
  // 여러 날 일정의 길이를 반복 발생일에도 그대로 적용합니다.
  const durationDays = Math.floor((endMs - startMs) / DAY_MS);
  const from = Date.parse(`${rangeStart}T00:00:00Z`);
  const to = Date.parse(`${rangeEnd}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];
  const repeatType = schedule.repeat_type || 'none';
  const interval = Math.max(1, Number(schedule.repeat_interval) || 1);
  const repeatUntil = schedule.repeat_until || '';
  const firstCandidate = Math.max(startMs, from - durationDays * DAY_MS);
  const occurrences = [];

  if (repeatType === 'none') {
    if (startMs <= to && endMs >= from) occurrences.push(makeOccurrence(schedule, baseStart, baseEnd));
    return occurrences;
  }

  const base = new Date(startMs);
  for (let candidateMs = firstCandidate; candidateMs <= to; candidateMs += DAY_MS) {
    if (candidateMs < startMs) continue;
    const candidate = new Date(candidateMs);
    const diffDays = Math.floor((candidateMs - startMs) / DAY_MS);
    let matches = false;
    if (repeatType === 'daily') matches = diffDays % interval === 0;
    if (repeatType === 'weekly') matches = candidate.getUTCDay() === base.getUTCDay() && Math.floor(diffDays / 7) % interval === 0;
    if (repeatType === 'monthly') {
      const monthDiff = (candidate.getUTCFullYear() - base.getUTCFullYear()) * 12 + candidate.getUTCMonth() - base.getUTCMonth();
      const lastDay = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0)).getUTCDate();
      matches = monthDiff >= 0 && monthDiff % interval === 0 && candidate.getUTCDate() === Math.min(base.getUTCDate(), lastDay);
    }
    const candidateKey = dateKey(candidate);
    if (!matches || (repeatUntil && candidateKey > repeatUntil)) continue;
    const end = new Date(candidateMs + durationDays * DAY_MS);
    occurrences.push(makeOccurrence(schedule, candidateKey, dateKey(end)));
  }
  return occurrences;
}

function makeOccurrence(schedule, startDate, endDate) {
  return { ...schedule, occurrence_start_date: startDate, occurrence_end_date: endDate };
}

export function buildDateEventMap(schedules, rangeStart, rangeEnd) {
  // 날짜 클릭용 목록은 한 일정이 걸쳐 있는 모든 날짜에 occurrence를 연결합니다.
  const map = {};
  schedules.forEach(schedule => {
    expandScheduleInstances(schedule, rangeStart, rangeEnd).forEach(occurrence => {
      const start = Date.parse(`${occurrence.occurrence_start_date}T00:00:00Z`);
      const end = Date.parse(`${occurrence.occurrence_end_date}T00:00:00Z`);
      for (let current = start; current <= end; current += DAY_MS) {
        const key = dateKey(new Date(current));
        (map[key] ||= []).push(occurrence);
      }
    });
  });
  Object.values(map).forEach(items => items.sort((a, b) => a.start_datetime.localeCompare(b.start_datetime) || a.title.localeCompare(b.title)));
  return map;
}

export function buildWeekEventSegments(dateMap, gridDates) {
  // 달력 렌더링용으로 다일 일정을 주 경계에서 자르고, 같은 주의 겹치는 막대는 서로 다른 lane에 배치합니다.
  return Array.from({ length: Math.ceil(gridDates.length / 7) }, (_, weekIndex) => {
    const days = gridDates.slice(weekIndex * 7, weekIndex * 7 + 7);
    const firstDay = dateKey(days[0]);
    const lastDay = dateKey(days[days.length - 1]);
    const events = new Map();
    days.forEach(day => (dateMap[dateKey(day)] || []).forEach(event => {
      if (event.occurrence_start_date < event.occurrence_end_date) events.set(`${event.schedule_id}:${event.occurrence_start_date}`, event);
    }));

    const segments = [...events.values()].filter(event => event.occurrence_start_date <= lastDay && event.occurrence_end_date >= firstDay)
      .map(event => ({
        event,
        start: event.occurrence_start_date < firstDay ? firstDay : event.occurrence_start_date,
        end: event.occurrence_end_date > lastDay ? lastDay : event.occurrence_end_date,
      }))
      .sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end) || a.event.title.localeCompare(b.event.title));

    const laneEnds = [];
    segments.forEach(segment => {
      let lane = laneEnds.findIndex(end => end < segment.start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = segment.end;
      segment.lane = lane;
      segment.startColumn = days.findIndex(day => dateKey(day) === segment.start) + 1;
      segment.endColumn = days.findIndex(day => dateKey(day) === segment.end) + 2;
    });
    return { segments, laneCount: laneEnds.length };
  });
}
