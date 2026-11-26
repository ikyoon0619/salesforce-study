// 모듈 노트 화면: Trailhead 모듈의 유닛별 한국어 요약을 블록 단위로 그린다.
// 노트 파일 형식은 README의 "모듈 노트 형식" 참고.
import { esc, inline, crumb } from './format.js';
import { store } from './store.js';

function block(b) {
  switch (b.type) {
    case 'p':
      return `<p>${inline(b.text)}</p>`;
    case 'list':
      return `<ul>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`;
    case 'steps':
      return `<div class="note-steps">${b.title ? `<p class="note-steps-title">${inline(b.title)}</p>` : ''}
        <ol>${b.items.map((i) => `<li>${i.startsWith('Setup >') ? `<span class="crumb">${crumb(i)}</span>` : inline(i)}</li>`).join('')}</ol></div>`;
    case 'table':
      return `<div class="table-wrap"><table>${b.title ? `<caption>${esc(b.title)}</caption>` : ''}
        <thead><tr>${b.headers.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${b.rows.map((r) => `<tr><th scope="row">${inline(r[0])}</th>${r.slice(1).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>`;
    case 'figure':
      // svg는 이 저장소에서 직접 그린 다이어그램 (data/notes/*.json). 색은 CSS 토큰 클래스로 지정.
      return `<figure class="diagram"><div class="diagram-art">${b.svg}</div>${b.caption ? `<figcaption>${inline(b.caption)}</figcaption>` : ''}</figure>`;
    case 'tip':
      return `<aside class="note-tip"><strong>시험 포인트</strong><p>${inline(b.text)}</p></aside>`;
    case 'path':
      return `<p class="note-path"><span class="crumb">${crumb(b.text)}</span></p>`;
    default:
      return '';
  }
}

export function koUrl(url) {
  return url.replace('https://trailhead.salesforce.com/content/', 'https://trailhead.salesforce.com/ko/content/');
}

/**
 * @param {HTMLElement} root
 * @param {object} cert
 * @param {object} section 노트가 속한 시험 섹션
 * @param {object} module  section.trail 의 항목
 * @param {object} note    data/notes/... JSON
 */
export function renderNote(root, { cert, section, module, note }) {
  const toc = note.units
    .map((u, i) => `<li><button type="button" class="linklike" data-go="unit-${i}">${esc(u.title)}</button></li>`)
    .join('');
  const units = note.units
    .map(
      (u, i) => `<section class="note-unit" id="unit-${i}">
        <p class="eyebrow">Unit ${i + 1}</p>
        <h2>${esc(u.title)}${u.ko ? `<span class="ko">${esc(u.ko)}</span>` : ''}</h2>
        ${u.blocks.map(block).join('')}
        <p class="note-source"><a href="${esc(u.url)}" target="_blank" rel="noopener">원문 (영어)</a> · <a href="${esc(koUrl(u.url))}" target="_blank" rel="noopener">한국어 페이지</a></p>
      </section>`
    )
    .join('');
  const terms = note.terms?.length
    ? `<section class="note-unit"><h2>용어 정리</h2><div class="table-wrap"><table><thead><tr><th>영어 (시험 표기)</th><th>뜻</th></tr></thead>
        <tbody>${note.terms.map(([en, ko]) => `<tr><th scope="row">${esc(en)}</th><td>${inline(ko)}</td></tr>`).join('')}</tbody></table></div></section>`
    : '';
  const done = store.isTrailDone(cert.id, module.url);

  root.innerHTML = `
    <div class="cert-layout">
      <nav class="side" aria-label="이 모듈의 유닛">
        <p class="side-title">${esc(section.title)}</p>
        <a href="#/c/${cert.id}/s/${section.id}"><span class="name">← 섹션으로</span></a>
        <hr>
        <ol class="toc">${toc}</ol>
      </nav>
      <article class="content note">
        <header>
          <p class="eyebrow">${module.kind === 'project' ? 'Trailhead 실습 노트' : 'Trailhead 모듈 노트'} · ${esc(section.title)}</p>
          <h1>${esc(module.title)}</h1>
          <p class="lead">${inline(note.intro)}</p>
          <p class="note-source">유닛 ${note.units.length}개 · 원래 약 ${module.minutes}분 ·
            <a href="${esc(module.url)}" target="_blank" rel="noopener">Trailhead 원문</a> ·
            <a href="${esc(koUrl(module.url))}" target="_blank" rel="noopener">한국어 페이지</a></p>
        </header>
        ${units}
        ${terms}
        <section class="cta">
          <p>Trailhead에서 배지를 받으려면 원문 페이지의 퀴즈나 실습 검사를 통과해야 해요.</p>
          <label class="check-done" for="note-done"><input type="checkbox" id="note-done" ${done ? 'checked' : ''}> 이 모듈 완료</label>
          <a class="btn btn-primary" href="#/c/${cert.id}/quiz/${section.id}">섹션 퀴즈 풀기</a>
        </section>
      </article>
    </div>`;

  root.querySelector('#note-done').addEventListener('change', (ev) => store.setTrailDone(cert.id, module.url, ev.target.checked));
  root.querySelectorAll('[data-go]').forEach((btn) =>
    btn.addEventListener('click', () => root.querySelector(`#${btn.dataset.go}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  );
}
