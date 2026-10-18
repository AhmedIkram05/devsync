import { buildPdfLines } from '../../pages/Reports';

// Exercises every report-type branch of the exported PDF text builder.
describe('buildPdfLines', () => {
  const base = { dateRange: 'week', generatedAt: '2026-01-01T00:00:00.000Z', summary: {} };

  test('renders details for each report type', () => {
    const tasks = buildPdfLines({ ...base, type: 'tasks', details: [{ title: 'Task A', status: 'done' }] });
    expect(tasks.join('\n')).toContain('Task A');

    const developers = buildPdfLines({
      ...base,
      type: 'developers',
      details: [{ name: 'Dev One', email: 'dev@example.com', total_tasks: 3 }],
    });
    expect(developers.join('\n')).toContain('Dev One');

    const github = buildPdfLines({
      ...base,
      type: 'github',
      details: [{ name: 'devsync', owner: 'ahmed', open_issues: 1, total_prs: 2 }],
    });
    expect(github.join('\n')).toContain('devsync');

    const other = buildPdfLines({ ...base, type: 'custom', details: [{ name: 'Loose Item' }] });
    expect(other.join('\n')).toContain('Loose Item');
  });

  test('falls back gracefully when summary and details are empty', () => {
    const lines = buildPdfLines({ ...base, type: 'tasks', generatedAt: null, details: [] });
    const text = lines.join('\n');
    expect(text).toContain('No summary data.');
    expect(text).toContain('No detail data.');
    expect(text).toContain('Unknown date');
  });
});
