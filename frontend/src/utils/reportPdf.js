// Report label formatting and the dependency-free PDF writer. Extracted
// verbatim from Reports.jsx; the page re-exports these for its tests.

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

  lines.push('', 'Details:');

  if (details.length === 0) {
    lines.push('No detail data.');
  } else if (report.type === 'tasks') {
    details.forEach((task) => {
      lines.push(`- ${task.title || 'Untitled'} [${task.status || 'unknown'}]`);
    });
  } else if (report.type === 'developers') {
    details.forEach((developer) => {
      lines.push(`- ${developer.name || 'Unknown'} (${developer.email || 'n/a'}) tasks: ${developer.total_tasks || 0}`);
    });
  } else if (report.type === 'github') {
    details.forEach((repo) => {
      lines.push(`- ${repo.name || 'Repo'} (${repo.owner || 'owner'}) issues: ${repo.open_issues || 0} prs: ${repo.total_prs || 0}`);
    });
  } else {
    details.forEach((item) => {
      lines.push(`- ${item.name || item.title || 'Item'}`);
    });
  }

  return lines.map(sanitizePdfText);
};

// Max text lines per PDF page (16pt leading from a 720pt top margin on a
// 792pt-tall page). Longer reports continue on extra pages instead of
// silently clipping below the MediaBox.
const PDF_LINES_PER_PAGE = 45;

const createPdfBlob = (lines) => {
  // Sanitize at the write site: unescaped ()/\ corrupts PDF strings and any
  // non-ASCII char desyncs /Length + xref offsets (chars vs UTF-8 bytes).
  const safeLines = lines.map(sanitizePdfText);
  const pages = [];
  for (let start = 0; start < safeLines.length; start += PDF_LINES_PER_PAGE) {
    pages.push(safeLines.slice(start, start + PDF_LINES_PER_PAGE));
  }
  if (pages.length === 0) {
    pages.push(['DevSync Report']);
  }

  // Object ids: 1 Catalog, 2 Pages, then per page a (content, page) pair,
  // then a single shared Font as the last object.
  const contentIds = pages.map((_, index) => 3 + index * 2);
  const pageIds = pages.map((_, index) => 4 + index * 2);
  const fontId = 3 + pages.length * 2;

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`
  ];

  pages.forEach((pageLines, index) => {
    const textStream = [
      'BT', '/F1 12 Tf', '72 720 Td',
      ...pageLines.flatMap((line, lineIndex) =>
        lineIndex === 0 ? [`(${line}) Tj`] : ['0 -16 Td', `(${line}) Tj`]
      ),
      'ET'
    ].join('\n');

    objects.push(`<< /Length ${textStream.length} >>\nstream\n${textStream}\nendstream`);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentIds[index]} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`
    );
  });

  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += 'xref\n';
  pdf += `0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
};

export { getReportLabel, getDateRangeLabel, formatGeneratedAt, sanitizePdfText, buildPdfLines, createPdfBlob };
