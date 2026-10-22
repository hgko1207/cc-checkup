---
target: 전체화면 (설치형 앱 UI)
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
target_fingerprint: "sha256:20de7b7ed5c45eb9fa68566fa482c4c28974a9e6d0e538436e9268b13d562a91"
target_path: "D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
timestamp: 2026-10-21T16-19-09Z
slug: src-app-ui-index-html
---
Method: dual-agent (A: design review sub-agent · B: detector sub-agent, sequential on one Electron window)

## Design Health Score — 23/40 (Acceptable)

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | 진단·다시 점검 로딩 표시 없음, Claude 실행 경과 시간·10분 한도 안 보임 |
| 2 | Match System / Real World | 2 | permissions.deny, PreToolUse, 도구 이름 로그, 되돌리기 결과 restored/deleted 영어 원문 |
| 3 | User Control and Freedom | 3 | 미리보기·되돌리기·중단 복원 좋음, Esc 닫기·Claude 실행 전 확인 없음 |
| 4 | Consistency and Standards | 2 | primary 버튼 6~7개, "Claude로 만들기" 안내 vs "Claude로 반영" 버튼, 경로 구분자 혼재 |
| 5 | Error Prevention | 2 | 비용 드는 Claude 실행이 한 번 클릭, 미리보기 중 뒤 버튼 활성 |
| 6 | Recognition Rather Than Recall | 2 | 최근 폴더가 앞부분만 보여 구별 불가 |
| 7 | Flexibility and Efficiency | 2 | 단축키·통과 숨기기·선택 고치기·diff 접기 없음 |
| 8 | Aesthetic and Minimalist Design | 3 | 절제됨, 표준 경로 중복·닫을 수 없는 배너·코드 벽 |
| 9 | Error Recovery | 2 | e.message 원문 노출, 로그인·쓰기 차단 안내는 좋음 |
| 10 | Help and Documentation | 3 | [자세히]의 남는 한계 좋음, 예시 머리말·클릭 가능한 링크 없음 |

## Design Specificity Verdict
내용은 이 제품의 것(영역 4개, 왜/고치면/남는 한계, 안전 흐름, 폴더 종류 판별 이유), 생김새는 범용(베이지·파랑·흰 카드·원형 배지). 사내 표준이 화면의 기준점이 되지 못함(경로 문자열 두 번, 통과선·남은 개수 없음).
Detector (live CDP, 3 states): skipped-heading (결과 화면 h1 없음, h3 시작 — 지목한 h1은 숨김 요소라 대상 부정확), flat-type-hierarchy (12/12/13px), straggler (#standard 긴 경로 — 사실상 오탐). Static index.html: 0. Pixel contrast pass not run (window judged hidden).

## Priority Issues
- [P1] Claude 실행이 확인 없이 시작 → 패널 안 확인 단계(대상·시간·비용·백업), 실행 중 경과 시간. /impeccable harden
- [P1] 모두 고치기 미리보기가 검토 불가(파일 4개, 훅 560줄, 11,800px, 요약 없음) → 요약·항목 체크·파일 접기·출처 표시. /impeccable distill
- [P1] 문서 폴더(비개발자)에도 개발자 언어(훅·/init·git add·도구 이름·restored) → 종류별 문구, 해당 없음 접기, 한국어 상태. /impeccable clarify
- [P2] primary 남발·목표 점수·변화 없음 → 행 버튼 secondary, 요약 primary 하나 "N개 바로 고치기 (→ 약 80점)", 통과선, 35→80, 위험 행 강조, 제목 크기 단계. /impeccable layout
- [P2] 키보드·스크린리더: 패널 포커스·Esc, aria-live 범위, 같은 이름 버튼, 배지 텍스트, 포커스 링 대비 1.2:1, h1 없음. /impeccable audit

## Persona Red Flags
- Alex: 단축키 없음, 통과 행 숨기기 없음, 일부 고치기 불가, 최근 폴더 구별 불가, 표준 경로 6줄.
- Sam: 위 P2 + .linkish 12px 밑줄 없음·약 17px 영역, 최근 폴더 접근 이름 "…order-api35점".
- Jordan: 빨간 35·위험 3, 개발 용어, /init 안내와 버튼 이름 불일치, 확인 없는 과금, git add 안내, 빈 화면 본문에 CTA 없음.

## Minor Observations
한글 word-break keep-all, 800×600에서 스크롤 영역 둘·패널이 본문 덮음, 문서 모드 전환 시 최근 점수 기록 변경·문서·구조 영역 사라짐, "CLAUDE.md 6줄" 모호, 3인칭 "(점검 프로그램의 …)", "이(가)" 흔적, 업데이트 배너 닫기 없음, 예시 머리말 없음, 패널이 요약 버튼 가림.

## Questions to Consider
1. 빨간 35가 주인공이어야 하나, "할 일 3개 → 80점"이어야 하나?
2. 비개발자에게 보안 영역을 보여 줄 이유가 있나, 아예 다른 화면이어야 하나?
3. 560줄 훅 코드 노출은 확인인가 책임 전가인가?
