---
name: Claude 세팅 점검
description: 폴더의 Claude Code 세팅을 기준과 비교해 0–100점과 할 일로 보여 주고, 미리 보기 → 적용 → 되돌리기로 고치는 데스크톱 도구
colors:
  bg: "#ffffff"
  bg-2: "#f7f7f8"
  fg: "#171719"
  fg-2: "rgb(46 47 51 / 0.88)"
  fg-3: "#5a5c63"
  line: "rgb(112 115 124 / 0.22)"
  line-2: "rgb(112 115 124 / 0.16)"
  fill: "rgb(112 115 124 / 0.08)"
  fill-2: "rgb(112 115 124 / 0.14)"
  brand: "#0066ff"
  brand-strong: "#005eeb"
  brand-subtle: "rgb(0 102 255 / 0.06)"
  brand-light: "rgb(0 102 255 / 0.28)"
  on-brand: "#ffffff"
  brand-fill: "#0066ff"
  brand-fill-strong: "#005eeb"
  brand-text: "#005eeb"
  neg: "#b00c0c"
  neg-fill: "#e52222"
  neg-fill-strong: "#b00c0c"
  neg-bg: "rgb(255 66 66 / 0.08)"
  cau: "#9c5800"
  cau-bg: "rgb(255 146 0 / 0.1)"
  pos: "#006e25"
  pos-bg: "rgb(0 191 64 / 0.1)"
  add: "rgb(0 191 64 / 0.12)"
  del: "rgb(255 66 66 / 0.1)"
  scrim: "rgb(23 23 25 / 0.4)"
typography:
  display:
    fontFamily: "Pretendard Variable, Pretendard, Malgun Gothic, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: "52px"
    letterSpacing: "-0.028em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Pretendard Variable, Pretendard, Malgun Gothic, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: "38px"
    letterSpacing: "-0.024em"
  title-page:
    fontFamily: "Pretendard Variable, Pretendard, Malgun Gothic, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: "32px"
    letterSpacing: "-0.023em"
  title:
    fontFamily: "Pretendard Variable, Pretendard, Malgun Gothic, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "28px"
    letterSpacing: "-0.012em"
  lead:
    fontFamily: "Pretendard Variable, Pretendard, Malgun Gothic, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: "26px"
  body-strong:
    fontFamily: "Pretendard Variable, Pretendard, Malgun Gothic, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "24px"
  body:
    fontFamily: "Pretendard Variable, Pretendard, Malgun Gothic, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "22px"
    letterSpacing: "0.0096em"
  body-small:
    fontFamily: "Pretendard Variable, Pretendard, Malgun Gothic, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  caption:
    fontFamily: "Pretendard Variable, Pretendard, Malgun Gothic, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: "18px"
  mono:
    fontFamily: "Cascadia Mono, Consolas, D2Coding, monospace"
    fontSize: "13px"
    fontWeight: 400
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  btn: "10px"
  lg: "12px"
  card: "16px"
  panel: "20px"
  full: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "40px"
