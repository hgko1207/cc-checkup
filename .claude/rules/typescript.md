---
paths:
  - "src/**/*.ts"
  - "test/**/*.ts"
---

# TypeScript 규칙

## 구조
- 진단 항목은 `src/checks/`에 Check 타입 함수로 만들고, `src/cli.ts`의 CHECKS 배열에 등록한다.
- Finding 인터페이스(id, severity, message, fix?)를 반환한다.

## 코드 스타일
- prettier (printWidth: 100)와 eslint (typescript-eslint recommended)로 포매팅·린트. 수동 정렬하지 않는다.
- ESM import에 `.js` 확장자를 붙인다 (NodeNext 해석).
- strict + noUncheckedIndexedAccess — 인덱스 접근 결과는 undefined 가능성을 처리한다.

## 이 스택의 함정
- `import type`을 쓰지 않으면 런타임에 불필요한 import가 남는다.

## 검증
- 정확한 명령은 CLAUDE.md의 검증 명령을 따른다.
