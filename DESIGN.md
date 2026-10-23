---
name: Claude 세팅 점검
description: 폴더의 Claude Code 팀 세팅을 사내 기준과 비교해 점수(0–100)로 보여 주고, 미리 보기 → 적용 → 되돌리기로 고치는 데스크톱 도구
colors:
  bg: "#f2f4f6"
  surface: "#ffffff"
  soft: "#f2f4f6"
  soft-2: "#f9fafb"
  ink: "#191f28"
  ink-2: "#4e5968"
  ink-3: "#66717f"
  line: "#e5e8eb"
  accent: "#1b64da"
  accent-hover: "#1957c2"
  accent-ink: "#ffffff"
  accent-soft: "#e8f3ff"
  accent-soft-hover: "#dbeafe"
  accent-text: "#1b64da"
  fail: "#d32f2f"
  fail-text: "#b42318"
  fail-bg: "#ffebee"
  fail-ink: "#ffffff"
  warn: "#c2410c"
  warn-text: "#a8410a"
  warn-bg: "#fff3e0"
  ok: "#15803d"
  ok-bg: "#e8f7ee"
  bar-fix: "#b3d4fd"
  bar-commit: "#e3eefc"
  code-bg: "#f6f7f9"
  add: "#e3f5e8"
  del: "#fdeaea"
typography:
  display:
    fontFamily: "Pretendard Variable, Segoe UI, Malgun Gothic, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.03em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Pretendard Variable, Segoe UI, Malgun Gothic, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.35
    letterSpacing: "-0.03em"
  title-page:
    fontFamily: "Pretendard Variable, Segoe UI, Malgun Gothic, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    letterSpacing: "-0.02em"
  title-dialog:
    fontFamily: "Pretendard Variable, Segoe UI, Malgun Gothic, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 800
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Pretendard Variable, Segoe UI, Malgun Gothic, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 800
    letterSpacing: "-0.02em"
  body-strong:
    fontFamily: "Pretendard Variable, Segoe UI, Malgun Gothic, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
  body-long:
    fontFamily: "Pretendard Variable, Segoe UI, Malgun Gothic, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: "Pretendard Variable, Segoe UI, Malgun Gothic, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "-0.01em"
  caption:
    fontFamily: "Pretendard Variable, Segoe UI, Malgun Gothic, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Pretendard Variable, Segoe UI, Malgun Gothic, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
  micro:
    fontFamily: "Pretendard Variable, Segoe UI, Malgun Gothic, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
  mono:
    fontFamily: "Cascadia Mono, Consolas, D2Coding, monospace"
    fontSize: "12px"
    fontWeight: 400
rounded:
  pill-sm: "6px"
  sm: "8px"
  tab: "9px"
  md: "10px"
  lg: "12px"
  xl: "14px"
  row: "16px"
  card: "24px"
  full: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
  4xl: "40px"
