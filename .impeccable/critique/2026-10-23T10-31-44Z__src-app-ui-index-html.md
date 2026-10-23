---
target: 전체화면 (새 디자인 1차)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
target_fingerprint: "sha256:a0b54ec9d8d0896eb2159d6230ad2172ad82a184b7d8718db9b681fe51773b19"
target_path: "D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
timestamp: 2026-10-23T10-31-44Z
slug: src-app-ui-index-html
---
Method: dual-agent (A: design review sub-agent · B: detector sub-agent, sequential on one Electron window over CDP)

## Design Health Score — 27/40 (Acceptable)
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility | 3 | "커밋하면 90점" 막대 구간이 트랙과 1.06:1로 안 보임 |
| 2 | Real world | 3 | 훅·권한 우회 모드·team-ai@team-ai-kit·raw diff 헤더 노출 |
| 3 | Control | 3 | 1번 할 일 설명(우회·훅까지 만든다)과 [이것만 고치기]가 모순 |
| 4 | Consistency | 2 | 확인창 위치 2종(바닥 시트·가운데), 개수 단위 3종(할 일·진단 항목·건), 동사 혼재, Claude 행 점수 열 어긋남 |
| 5 | Error prevention | 3 | 미리 보기가 75점이 아직 80점 아래라는 걸 말하지 않음, [적용]이 내용보다 먼저 |
| 6 | Recognition | 3 | 75→90의 핵심인 커밋이 할 일 목록에 없음 |
| 7 | Flexibility | 2 | Claude 항목 일괄 실행·적용 단축키·커밋 명령 복사 없음 |
| 8 | Minimalist | 3 | 할 일 7행이 같은 무게, 펼친 줄이 제목을 반복 |
| 9 | Error recovery | 2 | 일반 오류 패널은 원문만 |
| 10 | Help | 3 | 커밋 방법 안내 없음 |

## Design Specificity Verdict
정보 구조와 문구(3단 막대·80점 선·"고치고 커밋하면" 문장·고치는 방법별 묶음·원화 비용·기준 3열)는 이 제품 고유. 시각 체계(Pretendard·#f2f4f6·토스 블루·흰 카드·파스텔 배지, 기준 탭 4색 타일)는 범용. 확인 패널은 새 질감을 따라가지 못함.

Detector: 정적 0건. 실행 창 6상태: low-contrast warning 1(`.recent .where` #6b7684 on #e8f3ff 4.1:1), advisory 3(`--ink-3`가 #f9fafb·#f6f7f9 위 4.3~4.4:1: .todo-sub, .rule-tile span, .file pre .meta), flat-type-hierarchy advisory 1(기준 탭 h3 15 / h2 18 / h1 22, 낮은 우선순위). 다크 0건. 패널 고유 지적 0건.

## Priority Issues
- [P1] 커밋이 일급 단계가 아님: 할 일에 커밋 행 없음, 적용 결과의 커밋 안내가 회색 12px note. → 커밋 행 추가, 적용 결과 주 메시지를 "이제 커밋하면 90점", 명령 복사
- [P1] [이것만 고치기]와 묶음 설명 모순 → settings.json 설명을 "함께 고른 항목이 이 파일에 들어간다"로, 버튼 문구 정리
- [P2] 확인창이 새 디자인을 따르지 않음: 위치 2종, 행동이 헤더에, 취소·X 중복, 기계적 요약 → 한 형태(가운데)로 통일, 하단 행동 바, 큰 한 문장 요약, Claude 실행 버튼에 비용
- [P2] 개수 단위·동사 통일: 할 일 / 문제 두 단위
- [P3] 커밋 구간 대비(빗금), Claude 행 버튼 열 고정, ink-3 대비, 기준 탭 제목 단계, 기준 표 스크린리더 열 이름

## Persona Red Flags
- Alex(숙련 개발자): 적용 단축키 없음, Claude 항목 일괄 실행 없음, 커밋 명령 복사 없음
- Jordan(비개발 기획자): 용어(훅·권한 우회·확인 전)와 raw diff, 커밋 방법 안내 없음
- Sam(스크린리더): 기준 탭 열 머리가 aria-hidden이라 "주의 −5 / 안 됨"의 열 의미가 안 들림

## Minor Observations
헤더 quiet 버튼과 링크 무게 차이, 경로 줄 정보량, "눌러서 이유 보기" 힌트, 사이드바 폴더 종류 중복, 대괄호 버튼 표기, 다크 모드 막대 구간 구분, 기준 탭 "준비됨" 파랑이 주 버튼과 겹침

## Questions to Consider
- 점수가 80을 넘는 진짜 조건이 커밋이라면 앱이 왜 커밋 직전에 손을 놓나?
- 사용자에게 필요한 단위는 할 일 7행이 아니라 "적용 5 / Claude 2 / 커밋 1"의 세 단계 아닌가?
- 3단 막대와 80점 선이 브랜드 자산이라면 왜 가장 연한 색인가?