components:
  button:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.fg}"
    rounded: "{rounded.btn}"
    padding: "0 16px"
    height: "40px"
  button-hover:
    backgroundColor: "{colors.fill}"
  button-solid:
    backgroundColor: "{colors.brand-fill}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.btn}"
    padding: "0 16px"
    height: "40px"
  button-solid-hover:
    backgroundColor: "{colors.brand-fill-strong}"
  button-soft:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.brand}"
    rounded: "{rounded.btn}"
    height: "40px"
  button-danger:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.neg}"
    rounded: "{rounded.btn}"
    height: "40px"
  button-danger-fill:
    backgroundColor: "{colors.neg-fill}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.btn}"
    height: "40px"
  button-danger-fill-hover:
    backgroundColor: "{colors.neg-fill-strong}"
  button-lg:
    rounded: "{rounded.lg}"
    padding: "0 24px"
    height: "48px"
  button-sm:
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  text-button:
    backgroundColor: "transparent"
    textColor: "{colors.fg-2}"
    typography: "{typography.body-small}"
    rounded: "{rounded.sm}"
    padding: "6px 4px"
  link-button:
    backgroundColor: "transparent"
    textColor: "{colors.brand}"
    rounded: "{rounded.sm}"
    padding: "6px 4px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.fg-3}"
    rounded: "{rounded.md}"
    size: "36px"
  segmented-track:
    backgroundColor: "{colors.fill}"
    rounded: "{rounded.btn}"
    padding: "3px"
  segmented-item:
    backgroundColor: "transparent"
    textColor: "{colors.fg-3}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "32px"
  segmented-item-selected:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.fg}"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.fg-3}"
    padding: "12px 0"
  tab-selected:
    textColor: "{colors.fg}"
  card:
    backgroundColor: "{colors.bg}"
    rounded: "{rounded.card}"
    padding: "24px"
  message:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.fg-2}"
    typography: "{typography.body-small}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  message-warn:
    backgroundColor: "{colors.cau-bg}"
    textColor: "{colors.cau}"
  badge-fail:
    backgroundColor: "{colors.neg-bg}"
    textColor: "{colors.neg}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: "3px 8px"
  badge-warn:
    backgroundColor: "{colors.cau-bg}"
    textColor: "{colors.cau}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: "3px 8px"
  badge-ok:
    backgroundColor: "{colors.pos-bg}"
    textColor: "{colors.pos}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: "3px 8px"
  badge-na:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.fg-3}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: "3px 8px"
  tag:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.fg-3}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  tag-accent:
    backgroundColor: "{colors.brand-subtle}"
    textColor: "{colors.brand-text}"
  recent-item:
    backgroundColor: "transparent"
    rounded: "{rounded.btn}"
    padding: "8px 12px"
    height: "52px"
  recent-item-current:
    backgroundColor: "{colors.brand-subtle}"
    textColor: "{colors.brand-text}"
  todo-body:
    backgroundColor: "{colors.bg-2}"
    rounded: "{rounded.lg}"
    padding: "4px 20px"
  bundle-items:
    backgroundColor: "{colors.bg-2}"
    rounded: "{rounded.lg}"
    padding: "4px 16px"
  step:
    backgroundColor: "{colors.bg-2}"
    rounded: "{rounded.lg}"
    padding: "12px 14px"
  step-now:
    backgroundColor: "{colors.brand-subtle}"
    textColor: "{colors.brand-text}"
  panel:
    backgroundColor: "{colors.bg}"
    rounded: "{rounded.panel}"
    width: "min(880px, calc(100vw - var(--side-w) - 48px))"
  panel-compact:
    width: "min(560px, calc(100vw - var(--side-w) - 48px))"
  toast:
    backgroundColor: "{colors.bg}"
    rounded: "{rounded.panel}"
    width: "min(640px, calc(100vw - var(--side-w) - 48px))"
  help-dialog:
    backgroundColor: "{colors.bg}"
    rounded: "{rounded.panel}"
    width: "min(720px, calc(100vw - 48px))"
  command-code:
    backgroundColor: "{colors.bg-2}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
---

# Design System: Claude 세팅 점검

## Overview

**Creative North Star: "Montage 위의 점검표"**

원티드 Montage 디자인 시스템(wanteddev/montage-web, MIT)의 색·글자·모서리 토큰 위에 그린 업무 도구 화면입니다. 은유나 장식 그림 없이, 흰 면과 옅은 회색 면, 1px 선, 글자와 숫자만으로 "무엇이 위험하고 무엇을 누르면 되는지"를 보여 줍니다. 토큰 이름과 값은 `src/app/ui/style.css`의 `:root`에 있고, 어두운 모드는 같은 이름을 `@media (prefers-color-scheme: dark)`에서 다시 정의합니다.

밀도는 조작 도구 수준입니다. 왼쪽 사이드바(최근 폴더) + 오른쪽 본문 두 칸이고, 본문은 머리글 → 사용 방식 세그먼트 → 밑줄 탭 → 카드들이 20px 간격으로 쌓입니다. 파란색은 행동과 현재 위치에만, 빨강·주황·초록은 상태에만 쓰고, 상태는 항상 글자로도 말합니다.

**Key Characteristics:**

- 흰 카드(`bg`, 16px 모서리, 1px `line-2` 테두리)를 옅은 회색 본문(`bg-2`) 위에 쌓는 평면 구조
- 파란색(`brand`) 하나, 상태색 세 가지(`neg` / `cau` / `pos`)는 진단 상태 전용
- Pretendard Variable 한 벌, 굵기 400–700, 13px 미만 글자 없음
- 버튼은 Montage outlined(흰 면 + 1px `line`)가 기본, 채운 파란 버튼은 한 화면에 하나
- 아이콘은 인라인 선 SVG(굵기 1.8)만
- 확인은 가운데 모달, 결과는 아래쪽 비모달 알림, 사용법은 네이티브 `<dialog>`