components:
  button:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "40px"
  button-hover:
    backgroundColor: "{colors.line}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-soft:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.md}"
    height: "40px"
  button-soft-hover:
    backgroundColor: "{colors.accent-soft-hover}"
    textColor: "{colors.accent-hover}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    height: "40px"
  button-quiet-hover:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.ink}"
  button-danger-fill:
    backgroundColor: "{colors.fail}"
    textColor: "{colors.fail-ink}"
    rounded: "{rounded.md}"
    height: "40px"
  button-danger-fill-hover:
    backgroundColor: "{colors.fail-text}"
  button-small:
    padding: "0 12px"
    height: "34px"
  button-big:
    rounded: "{rounded.xl}"
    padding: "0 32px"
    height: "56px"
  button-wide:
    rounded: "{rounded.lg}"
    width: "100%"
    height: "44px"
  tabs-track:
    backgroundColor: "{colors.line}"
    rounded: "{rounded.lg}"
    padding: "4px"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.tab}"
    padding: "0 18px"
    height: "36px"
  tab-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "30px 36px"
  card-hero:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "34px 40px"
  pill-warn:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.warn-text}"
    rounded: "{rounded.sm}"
    padding: "5px 10px"
  pill-good:
    backgroundColor: "{colors.ok-bg}"
    textColor: "{colors.ok}"
    rounded: "{rounded.sm}"
    padding: "5px 10px"
  badge-fail:
    backgroundColor: "{colors.fail-bg}"
    textColor: "{colors.fail}"
    rounded: "{rounded.full}"
    size: "36px"
  badge-warn:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.warn}"
    rounded: "{rounded.full}"
    size: "36px"
  badge-ok:
    backgroundColor: "{colors.ok-bg}"
    textColor: "{colors.ok}"
    rounded: "{rounded.full}"
    size: "36px"
  badge-commit:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.full}"
    size: "36px"
  tag:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.ink-3}"
    typography: "{typography.micro}"
    rounded: "{rounded.pill-sm}"
    padding: "2px 6px"
  tag-company:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-text}"
    typography: "{typography.micro}"
    rounded: "{rounded.pill-sm}"
    padding: "2px 6px"
  todo-row:
    backgroundColor: "transparent"
    rounded: "{rounded.xl}"
    padding: "14px 16px"
  todo-row-open:
    backgroundColor: "{colors.soft-2}"
    rounded: "{rounded.row}"
  dialog:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    width: "min(880px, calc(100vw - var(--side-w) - 48px))"
  dialog-compact:
    width: "min(560px, calc(100vw - var(--side-w) - 48px))"
  toast:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    width: "min(640px, calc(100vw - var(--side-w) - 48px))"
  command-code:
    backgroundColor: "{colors.surface}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
---

# Design System: Claude 세팅 점검

## Overview

**Creative North Star: "한눈에 읽히는 점검표"**

회색 바탕(`bg`) 위에 흰 카드가 놓이고, 카드 안에서 글자와 숫자가 일을 합니다. 화려한 장식 없이 큰 굵은 글자, 넉넉한 여백, 크게 둥근 모서리(24px)로 차분하고 친절하게 보이는 토스풍 도구 화면입니다. 사용자는 먼저 개발자, 그다음 비개발자이므로 모든 문장은 합니다체로 "지금 상태 → 고치면 → 커밋하면"을 순서대로 말합니다.

색은 아껴 씁니다. 파란색 하나(`accent`)가 "지금 할 행동"과 "현재 점수"를 맡고, 빨강·주황·초록은 위험·주의·통과 상태를 뜻할 때만 나옵니다. 깊이는 그림자가 아니라 회색 바탕과 흰 면의 차이로 만듭니다. 그림자는 선택된 탭과 떠 있는 창(대화 상자·알림)에만 있습니다.

밀도는 조작 도구(Operate) 수준입니다. 한 화면에 요약 카드 하나, 할 일 카드 하나가 세로로 쌓이고(간격 20px), 모든 줄은 오른쪽 끝의 같은 자리에 점수(+N점)를 둡니다. 밝은 모드와 어두운 모드(`prefers-color-scheme: dark`)를 같은 토큰 이름으로 모두 지원합니다.

**Key Characteristics:**

- 회색 페이지(`bg`) + 흰 카드(`surface`, 24px 모서리), 테두리 없는 면 구분
- 파란 강조색 하나, 상태색 세 가지(fail / warn / ok)는 상태 표시 전용
- Pretendard Variable, 굵기 800의 짧은 제목, 숫자는 tabular-nums
- 점수 막대: 지금 / 고치면 / 커밋하면(점선) 세 구간 + 80점 목표선
- 아이콘은 인라인 선(stroke) SVG만, 이모지·글리프 문자 없음
- 확인이 필요한 일은 가운데 모달, 결과 알림은 아래쪽 비모달 카드

## Colors

차가운 회색 중립색 위에 파란색 하나와 상태색 세 가지만 얹은 팔레트입니다. 어두운 모드 값은 같은 토큰 이름으로 `style.css`의 `@media (prefers-color-scheme: dark)` 블록에 있고, 사이드카(`.impeccable/design.json`)의 `colorMeta.*.dark`에 함께 기록합니다.

### Primary

