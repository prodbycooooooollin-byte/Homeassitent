//! Minimaler, toleranter KeyValues-Parser für Steam-Dateien (nur Lesen).

use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq)]
pub enum Kv {
    Str(String),
    Obj(Vec<(String, Kv)>),
}

impl Kv {
    pub fn get(&self, key: &str) -> Option<&Kv> {
        match self {
            Kv::Obj(items) => items.iter().rev().find(|(k, _)| k.eq_ignore_ascii_case(key)).map(|(_, v)| v),
            _ => None,
        }
    }
    pub fn str(&self) -> Option<&str> {
        match self {
            Kv::Str(s) => Some(s),
            _ => None,
        }
    }
    pub fn entries(&self) -> &[(String, Kv)] {
        match self {
            Kv::Obj(items) => items,
            _ => &[],
        }
    }
    pub fn path(&self, keys: &[&str]) -> Option<&Kv> {
        let mut cur = self;
        for k in keys {
            cur = cur.get(k)?;
        }
        Some(cur)
    }
}

fn tokens(src: &str) -> Vec<String> {
    let mut out = Vec::new();
    let chars: Vec<char> = src.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            i += 1;
        } else if c == '/' && chars.get(i + 1) == Some(&'/') {
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
        } else if c == '{' || c == '}' {
            out.push(c.to_string());
            i += 1;
        } else if c == '"' {
            i += 1;
            let mut s = String::new();
            while i < chars.len() && chars[i] != '"' {
                if chars[i] == '\\' && i + 1 < chars.len() {
                    let n = chars[i + 1];
                    s.push(match n {
                        'n' => '\n',
                        't' => '\t',
                        other => other,
                    });
                    i += 2;
                    continue;
                }
                s.push(chars[i]);
                i += 1;
            }
            i += 1;
            out.push(format!("\u{0}{s}"));
        } else {
            let mut s = String::new();
            while i < chars.len() && !chars[i].is_whitespace() && chars[i] != '{' && chars[i] != '}' && chars[i] != '"' {
                s.push(chars[i]);
                i += 1;
            }
            out.push(format!("\u{0}{s}"));
        }
    }
    out
}

pub fn parse(src: &str) -> Kv {
    let toks = tokens(src);
    let mut pos = 0;
    Kv::Obj(parse_list(&toks, &mut pos))
}

fn parse_list(t: &[String], pos: &mut usize) -> Vec<(String, Kv)> {
    let mut items = Vec::new();
    while *pos < t.len() {
        let tok = &t[*pos];
        if tok == "}" {
            *pos += 1;
            return items;
        }
        if tok == "{" {
            *pos += 1;
            continue;
        }
        let key = tok.trim_start_matches('\u{0}').to_string();
        *pos += 1;
        match t.get(*pos).map(|s| s.as_str()) {
            Some("{") => {
                *pos += 1;
                items.push((key, Kv::Obj(parse_list(t, pos))));
            }
            Some("}") | None => items.push((key, Kv::Str(String::new()))),
            Some(v) => {
                items.push((key, Kv::Str(v.trim_start_matches('\u{0}').to_string())));
                *pos += 1;
            }
        }
    }
    items
}

/// Flache Sicht auf die Blätter eines Objekts.
pub fn leaves(kv: &Kv) -> BTreeMap<String, String> {
    kv.entries().iter().filter_map(|(k, v)| v.str().map(|s| (k.to_lowercase(), s.to_string()))).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_libraryfolders() {
        let src = r#""libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
		"apps"
		{
			"228980"		"1"
		}
	}
	"1"
	{
		"path"		"D:\\SteamLibrary"
		"apps"
		{
			"1422450"		"30000000000"
		}
	}
}"#;
        let kv = parse(src);
        let lf = kv.get("libraryfolders").unwrap();
        assert_eq!(lf.path(&["1", "path"]).unwrap().str(), Some("D:\\SteamLibrary"));
        assert!(lf.path(&["1", "apps", "1422450"]).is_some());
    }
}