## Colors

Montage의 coolNeutral 회색과 파란색 하나, 상태색 세 가지로 된 팔레트입니다. 투명도 값(`rgb(… / a)`)이 Montage의 원래 형식이라 그대로 씁니다. 어두운 모드 값은 사이드카 `colorMeta.*.dark`에 있습니다.

### Primary

- **Montage 블루** (`brand`): 흰·어두운 면 위의 파란 글자와 선. 링크형 버튼 글자, outlined soft 버튼 글자, 포커스 링, 점수 막대의 "지금" 구간, 라디오·체크박스 `accent-color`. 어두운 모드에서 밝아집니다.
- **눌린 블루** (`brand-strong`): 링크형 버튼의 hover.
- **채운 블루** (`brand-fill`, hover `brand-fill-strong`): 흰 글자(`on-brand`)를 얹는 면. 채운 주 버튼, 브랜드 마크, 현재 단계 번호. 두 모드에서 값이 같아 흰 글자가 늘 4.5:1을 넘깁니다.
- **옅은 면 위 블루 글자** (`brand-text`): `brand-subtle` 위의 파란 글자. 현재 폴더 이름, 현재 단계 제목, "사내" 태그, 사용법 번호 원.
- **옅은 블루 면** (`brand-subtle`): 현재 폴더 줄, 현재 단계 칸, 사용법 번호 원, "사내" 태그, 텍스트 선택 배경.
- **막대 예상 구간** (`brand-light`): 점수 막대의 "고치면" 구간 채움과 "커밋하면" 구간 점선.
- **블루 위 글자** (`on-brand`): 채운 버튼 글자(채운 위험 버튼도 같음).

### Status

- **위험** (`neg` 글자 / `neg-bg` 배지 바탕 / `neg-fill` 채운 위험 버튼, hover `neg-fill-strong`): 위험 배지, 오류 문장, 80점 미만 최근 폴더 점수, 되돌릴 수 없는 확인.
- **주의** (`cau` 글자 / `cau-bg` 바탕): 주의 배지, 경고 안내 상자, 알림 줄.
- **통과** (`pos` 글자 / `pos-bg` 바탕): 통과·"됨" 배지, 끝난 단계 번호, 80점 이상 점수, 목표 타일.

### Neutral

- **흰 면** (`bg`): 사이드바, 카드, 버튼, 모달, 사용법 창.
- **옅은 회색 면** (`bg-2`): 본문 바탕, 카드 안의 펼친 본문·묶음 목록·단계 칸·규칙 타일·코드 칸.
- **먹색** (`fg`): 제목과 본문, 선택된 탭 밑줄, 80점 목표선.
- **보조 글자** (`fg-2`): 할 일 줄의 "할 일:" 문장, 안내 문단, 텍스트 버튼.
- **흐린 글자** (`fg-3`): 경로, 그룹 이름, 표 머리, 선택 안 된 탭·세그먼트. Montage 토큰이 아니라 이 앱이 더한 값으로, 회색 면(`bg-2`) 위에서도 4.5:1을 넘깁니다.
- **선** (`line` 버튼·kbd 테두리, `line-2` 카드 테두리·줄 구분선·탭 바닥선).
- **채움** (`fill` hover·세그먼트 트랙·기본 안내 상자, `fill-2` 막대 빈 트랙·단계 번호 원).
- **diff** (`add`, `del`): 미리 보기의 추가·삭제 줄 바탕.
- **스크림** (`scrim`): 모달과 사용법 창 뒤.

### Named Rules

**The 30-Step Status Text Rule.** 상태색 글자는 Montage 팔레트의 50 단계(red 50 `#ff4242` 등) 대신 30 단계(`neg` `#b00c0c`, `cau` `#9c5800`, `pos` `#006e25`)를 써서 흰 면과 옅은 상태 바탕 위에서 4.5:1을 넘깁니다. 50 단계 색은 투명도를 낮춘 바탕(`*-bg`)에만 남습니다. 어두운 모드는 밝은 60 단계를 씁니다.

