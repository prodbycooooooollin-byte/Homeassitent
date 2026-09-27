// Minimaler Parser für das KeyValues3-Textformat (Source 2), wie es in
// Deadlocks scripts/*.vdata verwendet wird. Unterstützt Objekte, Arrays,
// Strings (auch """mehrzeilig"""), Zahlen, Booleans, null sowie Präfixe wie
// resource_name:"…", panorama:"…" oder subclass:{…} (Präfix wird verworfen).

export type KV3Value = string | number | boolean | null | KV3Value[] | KV3Object;
export interface KV3Object { [key: string]: KV3Value }

export function parseKV3(text: string): KV3Object {
  let i = 0;
  const n = text.length;

  const fail = (msg: string): never => {
    const line = text.slice(0, i).split('\n').length;
    throw new Error(`KV3: ${msg} (Zeile ${line})`);
  };

  function skip() {
    while (i < n) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '﻿') { i++; continue; }
      if (c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
      if (c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
      if (c === '<' && text.startsWith('<!--', i)) { const e = text.indexOf('-->', i); i = e < 0 ? n : e + 3; continue; }
      break;
    }
  }

  function readString(): string {
    if (text.startsWith('"""', i)) {
      const e = text.indexOf('"""', i + 3);
      if (e < 0) fail('offener """-String');
      const s = text.slice(i + 3, e).replace(/^\r?\n/, '').replace(/\r?\n$/, '');
      i = e + 3;
      return s;
    }
    i++; // "
    let out = '';
    while (i < n && text[i] !== '"') {
      if (text[i] === '\\' && i + 1 < n) { const x = text[i + 1]; out += x === 'n' ? '\n' : x === 't' ? '\t' : x; i += 2; continue; }
      out += text[i++];
    }
    if (i >= n) fail('offener String');
    i++;
    return out;
  }

  function readBare(): string {
    const start = i;
    while (i < n && /[A-Za-z0-9_.\-+|:$#@]/.test(text[i])) {
      // ein Präfix wie resource_name: endet vor " { [
      if (text[i] === ':') {
        let j = i + 1;
        while (j < n && /\s/.test(text[j])) j++;
        if (text[j] === '"' || text[j] === '{' || text[j] === '[') break;
      }
      i++;
    }
    if (i === start) fail(`unerwartetes Zeichen '${text[i]}'`);
    return text.slice(start, i);
  }

  function readValue(): KV3Value {
    skip();
    const c = text[i];
    if (c === '{') return readObject();
    if (c === '[') return readArray();
    if (c === '"') return readString();
    const bare = readBare();
    if (text[i] === ':') { i++; return readValue(); } // Präfix (resource_name:, subclass:, …)
    if (bare === 'true') return true;
    if (bare === 'false') return false;
    if (bare === 'null') return null;
    if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(bare)) return Number(bare);
    return bare;
  }

  function readArray(): KV3Value[] {
    i++; // [
    const out: KV3Value[] = [];
    for (;;) {
      skip();
      if (text[i] === ']') { i++; return out; }
      if (i >= n) fail('offenes Array');
      out.push(readValue());
      skip();
      if (text[i] === ',') i++;
    }
  }

  function readKey(): string {
    skip();
    return text[i] === '"' ? readString() : readBare();
  }

  function readObject(): KV3Object {
    i++; // {
    const out: KV3Object = {};
    for (;;) {
      skip();
      if (text[i] === '}') { i++; return out; }
      if (i >= n) fail('offenes Objekt');
      const key = readKey();
      skip();
      if (text[i] !== '=') fail(`'=' nach Schlüssel ${key} erwartet`);
      i++;
      out[key] = readValue();
      skip();
      if (text[i] === ',') i++;
    }
  }

  skip();
  if (text[i] !== '{') fail('Wurzelobjekt erwartet');
  return readObject();
}

/** Valve-KeyValues (v1, z. B. Lokalisierungsdateien): "key" "value"-Paare in verschachtelten Blöcken. */
export function parseKV1Tokens(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /"((?:[^"\\]|\\.)*)"\s*"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\n/g, '\n');
  return out;
}
