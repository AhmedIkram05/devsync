import { marked } from 'marked';
import DOMPurify from 'dompurify';

// no-danger guard: gated markdown renderer — all HTML produced here is
// DOMPurify-sanitized; do not use dangerouslySetInnerHTML or marked.parse
// directly elsewhere, route through sanitizeMarkdown.
export const sanitizeMarkdown = (markdown) => {
  if (!markdown) {
    return '';
  }

  const rawHtml = marked.parse(String(markdown));
  return DOMPurify.sanitize(rawHtml);
};

export default sanitizeMarkdown;
