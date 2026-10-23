---
target: 전체 화면 (점수 올리기 반복 후)
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
target_fingerprint: "sha256:6a92d3c4686325242a43c43727e34b0022a5c7feff784e30f8a8d947afb4c446"
target_path: "D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
timestamp: 2026-10-23T15-33-03Z
slug: src-app-ui-index-html
---
Method: dual-agent 반복 (A: design review sub-agent, 고침 → 재측정 4회 · B: detector는 3회차 실행 창 10상태 0건)

## Design Health Score — 30/40 (Good), 반복 추이 29 → 30 → 30 → 30
| # | Heuristic | Score | 남은 핵심 |
|---|---|---|---|
| 1 | Visibility | 3 | 일부만 적용했을 때 다음 단계 안내 (이번에 고침) |
| 2 | Real world | 3 | 보내기·커밋 확인창의 git 말(origin/master, revert, pull) |
| 3 | Control | 3 | 커밋 뒤 앱 되돌리기 없음, 되돌리기는 마지막 1회 |
| 4 | Consistency | 3 | 위험 색 규칙(보내기 버튼, 이번에 빨강으로) |
| 5 | Error prevention | 3 | PR 경고가 각주에 (이번에 본문으로) |
| 6 | Recognition | 3 | 커밋 뒤 되돌리기가 말없이 사라짐 (보내기 줄에 안내) |
| 7 | Flexibility | 3 | 커밋 메시지 고정, 보낼 브랜치 고정 |
| 8 | Minimalist | 3 | Claude 확인창 사실 7줄, 보내기 각주, 사이드바 단축키 문단 |
| 9 | Error recovery | 3 | 오류가 status로 조용히 (이번에 alert + 다시 시도 포커스) |
| 10 | Help | 3 | 용어집이 기준 탭 맨 아래 |

## 이번 반복에서 고친 것
점수 메모·포커스·결과 알림 크기·단축키 표시·Ctrl+Z, 창 전체 스크롤 버그, 확인창 두 번 실행, 보낼 커밋 목록·앱 커밋 표시, 일부 적용 점수·다음 단계·커밋 버튼, 커밋 뒤 안 보낸 상태 표시, 말 통일(팀 저장소), 오류 alert

## 남은 것 (4점으로 가려면 구조 변경)
- 커밋·보내기 흐름의 git 개념을 비개발자용으로 더 감싸기 (한 단계 "팀에 적용" 마법사 등)
- 커밋 메시지 편집·브랜치 선택(기능 추가)
- 확인창 정보량 줄이기
