"""Erkennt das Zielwort in transkribiertem Text."""
import re
import unicodedata

# Deckt die üblichen Schreibweisen und Transkriptionsvarianten ab (inkl. Plural).
_PATTERN = re.compile(r"\bn+[i1!]+g{2,}(?:[e3]r?|a|ah)?s?\b")


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).lower()
    text = "".join(c for c in text if not unicodedata.combining(c))
    # Buchstabiert (n i g g e r / n.i.g.g.a) zusammenziehen
    text = re.sub(r"\b(?:\w[\s.\-_*]+){3,}\w\b", lambda m: re.sub(r"[\s.\-_*]+", "", m.group()), text)
    return text


def count_hits(text: str) -> int:
    """Anzahl der Treffer im Text."""
    return len(_PATTERN.findall(_normalize(text)))
