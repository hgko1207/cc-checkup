---
target: 전체화면 (설치형 앱 UI) 2차
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
target_fingerprint: "sha256:994ddddcf59b2f1e607dfcc20d6f380b2cf276e106c20ec71f37a2933d2f3561"
target_path: "D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
timestamp: 2026-10-22T09-52-23Z
slug: src-app-ui-index-html
---
Method: dual-agent (A: design review sub-agent · B: detector sub-agent, sequential on one Electron window)

## Design Health Score — 28/40 (Good)

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | 폴더 종류를 바꾸면 점수가 안내 없이 바뀜 |
| 2 | Match System / Real World | 3 | 문서 폴더에서도 settings.json·훅·커밋·$ 표기 |
| 3 | User Control and Freedom | 2 | Claude 결과(ready)에서 ✕/Esc로 닫으면 앱이 잠김 (P0) |
| 4 | Consistency and Standards | 3 | "취소"의 두 의미, 경로 구분자 혼재, ghost 버튼이 텍스트처럼 보임 |
| 5 | Error Prevention | 3 | "기본으로"·폴더 종류 변경이 확인 없이 재진단 |
| 6 | Recognition Rather Than Recall | 3 | 점수 계산식·단축키가 보이지 않음 |
| 7 | Flexibility and Efficiency | 2 | 심각도 필터·다음 문제 이동 없음, 체크마다 패널 재렌더 |
| 8 | Aesthetic and Minimalist Design | 3 | H1이 전체 경로, 진단 문장 반복 |
| 9 | Error Recovery | 3 | 일반 오류는 "오류" 제목에 원문 |
| 10 | Help and Documentation | 3 | 점수 의미·계산 설명 없음 |

## Detector
Static 0. Live: initial 0, preview panel 1 (`nested-cards` on `fieldset.pick` inside `.panel` — 경계 사례), expanded 0. Pixel contrast pass skipped (window judged hidden); token contrast computed manually: 10 pairs light/dark all ≥4.5 (warn/warn-bg light 4.54 경계).

## Priority Issues
- [P0] Claude 결과 ready에서 ✕/Esc → 패널 닫힘, main은 실행 중 유지 → 모든 버튼 꺼짐, 복구 경로 없음
- [P1] render 때마다 포커스 유실(자세히, 개별 미리 보기 Esc, 자동 판별 되돌리기, Claude 확인 취소), 미리 보기 체크마다 패널 재렌더
- [P1] 점수 맥락: 종류 변경 시 조용한 점수 변화, 계산식 비공개, 예상 점수 없음, 해당 없음이 초록 통과
- [P2] sticky 하단 패널: 틈으로 목록 비침, 스크롤 3중, dialog 아님·포커스 가둠 없음
- [P2] H1이 전체 경로, 좁은 창에서 점수가 사이드바 아래

## Persona Red Flags
- Alex: 필터·이동 키 없음, 체크마다 스크롤 튐, 경로 복사 없음
- Sam: 포커스 유실, dialog 아님, #log live 아님, 꺼진 버튼 이유 없음, ghost 버튼
- Jordan: 개발 용어, 달러 표기, 빨간 35, 종류 선택 의미 설명 없음, 좁은 창에서 점수 안 보임, "기본으로" 확인 없음

## Minor
다크 모드 color-scheme 미선언, 숨기기 토글 위치 모호·"통과 N개 숨김" 클릭 불가, 진단 문장 반복, 꺼진 Claude 버튼 이유 title만, 개별 고치기 패널 제목에 항목 이름 없음.
