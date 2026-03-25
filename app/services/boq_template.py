"""
boq_template.py — Heuristic fallback for CAD to BOQ mapping.

Adapted from backend/boq_template.py for the BOQ-Analysis app.
Used when AI is unavailable or fails. Reads real items from parser output,
skips all noise, and maps to categories.
"""

import re
from typing import Any

# ── Skip patterns for fallback map_to_boq ─────────────────────────────
_SKIP_FRAGMENTS = re.compile(
    r"^(for\s+lighting\s*[&+]\s*power"
    r"|each\s+solar\s+panel\s+generates"
    r"|around\s+[\d.]+\s*kw\s+of\s+solar"
    r"|along\s+with\s+other\s+switch\s+controls"
    r"|from\s+metering\s+panel"
    r"|fed\s+from\s+common\s+area\s+db"
    r"|ep\s+for\s+panel"
    r"|conduit\s+legends"
    r"|socket\s+outlet"
    r"|to\s+cable\s+chamber"
    r"|^\s*(fridge|dish\s*washer|vehicle|charging\s+unit)\s*$"
    r"|^\s*(grounding\s+conductor|pvc\s+sleeves|\d+mm\s+diameter)\s*$"
    r"|^\s*typical\s+arrangement"
    r"|^\s*(electrical|earth\s+pit\s*&\s*panel\s+details|electrical\s+point\s+layout"
    r"|electrical\s+conduit\s+layout|electrical\s+dimension\s+layout)\s*$"
    r"|xql;|xqc;|xt[\d\.]"             # raw mtext codes
    r"|featherlite|vasanth\s*nagar|jayanagar"
    r"|@\s*\d+mm\s*(aff|ffl|abc)"
    r")",
    re.IGNORECASE,
)

_CAT_KW = {
    "Mechanical":  ["vrv unit","vrf unit","ahu","fcu","solar panel","monocrystalline",
                    "solar heater","bulkhead light","exhaust fan"],
    "Electrical":  ["socket","switch","light point","mcb","mccb","rccb","db","conduit",
                    "earth strip","earth pit","electrode","gi strip","gi wire","hume pipe",
                    "cable chamber","meter board","metering panel","rmu","kiosk"],
    "Piping":      ["pipe","valve","pump","tank","wc","basin","drain"],
    "Structural":  ["concrete","rebar","slab","upstand","column","beam"],
    "Civil":       ["road","paving","excavation","manhole","kerb"],
    "Architecture":["tile","paint","partition","false ceiling","door","window"],
}

def _classify(text: str) -> str:
    low = text.lower()
    for cat, kws in _CAT_KW.items():
        if any(kw in low for kw in kws): return cat
    return "General"


def map_to_boq(raw: dict[str, Any]) -> list[dict[str, Any]]:
    """Heuristic fallback — reads real items from parser output, skips all noise."""
    items   = []
    seen    = set()
    counter = 1

    def _add(name, desc, qty, unit, cat):
        nonlocal counter
        key = name.lower().strip()
        if not key or key in seen or len(key) < 3: return
        if _SKIP_FRAGMENTS.match(name): return
        seen.add(key)
        items.append({
            "item_no":     counter,
            "category":    cat,
            "clean_name":  name,
            "description": desc,
            "quantity":    round(float(qty), 2),
            "unit":        unit,
        })
        counter += 1

    # block attribs first (richest)
    for b in raw.get("blocks_with_attribs", []):
        name = b.get("clean_name") or b.get("block_name","")
        _add(name, b.get("description",name), 1, "nos",
             b.get("category") or _classify(name))

    # text annotations
    for t in raw.get("texts", []):
        name = t.get("clean_name") or t.get("text","")
        _add(name, t.get("text",name),
             t.get("quantity",0), t.get("unit","nos"),
             t.get("category") or _classify(name))

    # geometry last resort
    if not items:
        tl = raw.get("total_line_length",0)
        if tl > 0:
            _add("Linear runs", "Total line length — no annotations found", tl, "m", "General")
        for d,c,n in [("door_count","Architecture","Doors"),
                      ("window_count","Architecture","Windows"),
                      ("column_count","Structural","Columns")]:
            v = raw.get(d,0)
            if v: _add(n, f"{n} from block references", v, "nos", c)

    return items
