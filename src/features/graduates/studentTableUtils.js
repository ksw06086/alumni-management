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
    const leftValue = a?.[sort.key];
    const rightValue = b?.[sort.key];
    const leftBlank = leftValue == null || String(leftValue).trim() === '';
    const rightBlank = rightValue == null || String(rightValue).trim() === '';

    if (leftBlank || rightBlank) {
      if (leftBlank === rightBlank) return 0;
      return leftBlank ? 1 : -1;
    }

    let comparison;
    if (sort.numeric) {
      const leftNumber = Number(leftValue);
      const rightNumber = Number(rightValue);
      const leftIsNumber = Number.isFinite(leftNumber);
      const rightIsNumber = Number.isFinite(rightNumber);

      if (leftIsNumber !== rightIsNumber) return leftIsNumber ? -1 : 1;
      comparison = leftIsNumber
        ? leftNumber - rightNumber
        : koNumericCollator.compare(String(leftValue), String(rightValue));
    } else {
      comparison = koNumericCollator.compare(String(leftValue), String(rightValue));
    }

    return sort.direction === 'desc' ? -comparison : comparison;
  });
}