**The Blue Means Act Rule.** 파란색은 누를 수 있는 것(주 버튼, 링크, soft 버튼 글자)과 지금 위치(현재 폴더, 현재 단계, 지금 점수 구간, 포커스)에만 씁니다. 제목, 장식, 구역 바탕에는 쓰지 않습니다.

**The Right Blue Rule.** 파란 토큰은 놓이는 자리로 고릅니다. 흰 글자 아래 면은 `brand-fill`, `brand-subtle` 위 글자는 `brand-text`, 그 밖의 파란 글자·선은 `brand`. 어두운 모드의 밝은 `brand`를 흰 글자 아래에 깔지 않습니다.

**The Words Before Color Rule.** 상태는 색만으로 말하지 않습니다. 배지는 "위험 / 주의 / 통과 / 됨" 글자를 담고, 점수는 숫자로, 규칙 타일은 이름표로 함께 말합니다.

## Typography

**Display Font:** Pretendard Variable (Pretendard, Malgun Gothic, Apple SD Gothic Neo, system-ui 대체)
**Body Font:** Pretendard Variable (같은 스택)
**Label/Mono Font:** Cascadia Mono (Consolas, D2Coding 대체)

**Character:** Pretendard 한 벌로 점수부터 캡션까지 처리합니다. 큰 글자일수록 자간을 좁히고(-0.028 ~ -0.012em), 본문 15px은 Montage 본문 자간(0.0096em)을 씁니다. 글꼴은 앱에 넣어 오프라인·CSP `'self'`에서도 같게 보입니다(SIL OFL 1.1).

### Hierarchy

- **Display** (700, 40px/52px): 요약 카드의 점수 숫자 한 곳. 단위 "점"은 18px/600.
- **Headline** (700, 28px/38px): 처음 화면 제목.
- **Title-page** (700, 24px/32px): 머리글의 폴더 이름(h1), 점검 기준 이름.
- **Title** (600, 20px/28px): 카드 제목·묶음 제목. 모달 제목은 같은 크기에 700, 규칙 타일 숫자도 20px/700.
- **Lead** (600, 18px/26px): 요약 카드의 리드 문장(`pre-line`), 모달 메시지의 `::first-line`(700).
- **Body-strong** (600, 16px/24px): 할 일 제목, 탭, 사용법 단계 제목. 처음 화면 안내 문단은 16px/26px 400.
- **Body** (400, 15px/22px): 기본 글자, 버튼, "할 일:" 문장, 펼친 본문 칸(15px/24px, 64ch).
- **Body-small** (400–600, 14px/20px): 안내 상자, 작은 버튼, 텍스트 버튼, 세그먼트 항목, 펼친 본문 칸 이름.
- **Caption** (600, 13px/18px): 배지, 태그, 그룹 이름, 경로(400), 막대 눈금, kbd.
- **Mono** (400, 13px): 경로·명령·diff·로그·예시.

### Named Rules

**The 13px Floor Rule.** 화면의 어떤 글자도 13px보다 작지 않습니다. 가장 작은 단계는 Caption과 Mono(13px)입니다.

**The Tabular Score Rule.** 점수, +N점, 경과 시간처럼 바뀌는 숫자는 `font-variant-numeric: tabular-nums`로 자리를 고정합니다.

**The Keep-All Rule.** 문서 전체에 `word-break: keep-all`을 걸어 어절 중간에서 줄이 끊기지 않게 합니다. 경로·명령·제목만 `overflow-wrap: anywhere` 또는 `break-all`로 끊습니다.

## Layout

두 칸 격자(`--side-w` 248px + 나머지)입니다. 사이드바는 흰 면에 오른쪽 1px `line-2`, 안쪽 20px 16px, 요소 간격 20px이고 위에서부터 브랜드 → [폴더 열기] → 최근 폴더 → 아래쪽(사용법, Claude 상태 줄)입니다. 본문은 `bg-2` 바탕에서만 스크롤되고, 최대 920px 열(안쪽 28px 40px 48px)에 블록을 20px 간격으로 쌓습니다.

