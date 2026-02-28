const GRADE_STYLES = {
  S: 'bg-grade-s/15 text-grade-s',
  A: 'bg-grade-a/15 text-grade-a',
  B: 'bg-grade-b/15 text-grade-b',
  C: 'bg-grade-c/15 text-grade-c',
  D: 'bg-grade-d/15 text-grade-d',
  F: 'bg-grade-f/15 text-grade-f',
};

export default function GradeBadge({ grade, size = 'sm' }) {
  const sizeClass = size === 'lg'
    ? 'px-3 py-1.5 text-sm'
    : 'px-2 py-0.5 text-xs';

  return (
    <span className={`${sizeClass} rounded-full font-semibold ${GRADE_STYLES[grade] || 'bg-border text-text-secondary'}`}>
      {grade || '-'}
    </span>
  );
}