- **토스 블루** (`accent`): 주 버튼 배경, 점수 막대의 "지금" 구간, 포커스 링, 라디오·체크박스 `accent-color`, 브랜드 마크. 화면에서 가장 중요한 행동 하나와 현재 점수에만 씁니다.
- **눌린 블루** (`accent-hover`): 주 버튼과 링크의 hover.
- **블루 글자** (`accent-text`): 흰 면 위의 파란 글자(링크형 버튼, 현재 폴더, "사내" 태그, 목표 타일 숫자). 어두운 모드에서는 `accent`보다 밝게 갈라집니다.
- **옅은 블루** (`accent-soft`, hover `accent-soft-hover`): 보조(soft) 버튼, 현재 폴더 줄, 커밋 배지, "사내" 태그, 목표 타일, 텍스트 선택 배경.
- **블루 위 글자** (`accent-ink`): 주 버튼 글자.

### Status

- **위험 빨강** (`fail` 아이콘·채운 위험 버튼 / `fail-text` 글자 / `fail-bg` 배지·타일 바탕 / `fail-ink` 채운 버튼 글자): 감점이 큰 위험 항목과 되돌릴 수 없는 행동에만.
- **주의 주황** (`warn` 아이콘 / `warn-text` 글자 / `warn-bg` 바탕): 주의 항목, 상태 알약 "아직 준비 전", 막힘 안내.
- **통과 초록** (`ok` 아이콘·글자 / `ok-bg` 바탕): 통과 항목, 준비됨 알약, 80점 이상 최근 폴더 점수.

### Neutral

- **페이지 회색** (`bg`): 앱 전체 바탕. 카드 사이의 빈 곳.
- **흰 면** (`surface`): 카드, 사이드바, 대화 상자, 선택된 탭, 명령 코드 칸.
- **옅은 회색 면** (`soft`): 기본 버튼 바탕, 점수 막대 빈 트랙, 카드 안 구분선, 기본 태그 바탕.
- **더 옅은 회색 면** (`soft-2`): 펼친 할 일 줄, 줄 hover, 규칙 타일, 커밋 안내 상자.
- **먹색** (`ink`): 본문과 제목, 80점 목표선.
- **회색 바탕용 보조 글자** (`ink-2`): `bg`·`soft` 위의 보조 문장, 탭 글자, 조용한 버튼 글자.
- **흰 바탕용 보조 글자** (`ink-3`): 카드 안의 보조 문장, 그룹 이름, 캡션, 경로, 접기 화살표.
- **선** (`line`): 대화 상자 행동 바 위 선, 파일 칸·명령 칸 테두리, 탭 트랙 바탕, 기본 버튼 hover.
- **코드 바탕** (`code-bg`), **추가 줄** (`add`), **삭제 줄** (`del`): 미리 보기 diff와 예시·로그.
- **막대 고치면** (`bar-fix`), **막대 커밋하면** (`bar-commit`): 점수 막대의 예상 구간 전용.

### Named Rules

**The One Blue Rule.** 파란색은 행동과 현재 점수의 색입니다. 장식, 제목, 구역 바탕에 쓰지 않습니다. 상태를 말할 때는 빨강·주황·초록만 씁니다.

**The Surface-Aware Gray Rule.** 보조 글자 토큰은 놓이는 면으로 고릅니다. 회색 바탕(`bg`·`soft`) 위에는 `ink-2`, 흰 면(`surface`·`soft-2`) 위에는 `ink-3`. `ink-3`은 `bg` 위에서 4.5:1 경계(약 4.5:1)에 걸리므로 회색 바탕에 쓰지 않습니다. 모든 글자는 4.5:1 이상입니다.

**The Status-Only Color Rule.** 빨강·주황·초록은 진단 결과의 심각도(위험·주의·통과)를 뜻할 때만 씁니다. 글자에는 `*-text`, 아이콘·채움에는 기본 토큰, 바탕에는 `*-bg`를 씁니다.

## Typography

**Display Font:** Pretendard Variable (Segoe UI, Malgun Gothic, Apple SD Gothic Neo, system-ui 대체)
**Body Font:** Pretendard Variable (같은 스택)
**Label/Mono Font:** Cascadia Mono (Consolas, D2Coding 대체)

**Character:** 한글이 반듯하게 읽히는 Pretendard 한 벌로 제목부터 캡션까지 처리합니다. 큰 제목은 굵기 800과 좁은 자간(-0.02 ~ -0.03em)으로 단단하게, 본문은 14px에 자간 -0.01em으로 조밀하게 둡니다. Pretendard는 앱 안에 넣어 오프라인·CSP `'self'`에서도 같은 글꼴로 보입니다(SIL OFL 1.1, 라이선스 동봉).

