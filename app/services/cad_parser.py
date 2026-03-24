"""
cad_parser.py — v5  MAXIMUM EXTRACTION, NO DEDUPLICATION
"""

import ezdxf
import math
import re
from typing import Any, List, Dict, Optional
from collections import defaultdict

try:
    from app.services.cad_text_cleaner import clean_cad_text
    from app.services.cad_layer_classifier import classify_layer
except ImportError:
    from cad_text_cleaner import clean_cad_text
    from cad_layer_classifier import classify_layer


# ══ NOISE FILTER ═════════════════════════════════════════════════════════════
_NOISE_RE = re.compile(
    r"^(\s*[\d\.\-\+\/]+\s*$"
    r"|rev\s*[a-z0-9]|dwg[\s\.]?no"
    r"|drawn\s*by|checked\s*by|approved\s*by|issued\s*by"
    r"|date\s*[:\-]|scale\s*[:\-]"
    r"|north|true\s*north"
    r"|sheet\s*\d+\s*(of\s*\d+)?"
    r"|do\s*not\s*scale|nts"
    r"|good\s*for\s*construction|updated\s*as\s*per"
    r"|\s*[a-zA-Z]{1,2}\d{1,2}\s*$"
    r"|\s*\d{1,2}[a-zA-Z]{1,2}\s*$"
    # Mounting heights
    r"|@\s*\d+\s*mm\s*(aff|ffl|abc|bgl|ngl)?\b"
    r"|\d+\s*mm\s*(aff|ffl|abc|bgl|ngl)\b"
    r"|top\s*@\s*\d+mm"
    r"|switch\s*will\s*be\s*mounted\s*separately\s*@"
    r"|^\s*@\d{3,4}\s*mm\s*$"
    # Circuit labels
    r"|lighting\s+ckt[\s\-\.]*\d*"
    r"|power\s+ckt[\s\-\.]*\d*"
    r"|^\s*dummy\s*$|^\s*description\s*$|^\s*issuals?\s*$"
    # Raw MTEXT codes
    r"|^x[qt][clr][\s,;]|^x[qt][clr],t\d"
    # Room name labels standalone
    r"|^\s*(living|dining|bedroom|kitchen|toilet|bathroom|utility|"
    r"corridor|balcony|foyer|lobby|pantry|store|garage|terrace)\s*[\+\&]?\s*(living|dining)?\s*$"
    # Drawing admin labels
    r"|^\s*(electrical|mechanical|plumbing|hvac|fire)\s+"
    r"(layout|drawing|plan|detail|schedule|point\s+layout|conduit\s+layout|dimension\s+layout)\s*$"
    r"|^\s*electrical\s*$|^\s*duct\s*$|^\s*projection\s*$"
    # Company/address/copyright
    r"|confidential|copyright|all\s+information\s+contained"
    r"|maple\s+engg|engg[\-\s]design\s+services"
    r"|featherlite|vasanth\s*nagar|jayanagar|kodava\s*samaj"
    # Fragments
    r"|^\s*for\s+lighting\s*[&+]\s*power\s*$"
    r"|^\s*each\s+solar\s+panel\s+generates\s*$"
    r"|^\s*along\s+with\s+other\s+switch\s+controls\s*$"
    r"|^\s*from\s+metering\s+panel\s*$"
    r"|^\s*fed\s+from\s+common\s+area\s+db\s*$"
    r"|^\s*ep\s+for\s+panel\s*$"
    r"|^\s*conduit\s+legends\s*$"
    r"|^\s*socket\s+outlet\s*$"
    r"|^\s*to\s+cable\s+chamber\s*$"
    # Appliances (not materials)
    r"|^\s*fridge\s*$|^\s*dish\s*washer\s*$"
    r"|^\s*(electric\s+)?vehicle\s*$"
    r"|^\s*charging\s+unit(\s*\(at\s*gf\))?\s*$"
    # Standalone helpers
    r"|^\s*grounding\s+conductor\s*$|^\s*pvc\s+sleeves\s*$"
    r"|^\s*\d+\s*mm\s+diameter\s*$"
    r"|^\s*typical\s+arrangement\s+of\s+pipe\s+electrode\s*$"
    r"|^\s*(earth\s+pit\s*[&+]\s*panel\s+details|electrical\s+point\s+layout"
    r"|electrical\s+conduit\s+layout|electrical\s+dimension\s+layout)\s*$"
    r"|^\s*rc\s+upstand\s*$|^\s*\d+thk\s+rc\s+upstand\s*$"
    r")",
    re.IGNORECASE,
)

