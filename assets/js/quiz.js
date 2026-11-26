// 퀴즈 엔진: 문제 순서와 보기 순서를 섞고, 채점하고, 해설을 보여 준다.
import { store } from './store.js';
import { esc, inline } from './format.js';

const LETTERS = 'ABCDEFGH';

/** Fisher-Yates 셔플 (원본 배열은 건드리지 않음) */
export function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 정답 판정: 고른 보기 집합과 정답 집합이 정확히 같아야 정답 (부분 점수 없음, 실제 시험과 동일) */
export function isCorrect(selected, answer) {
  if (selected.length !== answer.length) return false;
  const s = new Set(selected);
  return answer.every((i) => s.has(i));
}

/**
 * 퀴즈 화면을 root에 그린다.
 * @param {HTMLElement} root
 * @param {{cert: object, questions: object[], scope: string, title: string, backHref: string}} opts
 */
export function runQuiz(root, { cert, questions, scope, title, backHref }) {
  const sectionTitle = Object.fromEntries(cert.sections.map((s) => [s.id, s.title]));
  // 각 문제마다 보기 표시 순서를 미리 섞어 둔다. order[k] = 원래 보기 번호
  const items = shuffle(questions).map((q) => ({ q, order: shuffle(q.options.map((_, i) => i)) }));
  const results = []; // {q, correct}
  let index = 0;

  function renderQuestion() {
    const { q, order } = items[index];
    const multi = q.answer.length > 1;
    const type = multi ? 'checkbox' : 'radio';
    root.innerHTML = `
      <div class="quiz">
        <div class="quiz-head">
          <span>${esc(title)}</span>
          <div class="progress" aria-hidden="true"><span style="width:${(index / items.length) * 100}%"></span></div>
          <span>${index + 1} / ${items.length}</span>
        </div>
        <form class="question" id="qform" novalidate>
          <p class="eyebrow">${esc(sectionTitle[q.section] ?? '')}</p>
          <p class="stem">${inline(q.q)}</p>
          ${multi ? `<p class="pick">${q.answer.length}개를 고르세요 (Choose ${q.answer.length})</p>` : ''}
          <fieldset class="options">
            <legend class="sr-only" hidden>보기</legend>
            ${order
              .map(
                (orig, k) => `
              <label class="option" data-orig="${orig}">
                <input type="${type}" name="opt" value="${orig}" id="opt-${q.id}-${orig}">
                <span><span class="letter">${LETTERS[k]}.</span>${inline(q.options[orig])}</span>
              </label>`
              )
              .join('')}
          </fieldset>
          <div id="feedback"></div>
          <div class="quiz-actions">
            <a class="btn" href="${backHref}">그만하기</a>
            <button class="btn btn-primary" type="submit" id="submit" disabled>채점하기</button>
          </div>
        </form>
      </div>`;

    const form = root.querySelector('#qform');
    const submit = root.querySelector('#submit');
    const inputs = [...form.querySelectorAll('input[name="opt"]')];

    form.addEventListener('change', () => {
      const n = inputs.filter((i) => i.checked).length;
      submit.disabled = multi ? n !== q.answer.length : n === 0;
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (form.classList.contains('answered')) {
        next();
        return;
      }
      const selected = inputs.filter((i) => i.checked).map((i) => Number(i.value));
      const ok = isCorrect(selected, q.answer);
      results.push({ q, correct: ok });
      store.recordAnswer(cert.id, q.id, ok);
      showFeedback(form, q, selected, ok);
      inputs.forEach((i) => (i.disabled = true));
      submit.disabled = false;
      submit.textContent = index + 1 < items.length ? '다음 문제' : '결과 보기';
      submit.focus();
    });
  }

  function showFeedback(form, q, selected, ok) {
    form.classList.add('answered');
    const chosen = new Set(selected);
    form.querySelectorAll('.option').forEach((label) => {
      const orig = Number(label.dataset.orig);
      const right = q.answer.includes(orig);
      if (right) label.classList.add('is-correct');
      else if (chosen.has(orig)) label.classList.add('is-wrong');
      const note = q.notes?.[orig];
      if (note) {
        const div = document.createElement('div');
        div.className = 'note';
        div.innerHTML = `${right ? '정답 이유' : '오답 이유'}: ${inline(note)}`;
        label.appendChild(div);
      }
    });
    form.querySelector('#feedback').innerHTML = `
      <div class="stack">
        <p class="verdict ${ok ? 'good' : 'bad'}">${ok ? '정답입니다' : '틀렸습니다. 오답노트에 저장했어요'}</p>
        <div class="explain"><p>${inline(q.explain)}</p></div>
      </div>`;
  }

  function next() {
    index += 1;
    if (index < items.length) {
      renderQuestion();
      root.scrollIntoView({ block: 'start' });
    } else {
      renderResult();
    }
  }

  function renderResult() {
    const correct = results.filter((r) => r.correct).length;
    const total = results.length;
    const pct = total ? Math.round((correct / total) * 100) : 0;
    const pass = pct >= cert.exam.passPercent;
    store.addAttempt(cert.id, scope, correct, total);

    // 섹션별 정답률
    const bySection = {};
    for (const r of results) {
      const s = (bySection[r.q.section] ??= { correct: 0, total: 0 });
      s.total += 1;
      if (r.correct) s.correct += 1;
    }
    const rows = Object.entries(bySection)
      .map(
        ([sid, s]) => `<tr><th scope="row">${esc(sectionTitle[sid] ?? sid)}</th>
          <td class="mono">${s.correct} / ${s.total}</td><td class="mono">${Math.round((s.correct / s.total) * 100)}%</td></tr>`
      )
      .join('');
    const wrong = results.filter((r) => !r.correct);

    root.innerHTML = `
      <div class="result">
        <p class="eyebrow">${esc(title)} 결과</p>
        <div class="score">
          <b class="${pass ? 'pass' : 'fail'}">${pct}%</b>
          <span>${correct} / ${total} 정답 · 합격선 ${cert.exam.passPercent}% ${pass ? '이상입니다' : '미만입니다'}</span>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>섹션</th><th>정답</th><th>정답률</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        ${
          wrong.length
            ? `<div class="stack"><h2 class="block-title">틀린 문제 ${wrong.length}개</h2>
               <div class="review-list">${wrong
                 .map((r) => `<div class="review-item"><span>${inline(r.q.q)}</span></div>`)
                 .join('')}</div></div>`
            : '<p class="muted">모두 맞혔어요.</p>'
        }
        <div class="row">
          <a class="btn btn-primary" href="#/c/${cert.id}/review">오답노트 보기</a>
          <button class="btn" type="button" id="again">다시 풀기</button>
          <a class="btn" href="${backHref}">돌아가기</a>
        </div>
      </div>`;
    root.querySelector('#again').addEventListener('click', () => runQuiz(root, { cert, questions, scope, title, backHref }));
  }

  if (!items.length) {
    root.innerHTML = `<div class="empty">풀 문제가 없어요. <a href="${backHref}">돌아가기</a></div>`;
    return;
  }
  renderQuestion();
}