### Hierarchy

- **Display** (800, 40px, 1.1, tabular-nums): 요약 카드의 큰 점수. 단위 "점"은 0.6em.
- **Headline** (800, 30px, 1.35, -0.03em): 요약 카드의 두 줄 결론. `white-space: pre-line`으로 줄을 일부러 나누고 `text-wrap: balance`. 좁은 창(≤1000px)에서 26px.
- **Title-page** (800, 24px, -0.02em): 폴더 이름(h1), 기준 이름. 빈 화면 제목은 26px.
- **Title-dialog** (800, 20px): 대화 상자 제목.
- **Title** (800, 18px, -0.02em): 카드 제목, 대화 상자 본문의 첫 줄 요약(`::first-line`).
- **Body-strong** (700, 15px): 할 일 제목, 기준 항목 제목.
- **Body-long** (400, 15px, 1.6–1.7): 대화 상자 메시지, 빈 화면 안내.
- **Body** (400, 14px, 1.55): 기본 글자, 버튼, 탭. 펼친 설명 문단은 1.65에 68ch까지.
- **Caption** (400, 13px, 1.6): "고치면:" 부제, 범례, 캡션, 그룹 이름(700).
- **Label** (700, 12px): 기준 표의 열 이름, 고르기 항목 제목. 경로는 Mono 12px.
- **Micro** (700, 11px): 태그, 예시 라벨, 점수 옆 메모(500).

### Named Rules

**The Tabular Score Rule.** 점수·감점·경과 시간처럼 바뀌는 숫자는 모두 `font-variant-numeric: tabular-nums`로 자리를 고정합니다.

**The Keep-All Rule.** 한국어 문장 블록에는 `word-break: keep-all`을 겁니다. 어절 중간에서 줄이 끊기지 않게 합니다. 경로·명령·파일 이름만 `break-all`/`overflow-wrap: anywhere`로 끊습니다.

## Layout

두 칸 구조입니다. 왼쪽 사이드바(`--side-w` 248px, 흰 면, 오른쪽 1px `line`)에 브랜드, 폴더 열기, 최근 폴더, Claude 상태가 있고, 오른쪽 본문은 최대 880px 열(`.wrap`, 안쪽 여백 32px 40px 56px)에 카드를 세로로 20px 간격으로 쌓습니다.

- **기준 간격:** 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40px. 카드 사이 20px, 카드 안 할 일 줄 사이 2px(펼치면 6px), 줄 안쪽 14px 16px.
- **오른쪽 고정 열:** 할 일 줄은 Claude 버튼 열(148px)과 점수·화살표 열(104px)의 폭을 고정해 모든 줄에서 같은 자리에 둡니다. 펼친 본문은 배지 폭만큼(66px) 들여 씁니다.
- **기준 표:** `minmax(0,1fr) 160px 120px` 세 열(항목과 통과 기준 / 안 지키면 / 이 폴더). 열 이름은 화면에 보이되 `aria-hidden`이고, 각 칸에는 `sr-only` 라벨이 붙습니다.
- **반응형(≤1000px):** 사이드바 220px, 본문 여백 24px, 카드 26px 24px, 기준 표 `1fr 120px 92px`, Claude 버튼은 할 일 문장 아래로 내려 갑니다. 창 최소 폭은 760px(스타일시트 주석 기준)이라 두 칸은 항상 유지합니다.
- **긴 경로:** 한 줄로 두고 `direction: rtl`로 앞쪽을 줄여 폴더 끝이 보이게 합니다.

## Elevation & Depth

평면 우선입니다. 깊이는 회색 페이지(`bg`)와 흰 카드(`surface`), 흰 카드 안의 `soft-2` 면으로 만듭니다. 카드에는 그림자도 테두리도 없습니다. 그림자는 화면 위에 떠야 하는 것에만 있습니다.

### Shadow Vocabulary

