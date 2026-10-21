// 화면 정적 파일(html·css)을 dist/app/ui로 복사한다. 스크립트는 tsc가 만든다.
import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist/app/ui", { recursive: true });
for (const name of ["index.html", "style.css"]) {
  await copyFile(`src/app/ui/${name}`, `dist/app/ui/${name}`);
}
