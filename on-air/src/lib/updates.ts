import { useEffect, useState } from "react";
import { api } from "./api";
import type { UpdateInfo } from "./types";

let current: UpdateInfo | null = null;
const ls = new Set<(u: UpdateInfo) => void>();
let started = false;

function start() {
  if (started) return;
  started = true;
  void api.updateInfo().then((u) => {
    current = u;
    ls.forEach((l) => l(u));
  }, () => undefined);
  void api.onUpdate((u) => {
    current = u;
    ls.forEach((l) => l(u));
  });
}

export function useUpdateInfo(): UpdateInfo | null {
  start();
  const [u, setU] = useState(current);
  useEffect(() => {
    ls.add(setU);
    return () => {
      ls.delete(setU);
    };
  }, []);
  return u;
}