- **선택된 탭** (`box-shadow: 0 1px 3px rgb(0 0 0 / 0.08)`): 회색 트랙 위 흰 탭을 살짝 띄웁니다.
- **모달 대화 상자** (`box-shadow: 0 2px 6px rgb(0 0 0 / 0.06), 0 24px 64px rgb(0 0 0 / 0.2)`): `scrim`(밝은 모드 `rgb(0 0 0 / 0.32)`, 어두운 모드 0.55) 위 가운데 창.
- **결과 알림 카드** (`box-shadow: 0 2px 6px rgb(0 0 0 / 0.08), 0 16px 40px rgb(0 0 0 / 0.18)`): 스크림 없이 아래쪽에 뜨는 카드.

### Named Rules

**The Flat Card Rule.** 카드는 바탕색 차이만으로 구분합니다. 카드에 그림자나 테두리를 더하지 않습니다. 그림자는 탭 선택과 떠 있는 창에만 씁니다.

## Shapes

크게 둥근 모서리가 이 화면의 형태 언어입니다. 바깥 면일수록 더 둥글고, 안쪽 요소일수록 덜 둥급니다: 카드·대화 상자 24px → 펼친 할 일 16px → 할 일 줄·큰 버튼·타일·안내 상자 14px → 탭 트랙·넓은 버튼 12px → 버튼·코드 칸·파일 칸 10px → 탭 9px → 알약·브랜드 마크 8px → 태그·막대 6px. 상태 배지만 완전한 원(36px, 지나간 항목 28px)입니다.

선은 드물게 씁니다. 1px `line`은 코드·파일·명령 칸 테두리와 대화 상자 행동 바 위에만, 카드 안의 구분선은 더 옅은 `soft`(지나간 항목 토글, 기준 그룹)입니다. "커밋하면" 구간만 1.5px 점선 외곽선(`bar-fix`)으로 그려 아직 확정되지 않은 점수임을 보여 줍니다.

## Components

### Buttons

차분하고 단단한 버튼. 굵은 글자와 둥근 면, 테두리 없음.

- **Shape:** 부드럽게 둥근 모서리(10px), 높이 40px, 안쪽 0 14px, 글자 14px/600, 아이콘과 8px 간격.
- **Primary:** 파란 면 + 흰 글자(700). **한 화면에 주 버튼은 하나**입니다. 요약 카드에서는 "N개 바로 고치기"와 "커밋 명령 복사"가 서로를 대신해 하나만 보이고, 대화 상자에서는 행동 바 맨 오른쪽 하나입니다.
- **Soft:** 옅은 파랑 면 + 파란 글자(700). 줄 단위 행동(이 할 일만 고치기, Claude로 반영, 표준 파일 바꾸기). 사이드바 안에서는 회색 면(`soft`)으로 바뀝니다.
- **Default:** 회색 면(`soft`) + 먹색 글자. 알림 안 보조 행동, 대화 상자의 취소·닫기.
- **Quiet / Ghost:** 투명 + `ink-2` 글자(500). 머리글의 되돌리기·리포트 저장·다시 점검. hover에 `soft` 면.
- **Danger-fill:** 빨간 면 + `fail-ink` 글자. 되돌릴 수 없는 확인에만. **Danger**(글자만 빨강)는 "중단".
- **Sizes:** small 34px(13px 글자), big 56px·14px 모서리·17px 글자(요약 카드와 빈 화면의 주 행동), wide 100%·44px·12px 모서리(사이드바 폴더 열기). 대화 상자 행동 바의 버튼은 44px.
- **Hover / Focus / Disabled:** 배경·글자색이 0.15s ease-out으로 바뀝니다. 포커스는 2px `accent` 외곽선, 2px 띄움. 꺼진 버튼은 투명도 0.45, 꺼진 이유는 버튼 아래 11px 글자로 적습니다.
- **Link-ish:** 밑줄 있는 파란 13px 글자 버튼(탐색기에서 열기, 다시 확인, 예시 보기).

### Tabs

- **Style:** 회색 트랙(`line`, 12px 모서리, 4px 안쪽) 안의 36px 탭. 선택된 탭은 흰 면 + 먹색 700 + 작은 그림자, 나머지는 투명 + `ink-2` 500.
- **Behavior:** `role="tablist"`, 선택된 탭만 `tabindex=0`(roving tabindex), 좌우 화살표·Home·End로 이동.

