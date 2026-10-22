---
target: 전체화면 (설치형 앱 UI) 3차
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
target_fingerprint: "sha256:c49ca93bfc8ad68c5ef7e7dbbca1bbf392df0dc71fd8976f4705208505a399b8"
target_path: "D:\\project\\Coding\\cc-checkup\\src\\app\\ui\\index.html"
timestamp: 2026-10-22T10-08-54Z
slug: src-app-ui-index-html
---
Method: dual-agent (A: design review sub-agent · B: detector sub-agent, sequential on one Electron window)

## Design Health Score — 28/40 (Good)
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility | 3 | 영역 카드에 영역 상태 요약 없음 |
| 2 | Real world | 3 | 문서 폴더에도 settings.json·권한 우회 모드, "설치하기"가 과장 |
| 3 | Control | 3 | 모달 중에도 최근 폴더 클릭 가능 → 결과 확인 우회 가능 |
| 4 | Consistency | 2 | 동사 5종, 토글 글자 고정, summary 마커 없음, 해당 없음 표시 불일치 |
| 5 | Error prevention | 3 | 폴더 종류 변경으로 점수 상승 |
| 6 | Recognition | 3 | 일괄 고치기 항목 이름과 행 문장 불일치 |
| 7 | Flexibility | 2 | 다시 점검·최근 폴더·라디오 뒤 포커스가 body로 |
| 8 | Minimalist | 3 | 머리말 경로 2줄 |
| 9 | Error recovery | 3 | 기타 오류 원문 |
| 10 | Help | 3 | 첫 실행 안내 약함 |

## Detector
Static 0, live initial 0, preview modal 0, expanded 0. Pixel contrast skipped (window judged hidden).

## Priority Issues
- [P1] 모달 무결성: Shift+Tab 탈출, scrim이 사이드바 미포함, 모달 중 최근 폴더로 결과 확인 우회
- [P1] 재진단 뒤 키보드 포커스 유실(다시 점검·최근 폴더·종류 라디오)
- [P2] 좁은 창에서 사이드바가 보고서 아래 2,400px로
- [P2] 폴더 종류 직접 지정이 점수를 조용히 올림, 해당 없음 표시 불일치
- [P3] "설치하기" 과장, 토글 글자 고정, summary 마커, 영역 상태 없음, 경로 2줄
