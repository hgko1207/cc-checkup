---
target: 전체 화면 (단계 흐름 후 점수 반복)
total_score: 38
max_score: 40
p0_count: 0
p1_count: 0
target_identity: "file:D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
target_fingerprint: "sha256:e1775118b1ae1a0bd1a527afc9f56e626666da986c03e0c1401ae11d1ed1e678"
target_path: "D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
timestamp: 2026-10-24T16-26-27Z
slug: src-app-ui-index-html
---
Method: dual-agent 반복 (A: design review sub-agent가 실행 중인 앱을 CDP로 직접 조작, 고침 → 재측정 · 12회차에는 push 실패를 일부러 일으켜 오류 알림까지 확인)

## Design Health Score — 38/40 (Excellent), 추이 30 → 29 → 31 → 33 → 37 → 38
| # | Heuristic | Score | 남은 핵심 |
|---|---|---|---|
| 1 | Visibility | 4 | 단계·상태 알약·결론·남은 단계·처리 중 표시가 서로 맞음 |
| 2 | Real world | 4 | 쉬운 말 먼저, git 말은 접기·용어 풀이 안 |
| 3 | Control | 4 | 미리 보기, 되돌리기, 모든 창의 취소·Esc, 다시 시도, 포커스 복귀 |
| 4 | Consistency | 3 | 오류 알림 안내 두 갈래, 55점 결론과 고친 뒤 화면 (12회차 뒤 고침, 재측정 안 함) |
| 5 | Error prevention | 4 | 확인창 직후 Ctrl+Enter 무시, 적용 중 잠금, 직접 눌러야 하는 버튼 |
| 6 | Recognition | 4 | 캡션의 단축키, 확인창 용어 풀이, 용어·단축키 링크 |
| 7 | Flexibility | 3 | 사용자 설정(커밋 메시지·브랜치) 없이는 상한 |
| 8 | Minimalist | 4 | 요약 카드·사이드바 정리 |
| 9 | Error recovery | 4 | 쉬운 문장 + 담당자 안내, 개발자 안내·git 출력 접기, [다시 시도] |
| 10 | Help | 4 | 필요한 순간에 용어 풀이 |

## 이번 반복에서 고친 것
- P1: 고친 뒤 커밋 전에 "준비됨 · 모든 항목을 통과했습니다"로 표시 → 상태 알약을 아직 준비 전 → 커밋 전 → 커밋됨·아직 안 보냄 → 준비됨 한 방향으로, 할 일 카드 "남은 단계: 커밋"
- P2: 처리 중 꺼진 버튼·체크박스에 있던 포커스가 BODY로 → 패널 제목으로, aria-busy
- P2: "준비됨" 두 가지 뜻 → 보낸 뒤 한 뜻, 80점은 "목표"
- P2: 흔한 push 실패가 터미널만 안내 → 쉬운 문장 + 담당자 안내, 개발자 안내·git 출력 접기
- 미리 보기 재계산 표시(.stale), 직접 눌러야 하는 버튼 표시, push 버튼 파랑(빨강은 지우는 동작만), 확인창 용어 풀이(커밋·push, PR, 스테이징), 단계 이름 붙은 미리 보기 제목

## 남은 것
- [P3] 빈 화면에서는 용어·단축키 링크가 없음 (기준 탭이 폴더를 연 뒤에만 있음, 수용)
- Flexibility 3점: 커밋 메시지·브랜치 고르기 같은 새 기능이 필요