- **기준 간격:** 4 / 8 / 12 / 16 / 20 / 24 / 40px. 카드 안쪽 24px, 버튼 사이 8px.
- **할 일 줄:** `minmax(0,1fr) auto auto 28px` 네 열(머리 버튼 | +N점 | 작은 버튼 | 화살표), 위아래 16px, 줄 사이 1px `line-2`. 머리 버튼 안은 `52px` 배지 열 + 문장. 펼친 본문은 64px 들여 씁니다.
- **기준 표:** `minmax(0,1fr) 160px 120px`.
- **반응형(≤1000px):** 사이드바 220px, 본문 안쪽 24px, 카드 20px, 요약 카드 한 열, 할 일 줄의 버튼이 둘째 줄로, 펼친 본문 칸 이름이 위로, 단계·사용법 칸 한 열, 기준 표 `1fr 120px 92px`. 창 최소 폭 760px이라 두 칸은 유지됩니다.
- **긴 경로:** 한 줄로 두고 `direction: rtl`로 앞쪽을 줄여 폴더 끝이 보이게 합니다.
- **알림이 떠 있을 때:** 본문 아래 여백을 220px로 늘려 알림이 마지막 카드를 가리지 않게 합니다.

## Elevation & Depth

평면 우선입니다. 깊이는 `bg-2` 바탕 위 흰 카드와 1px `line-2` 테두리로 만들고, 카드에는 그림자가 없습니다. 그림자는 화면 위에 떠야 하는 것과 세그먼트의 선택된 칸에만 있습니다.

### Shadow Vocabulary

- **떠 있는 창** (`--shadow`: `0 2px 8px rgb(23 23 25 / 0.06), 0 16px 40px rgb(23 23 25 / 0.16)`, 어두운 모드 0.3 / 0.5): 모달, 아래쪽 알림, 사용법 창.
- **선택된 세그먼트** (`--shadow-sm`: `0 1px 2px rgb(23 23 25 / 0.08)`, 어두운 모드 `rgb(0 0 0 / 0.4)`): 트랙 위 흰 칸을 살짝 띄웁니다.

### Named Rules

**The Bordered Flat Card Rule.** 카드는 1px `line-2` 테두리와 바탕색 차이로만 구분합니다. 카드에 그림자를 더하지 않습니다.

## Shapes

바깥 면일수록 더 둥글고 안쪽일수록 덜 둥급니다: 모달·사용법 창 20px → 카드 16px → 큰 버튼·안내 상자·펼친 본문·묶음 목록·단계 칸·타일 12px → 버튼·세그먼트 트랙·최근 폴더 줄·파일 칸 10px → 작은 버튼·세그먼트 칸·아이콘 버튼·코드 칸·브랜드 마크 8px → 배지·태그·텍스트 버튼·kbd 6px → 막대 4px. 번호 원과 상태 점만 완전한 원입니다.

선은 1px이 기본입니다. `line`은 버튼·kbd 테두리, `line-2`는 카드·줄 구분·탭 바닥선·코드 칸. 선택된 탭 밑줄만 2px `fg`, "커밋하면" 막대 구간만 1.5px 점선(`brand-light`)입니다.

## Components

### Buttons

Montage outlined 버튼이 기본입니다. 흰 면, 1px `line` 테두리, 15px/600 글자, 아이콘과 6px 간격.

- **Shape:** 10px 모서리, 높이 40px, 안쪽 0 16px. 큰 버튼(lg) 48px·12px 모서리·16px 글자, 작은 버튼(sm) 32px·8px 모서리·14px 글자. 모달 행동 바 버튼은 44px.
- **Solid (주 행동):** `brand-fill` 면 + `on-brand` 글자, hover `brand-fill-strong`. 한 화면(탭)에 하나입니다: 처음 화면의 [점검할 폴더 고르기], 요약 카드의 단계별 주 버튼 하나, 추천 세팅의 첫 묶음 행동, 모달 행동 바 오른쪽 끝.
- **Soft:** outlined 그대로 글자만 `brand`. 줄 단위 행동([Claude로 반영] 등).
- **Danger / Danger-fill:** outlined + `neg` 글자([중단]), 채운 `neg-fill` + `on-brand` 글자, hover `neg-fill-strong`(되돌릴 수 없는 확인에만).
- **Text / Link:** 테두리 없는 14px/600. 텍스트 버튼은 `fg-2`, 링크형은 `brand`.
- **Icon:** 36px 투명 칸, `fg-3` 아이콘, hover에 `fill`.
- **Hover / Focus / Disabled:** hover에 `fill`(채운 버튼은 `brand-fill-strong`), 0.15s ease-out. 포커스는 2px `brand` 외곽선 2px 띄움. 꺼진 버튼은 투명도 0.45, 이유는 버튼 아래 13px `fg-3`로 적습니다. 비용이 들거나 되돌릴 수 없는 버튼은 `deliberate`로 Ctrl+Enter에서 빠집니다.

