// 실전 모의고사: 섹션 비중대로 문제를 뽑고, 제한 시간 안에 채점 없이 끝까지 푼 뒤 한꺼번에 결과를 본다.
// 진행 중인 시험은 localStorage에 저장해서 새로 고침하거나 다른 화면에 다녀와도 이어서 풀 수 있다.
import { store } from './store.js';
import { esc, inline } from './format.js';
import { shuffle, isCorrect } from './quiz.js';

const LETTERS = 'ABCDEFGH';
const KEY = (certId) => `sfstudy:exam:${certId}`;
let timerId = null;

function stopTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
  window.onbeforeunload = null;
}

function loadSession(certId) {
  try {
    const raw = localStorage.getItem(KEY(certId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveSession(certId, s) {
  try {
    localStorage.setItem(KEY(certId), JSON.stringify(s));
  } catch {
    /* 저장 불가: 이번 화면에서만 유지 */
  }
}
function clearSession(certId) {
  try {
    localStorage.removeItem(KEY(certId));
  } catch {
    /* 무시 */
  }
}

/**
 * 섹션 비중(%)대로 문제 수를 나눈다. 최대 잉여(largest remainder) 방식으로 합계를 정확히 total에 맞추고,
 * 섹션에 준비된 문제보다 많이 배정되면 남는 몫을 다른 섹션으로 넘긴다.
 * @returns {Record<string, number>}
 */
export function allocate(sections, available, total) {
  const usable = sections.filter((s) => (available[s.id] ?? 0) > 0);
  const cap = usable.reduce((n, s) => n + available[s.id], 0);
  const target = Math.min(total, cap);
  const weightSum = usable.reduce((n, s) => n + s.weight, 0) || 1;
  const raw = usable.map((s) => ({ id: s.id, exact: (target * s.weight) / weightSum }));
  const out = Object.fromEntries(raw.map((r) => [r.id, Math.min(Math.floor(r.exact), available[r.id])]));
  let left = target - Object.values(out).reduce((a, b) => a + b, 0);
  const byRemainder = raw.slice().sort((a, b) => (b.exact % 1) - (a.exact % 1));
  while (left > 0) {
    let moved = false;
    for (const r of byRemainder) {
      if (left === 0) break;
      if (out[r.id] < available[r.id]) {
        out[r.id] += 1;
        left -= 1;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

function buildSession(cert) {
  const total = cert.exam.questions;
  const pools = Object.fromEntries(cert.sections.map((s) => [s.id, cert.questions.filter((q) => q.section === s.id)]));
  const counts = allocate(cert.sections, Object.fromEntries(Object.entries(pools).map(([k, v]) => [k, v.length])), total);
  const picked = Object.entries(counts).flatMap(([sid, n]) => shuffle(pools[sid]).slice(0, n));
  const items = shuffle(picked).map((q) => ({ id: q.id, order: shuffle(q.options.map((_, i) => i)) }));
  return {
    items,
    answers: {}, // id -> [원래 보기 번호]
    flags: {}, // id -> true
    index: 0,
    startedAt: Date.now(),
    endsAt: Date.now() + cert.exam.minutes * 60 * 1000,
  };
}

function fmtClock(ms) {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 시작 화면. 진행 중인 시험이 있으면 이어 풀기를 보여 준다. */
export function renderExamIntro(root, cert) {
  stopTimer();
  const counts = allocate(
    cert.sections,
    Object.fromEntries(cert.sections.map((s) => [s.id, cert.questions.filter((q) => q.section === s.id).length])),
    cert.exam.questions
  );
  const n = Object.values(counts).reduce((a, b) => a + b, 0);
  const saved = loadSession(cert.id);
  const resumable = saved && saved.endsAt > Date.now();
  if (saved && !resumable) clearSession(cert.id);
  const answered = resumable ? Object.keys(saved.answers).length : 0;
  const past = store.attempts(cert.id).filter((a) => a.scope === 'exam').slice(0, 5);

  root.innerHTML = `
    <div class="content exam-intro">
      <header><p class="eyebrow">${esc(cert.name)}</p><h1>실전 모의고사</h1>
        <p class="lead">실제 시험처럼 ${n}문제를 ${cert.exam.minutes}분 안에 풉니다. 문제를 풀 때는 정답을 알려 주지 않고, 제출한 뒤 한꺼번에 채점해요.</p></header>
      <section class="block">
        <h2>규칙</h2>
        <ul>
          <li>섹션 비중대로 문제를 뽑아요. 합격선은 <strong>${cert.exam.passPercent}%</strong>입니다.</li>
          <li>복수 정답 문제는 정해진 개수를 모두 맞혀야 정답이에요 (부분 점수 없음).</li>
          <li>앞뒤로 오가며 답을 바꿀 수 있고, 헷갈리는 문제는 <strong>나중에 보기</strong>로 표시해 두세요.</li>
          <li>시간이 끝나면 자동으로 제출돼요. 새로 고침하거나 다른 화면에 다녀와도 이어서 풀 수 있어요.</li>
          <li>실제 시험에는 채점하지 않는 문제 ${cert.exam.unscored}개가 더 있지만, 여기서는 모든 문제를 채점해요.</li>
        </ul>
        <div class="table-wrap"><table>
          <thead><tr><th>섹션</th><th>비중</th><th>문제 수</th></tr></thead>
          <tbody>${cert.sections
            .map((s) => `<tr><th scope="row">${esc(s.title)}</th><td class="mono">${s.weight}%</td><td class="mono">${counts[s.id] ?? 0}</td></tr>`)
            .join('')}</tbody>
        </table></div>
      </section>
      <div class="row">
        ${
          resumable
            ? `<button class="btn btn-primary" type="button" id="resume">이어서 풀기 (${answered}/${saved.items.length} 답함 · 남은 시간 ${fmtClock(saved.endsAt - Date.now())})</button>
               <button class="btn" type="button" id="restart">새로 시작</button>`
            : `<button class="btn btn-primary" type="button" id="start">시작하기</button>`
        }
      </div>
      ${
        past.length
          ? `<section class="block"><h2>지난 모의고사</h2><div class="table-wrap"><table>
              <thead><tr><th>날짜</th><th>점수</th><th>결과</th></tr></thead>
              <tbody>${past
                .map((a) => {
                  const pct = Math.round((a.correct / a.total) * 100);
                  return `<tr><th scope="row" class="mono">${new Date(a.at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</th>
                    <td class="mono">${a.correct} / ${a.total} (${pct}%)</td><td>${pct >= cert.exam.passPercent ? '합격선 이상' : '합격선 미만'}</td></tr>`;
                })
                .join('')}</tbody></table></div></section>`
          : ''
      }
    </div>`;

  const start = () => {
    const s = buildSession(cert);
    saveSession(cert.id, s);
    runExam(root, cert, s);
  };
  root.querySelector('#start')?.addEventListener('click', start);
  root.querySelector('#restart')?.addEventListener('click', start);
  root.querySelector('#resume')?.addEventListener('click', () => runExam(root, cert, saved));
}

function runExam(root, cert, s) {
  stopTimer();
  const byId = new Map(cert.questions.map((q) => [q.id, q]));
  // 문제 데이터가 바뀌어 없어진 문제는 건너뛴다
  s.items = s.items.filter((it) => byId.has(it.id));
  if (!s.items.length) {
    clearSession(cert.id);
    return renderExamIntro(root, cert);
  }
  s.index = Math.min(s.index, s.items.length - 1);
  const sectionTitle = Object.fromEntries(cert.sections.map((x) => [x.id, x.title]));
  const persist = () => saveSession(cert.id, s);
  const isAnswered = (id) => {
    const a = s.answers[id];
    return Boolean(a && a.length === byId.get(id).answer.length);
  };

  window.onbeforeunload = (e) => {
    e.preventDefault();
    e.returnValue = '';
  };

  root.innerHTML = `
    <div class="exam">
      <div class="exam-bar">
        <span class="exam-title">${esc(cert.name)} 모의고사</span>
        <span class="exam-count mono" id="exam-count"></span>
        <span class="exam-timer mono" id="exam-timer" role="timer" aria-live="off"></span>
        <button class="btn" type="button" id="finish">제출하기</button>
      </div>
      <div class="exam-body">
        <div id="exam-q"></div>
        <nav class="exam-grid" id="exam-grid" aria-label="문제 목록"></nav>
      </div>
      <div id="exam-confirm"></div>
    </div>`;

  const qBox = root.querySelector('#exam-q');
  const grid = root.querySelector('#exam-grid');
  const timerEl = root.querySelector('#exam-timer');
  const countEl = root.querySelector('#exam-count');

  function tick() {
    if (!timerEl.isConnected) return stopTimer();
    const left = s.endsAt - Date.now();
    timerEl.textContent = fmtClock(left);
    timerEl.classList.toggle('low', left < 10 * 60 * 1000);
    if (left <= 0) submit(true);
  }

  function renderGrid() {
    const done = s.items.filter((it) => isAnswered(it.id)).length;
    countEl.textContent = `${done} / ${s.items.length} 답함`;
    grid.innerHTML = s.items
      .map((it, i) => {
        const cls = [isAnswered(it.id) ? 'done' : '', s.flags[it.id] ? 'flag' : '', i === s.index ? 'current' : ''].join(' ');
        const label = `${i + 1}번${isAnswered(it.id) ? ', 답함' : ''}${s.flags[it.id] ? ', 나중에 보기' : ''}`;
        return `<button type="button" class="${cls}" data-i="${i}" aria-label="${label}"${i === s.index ? ' aria-current="true"' : ''}>${i + 1}</button>`;
      })
      .join('');
  }

  function renderQuestion() {
    const it = s.items[s.index];
    const q = byId.get(it.id);
    const multi = q.answer.length > 1;
    const chosen = new Set(s.answers[it.id] ?? []);
    qBox.innerHTML = `
      <form class="question" id="qform" novalidate>
        <div class="exam-qhead">
          <span class="eyebrow">${s.index + 1}번 · ${esc(sectionTitle[q.section] ?? '')}</span>
          <label class="flag-toggle"><input type="checkbox" id="flag" ${s.flags[it.id] ? 'checked' : ''}> 나중에 보기</label>
        </div>
        <p class="stem">${inline(q.q)}</p>
        ${multi ? `<p class="pick">${q.answer.length}개를 고르세요 (Choose ${q.answer.length})</p>` : ''}
        <fieldset class="options">
          ${it.order
            .map(
              (orig, k) => `
            <label class="option">
              <input type="${multi ? 'checkbox' : 'radio'}" name="opt" value="${orig}" ${chosen.has(orig) ? 'checked' : ''}>
              <span><span class="letter">${LETTERS[k]}.</span>${inline(q.options[orig])}</span>
            </label>`
            )
            .join('')}
        </fieldset>
        <div class="quiz-actions">
          <button class="btn" type="button" id="prev" ${s.index === 0 ? 'disabled' : ''}>이전</button>
          <button class="btn btn-primary" type="button" id="next">${s.index + 1 < s.items.length ? '다음' : '제출 화면으로'}</button>
        </div>
      </form>`;

    const inputs = [...qBox.querySelectorAll('input[name="opt"]')];
    inputs.forEach((inp) =>
      inp.addEventListener('change', () => {
        let sel = inputs.filter((x) => x.checked).map((x) => Number(x.value));
        // 복수 정답은 정해진 개수보다 많이 고르지 못하게 막는다
        if (multi && sel.length > q.answer.length) {
          inp.checked = false;
          sel = inputs.filter((x) => x.checked).map((x) => Number(x.value));
        }
        s.answers[it.id] = sel;
        persist();
        renderGrid();
      })
    );
    qBox.querySelector('#flag').addEventListener('change', (e) => {
      if (e.target.checked) s.flags[it.id] = true;
      else delete s.flags[it.id];
      persist();
      renderGrid();
    });
    qBox.querySelector('#prev').addEventListener('click', () => go(s.index - 1));
    qBox.querySelector('#next').addEventListener('click', () => (s.index + 1 < s.items.length ? go(s.index + 1) : confirmSubmit()));
  }

  function go(i) {
    s.index = Math.max(0, Math.min(s.items.length - 1, i));
    persist();
    renderQuestion();
    renderGrid();
    root.querySelector('.exam-bar').scrollIntoView({ block: 'nearest' });
  }

  function confirmSubmit() {
    const unanswered = s.items.filter((it) => !isAnswered(it.id)).length;
    const flagged = Object.keys(s.flags).length;
    const box = root.querySelector('#exam-confirm');
    box.innerHTML = `
      <div class="exam-confirm" role="alertdialog" aria-labelledby="confirm-title">
        <p id="confirm-title"><strong>제출할까요?</strong></p>
        <p>${unanswered ? `아직 답하지 않은 문제가 <strong>${unanswered}개</strong> 있어요 (틀린 것으로 채점). ` : '모든 문제에 답했어요. '}${flagged ? `나중에 보기로 표시한 문제 ${flagged}개.` : ''}</p>
        <div class="row">
          <button class="btn btn-primary" type="button" id="confirm-yes">제출하고 채점</button>
          <button class="btn" type="button" id="confirm-no">계속 풀기</button>
        </div>
      </div>`;
    box.querySelector('#confirm-yes').addEventListener('click', () => submit(false));
    box.querySelector('#confirm-no').addEventListener('click', () => (box.innerHTML = ''));
    box.querySelector('#confirm-yes').focus();
  }

  function submit(timeUp) {
    stopTimer();
    clearSession(cert.id);
    const results = s.items.map((it) => {
      const q = byId.get(it.id);
      const sel = s.answers[it.id] ?? [];
      const ok = isCorrect(sel, q.answer);
      store.recordAnswer(cert.id, q.id, ok);
      return { q, order: it.order, sel, ok, flagged: Boolean(s.flags[it.id]) };
    });
    const correct = results.filter((r) => r.ok).length;
    store.addAttempt(cert.id, 'exam', correct, results.length);
    renderExamResult(root, cert, results, { timeUp, usedMs: Math.min(Date.now(), s.endsAt) - s.startedAt });
  }

  grid.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (b) go(Number(b.dataset.i));
  });
  root.querySelector('#finish').addEventListener('click', confirmSubmit);

  renderQuestion();
  renderGrid();
  tick();
  if (timerEl.isConnected && s.endsAt > Date.now()) timerId = setInterval(tick, 1000);
}

function renderExamResult(root, cert, results, { timeUp, usedMs }) {
  const sectionTitle = Object.fromEntries(cert.sections.map((x) => [x.id, x.title]));
  const correct = results.filter((r) => r.ok).length;
  const pct = Math.round((correct / results.length) * 100);
  const pass = pct >= cert.exam.passPercent;

  const bySection = cert.sections
    .map((sec) => {
      const rs = results.filter((r) => r.q.section === sec.id);
      if (!rs.length) return '';
      const c = rs.filter((r) => r.ok).length;
      const p = Math.round((c / rs.length) * 100);
      return `<tr><th scope="row">${esc(sec.title)}</th><td class="mono">${sec.weight}%</td><td class="mono">${c} / ${rs.length}</td>
        <td><div class="meter" aria-hidden="true"><span class="${p >= cert.exam.passPercent ? 'ok' : 'low'}" style="width:${p}%"></span></div><span class="mono">${p}%</span></td></tr>`;
    })
    .join('');

  const review = results
    .map((r, i) => {
      const chosen = new Set(r.sel);
      const opts = r.order
        .map((orig, k) => {
          const right = r.q.answer.includes(orig);
          const cls = right ? 'is-correct' : chosen.has(orig) ? 'is-wrong' : '';
          const mark = chosen.has(orig) ? ' (내 선택)' : '';
          const note = r.q.notes?.[orig] ? `<div class="note">${right ? '정답 이유' : '오답 이유'}: ${inline(r.q.notes[orig])}</div>` : '';
          return `<div class="option ${cls}"><span></span><span><span class="letter">${LETTERS[k]}.</span>${inline(r.q.options[orig])}${mark}</span>${note}</div>`;
        })
        .join('');
      return `<details class="exam-review ${r.ok ? 'ok' : 'ng'}" data-ok="${r.ok}">
        <summary><span class="mono">${i + 1}</span><span class="tag ${r.ok ? 'good' : 'bad'}">${r.ok ? '정답' : r.sel.length ? '오답' : '무응답'}</span>
          <span class="sum-q">${inline(r.q.q)}</span>${r.flagged ? '<span class="tag">표시</span>' : ''}</summary>
        <div class="question answered">
          <p class="eyebrow">${esc(sectionTitle[r.q.section] ?? '')}</p>
          <p class="stem">${inline(r.q.q)}</p>
          <div class="options">${opts}</div>
          <div class="explain"><p>${inline(r.q.explain)}</p></div>
        </div>
      </details>`;
    })
    .join('');

  const wrongN = results.length - correct;
  root.innerHTML = `
    <div class="result exam-result">
      <p class="eyebrow">${esc(cert.name)} 모의고사 결과${timeUp ? ' · 시간 종료로 자동 제출' : ''}</p>
      <div class="score">
        <b class="${pass ? 'pass' : 'fail'}">${pct}%</b>
        <span>${correct} / ${results.length} 정답 · 합격선 ${cert.exam.passPercent}% ${pass ? '이상입니다' : '미만입니다'} · 걸린 시간 ${fmtClock(usedMs)}</span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>섹션</th><th>비중</th><th>정답</th><th>정답률</th></tr></thead>
        <tbody>${bySection}</tbody>
      </table></div>
      <p class="muted">틀린 문제 ${wrongN}개는 오답노트에 저장했어요. 정답률이 낮은 섹션의 노트부터 다시 보세요.</p>
      <div class="row">
        <a class="btn btn-primary" href="#/c/${cert.id}/review">오답노트 보기</a>
        <button class="btn" type="button" id="retake">다시 응시</button>
      </div>
      <section class="block">
        <div class="exam-review-head"><h2>문제별 해설</h2>
          <label class="check-done"><input type="checkbox" id="only-wrong" ${wrongN ? 'checked' : ''}> 틀린 문제만 보기</label></div>
        <div class="exam-reviews" id="exam-reviews">${review}</div>
      </section>
    </div>`;

  root.querySelector('#retake').addEventListener('click', () => renderExamIntro(root, cert));
  const list = root.querySelector('#exam-reviews');
  const toggle = root.querySelector('#only-wrong');
  const apply = () => list.classList.toggle('only-wrong', toggle.checked);
  toggle.addEventListener('change', apply);
  apply();
  window.scrollTo(0, 0);
}

/** 라우터가 다른 화면으로 갈 때 타이머를 멈춘다 */
export function leaveExam() {
  stopTimer();
}
