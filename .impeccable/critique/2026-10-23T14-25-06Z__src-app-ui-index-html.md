---
target: 전체 화면 (커밋·모두 처리 추가 후)
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
target_fingerprint: "sha256:40b1720e4adb0803958858f1f4f975fe6e36298eb88db643dd9217f89707a5c0"
target_path: "D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
timestamp: 2026-10-23T14-25-06Z
slug: src-app-ui-index-html
---
Method: dual-agent (A: design review sub-agent · B: detector sub-agent, sequential on one Electron window over CDP)

## Design Health Score — 28/40 (Good)
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility | 3 | 커밋 뒤 "준비됨"이지만 push 전 상태가 화면에 남지 않음 |
| 2 | Real world | 3 | 용어 풀이는 좋으나 "반영", 끊긴 원시 git 명령 상자, 비용 "150~400원"이 앱 청구처럼 읽힘 |
| 3 | Control | 3 | 되돌리기 1단계, 커밋 뒤에도 커밋 전과 같은 문구로 열림 |
| 4 | Consistency | 2 | 커밋 메시지 2종(복사 명령 vs 실제), 커밋 진입점 3~4곳, "안 됨"이 주의도 빨강 |
| 5 | Error prevention | 3 | Ctrl+Enter·첫 Tab이 유료 "Claude 실행"에 닿음 |
| 6 | Recognition | 3 | 단축키는 툴팁에만, 미리 보기 항목명이 할 일 제목과 다름 |
| 7 | Flexibility | 3 | 단축키·일괄·모두 처리 있음, push·직접 할 일은 앱 밖 |
| 8 | Minimalist | 3 | 커밋 줄 원시 명령 상자, 펼친 줄 제목 반복 |
| 9 | Error recovery | 2 | 일반 오류는 원문 + 닫기만 |
| 10 | Help | 3 | 줄별 맥락 도움말 수준급, 가이드 링크는 guideUrl 있을 때만 |

## Design Specificity Verdict
바탕은 토스풍이지만 결론 문장·감점 산식·지금/고치면/커밋하면 3구간 막대·80점 선·줄 오른쪽 +N점 열이 이 제품 고유. DESIGN.md와 다른 점: 히어로 주 버튼이 "변경 커밋하기", 커밋 줄에 [커밋하기] 추가, 체크박스·라디오 포커스 링이 기본값, 기준 요약 "안 됨"이 주의까지 빨강.

Detector: 정적 7건 advisory(design-system-color, 모두 다크 모드 토큰 값 — DESIGN.md 앞머리에 다크 팔레트가 없어서 생긴 오탐). 실행 창 10회(결과·펼침·기준·모두 처리·미리 보기·적용·커밋 줄·커밋 확인·커밋 결과·다크) 모두 0건. 이전 회차의 빗금·대비·긴 줄 지적은 모두 사라짐.

## Priority Issues
- [P1] 커밋 뒤 "준비됨"이 push 전 상태를 숨김 → "커밋됨 · push 전" 표시와 "팀원에게 보내기(git push)" 줄, 또는 확인 후 앱에서 push
- [P1] 커밋 뒤 되돌리기가 사실과 다른 약속 → 커밋 감지 시 경고 문구, 버튼 숨김, 또는 커밋 되돌리기 별도
- [P2] 커밋 진입점 넷·메시지 둘 → 히어로 하나, 명령은 "직접 하려면" 접기, 메시지 통일
- [P2] 유료 실행이 기본 키 동작 → 비용이 드는 버튼은 Ctrl+Enter 제외, 행동 바 DOM 순서 [취소][실행]
- [P2] settings 줄 "커밋 후 +15"가 커밋 줄 +15와 중복 → 줄 메모 제거, 펼친 목록에 한 줄 설명
- (사용자 질문) 비용 "150~400원" 표기가 앱이 돈을 받는 것처럼 읽힘 → "Claude 사용량 약 $0.1~0.3 (요금제 한도에서 차감)"

## Persona Red Flags
- Alex: 단축키는 툴팁에만, Ctrl+Enter가 유료 실행, 되돌리기 1단계, push는 터미널
- Jordan: 마지막 걸음이 "터미널에서 git push"인데 복사할 명령도 없음, "준비됨"을 완료로 오해
- Sam: 체크박스·라디오 기본 포커스 링, "안 됨" 구분이 색에만, 할 일 포커스 링이 점수 열 밖
- Riley: 커밋 뒤 되돌리기를 그대로 밟음

## Minor Observations
[모두 처리] 버튼 기준선 어긋남, 모두 처리 확인창에 달러 표기 없음, 예시 표준의 your-org 플레이스홀더, 결과 알림이 목록을 가리고 커밋 결과를 닫으면 포커스가 h1, 사이드바 하단 빈 공간, 빈 화면에 어떤 폴더를 고를지 안내 없음

## Questions to Consider
- push 전인데 "준비됨"이면 누구의 준비인가? 커밋됨 → push됨을 막대의 네 번째 구간으로?
- 비개발자가 두 번째 대상이라면 마지막 걸음을 터미널에 맡기는 게 맞나?
- Claude 할 일 +10점이 막대에 없는 건 의도인가?