### Header

폴더 이름(Title-page) + 경로 한 줄([탐색기에서 열기] 텍스트 버튼) 왼쪽, 오른쪽에 아이콘 달린 outlined 버튼 셋(마지막 반영 되돌리기 / 리포트 저장 / 다시 점검).

### Segmented control (사용 방식)

`fill` 트랙(3px 안쪽, 10px 모서리) 안의 32px 칸 두 개: 혼자 써요 / 팀이 같이 써요. `aria-pressed`로 선택을 말하고, 선택된 칸은 흰 면 + `fg` + `--shadow-sm`, 나머지는 `fg-3`. 오른쪽에 14px `fg-3` 설명.

### Tabs

Montage 밑줄 탭: 점검 결과 / 추천 세팅 / 점검 기준. 16px/600, 간격 24px, 바닥 1px `line-2`. 선택된 탭은 `fg` 글자 + 2px `fg` 밑줄, 나머지는 `fg-3`(hover `fg`). `role="tablist"`, Ctrl+1/2/3.

### Summary card (시그니처)

카드 안 두 열(왼쪽 점수, 오른쪽 주 버튼): 리드 문장(Lead, 두 줄까지) → 40px 점수 + 감점 메모(15px `fg-3`) → 막대 → 눈금 → 주 버튼 하나 → 정보 안내 상자.

- **막대:** 8px 높이, 4px 모서리, `fill-2` 트랙. 겹친 세 구간: 지금(`brand`) / 고치면(`brand-light`) / 커밋하면(1.5px 점선 `brand-light`). 80% 자리에 2×16px `fg` 목표선. 아래 13px 눈금 "0 / 목표 80 / 100". 막대와 눈금은 `aria-hidden`, 숫자는 글자로 따로 말합니다.
- **단계(팀 저장소):** 고치기 → 커밋 → 팀원에게 보내기 세 칸. 지금 칸은 `brand-subtle` 면 + `brand-fill` 번호 원 + `brand-text` 제목, 끝난 칸은 `pos` 체크 번호, 다음 칸은 `bg-2`.
- **Motion:** 막대 폭 0.7s `cubic-bezier(0.16, 1, 0.3, 1)`이 유일한 연출 움직임이고, 다시 계산 중인 점수는 투명도 0.45로 흐립니다.

### Message box

Montage section-message. 아이콘 + 14px/20px 글자, 12px 모서리, 안쪽 12px 16px. 기본은 `fill` + `fg-2`, 경고는 `cau-bg` + `cau`, 업데이트 안내 줄은 흰 면 + `line-2` 테두리.

### To-do list rows (시그니처)

- **구조:** 글자 배지 | 위험 제목(16px/600) + "할 일: …" 줄(15px `fg-2`) | +N점(15px/600, tabular) | 작은 outlined 버튼 | 화살표 아이콘(28px). 그룹 이름은 13px/600 `fg-3`.
- **펼친 본문:** `bg-2` 12px 상자 안의 세 줄 표 — 왜 위험한가요 / 고치면 / 못 막는 것(있을 때만, 예시가 있으면 "예시" 줄). 칸 이름 112px 14px/600 `fg-3`, 내용 15px/24px, 줄 사이 1px `line-2`. 아래 행동 버튼 줄.
- **States:** 머리 버튼이 펼치기를 맡고(`aria-expanded`), 화살표는 0.2s 회전. 포커스는 2px `brand` 외곽선 4px 띄움.
- **지나간 항목:** 카드 아래 "통과한 항목" 토글로 접혀 있고, 펼치면 76px 배지 열의 조용한 `fg-2` 줄.

### Badge / Tag

- **Badge:** 13px/600, 6px 모서리, 안쪽 3px 8px. 위험 `neg`/`neg-bg`, 주의 `cau`/`cau-bg`, 통과 `pos`/`pos-bg`, 해당 없음 `fg-3`/`fill`. 글자가 상태를 말합니다.
- **Tag:** 13px/600, 6px 모서리. 기본 `fill`/`fg-3`, "사내" 태그는 `brand-subtle`/`brand-text`.

### Bundle cards (추천 세팅)

