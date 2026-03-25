"""
cad_text_cleaner.py  —  Strip AutoCAD formatting codes.
"""

import re

_CTRL = [
    (r"%%[Pp]", "±"),
    (r"%%[Dd]", "°"),
    (r"%%[Cc]", "⌀"),
    (r"%%[Oo]", ""),
    (r"%%[Uu]", ""),
    (r"%%\d{3}", ""),
]

_MTEXT_RE = re.compile(
    r"\{\\[fFhHcCwWqQaAtT][^;]*;"
    r"|\{\\[PpNnS~Ll]"
    r"|\\[PpNnS~Ll]"
    r"|\\[fFhHcCwWqQaAtT][^;]*;"
    r"|[{}]",
    re.IGNORECASE,
)

_FIELD_RE = re.compile(r"%<[^>]*>%", re.IGNORECASE)
_HYPER_RE = re.compile(r"HYPERLINK\s*\"[^\"]*\"\s*", re.IGNORECASE)
_WS_RE    = re.compile(r"\s{2,}")

def clean_cad_text(raw: str) -> str:
    if not raw:
        return ""
    text = str(raw)
    for pattern, repl in _CTRL:
        text = re.sub(pattern, repl, text)
    text = _MTEXT_RE.sub(" ", text)
    text = _FIELD_RE.sub("", text)
    text = _HYPER_RE.sub("", text)
    text = _WS_RE.sub(" ", text)
    return text.strip()
