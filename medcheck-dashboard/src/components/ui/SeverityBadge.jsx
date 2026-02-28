const SEVERITY_STYLES = {
  critical: 'bg-grade-d/10 text-grade-d',
  major: 'bg-grade-c/10 text-grade-c',
  minor: 'bg-grade-b/10 text-grade-b',
};

export default function SeverityBadge({ severity }) {
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${SEVERITY_STYLES[severity] || 'bg-border text-text-secondary'}`}>
      {severity}
    </span>
  );
}
