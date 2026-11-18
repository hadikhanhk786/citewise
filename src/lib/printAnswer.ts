import type { Citation } from './mock-data';

const escapeHtml = (s: string) =>
    s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/**
 * Opens the browser's print dialog for one answer (rendered HTML, charts included)
 * plus its citations, so the user can "Save as PDF". No PDF library needed.
 */
export function printAnswer(question: string | undefined, answerEl: HTMLElement, citations: Citation[]) {
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) return false;
    const sources = citations
        .map(c => `<li>${escapeHtml(c.title)}${c.page != null ? ` — page ${c.page}` : ''}</li>`)
        .join('');
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Citewise answer</title>
<style>
  body { font-family: system-ui, sans-serif; color: #111; max-width: 720px; margin: 32px auto; line-height: 1.55; }
  h1 { font-size: 18px; } h2, h3 { font-size: 16px; }
  table { border-collapse: collapse; } td, th { border: 1px solid #ccc; padding: 4px 8px; }
  pre { white-space: pre-wrap; background: #f5f5f5; padding: 8px; }
  .q { color: #555; border-left: 3px solid #ccc; padding-left: 12px; }
  svg text { fill: #333; }
</style></head><body>
${question ? `<p class="q">${escapeHtml(question)}</p>` : ''}
${answerEl.innerHTML}
${sources ? `<h3>Sources</h3><ol>${sources}</ol>` : ''}
<p style="color:#888;font-size:12px">Generated with Citewise · ${new Date().toLocaleString()}</p>
</body></html>`);
    win.document.close();
    win.focus();
    win.print();
    return true;
}
