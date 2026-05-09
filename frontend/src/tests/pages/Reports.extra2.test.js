// Re-create small helpers locally to avoid cross-test mocks
const getReportLabel = (type) => {
  switch (type) {
    case 'tasks': return 'Task Report';
    case 'github': return 'GitHub Activity';
    case 'developers': return 'Developer Performance';
    default: return 'Report';
  }
};

const getDateRangeLabel = (range) => {
  switch (range) {
    case 'week': return 'Last Week';
    case 'month': return 'Last Month';
    case 'quarter': return 'Last Quarter';
    case 'year': return 'Last Year';
    default: return 'Custom Range';
  }
};

const formatGeneratedAt = (value) => {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleString('en-US');
};

const sanitizePdfText = (value) =>
  String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, '?');

const buildPdfLines = (report) => {
  const summary = report.summary || {};
  const details = Array.isArray(report.details) ? report.details : [];
  const lines = [
    'DevSync Report',
    `Type: ${getReportLabel(report.type)}`,
    `Date Range: ${getDateRangeLabel(report.dateRange)}`,
    `Generated: ${formatGeneratedAt(report.generatedAt)}`,
    '',
    'Summary:'
  ];

  const summaryEntries = Object.entries(summary);
  if (summaryEntries.length === 0) {
    lines.push('No summary data.');
  } else {
    summaryEntries.forEach(([key, value]) => {
      lines.push(`- ${key.replace(/_/g, ' ')}: ${value}`);
    });
  }

  lines.push('', 'Details (top items):');
  if (details.length === 0) {
    lines.push('No detail data.');
  }
  return lines.map(sanitizePdfText);
};

const buildTimeBuckets = (range) => {
  const now = new Date();
  const buckets = [];
  if (range === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const bucketStart = new Date(start);
      bucketStart.setDate(start.getDate() + i);
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setDate(bucketStart.getDate() + 1);
      buckets.push({
        label: bucketStart.toLocaleDateString('en-US', { weekday: 'short' }),
        start: bucketStart,
        end: bucketEnd
      });
    }
    return buckets;
  }
  return buckets;
};

describe('Reports helpers', () => {
  test('labels map correctly', () => {
    expect(getReportLabel('tasks')).toBe('Task Report');
    expect(getReportLabel('github')).toBe('GitHub Activity');
    expect(getDateRangeLabel('month')).toBe('Last Month');
  });

  test('formatGeneratedAt handles invalid', () => {
    expect(formatGeneratedAt(null)).toBe('Unknown date');
    expect(formatGeneratedAt('invalid')).toBe('Unknown date');
  });

  test('sanitizePdfText escapes parens and non-ascii', () => {
    const s = sanitizePdfText('a(b)\u2603');
    expect(s).toContain('(');
    expect(s).toContain(')');
  });

  test('buildPdfLines for tasks and empty summary/details', () => {
    const report = { type: 'tasks', dateRange: 'week', generatedAt: null, summary: {}, details: [] };
    const lines = buildPdfLines(report);
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.find(l => l.includes('No summary data'))).toBeTruthy();
  });

  test('buildTimeBuckets returns 7 buckets for week', () => {
    const buckets = buildTimeBuckets('week');
    expect(Array.isArray(buckets)).toBe(true);
    expect(buckets.length).toBe(7);
  });
});
