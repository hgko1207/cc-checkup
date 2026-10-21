// 기본 표준 (내장). 값은 v0.3에서 코드에 있던 기준과 같다 — 기본 표준으로는 진단 결과가 바뀌지 않는다.
// 사내 표준은 standard/example-company.json처럼 공유 파일로 덮어쓴다.
import type { Standard } from "./standard.js";

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
    requiredSections: [{ id: "verify", title: "검증 명령", aliases: ["검증", "verify", "test"] }],
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
        "이 저장소의 구조와 package.json 같은 설정 파일을 읽고 CLAUDE.md를 사내 표준에 맞게 고쳐라. " +
        "빠진 필수 섹션({{missing}})을 채우되, 실제로 확인한 명령과 경로만 적는다. 이미 있는 내용은 지우지 않는다. " +
        "CLAUDE.md 외의 파일은 수정하지 않는다.",
    },
    design: {
      title: "DESIGN.md 만들기",
      targets: ["DESIGN.md"],
      prompt:
        "이 저장소의 화면 코드(컴포넌트, 스타일, 색·글꼴 정의)를 읽고 DESIGN.md를 만들어라. " +
        "실제로 쓰는 색상·글꼴·간격·컴포넌트 규칙만 적고, 없는 규칙을 지어내지 않는다. DESIGN.md 외의 파일은 수정하지 않는다.",
    },
  },
};