### Status pill / Badge / Tag

- **Pill:** 요약 카드 맨 위의 상태(13px/700, 8px 모서리). 주의는 `warn-bg`/`warn-text`, 준비됨은 `ok-bg`/`ok`.
- **Badge:** 할 일 줄 왼쪽의 36px 원, 안에 16px 선 SVG(굵기 2.6). 위험·주의·통과·해당 없음(`soft`/`ink-3`)·커밋(옅은 파랑). 화면 읽기 프로그램용 라벨은 `sr-only`.
- **Tag:** 11px/700, 6px 모서리. 기준 표에서 사내 표준이 더한 항목에 "사내" 태그(옅은 파랑).

### Cards / Containers

- **Corner Style:** 24px.
- **Background:** `surface` on `bg`.
- **Shadow Strategy:** 없음(Flat Card Rule).
- **Border:** 없음.
- **Internal Padding:** 일반 카드 30px 36px, 요약 카드 34px 40px, 목록 카드(할 일·기준) 26px 24px 8px. 카드 제목 줄은 안쪽 0 16px로 줄 글자와 맞춥니다.

### Inputs / Fields

텍스트 입력은 없습니다. 라디오·체크박스는 18px 기본 컨트롤에 `accent-color: accent`만 줍니다.

### Navigation

- **사이드바 최근 폴더:** 44px 이상 줄, 10px 모서리. 폴더 이름(500) 위, 경로(11px `ink-3`, 앞쪽 줄임) 아래, 오른쪽 점수(13px/600, 80점 이상 `ok`, 미만 `fail-text`). 현재 폴더는 옅은 파랑 면 + 파란 글자.

### Summary hero (시그니처)

요약 카드는 위에서 아래로: 상태 알약 + 기준 이름 → 두 줄 결론(Headline) → 큰 점수 + 감점 내역("100점에서 … = −N점", `ink-3` 14px) → 점수 막대 → 범례 → 주 버튼 + 두 줄 캡션.

- **점수 막대:** 12px 높이, 6px 모서리, `soft` 트랙. 겹친 세 구간: 지금(`accent`) / 고치면(`bar-fix`) / 커밋하면(`bar-commit` + 1.5px 점선 `bar-fix` 외곽선). 80% 자리에 2px 먹색 목표선이 위아래로 5px 넘칩니다. 막대는 `aria-hidden`이고 숫자는 글자로 따로 말합니다.
- **범례:** 10px 둥근 사각 견본 + "지금 N점 / 고치면 N점 / 커밋하면 N점", 목표선 견본은 2×12px.
- **Motion:** 이 화면의 유일한 연출 움직임은 막대 폭 전환(0.7s `cubic-bezier(0.16, 1, 0.3, 1)`)입니다. 다시 계산 중인 점수는 투명도 0.45로 흐려집니다.

### To-do rows (시그니처)

- **구조:** 배지 → 제목(15px/700) + "고치면: …" 부제(13px `ink-3`) → (Claude 버튼 열) → 오른쪽 고정 열 "+N점"(14px/700, tabular) + 접기 화살표.
- **그룹:** 13px/700 `ink-3` 그룹 이름 — 바로 고칠 수 있습니다 / Claude가 써 줍니다 · 건당 약 1분, 150~400원 / 직접 해야 합니다 / 커밋해서 팀에 적용합니다. 위험 항목이 먼저, 그다음 감점이 큰 순서.
- **States:** hover에 `soft-2` 면, 펼치면 줄 전체가 `soft-2` 면(16px 모서리)이 되고 본문이 열립니다. 포커스는 안쪽 2px `accent` 외곽선.
- **펼친 본문:** 13px/700 `ink-2` 소제목 + 14px/1.65 문단(68ch) — 왜 문제인가요 / 함께 해결되는 문제(흰 칸 목록, 항목별 감점) / 고치면 / 남는 한계 / 예시(코드 바탕 칸). 맨 아래 행동 버튼.
- **커밋 줄:** 누르지 않는 안내 줄(커밋 배지), 아래에 명령 복사 줄.
- **지나간 항목:** 카드 맨 아래 52px 토글("통과한 항목 N개 보기")로 접혀 있고, 펼치면 28px 배지의 조용한 줄(`ink-2`)로 보입니다. 열림 여부는 기억됩니다.