def _is_noise(t: str) -> bool:
    return bool(_NOISE_RE.match(t.strip()))


# ══ MATERIAL HINTS ════════════════════════════════════════════════════════════
_HINTS = [
    "socket","switch","light","fan","mcb","mccb","rccb","acb","db ","tpn",
    "distribution board","conduit","tray","trunking","earth","electrode",
    "meter","panel","kiosk","rmu","transformer","ups","ats","dg","vfd",
    "vrv","vrf","ahu","fcu","solar","sq.mm","sqmm","cu. wire","cable","wire",
    "xlpe","nyy","a2x","pipe","hume","dwc","chamber","slab","upstand","rcc",
    "riser","module box","cover plate","geyser","point","nos of","wiring",
    "service socket","bulkhead","rccb","gi strip","gi wire",
]

def _has_hint(t: str) -> bool:
    low = t.lower()
    return any(h in low for h in _HINTS)


# ══ QUANTITY EXTRACTION ═══════════════════════════════════════════════════════
_LEAD_M_RE  = re.compile(r"^(\d+)\s*[Mm]\s+\S")
_NOS_OF_RE  = re.compile(r"^(\d+)\s+NOS\s+OF\s+", re.IGNORECASE)
_NOS_ANY_RE = re.compile(r"\b(\d+)\s+NOS\b", re.IGNORECASE)
_QTY_RE     = re.compile(
    r"(\d+(?:\.\d+)?)\s*(rmt|lm|running\s*m(?:etre|eter)?|m\b|nos?\.?|"
    r"pcs?\.?|sets?|kg\b|m2|m3|sqm|sq\.m|kva|kw)",
    re.IGNORECASE,
)
_UNIT_MAP = {
    "rmt":"Rmt","lm":"Rmt","running m":"Rmt","running metre":"Rmt",
    "m":"m","nos":"nos","no":"nos","nos.":"nos","pcs":"nos","pc":"nos",
    "sets":"sets","set":"sets","kg":"kg",
    "m2":"m²","sqm":"m²","sq.m":"m²","m3":"m³","kva":"kVA","kw":"kW",
}

def _extract_qty(text: str):
    if not text: return 0.0, _infer_unit(text)
    m = _LEAD_M_RE.match(text)
    if m: return float(m.group(1)), "nos"
    m = _NOS_OF_RE.match(text)
    if m: return float(m.group(1)), "nos"
    m = _NOS_ANY_RE.search(text)
    if m: return float(m.group(1)), "nos"
    m = _QTY_RE.search(text)
    if m:
        try:
            raw = m.group(2).strip().lower().rstrip(".")
            return float(m.group(1)), _UNIT_MAP.get(raw, raw)
        except ValueError: pass
    return 0.0, _infer_unit(text)

def _infer_unit(text: str) -> str:
    low = (text or "").lower()
    if any(x in low for x in [
        "sq.mm","sqmm","sq mm","cu. wire","cable","earth strip","gi strip",
        "cu strip","gi wire","hume pipe","dwc pipe","conduit run","conduit for",
        "dia frls pvc conduit","dia pvc conduit","gi pipe electrode",
        "a2xfy","a2xcewy","xlpe","nyy","2r-25x3","50x3 gi","50x6 gi",
    ]): return "Rmt"
    if any(x in low for x in ["slab","floor area","m²","sqm"]): return "m²"
    if any(x in low for x in ["concrete","excavation","m³"]): return "m³"
    if any(x in low for x in ["rebar","reinforcement","kg"]): return "kg"
    return "nos"

_ACTION_RE = re.compile(
    r"^(providing\s+and\s+fixing|providing\s+&\s+fixing|"
    r"supply\s+and\s+(install|installation)|s/i\s+of|p/f\s+of|"
    r"installation\s+of|supply\s+of|providing|fixing|laying|"
    r"erection\s+of|furnishing\s+and\s+fixing)\s+",
    re.IGNORECASE,
)
def _clean_name(text: str) -> str:
    if not text: return ""
    s = _ACTION_RE.sub("", text.strip())
    s = re.sub(r"^(the|a|an|of|to)\s+", "", s, flags=re.IGNORECASE)
    return s[:100].strip() or text[:100].strip()


