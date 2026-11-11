const koNumericCollator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

export function filterStudentRows(rows, { status = '전체학생', query = '' } = {}) {
  const search = String(query || '').trim().toLocaleLowerCase('ko-KR');
  return rows.filter(student => {
    if (status !== '전체학생' && student?.status !== status) return false;
    if (!search) return true;
    return [student?.name, student?.studentId, student?.company, student?.field, student?.phone, student?.address]
      .some(value => String(value ?? '').toLocaleLowerCase('ko-KR').includes(search));
  });
}

export function sortStudentRows(rows, sort) {
  if (!sort) return rows;
  return [...rows].sort((a, b) => {
    const av = a?.[sort.key], bv = b?.[sort.key];
    const aBlank = av == null || String(av).trim() === '';
    const bBlank = bv == null || String(bv).trim() === '';
    if (aBlank || bBlank) return aBlank === bBlank ? 0 : aBlank ? 1 : -1;
    let comparison;
    if (sort.numeric) {
      const aNumber = Number(av), bNumber = Number(bv);
      const aNumeric = Number.isFinite(aNumber), bNumeric = Number.isFinite(bNumber);
      if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
      comparison = aNumeric ? aNumber - bNumber : koNumericCollator.compare(String(av), String(bv));
    } else comparison = koNumericCollator.compare(String(av), String(bv));
    return sort.direction === 'desc' ? -comparison : comparison;
  });
}
