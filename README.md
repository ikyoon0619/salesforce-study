# Salesforce 자격증 스터디

Salesforce 자격증 시험 준비용 개인 학습 사이트입니다. 섹션별 요약, 핵심 개념, 비교표, 시험 함정, 해설이 있는 연습 문제, 오답노트를 제공합니다.

- 학습 순서: Platform App Builder → Platform Developer I → Agentforce Specialist 또는 JavaScript Developer I
- 연습 문제는 모두 직접 작성한 원본입니다. 실제 시험 문제(덤프)는 쓰지 않습니다.
- 시험 정보 출처: [Platform App Builder 공식 Exam Guide](https://help.salesforce.com/s/articleView?id=005298964&language=en_US&type=1) (Summer '26 기준, 2026-11-26 확인)

## 구조

```
index.html            화면 틀
assets/css/style.css  디자인 (라이트/다크 모드)
assets/js/main.js     해시 라우터와 화면 렌더링
assets/js/quiz.js     퀴즈 엔진 (셔플, 채점, 해설, 결과)
assets/js/store.js    학습 기록 저장 (localStorage)
assets/js/format.js   텍스트 escape, **굵게** / `코드` / [링크](https://...) 변환
data/certs.json       자격증 목록
data/pab.json         Platform App Builder 콘텐츠와 문제
tools/validate.py     콘텐츠 JSON 검사기
netlify.toml          Netlify 배포 설정
```

## 로컬에서 실행

JSON을 `fetch`로 읽기 때문에 파일을 더블클릭하면 열리지 않습니다. 간단한 서버를 띄우세요.

```bash
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000
```

## 콘텐츠 검사

```bash
python3 tools/validate.py
```

섹션 비중 합계(100%), 문제 id 중복, 정답 번호 범위, 보기별 해설 개수 등을 확인합니다. Netlify 배포 때도 자동으로 실행되며, 오류가 있으면 배포가 멈춥니다.

## 문제 형식

```json
{
  "id": "dm-01",
  "section": "data-modeling",
  "q": "문제 본문",
  "options": ["보기 A", "보기 B", "보기 C", "보기 D"],
  "answer": [1],
  "explain": "전체 해설",
  "notes": ["A가 틀린 이유", "B가 맞는 이유", "C가 틀린 이유", "D가 틀린 이유"]
}
```

`answer`에 번호가 2개 이상이면 복수 정답 문제("2개를 고르세요")로 표시됩니다. 보기 순서는 화면에서 매번 섞입니다.

## 새 자격증 추가

1. `data/<id>.json`을 `pab.json`과 같은 형식으로 만든다.
2. `data/certs.json`의 해당 항목에 `"file": "data/<id>.json"`을 넣는다.
3. `python3 tools/validate.py`로 검사한다.

## Netlify 배포

Netlify에서 **Add new site → Import an existing project → GitHub → salesforce-study** 를 고르면 `netlify.toml` 설정이 자동으로 적용됩니다. 이후 `main` 브랜치에 병합될 때마다 자동 배포됩니다.
