import { buildPdfLines, createPdfBlob } from '../../pages/Reports';

// jsdom's Blob has no .text(); readAsText decodes UTF-8, which is identity
// for the ASCII-only documents this writer must produce.
const blobText = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(blob);
  });

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

// The hand-rolled PDF writer must never emit an invalid stream: unescaped
// ()/\ corrupt PDF strings and non-ASCII chars desync /Length + xref offsets
// (Blob encodes UTF-8, but offsets are computed on JS string length).
describe('createPdfBlob escaping', () => {
  test('escapes PDF specials and strips non-ascii before writing the stream', async () => {
    const blob = createPdfBlob(['Task (1) \\ Backslash ☃ é']);
    const pdf = await blobText(blob);

    expect(pdf).toContain('(Task \\(1\\) \\\\ Backslash ? ?) Tj');
    // Whole document stays single-byte ASCII, so string length == byte length
    expect([...pdf].every((ch) => ch.charCodeAt(0) <= 0x7f)).toBe(true);
  });

  test('keeps every content stream /Length equal to its byte length', async () => {
    const report = buildPdfLines({
      dateRange: 'week',
      generatedAt: '2026-01-01T00:00:00.000Z',
      type: 'tasks',
      summary: {},
      details: [{ title: 'Weird (title) \\ with ☃ snowman', status: 'done' }],
    });
    const pdf = await blobText(createPdfBlob(report));

    const streamRe = /\/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g;
    let match;
    let streams = 0;
    while ((match = streamRe.exec(pdf)) !== null) {
      expect(Number(match[1])).toBe(match[2].length);
      streams += 1;
    }
    expect(streams).toBeGreaterThan(0);
  });
});
