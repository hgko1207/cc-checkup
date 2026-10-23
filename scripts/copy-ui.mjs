// tsc가 만들지 않는 파일을 dist로 복사한다: 화면 정적 파일(html·css·글꼴), 훅 템플릿.
import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist/app/ui", { recursive: true });
for (const name of ["index.html", "style.css"]) {
  await copyFile(`src/app/ui/${name}`, `dist/app/ui/${name}`);
}
// 글꼴: Pretendard (SIL OFL 1.1). 라이선스 파일을 함께 넣는다
await mkdir("dist/app/ui/fonts", { recursive: true });
await copyFile(
  "node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  "dist/app/ui/fonts/PretendardVariable.woff2",
);
await copyFile("node_modules/pretendard/dist/LICENSE.txt", "dist/app/ui/fonts/LICENSE.txt");
// 위험 명령 차단 훅 템플릿 (src/hook-template.ts가 옆 폴더에서 읽는다)
await mkdir("dist/templates/hooks", { recursive: true });
for (const name of ["block-dangerous-bash.cjs", "lib.cjs"]) {
  await copyFile(`src/templates/hooks/${name}`, `dist/templates/hooks/${name}`);
}
