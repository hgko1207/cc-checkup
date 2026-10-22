// 한국어 조사 고르기: 앞말 끝소리에 받침이 있으면 "이·을", 없으면 "가·를".
// 괄호 설명은 건너뛰고 본말로 판단한다 ("작업 계획 파일(plan.md)" → "파일" → 받침 있음)
export function josa(word: string, withBatchim: string, without: string): string {
  const base = word.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const last = base.charCodeAt(base.length - 1);
  if (last >= 0xac00 && last <= 0xd7a3) return (last - 0xac00) % 28 > 0 ? withBatchim : without;
  // 영문·숫자는 읽는 소리로 대강 판단 (…l·m·n·숫자 0136 등은 받침)
  return /[lmnr]$|[0136]$/i.test(base) ? withBatchim : without;
}

export function withJosa(word: string, withBatchim: string, without: string): string {
  return word + josa(word, withBatchim, without);
}