카드마다 제목(Title) + "N개 중 N개 남음"(14px `fg-3`) → 조언 문단(15px/24px `fg-2`, 64ch) → `bg-2` 목록 상자(52px 배지 열 + 할 일 문장, 줄 사이 `line-2`) → 행동 버튼 줄. 첫 묶음의 행동만 Solid입니다.

### Sidebar recent folders

52px 이상 줄, 10px 모서리. 폴더 이름(15px/600) 위, 경로(13px `fg-3`, 앞쪽 줄임) 아래, 오른쪽 점수(14px/600, 80점 이상 `pos`, 미만 `neg`). 현재 폴더는 `brand-subtle` 면 + `brand-text` 이름. 줄에 마우스를 올리거나 포커스가 오면 점수 자리에 28px × 아이콘 버튼(목록에서 빼기, 흰 면)이 나타납니다.

### Modal panel and toast

- **확인 창(모달):** 본문 영역 가운데, 흰 면 20px 모서리 + `--shadow`, 폭 880px(compact 560px), 최대 86vh. 제목(20px/700) / 스크롤 본문(15px/24px `fg-2`, 첫 줄 18px/700 `fg`) / 위 1px `line-2`의 행동 바([취소] → [주 버튼], 주 버튼이 오른쪽 끝). 뒤는 `scrim`.
- **결과 알림(toast):** 같은 창이 아래 20px에 640px로 바뀌고, 스크림 없이 1px `line-2` 테두리 + 그림자, 오른쪽 위 × 아이콘 버튼.
- **미리 보기:** 파일별 접는 칸(10px, `line-2` 테두리), diff는 `add`/`del` 바탕 Mono 13px.

### Help window

네이티브 `<dialog>`(`showModal`) 720px, 20px 모서리, `::backdrop`은 `scrim`. 번호 원(24px `brand-subtle`/`brand-text`)이 달린 단계 목록, 용어 `dl`, 단축키 표(줄 사이 `line-2`)로 됩니다.

## Do's and Don'ts

### Do:

- **Do** 색은 `style.css`의 토큰(`var(--…)`)으로만 쓰고, 밝은·어두운 모드를 같은 토큰 이름으로 맞추세요.
- **Do** 흰 글자 아래에는 `brand-fill`·`neg-fill`을, 옅은 파랑 면 위 글자에는 `brand-text`를 쓰세요(The Right Blue Rule).
- **Do** 상태 글자에는 30 단계 토큰(`neg` / `cau` / `pos`)을, 바탕에는 `*-bg`를 쓰세요(The 30-Step Status Text Rule).
- **Do** 상태는 배지 글자·숫자·이름표로도 말하세요(The Words Before Color Rule).
- **Do** 버튼은 outlined를 기본으로 두고, 채운 `brand-fill` 버튼은 한 화면에 하나만 두세요.
- **Do** 카드는 흰 면 + 1px `line-2` + 16px 모서리로 만들고 20px 간격으로 쌓으세요.
- **Do** 아이콘은 `viewBox="0 0 24 24"` 인라인 선 SVG(`fill: none; stroke: currentColor`, 굵기 1.8, 18px)로 넣고 `aria-hidden="true"`를 주세요.
- **Do** 포커스는 2px `brand` 외곽선으로 보이게 하고, `prefers-reduced-motion: reduce`에서는 모든 전환을 끄세요.

### Don't:

- **Don't** 은유 그림, 일러스트, 장식용 그래픽이나 배경 무늬를 넣지 마세요.
- **Don't** 파란색을 제목·장식·구역 바탕에 쓰지 마세요. 행동, 링크, 현재 위치에만 씁니다.
- **Don't** 상태를 색만으로 구분하지 마세요.
- **Don't** 13px보다 작은 글자를 쓰지 마세요.
- **Don't** 카드에 그림자를 더하지 마세요. 그림자는 떠 있는 창과 선택된 세그먼트에만 있습니다.
- **Don't** 이모지나 글리프 문자(✓, ✕, ▶ 등)를 아이콘으로 쓰지 마세요.
- **Don't** 제목 위에 작은 머리말(eyebrow·kicker) 줄을 만들지 마세요.
- **Don't** 막대 폭 전환 말고 다른 연출 움직임을 더하지 마세요. 상태 전환(색 0.15s, 화살표 0.2s, 흐림 0.2s)만 있습니다.
