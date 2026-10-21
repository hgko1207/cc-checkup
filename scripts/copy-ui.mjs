// tsc가 만들지 않는 파일을 dist로 복사한다: 화면 정적 파일(html·css), 훅 템플릿.
import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist/app/ui", { recursive: true });
for (const name of ["index.html", "style.css"]) {
  await copyFile(`src/app/ui/${name}`, `dist/app/ui/${name}`);
}
// 위험 명령 차단 훅 템플릿 (src/hook-template.ts가 옆 폴더에서 읽는다)
await mkdir("dist/templates/hooks", { recursive: true });
for (const name of ["block-dangerous-bash.cjs", "lib.cjs"]) {
  await copyFile(`src/templates/hooks/${name}`, `dist/templates/hooks/${name}`);
}
