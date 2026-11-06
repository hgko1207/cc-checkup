---
target: src/app/ui 2차 점검 (877e93e 이후)
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
target_fingerprint: "sha256:69b2e22f22d85adb48da41af02a33aba41f2bc703051fdf83c73e0de77121328"
target_path: "D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
timestamp: 2026-11-01T15-52-03Z
slug: src-app-ui-index-html
---
Method: dual-agent (A: 디자인 검토 · B: 자동 검사). 데스크톱 앱이라 두 평가가 각자 별도 앱 창을 띄워 병렬 실행. B가 먼저 끝나 종합 문맥에 먼저 들어옴(A는 격리된 채로 완료).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | 팀 폴더가 커밋 전에도 사이드바에 초록 85점. 원격 없으면 3단계가 영원히 "지금" |
| 2 | Match System / Real World | 3 | 한 개념에 이름 3개(권한 우회 모드 / 묻지 않고… / 확인 없이…) |
| 3 | User Control and Freedom | 3 | 미리 보기·백업·되돌리기는 좋음. 원격 없는 팀 폴더는 끝낼 방법이 없음 |
| 4 | Consistency and Standards | 2 | 행 +5점 vs 미리 보기 40→60점, 리포트 저장 버튼 2개, 폴더·기준 파일 동사 흔들림 |
| 5 | Error Prevention | 3 | 되돌릴 수 없는 커밋이 파란 기본 버튼 + Ctrl+Enter, 되돌릴 수 있는 되돌리기는 빨간 버튼 |
| 6 | Recognition Rather Than Recall | 3 | 추천 세팅이 같은 항목을 다른 묶음으로 다시 보여 주며 어긋남 |
| 7 | Flexibility and Efficiency | 3 | 코드 펼침 기억 없음, Ctrl+R 도움말 누락 |
| 8 | Aesthetic and Minimalist Design | 3 | 팀 요약 카드 7층, 완료 상태가 빈 카드 |
| 9 | Error Recovery | 2 | 원격 없음을 "보낼 것이 없습니다"로 잘못 말하고 다음 할 일 없음 |
| 10 | Help and Documentation | 3 | 사용법 창·확인 창 안 용어 접기 좋음 |
| **Total** | | **28/40** | **Good (하한)** |

## Design Specificity Verdict
- LLM: 행동과 문구는 이 제품을 위해 쓰였음(할 일 줄, 고치기→커밋→보내기, 혼자/팀 이유, ruleNotes 쉬운 말, Claude 비용 안내). 겉모습(흰 카드·파란 버튼·옅은 배지)은 업종 공통. 정체성은 말에 있고 시각엔 약함. slop 아님.
- Deterministic: CLI index.html 0건(권고 1), 디렉터리 0건(권고 3: 다크 fg-2 rgba(194,196,200,.88) DESIGN.md 누락, .brand 17px 램프 밖, .bar-goal radius 1px). CDP 8개 상태(home/solo 열림/미리 보기/team/추천/기준/help/dark) 모두 0건. 프로브로 스캐너 동작 확인.

## Priority Issues
- [P1] 원격 저장소 없는 팀 폴더가 끝나지 않음 (pushFlow app.ts:1979, renderHero app.ts:1769). Fix: 원격 없음을 미리 감지해 3단계를 "원격 저장소 연결 필요"로, 개발자용에 git remote add, "보내기는 직접 할게요"로 마무리, 토스트 제목 "아직 보낼 수 없습니다". → /impeccable harden
- [P1] 숫자가 화면마다 다름: 권한 우회 행 +5점 vs 단건 미리 보기 40→60(settings.json 새로 만들며 settings/missing도 해결), 같은 .env 행이 혼자 +35·팀 +20, 위험1·주의2인데 55점, 통과 3→8개. Fix: 행의 +N을 미리 보기와 같은 계산으로, 목록 머리에 "할 일 3개 (점검 항목 5개)". → /impeccable clarify
- [P2] 커밋(되돌릴 수 없음)이 파란 기본 버튼+Ctrl+Enter, 파일 목록은 접혀 있음. Fix: deliberate, 파일 경로 바로 보이기, 경고 한 줄 분리. → /impeccable harden
- [P2] 추천 세팅이 점검 결과와 어긋남: 혼자 모드에서 권한 우회 할 일이 어떤 묶음에도 없음(teamOnly 묶음만 매칭, app.ts:2179·2193), 커밋 후 "다음/됨" 중복, 완료 시 문구 3개 중복. → /impeccable distill
- [P3] 용어 흔들림: 기본 표준/기본 기준, 사내 기준 파일/팀 기준 파일, 훅/검사(훅)/위험 명령 차단 훅, 혼자 모드에 "팀 공용 설정 파일". → /impeccable clarify

## Persona Red Flags
- Alex: 코드 보기 매번 다시 접힘, 적용마다 토스트 닫기, Ctrl+R 미기재, CLI(npx cc-checkup) 안내 없음.
- Sam: .todo-head 접근 이름에 ", 고치면 +35점" 앞 쉼표, 토스트 뒤 포커스 이동이 role=status 낭독과 겹침, 추천 묶음에 보호 동작 앞 "위험" 배지, forced-colors 없음(고대비에서 선택된 세그먼트·점수 막대 사라짐), 대화상자 구현 2종.
- Jordan: ".git이 있는 폴더" 전제, "단축키로는 실행되지 않습니다" 부정문 소음, 단건 미리 보기 제목이 지시문 통째, "3개 한 번에 고치기"(할 일) vs "파일 3개 적용"(파일).

## Minor Observations
- 사이드바 55점이 회색(DESIGN.md는 80 미만 neg, scoreTone은 50 미만만 빨강, app.ts:1573)
- .env 6가지 줄이 읽기/고치기로 거의 같은 두 줄
- 되돌리기 버튼이 나타나면 머리 경로가 잘려 흔들림
- "남은 단계: …" 카드 제목이 단계 표시와 중복
- 사용 방식 메모의 괄호 속 긴 절
- "점수는 그대로 40점" 동안 "고치면" 예상은 85→70으로 바뀜
- 900px에서 Claude 상태 줄바꿈, 대화상자 왼쪽 아래 Ctrl+Enter 칩이 외톨이

## Questions to Consider
- 모든 +N이 실제로 고치는 엔진과 같은 약속이어야 하지 않나? 지금은 4배 차이.
- 추천 세팅에서만 할 수 있는 일이 무엇인가? 없다면 어긋남만 만드는 두 번째 화면 아닌가?
- 팀 폴더가 팀원에게 하나도 안 갔는데 초록 100점이어도 되나? "내 PC 100 / 팀 0"?
