// 학습 기록 저장소. 브라우저 localStorage에 한 개의 키로 저장한다.
// 저장이 막힌 환경(사생활 보호 모드 등)에서도 화면은 정상 동작하도록 모든 접근을 try/catch로 감싼다.

const KEY = 'sfstudy:v1';

/** @typedef {{done: Record<string, boolean>, wrong: Record<string, {count:number, last:string}>, attempts: Array<{scope:string, correct:number, total:number, at:string}>}} CertState */

function empty() {
  return { certs: {} };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw);
    return data && typeof data === 'object' && data.certs ? data : empty();
  } catch {
    return empty();
  }
}

let state = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 저장 불가: 이번 방문 동안만 메모리에 유지 */
  }
}

/** @returns {CertState} */
function cert(certId) {
  if (!state.certs[certId]) {
    state.certs[certId] = { done: {}, wrong: {}, attempts: [], trail: {} };
  }
  state.certs[certId].trail ??= {};
  return state.certs[certId];
}

export const store = {
  isDone(certId, sectionId) {
    return Boolean(cert(certId).done[sectionId]);
  },
  setDone(certId, sectionId, value) {
    cert(certId).done[sectionId] = Boolean(value);
    save();
  },
  doneCount(certId) {
    return Object.values(cert(certId).done).filter(Boolean).length;
  },

  /** Trailhead 모듈 완료 표시 (키 = 모듈 URL) */
  isTrailDone(certId, url) {
    return Boolean(cert(certId).trail[url]);
  },
  setTrailDone(certId, url, value) {
    cert(certId).trail[url] = Boolean(value);
    save();
  },

  /** 문제를 맞혔는지 틀렸는지 기록. 틀리면 오답노트에 넣고, 오답노트에 있던 문제를 맞히면 뺀다. */
  recordAnswer(certId, questionId, correct) {
    const c = cert(certId);
    if (correct) {
      delete c.wrong[questionId];
    } else {
      const prev = c.wrong[questionId];
      c.wrong[questionId] = { count: (prev?.count ?? 0) + 1, last: new Date().toISOString() };
    }
    save();
  },
  wrongIds(certId) {
    return Object.keys(cert(certId).wrong);
  },
  wrongInfo(certId, questionId) {
    return cert(certId).wrong[questionId];
  },

  addAttempt(certId, scope, correct, total) {
    const c = cert(certId);
    c.attempts.unshift({ scope, correct, total, at: new Date().toISOString() });
    c.attempts = c.attempts.slice(0, 30);
    save();
  },
  attempts(certId) {
    return cert(certId).attempts;
  },

  reset(certId) {
    delete state.certs[certId];
    save();
  },
};
