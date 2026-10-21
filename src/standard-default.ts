// 기본 표준 (내장). 개발 저장소 기준은 v0.3에서 코드에 있던 기준과 같다 — 기본 표준으로는 진단 결과가 바뀌지 않는다.
// 사내 표준은 standard/example-company.json처럼 공유 파일로 덮어쓴다.
import type { Standard } from "./standard.js";

// 지어낸 규칙을 막는 공통 문장 (실제 claude 확인에서 근거 없는 규칙을 적은 적이 있다)
const NO_INVENT =
  "규칙·금지 사항은 실제 파일에서 근거를 찾은 것만 적고, " +
  "근거가 없으면 지어내지 말고 '- TODO: 팀이 정할 것' 한 줄로 남긴다. ";

export const DEFAULT_STANDARD: Standard = {
  name: "기본 표준",
  version: "1.0.0",
  env: {
    // 고치기 1이 넣는 기본 대상 6개 (team-ai-kit 템플릿과 같은 목록)
    targets: [
      ".env",
      ".env.local",
      ".env.*.local",
      ".env.production*",
      ".env.development*",
      ".env.staging*",
    ],
  },
  claudeMd: {
    maxLines: 200,
    task: "claudeMd",
    requiredSections: [
      {
        id: "verify",
        title: "검증 명령",
        aliases: ["검증", "verify", "test"],
        example:
          "## 검증 명령\n\n작업을 끝내기 전에 이 순서로 실행한다. 실제로 실행해 확인한 명령만 적는다.\n\n" +
          "1. 타입체크: `npm run typecheck`\n2. 린트: `npm run lint`\n3. 테스트: `npm run test`",
      },
    ],
  },
  requiredFiles: [],
  plugins: { marketplaces: {}, required: [] },
  uiDetection: {
    dependencies: [
      "react",
      "react-dom",
      "vue",
      "svelte",
      "next",
      "nuxt",
      "@angular/core",
      "solid-js",
      "preact",
      "astro",
      "electron",
    ],
    files: ["index.html", "public/index.html", "src/index.html", "pubspec.yaml"],
  },
  score: { fail: 15, warn: 5 },
  claudeTasks: {
    claudeMd: {
      title: "CLAUDE.md 기준 잡기",
      targets: ["CLAUDE.md"],
      prompt:
        "이 저장소의 구조와 package.json 같은 설정 파일을 읽고 CLAUDE.md를 사내 표준에 맞게 만들거나 고쳐라. " +
        "빠진 필수 섹션({{missing}})을 채우되, 실제로 확인한 명령과 경로만 적는다. 이미 있는 내용은 지우지 않는다. " +
        "규칙·금지 사항은 설정 파일(eslint·prettier·tsconfig·editorconfig 등)이나 코드에서 근거를 찾은 것만 적고, " +
        "근거가 없으면 지어내지 말고 '- TODO: 팀이 정할 것' 한 줄로 남긴다. " +
        "CLAUDE.md 외의 파일은 수정하지 않는다.",
    },
    claudeMdDocs: {
      title: "문서 폴더 CLAUDE.md 기준 잡기",
      targets: ["CLAUDE.md"],
      prompt:
        "이 폴더는 코드가 아니라 문서·기획 자료 폴더다. 폴더의 파일 목록과 문서 몇 개를 읽고 CLAUDE.md를 만들거나 고쳐라. " +
        "빠진 필수 섹션({{missing}})을 채운다: 이 폴더가 무엇을 위한 곳인지, 하위 폴더와 파일 이름 규칙, " +
        "문서 작성 방식(말투·형식), Claude가 하지 말 것. " +
        "실제로 있는 폴더·파일 이름만 적고 이미 있는 내용은 지우지 않는다. " +
        NO_INVENT +
        "CLAUDE.md 외의 파일은 수정하지 않는다.",
    },
    design: {
      title: "DESIGN.md 만들기",
      targets: ["DESIGN.md"],
      prompt:
        "이 저장소의 화면 코드(컴포넌트, 스타일, 색·글꼴 정의)를 읽고 DESIGN.md를 만들어라. " +
        "실제로 쓰는 색상·글꼴·간격·컴포넌트 규칙만 적고, 없는 규칙을 지어내지 않는다. " +
        "확인할 수 없는 항목은 '- TODO: 팀이 정할 것'으로 남긴다. DESIGN.md 외의 파일은 수정하지 않는다.",
    },
  },
  docs: {
    claudeMd: {
      task: "claudeMdDocs",
      requiredSections: [
        {
          id: "purpose",
          title: "폴더 목적",
          aliases: ["목적", "소개", "개요", "about", "purpose", "overview"],
          example:
            "## 폴더 목적\n\n2026년 상반기 신규 서비스 기획 문서를 모은다. 기획서·회의록·시장 조사 자료가 있다.",
        },
        {
          id: "structure",
          title: "폴더 구조",
          aliases: ["구조", "structure", "폴더 구성", "파일 이름"],
          example:
            "## 폴더 구조\n\n- `기획서/` — 기능별 기획서 (`YYYYMMDD_기능명.md`)\n" +
            "- `회의록/` — 주간 회의록\n- `자료/` — 외부 조사 자료 (원본, 수정하지 않음)",
        },
        {
          id: "writing",
          title: "문서 작성 규칙",
          aliases: ["작성 규칙", "문서 규칙", "작성 방식", "writing", "style", "말투"],
          example:
            "## 문서 작성 규칙\n\n- 평서문(~한다)으로 쓴다.\n- 결론을 첫 문단에 쓴다.\n- 표는 마크다운 표로 쓴다.",
        },
        {
          id: "dont",
          title: "하지 말 것",
          aliases: ["하지 말 것", "금지", "don't", "do not"],
          example:
            "## 하지 말 것\n\n- `자료/`의 원본 파일을 고치지 않는다.\n- 고객 이름·연락처를 문서에 옮겨 적지 않는다.",
        },
      ],
    },
    requiredFiles: [],
  },
};
