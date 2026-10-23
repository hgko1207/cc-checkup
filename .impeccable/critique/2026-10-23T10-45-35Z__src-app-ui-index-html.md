---
target: 전체화면 (새 디자인 2차)
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
target_fingerprint: "sha256:1c6141c0c151a3a7e43d6fcfa55741995cea65e5a19b2c15b97542e0331fa1dc"
target_path: "D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
timestamp: 2026-10-23T10-45-35Z
slug: src-app-ui-index-html
---
Method: dual-agent (A: design review sub-agent · B: detector sub-agent, sequential on one Electron window over CDP)

## Design Health Score — 28/40 (Good)
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility | 3 | 되돌리기 뒤 사이드바 최근 폴더 점수가 이전 값(75)으로 남음 |
| 2 | Real world | 3 | 훅·권한 우회 모드·커밋·반영 용어 풀이 없음 |
| 3 | Control | 3 | 되돌리기 1단계뿐, 되돌린 뒤 버튼이 사라짐 |
| 4 | Consistency | 2 | 줄 점수(−35)와 실제 오르는 점수(+20)·커밋(+15)의 산수가 막대와 안 맞음, 점수 열 위치 2종, 마이너스 기호 혼용, 알림 첫 줄 스타일 혼용 |
| 5 | Error prevention | 3 | 되돌리기 확인이 파일 삭제인데 파란 주 버튼, 결과 점수 미표시 |
| 6 | Recognition | 3 | 힌트 문구가 접기 표시와 중복 |
| 7 | Flexibility | 2 | Claude 일괄 실행·단축키 없음 |
| 8 | Minimalist | 3 | 히어로 요소 7개, 안심 문구 3회 반복 |
| 9 | Error recovery | 3 | 일반 오류는 원문만 |
| 10 | Help | 3 | 문맥 도움말은 강하나 용어 풀이 없음 |

## Design Specificity Verdict
IA(고치는 방법별 묶음, 지금·고치면·커밋하면 3단 막대와 80점 선)는 제품 고유, 시각은 토스 문법. 개발 도구다운 단서가 적고 사이드바 하단이 비어 있음.

Detector: 정적·실행 창 10회 스캔. repeating-stripes-gradient advisory(커밋 막대 빗금, 의미 있는 표시라 오탐에 가까움), 적용 알림 `#panel-note` line-length·straggler(긴 백업 경로). 다크 모드 신규 0건. 1차의 대비 지적은 모두 사라짐.

## Priority Issues
- [P1] 줄 점수 산수 불일치: 줄에는 "고치면 오르는 점수"를 보여 합계가 막대(35→75→90)와 맞게
- [P1] 적용 뒤 커밋 단계 위계: 히어로 주 버튼을 "커밋 명령 복사"로, 적용 알림은 짧게
- [P2] 되돌리기 뒤 사이드바 점수 갱신
- [P2] 알림을 닫으면 포커스가 사라짐(돌아갈 버튼이 숨겨진 경우)
- [P2] 점수 열 위치 통일
- [P3] 되돌리기 확인: 지우는 파일 수를 첫 줄에, 위험 색 버튼. 마이너스 기호·알림 스타일 통일

## Persona Red Flags
- Alex: 산수 불일치, Claude 일괄 실행 없음, 적용 버튼이 무엇을 하는지 말하지 않음
- Jordan: 적용 뒤 다음 할 일이 git 명령뿐, 용어 풀이 없음, 75점인데 준비 전인 이유
- Sam: 알림을 닫으면 포커스를 잃음

## Questions to Consider
- 목표가 80점인가, 팀에 적용(커밋)인가?
- 마지막 커밋을 앱 안에서 할 수는 없나?
- 할 일 13개짜리 점검표에 토스 밀도가 필요한가?
