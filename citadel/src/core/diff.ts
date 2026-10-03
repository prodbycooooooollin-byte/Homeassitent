// Zeilenbasierter Diff (LCS) für die Änderungsvorschau.

export interface DiffLine {
  kind: 'same' | 'add' | 'del';
  text: string;
  oldNo?: number;
  newNo?: number;
}

export function lineDiff(a: string, b: string): DiffLine[] {
  const A = a.split(/\r?\n/);
  const B = b.split(/\r?\n/);
  // gemeinsamen Anfang/Ende abschneiden (schnell für typische kleine Änderungen)
  let pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0;
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  const a2 = A.slice(pre, A.length - suf);
  const b2 = B.slice(pre, B.length - suf);
  const n = a2.length;
  const m = b2.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a2[i] === b2[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  for (let k = 0; k < pre; k++) out.push({ kind: 'same', text: A[k], oldNo: k + 1, newNo: k + 1 });
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a2[i] === b2[j]) {
      out.push({ kind: 'same', text: a2[i], oldNo: pre + i + 1, newNo: pre + j + 1 });
      i++;
      j++;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      out.push({ kind: 'add', text: b2[j], newNo: pre + j + 1 });
      j++;
    } else {
      out.push({ kind: 'del', text: a2[i], oldNo: pre + i + 1 });
      i++;
    }
  }
  for (let k = 0; k < suf; k++) out.push({ kind: 'same', text: A[A.length - suf + k], oldNo: A.length - suf + k + 1, newNo: B.length - suf + k + 1 });
  return out;
}

/** Nur geänderte Zeilen mit etwas Kontext (für kompakte Vorschau). */
export function compactDiff(lines: DiffLine[], context = 2): (DiffLine | { kind: 'gap'; count: number })[] {
  const keep = new Array(lines.length).fill(false);
  lines.forEach((l, idx) => {
    if (l.kind !== 'same') for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k++) keep[k] = true;
  });
  const out: (DiffLine | { kind: 'gap'; count: number })[] = [];
  let gap = 0;
  lines.forEach((l, idx) => {
    if (keep[idx]) {
      if (gap) out.push({ kind: 'gap', count: gap });
      gap = 0;
      out.push(l);
    } else gap++;
  });
  if (gap) out.push({ kind: 'gap', count: gap });
  return out;
}