### Criteria list

기준 카드 위에는 규칙 타일 네 칸(시작 점수 / 위험 1건마다 / 주의 1건마다 / 준비됨 80점부터, 20px/800 숫자, 14px 모서리, 상태별 옅은 바탕). 기준 표는 그룹 이름(14px/800, 위 `soft` 선) 아래 세 열 줄: 제목 + 규칙(13px `ink-3`) / 감점(위험·주의 색 글자) / 이 폴더 상태(통과 `ok`, 위험 `fail-text`, 주의 `warn-text`, 해당 없음 `ink-3`).

### Dialogs

- **확인 창(모달):** 본문 영역 가운데, 흰 면 24px 모서리, 폭 880px(compact 560px), 높이 최대 86vh. 제목(20px/800) / 스크롤되는 본문 / 위 1px `line`이 있는 행동 바. 행동 바는 `row-reverse`로 주 버튼이 오른쪽 끝에 옵니다. 메시지의 첫 줄은 `::first-line`으로 18px/800 먹색 한 문장 요약, 나머지는 15px `ink-2`. 뒤 화면은 `inert`, Tab은 창 안에서 돕니다.
- **결과 알림(비모달 toast):** 같은 창이 아래 20px에 640px 카드로 바뀌고 스크림이 없습니다. 버튼은 "닫기" 하나.
- **미리 보기:** 파일별로 접는 칸(10px 모서리, `line` 테두리), diff 줄은 `add`/`del` 바탕, Mono 12px.

### Command copy row

`soft-2` 상자(14px 모서리) 안에 Mono 12.5px 명령 칸(흰 면, `line` 테두리, 10px 모서리, `break-all`) + 오른쪽 복사 버튼. 할 일 목록 안에서는 배지 폭만큼 들여 씁니다.

## Do's and Don'ts

### Do:

- **Do** 회색 페이지(`bg`) 위에 흰 카드(`surface`, 24px 모서리)를 20px 간격으로 쌓고, 카드에 그림자·테두리를 더하지 마세요(The Flat Card Rule).
- **Do** 한 화면에 주 버튼(`accent` 면)은 하나만 두세요. 대화 상자에서는 행동 바 오른쪽 끝입니다.
- **Do** 보조 글자는 면에 맞춰 고르세요: 회색 바탕 위 `ink-2`, 흰 면 위 `ink-3`. 모든 글자 대비는 4.5:1 이상입니다.
- **Do** 아이콘은 `viewBox="0 0 24 24"` 인라인 선 SVG(`fill: none; stroke: currentColor`, 굵기 2, 배지 안 2.6)로 넣고 `aria-hidden="true"`를 주세요.
- **Do** 줄에 보이는 점수는 "고치면 되찾는 점수(+N점)"로 쓰세요. 줄 점수의 합이 막대의 "지금 → 고치면/커밋하면" 차이와 맞아야 합니다.
- **Do** 바뀌는 숫자에는 tabular-nums, 한국어 문장 블록에는 `word-break: keep-all`을 거세요.
- **Do** 포커스는 2px `accent` 외곽선으로 보이게 하고, `prefers-reduced-motion: reduce`에서는 모든 전환을 끄세요.
- **Do** 확인이 필요한 일은 가운데 모달로, 결과만 알리는 일은 아래쪽 비모달 카드로 보여 주세요.

### Don't:

- **Don't** 이모지나 글리프 문자(✓, ✕, ▶ 등)를 아이콘으로 쓰지 마세요.
- **Don't** 빨강·주황·초록을 상태(위험·주의·통과) 말고 다른 뜻으로 쓰지 마세요. 파란색을 장식이나 구역 바탕으로 쓰지 마세요.
- **Don't** `ink-3`을 회색 페이지(`bg`) 위 글자로 쓰지 마세요.
- **Don't** 점수 막대 폭 전환 말고 다른 연출 움직임(등장 애니메이션, 튀는 효과)을 더하지 마세요. 상태 전환(색 0.15s, 화살표 회전 0.2s)만 허용됩니다.
- **Don't** 제목 위에 작은 머리말(eyebrow·kicker) 줄을 새로 만들지 마세요.
