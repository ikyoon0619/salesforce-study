// 앱 진입점: 해시 라우터 + 화면 렌더링.
// 라우트
//   #/                          홈 (자격증 목록)
//   #/c/:cert                   자격증 개요
//   #/c/:cert/s/:section        섹션 학습
//   #/c/:cert/quiz              퀴즈 범위 선택
//   #/c/:cert/quiz/:scope       퀴즈 (scope = 섹션 id 또는 all)
//   #/c/:cert/review            오답노트
//   #/c/:cert/review/quiz       오답만 다시 풀기
//   #/c/:cert/m/:note           Trailhead 모듈 노트
import { store } from './store.js';
import { runQuiz } from './quiz.js';
import { esc, inline, crumb } from './format.js';
import { renderNote } from './notes.js';

const app = document.getElementById('app');
const topnav = document.getElementById('topnav');

// ---------- 데이터 로딩 ----------
const cache = new Map();
async function getJSON(path) {
  if (!cache.has(path)) {
    cache.set(
      path,
      fetch(path).then((r) => {
        if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
        return r.json();
      })
    );
  }
  return cache.get(path);
}
const getRegistry = () => getJSON('data/certs.json');
async function getCert(id) {
  const reg = await getRegistry();
  const entry = reg.certs.find((c) => c.id === id);
  if (!entry || !entry.file) return null;
  return getJSON(entry.file);
}

// ---------- 라우터 ----------
function parse() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return parts.map(decodeURIComponent);
}

