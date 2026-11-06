import { richParts } from "../lib/useSettings";

export function Rich({ text }: { text: string }) {
  return (
    <>
      {richParts(text).map((p, i) => (p.bold ? <b key={i}>{p.text}</b> : <span key={i}>{p.text}</span>))}
    </>
  );
}
