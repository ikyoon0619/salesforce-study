// 텍스트 출력 도우미. 콘텐츠 JSON의 문자열은 항상 escape한 뒤
// **굵게**, `코드`, [링크](https://...) 세 가지만 HTML로 바꾼다.

export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

/** "Setup > Object Manager > Fields" 형태의 경로를 빵부스러기 모양으로 */
export function crumb(path) {
  return path
    .split('>')
    .map((p) => esc(p.trim()))
    .join('<span class="sep">›</span>');
}

/** 여러 줄 코드 예시 (Apex, SOQL, HTML, JS). 내용은 escape만 하고 그대로 보여 준다. */
export function codeBlock(code, lang = '') {
  if (!code) return '';
  return `<pre class="code-block"${lang ? ` data-lang="${esc(lang)}"` : ''}><code>${esc(code)}</code></pre>`;
}
