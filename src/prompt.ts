import { createInterface } from "node:readline/promises";

// stdin과 stdout이 모두 터미널일 때만 묻는다. 파이프·CI·리다이렉트에서는 묻지도 쓰지도 않는다
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export type Ask = (question: string) => Promise<string>;

export const askTerminal: Ask = async (question) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
};

// "1,2" → [1,2], "a" → 전부, 엔터 → [] (건너뛰기). 잘못된 입력이면 null
export function parseSelection(input: string, max: number): number[] | null {
  const s = input.trim().toLowerCase();
  if (s === "") return [];
  if (s === "a") return Array.from({ length: max }, (_, i) => i + 1);
  const nums = s.split(/[\s,]+/).filter((x) => x !== "");
  const out = new Set<number>();
  for (const n of nums) {
    if (!/^\d+$/.test(n)) return null;
    const v = Number(n);
    if (v < 1 || v > max) return null;
    out.add(v);
  }
  return [...out].sort((x, y) => x - y);
}

export async function askSelection(ask: Ask, max: number): Promise<number[]> {
  for (let tries = 0; tries < 3; tries++) {
    const picked = parseSelection(
      await ask("적용할 번호 (예: 1,2 / a=전부 / 엔터=건너뛰기): "),
      max,
    );
    if (picked !== null) return picked;
    console.log(`  1부터 ${max} 사이 번호를 쉼표로 적으세요.`);
  }
  return [];
}

// 기본값은 N. y·yes만 승인으로 본다
export async function confirm(ask: Ask, question: string): Promise<boolean> {
  return /^(y|yes)$/i.test((await ask(`${question} [y/N]: `)).trim());
}
