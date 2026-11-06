---
target: src/app/ui (Montage 재디자인 후)
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
target_fingerprint: "sha256:1e370f5af44ded99386982518117aeca2a6f6da8a63fcc9657601e2a18e63d15"
target_path: "D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
timestamp: 2026-10-30T13-42-20Z
slug: src-app-ui-index-html
---
Method: dual-agent (A: design review agent · B: detector agent, desktop app, separate app instances)

## Design Health Score: 28/40 (Good, low end), previous 22/40

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | 전후 점수가 알림과 함께 사라짐, 팀은 보내기 전 사이드바 초록 100점 |
| 2 | Match System / Real World | 3 | 미리 보기 체크 항목 "team-ai-kit 훅", JSON 펼침, "확인 전" |
| 3 | User Control and Freedom | 3 | 미리 보기·취소·되돌리기 있음, PR 팀은 보내기 창에서 막힘 |
| 4 | Consistency and Standards | 2 | 할 일 3개 / 위험·주의 5건 / 문제 5건 / 추천 4+1 숫자 단위 불일치, 검사·훅 용어 섞임 |
| 5 | Error Prevention | 3 | 되돌릴 수 없는 커밋이 Ctrl+Enter 두 번으로 됨 |
| 6 | Recognition Rather Than Recall | 3 | 보내기 창이 팀 PR 정책을 기억하게 함 |
| 7 | Flexibility and Efficiency | 3 | 주 버튼이 Tab 7번째 |
| 8 | Aesthetic and Minimalist Design | 2 | 점수 줄 사실 5개, 추천 세팅이 할 일 반복, 한 줄에 같은 동작 3곳 |
| 9 | Error Recovery | 3 | 코드상 양호 |
| 10 | Help and Documentation | 3 | 사용법·용어 창, 검색 없음 |

## Design Specificity Verdict
문구는 제품 고유(위험 문장, 고치면·커밋하면 막대, 단계), 생김새는 회색 바탕 흰 카드라 흔함 (Montage 선택의 결과).
Detector: CLI 0 findings (advisory 3: dark fg-2 오탐, .brand 17px, .bar-goal radius 1px). CDP 7 states: light 0, dark 1 low-contrast (sidebar current folder name #3385ff on brand-subtle 4.0:1; same pair in step title, 사내 tag, guide number).

## Priority Issues
1. [P1] 화면 숫자 불일치: 할 일 단위로 통일, 진단 항목 수는 점검 기준에만 (clarify)
2. [P1] 팀 끝·전후 비교 약함: 커밋 시 100점, 보내기 전 초록, 55→100은 알림뿐. 처음→지금 상시 표시, 완료 카드 (onboard)
3. [P1] 미리 보기가 코드 먼저, 안심 문구는 스크롤 아래: diff 접기, 백업 문구를 적용 버튼 옆으로, 체크 항목 쉬운 말 (distill)
4. [P2] 혼자 모드에 팀 문구: 되돌리기 문구, 팀 전용 항목 "보지 않음", 점수 같으면 알림 안 함 (clarify)
5. [P2] 보내기 창이 PR 팀 막다른 길, 커밋 목록 접힘 (harden)

## Persona Red Flags
- Alex: 주 버튼 Tab 7번째, JSON 스크롤, Ctrl+Enter 커밋
- Sam: Ctrl+Enter 표시가 버튼처럼 보임, "점검 기준에서 이 항목 보기"가 dt 칸에 들어감(.todo-body > div 격자 규칙 버그)
- Jordan: ".git이 있는 폴더", JSON, team-ai-kit 훅, "직접 눌러 주세요"
- 혼자 개발자: 커밋 문구, 팀 전용 −15 항목
- 팀 리드: 전후 비교 화면 없음, 추천·결과 숫자 다름

## Minor Observations
- 되돌리기 버튼 나타나면 머리글 좁아져 "탐색기에서 열기" 두 줄
- 추천 세팅 "이런 명령을…" 지시어 대상 없음
- 막대 연한·점선 구간 범례 없음
- 어두운 모드 brand-text 대비 4.0:1
- 사이드바 "다시 확인" 의미 불명

## Questions to Consider
- 결과 목록을 묶음별로 나누고 추천 탭을 없앨까?
- 점수는 "이 PC에서 안전"까지, "팀에 적용됨"은 별도 완료 상태로?
- 55→100을 닫히는 알림이 아니라 남는 화면으로?