# ══ CATEGORY CLASSIFIER ═══════════════════════════════════════════════════════
_CAT_MAP = {
    "Firefighting":   ["sprinkler","fire pump","fm200","hose reel","facp","deluge","novec","fire pipe"],
    "Mechanical":     ["ahu","fcu","vrf unit","vrv unit","duct","chiller","diffuser",
                       "solar panel","monocrystalline","solar heater","solar power",
                       "exhaust fan socket","bulkhead light"],
    "Electrical":     ["socket","switch","light point","light fitting","mcb","mccb","rccb","acb",
                       "distribution board","db ","tpn db","conduit","cable tray","trunking",
                       "earth strip","earth pit","electrode","gi strip","gi wire",
                       "meter board","metering panel","hume pipe","dwc pipe","cable chamber",
                       "rmu","kiosk","module box","cover plate","wiring","cu. wire","sq.mm",
                       "a2x","xlpe","fan point","wall light","ceiling light","mirror light",
                       "bulkhead","geyser","fan regulator","chandelier","dimmer","aquaguard",
                       "chimney","washing machine","hob socket","mixer socket","tv socket",
                       "telephone socket","ev charging","vrv mcb","32a 4p mcb","32a dp mcb",
                       "40a,4p rccb","service socket","conduit riser","conduit drop",
                       "conduit raiser","transformer","ups","ats","vfd","solar earth pit",
                       "pvc sleeve for solar","rccb","6 way tpn","12 way"],
    "Piping":         ["pipe","valve","pump","tank","wc","basin","drain","trap"],
    "Structural":     ["concrete","rebar","slab","rc upstand","upstand","column","beam",
                       "formwork","150thk"],
    "Civil":          ["road","paving","excavation","manhole","kerb","backfill"],
    "Architecture":   ["tile","paint","partition","false ceiling","door","window"],
}

def _classify(text: str) -> str:
    low = text.lower()
    for cat, kws in _CAT_MAP.items():
        if any(kw in low for kw in kws):
            return cat
    return "General"


