---
target: 앱 화면 전체
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
target_fingerprint: "sha256:e1775118b1ae1a0bd1a527afc9f56e626666da986c03e0c1401ae11d1ed1e678"
target_path: "D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
timestamp: 2026-10-28T14-46-29Z
slug: src-app-ui-index-html
---
Method: dual-agent (A: design review sub-agent, live app via CDP · B: detector sub-agent, source + live CDP), sequential on one app window

## Design Health Score — 22/40 (Acceptable)
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | 상태 알약(팀 공유 단계)과 결론 문장(점수)이 다른 축을 말함 |
| 2 | Match System / Real World | 1 | 팀 말투뿐, 기준 이름 5가지, 원인형 제목, 날 JSON 미리 보기, CLI 플래그 노출 |
| 3 | User Control and Freedom | 2 | 처음 화면으로 못 돌아감, 항목 "해당 없음" 처리 불가, 최근 폴더 삭제 불가 |
| 4 | Consistency and Standards | 2 | 고치기 동사 4종, 머리글 버튼이 글자처럼 보임, 가운뎃점 용법 3–4가지 |
| 5 | Error Prevention | 3 | 안전장치 훌륭, 단건 미리 보기가 틀린 점수 약속 |
| 6 | Recognition Rather Than Recall | 2 | 용어집이 기준 탭 맨 아래, 화면 밖 카드 참조 |
| 7 | Flexibility and Efficiency | 3 | 단축키·일괄 있음, 범위(local/project/user) 선택 없음 |
| 8 | Aesthetic and Minimalist Design | 2 | 펼친 할 일 660px 6구역, 설명 반복 |
| 9 | Error Recovery | 3 | 좋은 패턴, "팀 담당자에게 물어보세요"는 혼자 쓰는 사람에게 막다른 길 |
| 10 | Help and Documentation | 1 | 온보딩 없음, 빈 화면에서 도움말 숨김, 12px 링크 하나 |

## Priority Issues
- [P0] 제품 전체가 팀 말투·팀 점수 — 개인 저장소 사용자는 점수·목표·"준비됨"을 해석/도달할 수 없음 (settings/committed −15, 팀원에게 보내기 단계)
- [P1] 펼친 할 일이 할 일을 말하지 않음 — 원인형 제목, 행동은 13px 부제, 실제 위험(.env 읽기)은 하위 2번째
- [P1] 점수 신뢰 — 단건 미리 보기 "커밋하면 100점" 버그(app.ts:672 chosen.length === all.length), 사용자 전역/local 설정 무시 오탐(settings.ts:63, git.ts:104–117)
- [P2] 처음 화면·사용 안내·도움말 없음 — current=null 경로 없음, side-help 12px·빈 화면 숨김
- [P2] 머리글 리포트 저장·다시 점검이 투명 배경 500 글자라 버튼으로 안 보임
- [P3] 이름·동사 제각각 — 이 할 일만 고치기(실제로는 미리 보기), 바로 고치기, 기준/표준/사내 표준

## Persona Red Flags
- Jordan: 권한 우회 모드·커밋·push·감점 공식·날 JSON, 물어볼 팀 담당자 없음
- Alex: 범위 선택·패턴 부분 선택·무시 불가, 전역 설정 오탐
- 혼자 쓰는 개발자: 결론·단계·알약·용어집이 남 얘기, 준비됨 도달 불가, 개인 설정 보호가 감점

## Detector
- CLI: 7 advisory design-system-color (다크 팔레트가 DESIGN.md에 없음, 문서 누락)
- Live CDP 3 states: 0 findings. 13px 미만 보이는 글자 15–18개, 4.5:1 미만 없음
- 기준 탭 "기본 내장"이 Mono 폰트로 한글 렌더

## Middle-dot audit
문장 사이(app.ts:1761, 1337, 1912), 단계 번호+콜론(app.ts:698, 344, 1820), 단축키 표의 두 겹 의미(index.html:293–298), 상태 결합(app.ts:1956–1957, 1587), 코드 토큰 연결(core.ts:281, details.ts:11). 규칙: 띄운 점은 짧은 명사구 메타데이터에만.
