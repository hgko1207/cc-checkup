---
target: 전체화면 (설치형 앱 UI) 4차
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
target_fingerprint: "sha256:e7ac0401da163b49f804a4d434c0bd9c645c25170a72b4fbb27d5654d712abb8"
target_path: "D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
timestamp: 2026-10-22T10-21-29Z
slug: src-app-ui-index-html
---
Method: dual-agent (A: design review sub-agent · B: detector sub-agent, sequential on one Electron window)

## Design Health Score — 31/40 (Good)
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility | 3 | 되돌리기 꺼진 이유가 title에만 |
| 2 | Real world | 3 | permissions.deny·훅 용어, .env가 없어도 "위험" |
| 3 | Control | 4 | 미리 보기·고르기·취소·백업·되돌리기·중단·버리기·자동 판별 복귀 |
| 4 | Consistency | 3 | 동사 5종, 큰 버튼 5개 vs 행 버튼 7개, 확인창이 모두 오른쪽 아래 |
| 5 | Error prevention | 3 | 폴더 종류 라디오로 점수 상승, 미리 보기 첫 Tab이 [적용] |
| 6 | Recognition | 3 | 5개 고치기 ↔ 7개 항목 대응을 머릿속으로 |
| 7 | Flexibility | 3 | Claude 작업 연속 실행·영역 이동·필터 없음 |
| 8 | Minimalist | 3 | 경로 줄, 같은 무게의 버튼 4개, 떠 있는 숨기기 토글 |
| 9 | Error recovery | 3 | 일반 오류 원문 |
| 10 | Help | 3 | 처음 사용 흐름 안내 없음 |

## Detector
Static 0, live initial 0, preview modal 0, expanded 0. Pixel contrast skipped (window judged hidden).

## Priority Issues
- [P1] 폴더 종류 직접 지정이 점수 우회로 (점수·리포트에 직접 지정 표시 없음)
- [P1] 행 버튼과 고치기 단위가 1:1이 아님, 라벨 동사 제각각
- [P2] 미리 보기 첫 Tab이 [적용]
- [P2] 모든 확인창이 오른쪽 아래 시트
- [P3] 요약 카드 위계, .env 없을 때 심각도, 숨기기 토글 위치