# ══ MAIN ENTRY POINT ══════════════════════════════════════════════════════════
def parse_dxf(path: str) -> Dict[str, Any]:
    doc   = ezdxf.readfile(path)
    msp   = doc.modelspace()
    units = doc.header.get("$INSUNITS", 4)
    scale = 1.0 if units == 6 else (0.0254 if units == 1 else 0.001)

    # geometry accumulators
    total_line_length = circle_count = arc_count = polyline_count = 0
    circle_total_circumference = arc_total_length = polyline_total_length = 0.0
    closed_polyline_area = 0.0
    door_count = window_count = column_count = furniture_count = other_block_count = 0
    lines: list = []
    layer_summary: dict = {}
    entity_stats: dict = {}

    # KEY: raw list — NO deduplication at parser level
    texts: List[Dict] = []
    blocks_with_attribs: List[Dict] = []
    all_text_parts: List[str] = []

    DOOR_P  = ["door","dr","d-","entrance"]
    WIN_P   = ["window","win","w-","wd"]
    COL_P   = ["column","col","pillar","pier"]
    FURN_P  = ["furniture","furn","chair","table","desk","bed","sofa","cabinet"]

    def _match_pat(n, pats): return any(p in n.lower() for p in pats)

    def _ensure_layer(lname):
        if lname not in layer_summary:
            layer_summary[lname] = {
                "category": classify_layer(lname),
                "line_length": 0.0, "polyline_length": 0.0,
                "text_count": 0, "block_count": 0, "dimension_count": 0,
            }

    def _add_text(raw: str, layer: str, source: str, etype: str, mult: int = 1):
        cleaned = clean_cad_text(str(raw or "")).strip()
        if not cleaned or len(cleaned) < 3: return
        if _is_noise(cleaned): return
        
        _ensure_layer(layer)
        cat = _classify(cleaned) or layer_summary[layer]["category"]
        
        ctx = f"{cat}/{layer}"
        if source.startswith("blockdef:"):
            bname = source[len("blockdef:"):]
            ctx   = f"BLOCK:{bname}(x{mult})/{layer}"
        
        all_text_parts.append(f"[{ctx}] {cleaned}")

        if not _has_hint(cleaned): return

        cname = _clean_name(cleaned)
        if not cname or len(cname) < 3: return
        qty, unit = _extract_qty(cleaned)
        
        if source.startswith("blockdef:") and mult > 1:
            qty = mult if qty == 0 else qty * mult

        texts.append({
            "text":        cleaned,
            "clean_name":  cname,
            "layer":       layer,
            "category":    cat,
            "entity_type": etype,
            "source":      source,
            "quantity":    qty,
            "unit":        unit,
        })
        layer_summary[layer]["text_count"] += 1

    # ── GEOMETRY ─────────────────────────────────────────────────────────
    for e in msp.query("LINE"):
        x1,y1 = e.dxf.start.x, e.dxf.start.y
        x2,y2 = e.dxf.end.x, e.dxf.end.y
        ln = math.dist((x1,y1),(x2,y2))
        total_line_length += ln
        lines.append({"x1":x1,"y1":y1,"x2":x2,"y2":y2})
        layer = e.dxf.layer; _ensure_layer(layer)
        layer_summary[layer]["line_length"] += ln

    for e in msp.query("CIRCLE"):
        circle_count += 1
        circle_total_circumference += 2*math.pi*e.dxf.radius

    for e in msp.query("ARC"):
        r=e.dxf.radius; a0=math.radians(e.dxf.start_angle)
        a1=math.radians(e.dxf.end_angle); ang=a1-a0
        if ang<0: ang+=2*math.pi
        arc_count+=1; arc_total_length+=r*ang

    for e in msp.query("LWPOLYLINE"):
        try:
            pts=[(float(p[0]),float(p[1])) for p in e.get_points(format="xy")]
            if len(pts)<2: continue
            perim=sum(math.dist(pts[i],pts[i+1]) for i in range(len(pts)-1))
            if e.closed: perim+=math.dist(pts[-1],pts[0])
            polyline_count+=1; polyline_total_length+=perim
            if e.closed and len(pts)>=3:
                area=0.0; n=len(pts)
                for i in range(n):
                    j=(i+1)%n; area+=pts[i][0]*pts[j][1]; area-=pts[j][0]*pts[i][1]
                closed_polyline_area+=abs(area)/2.0
            layer=e.dxf.layer; _ensure_layer(layer)
            layer_summary[layer]["polyline_length"]+=perim
        except Exception: continue

    block_instance_count: dict[str, int] = defaultdict(int)
    spaces_for_count = [("modelspace", msp)]
    for layout in doc.layouts:
        if layout.name.lower() != "model":
            spaces_for_count.append((f"layout:{layout.name}", layout))
    
    for _, space in spaces_for_count:
        for e in space.query("INSERT"):
            try:
                bname = e.dxf.name
                if not bname.startswith("*"):
                    block_instance_count[bname] += 1
            except: continue

    spaces = [("modelspace", msp)]
    for layout in doc.layouts:
        if layout.name.lower() != "model":
            spaces.append((f"layout:{layout.name}", layout))
    for blk in doc.blocks:
        n = blk.name
        if n.startswith("*") or n.upper() in ("MODEL_SPACE","PAPER_SPACE"): continue
        spaces.append((f"blockdef:{n}", blk))

    for space_label, space in spaces:
        is_msp = (space_label == "modelspace")
        instance_mult = 1
        if space_label.startswith("blockdef:"):
            bname = space_label[len("blockdef:"):]
            instance_mult = block_instance_count.get(bname, 1)

        for e in space:
            etype = e.dxftype()
            entity_stats[etype] = entity_stats.get(etype, 0) + 1
            try:
                layer = e.dxf.layer if hasattr(e,"dxf") and hasattr(e.dxf,"layer") else "0"
                _ensure_layer(layer)

                if etype == "TEXT":
                    _add_text(e.dxf.text or "", layer, space_label, "TEXT", mult=instance_mult)
                elif etype == "MTEXT":
                    try:    raw = e.plain_mtext()
                    except: raw = getattr(e,"text","") or ""
                    _add_text(raw, layer, space_label, "MTEXT", mult=instance_mult)
                elif etype == "ATTRIB":
                    tag = getattr(e.dxf,"tag","")
                    val = e.dxf.text or ""
                    _add_text(f"{tag}: {val}" if tag else val, layer, space_label, "ATTRIB", mult=instance_mult)
                elif etype == "ATTDEF":
                    val = e.dxf.text or ""
                    if val.lower() not in ("","-","?","x","tbd","none"):
                        tag = getattr(e.dxf,"tag","")
                        _add_text(f"{tag}: {val}" if tag else val, layer, space_label, "ATTDEF", mult=instance_mult)
                elif etype == "MULTILEADER":
                    try:
                        content = e.context.mtext.default_content
                        _add_text(clean_cad_text(content), layer, space_label, "MULTILEADER", mult=instance_mult)
                    except: pass
                elif etype == "ACAD_TABLE":
                    try:
                        for row in range(e.dxf.rows):
                            for col in range(e.dxf.columns):
                                try:
                                    val = str(e.get_cell(row,col).value or "")
                                    _add_text(val, layer, space_label, "TABLE_CELL", mult=instance_mult)
                                except: pass
                    except: pass
                elif etype == "INSERT":
                    bname = e.dxf.name
                    if is_msp:
                        layer_summary[layer]["block_count"] += 1
                        if   _match_pat(bname, DOOR_P):  door_count  += 1
                        elif _match_pat(bname, WIN_P):   window_count+= 1
                        elif _match_pat(bname, COL_P):   column_count+= 1
                        elif _match_pat(bname, FURN_P):  furniture_count+=1
                        else:                            other_block_count+=1

                    if hasattr(e, "attribs"):
                        attribs = []
                        for att in e.attribs:
                            tag = att.dxf.tag or ""
                            val = clean_cad_text(att.dxf.text or "").strip()
                            if val and val.lower() not in ("","none","-","n/a","tbd","?"):
                                attribs.append({"tag": tag, "value": val})
                                _add_text(val, layer, f"insert:{bname}", "ATTRIB")
                                all_text_parts.append(f"[BLOCK:{bname}/{layer}] {tag}={val}")

                        if attribs:
                            cat = _classify(bname) or layer_summary[layer]["category"]
                            full = " | ".join(f"{a['tag']}: {a['value']}" for a in attribs)
                            blocks_with_attribs.append({
                                "block_name": bname,
                                "clean_name": _clean_name(full) if full else bname,
                                "description": full,
                                "layer": layer, "category": cat,
                                "attribs": attribs, "source": space_label,
                            })

                elif etype == "DIMENSION":
                    override = getattr(e.dxf,"text","") or ""
                    if override and override not in ("<>",""):
                        mt = clean_cad_text(override)
                        if not _is_noise(mt):
                            _add_text(mt, layer, space_label, "DIMENSION_TEXT", mult=instance_mult)

            except Exception: continue

    for ld in layer_summary.values():
        ld["line_length"]     = round(float(ld["line_length"]),2)
        ld["polyline_length"] = round(float(ld["polyline_length"]),2)

    return {
        "total_line_length":           round(float(total_line_length*scale),2),
        "circle_count":                circle_count,
        "circle_total_circumference":  round(float(circle_total_circumference*scale),2),
        "arc_count":                   arc_count,
        "arc_total_length":            round(float(arc_total_length*scale),2),
        "polyline_count":              polyline_count,
        "polyline_total_length":       round(float(polyline_total_length*scale),2),
        "closed_polyline_area":        round(float(closed_polyline_area*(scale**2)),2),
        "door_count":                  door_count,
        "window_count":                window_count,
        "column_count":                column_count,
        "furniture_count":             furniture_count,
        "other_block_count":           other_block_count,
        "lines":                       lines,
        "texts":                       texts,
        "blocks_with_attribs":         blocks_with_attribs,
        "dimensions":                  [],
        "layer_summary":               layer_summary,
        "combined_text":               "\n".join(all_text_parts),
        "extraction_stats": {
            "total_text_entities":  len(texts),
            "total_blocks_attribs": len(blocks_with_attribs),
            "spaces_scanned":       len(spaces),
            "raw_text_lines":       len(all_text_parts),
            "entity_type_counts":   entity_stats,
        },
    }
