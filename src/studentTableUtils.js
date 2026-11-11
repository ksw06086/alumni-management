const koNumericCollator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

export function sortStudentRows(rows, sort) {
  if (!sort) return rows;
  return [...rows].sort((a, b) => {
    const av = a?.[sort.key], bv = b?.[sort.key];
    const aBlank = av == null || String(av).trim() === '';
    const bBlank = bv == null || String(bv).trim() === '';
    if (aBlank || bBlank) return aBlank === bBlank ? 0 : aBlank ? 1 : -1;
    const comparison = sort.numeric
      ? Number(av) - Number(bv)
      : koNumericCollator.compare(String(av), String(bv));
    return sort.direction === 'desc' ? -comparison : comparison;
  });
}