async function route() {
  const [kind, certId, sub, arg, arg2] = parse();
  try {
    if (!kind) return await renderHome();
    if (kind !== 'c' || !certId) return notFound();
    const cert = await getCert(certId);
    if (!cert) return notFound();
    if (!sub) return renderOverview(cert);
    if (sub === 's' && arg) return renderSection(cert, arg);
    if (sub === 'quiz' && !arg) return renderQuizPicker(cert);
    if (sub === 'quiz') return renderQuiz(cert, arg);
    if (sub === 'review' && arg === 'quiz') return renderReviewQuiz(cert);
    if (sub === 'review') return renderReview(cert);
    if (sub === 'm' && arg) return await renderModuleNote(cert, arg);
    return notFound();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="empty">콘텐츠를 불러오지 못했어요 (${esc(err.message)}).<br>
      로컬에서 열었다면 <code>python3 -m http.server</code>로 서버를 띄운 뒤 접속하세요.</div>`;
  } finally {
    app.focus({ preventScroll: true });
  }
}

function notFound() {
  setNav(null);
  app.innerHTML = `<div class="empty">페이지를 찾을 수 없어요. <a href="#/">처음으로</a></div>`;
}

function setTitle(text) {
  document.title = text ? `${text} · SF Study` : 'Salesforce 자격증 스터디';
}

function setNav(cert, active) {
  if (!cert) {
    topnav.innerHTML = '';
    return;
  }
  const base = `#/c/${cert.id}`;
  const links = [
    ['overview', base, '개요'],
    ['quiz', `${base}/quiz`, '퀴즈'],
    ['review', `${base}/review`, `오답노트 (${store.wrongIds(cert.id).length})`],
  ];
  topnav.innerHTML = links
    .map(([key, href, label]) => `<a href="${href}"${key === active ? ' aria-current="page"' : ''}>${esc(label)}</a>`)
    .join('');
}

// ---------- 공통 조각 ----------
function sideNav(cert, activeId) {
  const items = cert.sections
    .map((s) => {
      const done = store.isDone(cert.id, s.id);
      return `<a href="#/c/${cert.id}/s/${s.id}" class="${done ? 'done' : ''}"${s.id === activeId ? ' aria-current="page"' : ''}>
        <span class="name">${esc(s.title)}</span><span class="w">${s.weight}%</span>
        <span class="bar"><span style="width:${(s.weight / 35) * 100}%"></span></span>
      </a>`;
    })
    .join('');
  return `<nav class="side" aria-label="시험 섹션">
    <p class="side-title">시험 섹션 · 비중</p>
    <a href="#/c/${cert.id}"${activeId === '__overview' ? ' aria-current="page"' : ''}><span class="name">개요</span></a>
    ${items}
  </nav>`;
}

function fmtMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}시간${m ? ` ${m}분` : ''}` : `${m}분`;
}

function trailProgress(cert, section) {
  const list = section.trail ?? [];
  return { done: list.filter((m) => store.isTrailDone(cert.id, m.url)).length, total: list.length };
}

/** 섹션의 Trailhead 모듈 목록 + 완료 체크 */
function trailBlock(cert, section) {
  const list = section.trail ?? [];
  if (!list.length) return '';
  const rows = list
    .map((m, i) => {
      const id = `trail-${section.id}-${i}`;
      const done = store.isTrailDone(cert.id, m.url);
      return `<li class="trail-item">
        <input type="checkbox" id="${id}" data-url="${esc(m.url)}" ${done ? 'checked' : ''} aria-label="${esc(m.title)} 완료">
        <div class="trail-body">
          ${
            m.note
              ? `<a href="#/c/${cert.id}/m/${esc(m.note)}">${esc(m.title)}</a>`
              : `<a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.title)}</a>`
          }
          <span class="trail-topics">${inline(m.topics)}</span>
          <span class="trail-links">${m.note ? '<span class="pill pill-ready">한국어 노트</span> ' : ''}<a href="${esc(m.url)}" target="_blank" rel="noopener">Trailhead 원문</a></span>
        </div>
        <span class="trail-meta">${m.kind === 'project' ? '<span class="pill">실습</span>' : ''}<span class="mono">${fmtMinutes(m.minutes)}</span></span>
      </li>`;
    })
    .join('');
  const p = trailProgress(cert, section);
  const total = list.reduce((a, m) => a + m.minutes, 0);
  return `<section class="block" id="trail-block"><h2>Trailhead 모듈 <span class="en">TRAIL</span></h2>
    <p class="muted">공식 준비 트레일에서 이 섹션에 해당하는 모듈이에요. 이 페이지의 요약은 아래 모듈 내용을 모두 반영합니다. 실습(Project)은 Trailhead Playground에서 직접 해 보세요.
      <span class="mono" id="trail-count">${p.done} / ${p.total} 완료</span> · 합계 ${fmtMinutes(total)}</p>
    <ul class="trail">${rows}</ul></section>`;
}

function bindTrail(cert, section) {
  const box = app.querySelector('#trail-block');
  if (!box) return;
  box.addEventListener('change', (ev) => {
    const input = ev.target.closest('input[data-url]');
    if (!input) return;
    store.setTrailDone(cert.id, input.dataset.url, input.checked);
    const p = trailProgress(cert, section);
    box.querySelector('#trail-count').textContent = `${p.done} / ${p.total} 완료`;
  });
}

function sectionQuestions(cert, sectionId) {
  return cert.questions.filter((q) => q.section === sectionId);
}

// ---------- 홈 ----------
async function renderHome() {
  setNav(null);
  setTitle('');
  const reg = await getRegistry();
  const cards = await Promise.all(
    reg.certs.map(async (entry) => {
      if (!entry.file) {
        return `<div class="cert-card is-planned">
          <div class="row"><span class="pill">${esc(entry.statusLabel)}</span></div>
          <h2>${esc(entry.name)}</h2>
          <p>${esc(entry.note ?? '')}</p>
        </div>`;
      }
      const cert = await getJSON(entry.file);
      const total = cert.sections.length;
      const done = store.doneCount(cert.id);
      const last = store.attempts(cert.id)[0];
      return `<a class="cert-card" href="#/c/${cert.id}">
        <div class="row"><span class="pill pill-ready">${esc(entry.statusLabel)}</span><span class="code">${esc(cert.exam.release)}</span></div>
        <h2>${esc(cert.name)}</h2>
        <p>${esc(entry.note ?? '')}</p>
        <div class="meter" aria-label="학습 진도"><span style="width:${(done / total) * 100}%"></span></div>
        <div class="cert-stats"><span>섹션 ${done} / ${total} 완료</span><span>${
          last ? `최근 퀴즈 ${Math.round((last.correct / last.total) * 100)}%` : '퀴즈 기록 없음'
        }</span></div>
      </a>`;
    })
  );
  app.innerHTML = `
    <section class="hero">
      <p class="eyebrow">Salesforce Certification Notes</p>
      <h1>시험에 나오는 것만, 쉽게 정리한 자격증 노트</h1>
      <p class="lead">섹션별 핵심 요약을 읽고, 시나리오 문제로 확인하고, 틀린 문제는 오답노트에서 다시 풉니다. 학습 기록은 이 브라우저에 저장돼요.</p>
    </section>
    <div class="cert-grid">${cards.join('')}</div>`;
}

// ---------- 자격증 개요 ----------
function renderOverview(cert) {
  setNav(cert, 'overview');
  setTitle(cert.name);
  const e = cert.exam;
  const facts = [
    ['문항 수', `${e.questions}문항`],
    ['시간', `${e.minutes}분`],
    ['합격선', `${e.passPercent}%`],
    ['응시료', e.fee],
    ['재응시료', e.retake],
    ['선수 조건', e.prerequisite],
  ];
  const weights = cert.sections
    .map(
      (s) => `<a class="weight-row" href="#/c/${cert.id}/s/${s.id}">
        <span class="label">${esc(s.title)} ${s.status === 'ready' ? '<span class="pill pill-ready">학습 가능</span>' : '<span class="pill pill-draft">작성 중</span>'}${
          store.isDone(cert.id, s.id) ? '<span class="pill">완료</span>' : ''
        }</span>
        <span class="pct">${s.weight}%</span>
        <span class="track"><span style="width:${s.weight}%"></span></span>
        <span class="trail-note">Trailhead 모듈 ${trailProgress(cert, s).done} / ${trailProgress(cert, s).total} 완료</span>
      </a>`
    )
    .join('');
  const order = [...cert.sections].sort((a, b) => b.weight - a.weight);

  app.innerHTML = `
    <div class="cert-layout">
      ${sideNav(cert, '__overview')}
      <div class="content">
        <header>
          <p class="eyebrow">${esc(cert.fullName)}</p>
          <h1>${esc(cert.name)} 한눈에 보기</h1>
          <p class="lead">${inline(cert.intro)}</p>
        </header>
        <section class="block">
          <h2>시험 정보 <span class="en">EXAM FACTS</span></h2>
          <dl class="facts">${facts.map(([k, v]) => `<div class="fact"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
          <p class="source-line">채점되지 않는 문항 최대 ${e.unscored}개가 추가로 나올 수 있음 · 출제 기준 ${esc(e.release)} · ${esc(e.verifiedAt)} 확인 ·
            <a href="${esc(e.source)}" target="_blank" rel="noopener">공식 Exam Guide</a></p>
        </section>
        <section class="block">
          <h2>섹션별 출제 비중 <span class="en">EXAM OUTLINE</span></h2>
          <div class="weights">${weights}</div>
        </section>
        ${
          cert.trail
            ? `<section class="block"><h2>공식 준비 트레일 <span class="en">TRAILHEAD</span></h2>
              <p><a href="${esc(cert.trail.url)}" target="_blank" rel="noopener">${esc(cert.trail.title)}</a> (${esc(cert.trail.hours)})의 모든 모듈을 섹션별로 나눠 각 섹션 페이지에 넣었어요. 모듈을 마치면 체크해 두세요.</p></section>`
            : ''
        }
        <section class="block">
          <h2>추천 학습 순서</h2>
          <p class="muted">비중이 큰 섹션부터 공부하면 같은 시간에 점수를 더 많이 올릴 수 있어요.</p>
          <ol>${order.map((s) => `<li>${esc(s.title)} (${s.weight}%)</li>`).join('')}</ol>
        </section>
        <section class="cta">
          <p>문제 ${cert.questions.length}개가 준비되어 있어요. 오답노트에는 지금 ${store.wrongIds(cert.id).length}개가 있습니다.</p>
          <a class="btn btn-primary" href="#/c/${cert.id}/quiz">퀴즈 풀기</a>
        </section>
      </div>
    </div>`;
}

// ---------- 섹션 학습 ----------
function renderSection(cert, sectionId) {
  const s = cert.sections.find((x) => x.id === sectionId);
  if (!s) return notFound();
  setNav(cert, 'overview');
  setTitle(s.title);
  const qs = sectionQuestions(cert, s.id);

  if (s.status !== 'ready') {
    app.innerHTML = `
      <div class="cert-layout">
        ${sideNav(cert, s.id)}
        <div class="content">
          <header><p class="eyebrow">시험 비중 ${s.weight}%</p><h1>${esc(s.title)}</h1><p class="lead">${inline(s.ko)}</p></header>
          ${s.objectives?.length ? `<section class="block"><h2>공식 출제 목표 <span class="en">OBJECTIVES</span></h2><ul class="objectives">${s.objectives.map((o) => `<li>${inline(o)}</li>`).join('')}</ul></section>` : ''}
          <div class="draft-note">이 섹션의 요약과 문제는 작성 중이에요. 그동안 아래 Trailhead 모듈로 공부할 수 있어요.</div>
          ${trailBlock(cert, s)}
        </div>
      </div>`;
    bindTrail(cert, s);
    return;
  }

  const blocks = [];
  blocks.push(`<section class="block"><h2>3줄 요약 <span class="en">SUMMARY</span></h2>
    <ol class="summary">${s.summary.map((t) => `<li>${inline(t)}</li>`).join('')}</ol></section>`);

  if (s.objectives?.length) {
    blocks.push(`<section class="block"><h2>공식 출제 목표 <span class="en">OBJECTIVES</span></h2>
      <ul class="objectives">${s.objectives.map((o) => `<li>${inline(o)}</li>`).join('')}</ul></section>`);
  }

  blocks.push(`<section class="block"><h2>핵심 개념 <span class="en">KEY CONCEPTS</span></h2>
    <div class="concepts">${s.concepts
      .map(
        (c) => `<article class="concept"><h3>${esc(c.term)}${c.ko ? `<span class="ko">${esc(c.ko)}</span>` : ''}</h3>
          <p>${inline(c.body)}</p>
          ${c.points?.length ? `<ul>${c.points.map((p) => `<li>${inline(p)}</li>`).join('')}</ul>` : ''}</article>`
      )
      .join('')}</div></section>`);

  if (s.tables?.length) {
    blocks.push(`<section class="block"><h2>비교표 <span class="en">COMPARE</span></h2>
      ${s.tables
        .map(
          (t) => `<div class="table-wrap"><table><caption>${esc(t.title)}</caption>
          <thead><tr>${t.headers.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${t.rows.map((r) => `<tr><th scope="row">${inline(r[0])}</th>${r.slice(1).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>`
        )
        .join('')}</section>`);
  }

  if (s.numbers?.length) {
    blocks.push(`<section class="block"><h2>외워 둘 숫자 <span class="en">LIMITS</span></h2>
      <div class="numbers">${s.numbers.map((n) => `<div class="number"><b>${esc(n.value)}</b><span>${inline(n.label)}</span></div>`).join('')}</div></section>`);
  }

  if (s.setupPaths?.length) {
    blocks.push(`<section class="block"><h2>Setup 메뉴 위치 <span class="en">WHERE IN SETUP</span></h2>
      <ul class="paths">${s.setupPaths.map((p) => `<li><span>${esc(p.label)}</span><span class="crumb">${crumb(p.path)}</span></li>`).join('')}</ul></section>`);
  }

  if (s.traps?.length) {
    blocks.push(`<section class="block"><h2>시험 함정 <span class="en">EXAM TRAPS</span></h2>
      <ul class="traps">${s.traps.map((t) => `<li>${inline(t)}</li>`).join('')}</ul></section>`);
  }

  blocks.push(trailBlock(cert, s));

  if (s.links?.length) {
    blocks.push(`<section class="block"><h2>더 공부할 자료</h2>
      <ul class="links">${s.links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title)}</a></li>`).join('')}</ul></section>`);
  }

  const done = store.isDone(cert.id, s.id);
  blocks.push(`<section class="cta">
    <p>이 섹션 문제 ${qs.length}개로 이해했는지 확인해 보세요.</p>
    <label class="check-done" for="done-${s.id}"><input type="checkbox" id="done-${s.id}" ${done ? 'checked' : ''}> 학습 완료</label>
    <a class="btn btn-primary" href="#/c/${cert.id}/quiz/${s.id}">섹션 퀴즈 풀기</a>
  </section>`);

  app.innerHTML = `
    <div class="cert-layout">
      ${sideNav(cert, s.id)}
      <div class="content">
        <header>
          <p class="eyebrow">시험 비중 ${s.weight}%</p>
          <h1>${esc(s.title)}</h1>
          <p class="lead">${inline(s.ko)}</p>
        </header>
        ${blocks.join('')}
      </div>
    </div>`;

  bindTrail(cert, s);
  app.querySelector(`#done-${CSS.escape(s.id)}`).addEventListener('change', (ev) => {
    store.setDone(cert.id, s.id, ev.target.checked);
    const link = app.querySelector(`.side a[href="#/c/${cert.id}/s/${s.id}"]`);
    link?.classList.toggle('done', ev.target.checked);
  });
}

// ---------- 모듈 노트 ----------
async function renderModuleNote(cert, noteId) {
  let section;
  let module;
  for (const s of cert.sections) {
    const m = (s.trail ?? []).find((t) => t.note === noteId);
    if (m) {
      section = s;
      module = m;
      break;
    }
  }
  if (!module) return notFound();
  const note = await getJSON(`data/notes/${cert.id}/${noteId}.json`);
  setNav(cert, 'overview');
  setTitle(module.title);
  renderNote(app, { cert, section, module, note });
  window.scrollTo(0, 0);
}

// ---------- 퀴즈 ----------
function renderQuizPicker(cert) {
  setNav(cert, 'quiz');
  setTitle(`${cert.name} 퀴즈`);
  const cards = cert.sections
    .map((s) => {
      const n = sectionQuestions(cert, s.id).length;
      return n
        ? `<a href="#/c/${cert.id}/quiz/${s.id}"><strong>${esc(s.title)}</strong><span class="count">${n}문제 · 비중 ${s.weight}%</span></a>`
        : `<div><strong>${esc(s.title)}</strong><span class="count">문제 작성 중</span></div>`;
    })
    .join('');
  const recent = store.attempts(cert.id).slice(0, 5);
  const scopeName = (scope) => (scope === 'all' ? '전체' : scope === 'review' ? '오답노트' : cert.sections.find((s) => s.id === scope)?.title ?? scope);
  app.innerHTML = `
    <div class="content">
      <header><p class="eyebrow">${esc(cert.name)}</p><h1>퀴즈</h1>
        <p class="lead">문제와 보기 순서는 매번 섞여요. 실제 시험처럼 복수 정답 문제는 고를 개수가 정해져 있고, 전부 맞혀야 정답입니다.</p></header>
      <section class="block">
        <h2>범위 선택</h2>
        <div class="quiz-pick">
          <a href="#/c/${cert.id}/quiz/all"><strong>전체 섞어서</strong><span class="count">${cert.questions.length}문제</span></a>
          ${cards}
        </div>
      </section>
      ${
        recent.length
          ? `<section class="block"><h2>최근 기록</h2><div class="table-wrap"><table>
            <thead><tr><th>범위</th><th>점수</th><th>날짜</th></tr></thead>
            <tbody>${recent
              .map(
                (a) => `<tr><th scope="row">${esc(scopeName(a.scope))}</th><td class="mono">${a.correct} / ${a.total} (${Math.round((a.correct / a.total) * 100)}%)</td>
                <td class="mono">${new Date(a.at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</td></tr>`
              )
              .join('')}</tbody></table></div></section>`
          : ''
      }
    </div>`;
}

function renderQuiz(cert, scope) {
  setNav(cert, 'quiz');
  const isAll = scope === 'all';
  const section = cert.sections.find((s) => s.id === scope);
  if (!isAll && !section) return notFound();
  const questions = isAll ? cert.questions : sectionQuestions(cert, scope);
  const title = isAll ? `${cert.name} 전체 퀴즈` : `${section.title} 퀴즈`;
  setTitle(title);
  runQuiz(app, { cert, questions, scope, title, backHref: isAll ? `#/c/${cert.id}/quiz` : `#/c/${cert.id}/s/${scope}` });
}

// ---------- 오답노트 ----------
function renderReview(cert) {
  setNav(cert, 'review');
  setTitle(`${cert.name} 오답노트`);
  const byId = new Map(cert.questions.map((q) => [q.id, q]));
  const ids = store.wrongIds(cert.id).filter((id) => byId.has(id));
  const sectionTitle = Object.fromEntries(cert.sections.map((s) => [s.id, s.title]));
  const list = ids
    .map((id) => ({ q: byId.get(id), info: store.wrongInfo(cert.id, id) }))
    .sort((a, b) => b.info.count - a.info.count)
    .map(
      ({ q, info }) => `<div class="review-item">
        <span>${inline(q.q)}</span>
        <span class="meta">${info.count}회 틀림</span>
        <span class="meta">${esc(sectionTitle[q.section] ?? '')}</span>
      </div>`
    )
    .join('');
  app.innerHTML = `
    <div class="content">
      <header><p class="eyebrow">${esc(cert.name)}</p><h1>오답노트</h1>
        <p class="lead">틀린 문제가 자동으로 모입니다. 다시 풀어서 맞히면 목록에서 빠져요.</p></header>
      ${
        ids.length
          ? `<div class="row"><a class="btn btn-primary" href="#/c/${cert.id}/review/quiz">오답 ${ids.length}개 다시 풀기</a></div>
             <div class="review-list">${list}</div>`
          : `<div class="empty">아직 틀린 문제가 없어요. <a href="#/c/${cert.id}/quiz">퀴즈 풀러 가기</a></div>`
      }
      <section class="block">
        <h2>기록 초기화</h2>
        <p class="muted">이 자격증의 학습 완료 표시, 오답노트, 퀴즈 기록을 모두 지웁니다.</p>
        <div class="row" id="reset-area"><button class="btn" type="button" id="reset">기록 초기화</button></div>
      </section>
    </div>`;
  const area = app.querySelector('#reset-area');
  app.querySelector('#reset').addEventListener('click', () => {
    area.innerHTML = `<span>정말 지울까요? 되돌릴 수 없어요.</span>
      <button class="btn" type="button" id="reset-yes">지우기</button>
      <button class="btn" type="button" id="reset-no">취소</button>`;
    area.querySelector('#reset-yes').addEventListener('click', () => {
      store.reset(cert.id);
      renderReview(cert);
    });
    area.querySelector('#reset-no').addEventListener('click', () => renderReview(cert));
  });
}

function renderReviewQuiz(cert) {
  setNav(cert, 'review');
  const ids = new Set(store.wrongIds(cert.id));
  const questions = cert.questions.filter((q) => ids.has(q.id));
  const title = '오답 다시 풀기';
  setTitle(title);
  runQuiz(app, { cert, questions, scope: 'review', title, backHref: `#/c/${cert.id}/review` });
}

window.addEventListener('hashchange', route);
route();
