"""
boq_engine.py — v5 (QTO Focused - No Pricing)

KEY CHANGE: After receiving all raw items from cad_parser (no dedup),
this engine:
  1. Groups items by clean_name + category
  2. Sums quantities for same item type
  3. Returns consolidated list (Quantity Takeoff)
"""

import re
from typing import List, Dict
from collections import defaultdict


# ── Unit normalisation ─────────────────────────────────────────────────────────
_UNIT_ALIASES = {
    "rmt":"Rmt","lm":"Rmt","rm":"Rmt","running metre":"Rmt","running meter":"Rmt",
    "lin m":"Rmt","linear m":"Rmt","metre":"m","meter":"m","meters":"m","metres":"m",
    "sqm":"m²","sq m":"m²","sq.m":"m²","m2":"m²","square metre":"m²",
    "cum":"m³","cu.m":"m³","m3":"m³",
    "number":"nos","numbers":"nos","no.":"nos","no":"nos",
    "each":"nos","pcs":"nos","pieces":"nos","pc":"nos",
    "set":"sets","kilogram":"kg","kilograms":"kg",
    "kva":"kVA","kw":"kW",
}

def normalise_unit(raw: str) -> str:
    if not raw or raw == "-": return "nos"
    clean = raw.strip().lower().rstrip(".")
    return _UNIT_ALIASES.get(clean, raw.strip())


# ── Unit inference ─────────────────────────────────────────────────────────────
def _infer_unit(text: str) -> str:
    low = (text or "").lower()
    if any(x in low for x in [
        "sq.mm","sqmm","sq mm","cu. wire","cable","earth strip","gi strip",
        "cu strip","gi wire","hume pipe","dwc pipe","conduit run","conduit for",
        "dia frls pvc conduit","dia pvc conduit","gi pipe electrode",
        "a2xfy","a2xcewy","xlpe","nyy","2r-25x3","50x3 gi","50x6 gi",
    ]): return "Rmt"
    if any(x in low for x in ["slab area","floor area","m²","sqm"]): return "m²"
    if any(x in low for x in ["concrete","excavation","m³"]): return "m³"
    if any(x in low for x in ["rebar","reinforcement","kg"]): return "kg"
    return "nos"


# ── Consolidate raw items ──────────────────────────────────────────────────────
def consolidate_items(raw_items: List[Dict]) -> List[Dict]:
    """
    Take the full raw list (possibly duplicated across layouts)
    and consolidate by clean_name:
      - Sum quantities
      - Keep best category
      - Keep best source (ATTRIB > MTEXT > TEXT)
    """
    SOURCE_RANK = {
        "ATTRIB": 9, "BLOCK_COMBINED": 9,
        "MTEXT": 8, "TEXT": 7,
        "MULTILEADER": 6, "TABLE_CELL": 5,
        "ATTDEF": 4, "DIMENSION_TEXT": 3,
    }
    CAT_RANK = {
        "Firefighting": 9, "Mechanical": 8, "Electrical": 7,
        "Piping": 6, "Structural": 5, "Civil": 4,
        "Architecture": 3, "General": 1,
    }

    # Group by clean_name (case-insensitive)
    groups: dict[str, dict] = {}
    for item in raw_items:
        key = (item.get("clean_name","") or "").lower().strip()
        if not key or len(key) < 3:
            continue

        if key not in groups:
            groups[key] = {
                "clean_name":  item.get("clean_name",""),
                "description": item.get("text", item.get("description","")),
                "category":    item.get("category","General"),
                "unit":        normalise_unit(item.get("unit","nos")),
                "quantity":    float(item.get("quantity", 0)),
                "source":      item.get("entity_type",""),
                "layer":       item.get("layer",""),
                "count":       1,
            }
        else:
            existing = groups[key]
            # Sum quantities
            q = float(item.get("quantity", 0))
            existing["quantity"] += q
            existing["count"]    += 1
            # Keep higher-ranked category
            new_cat = item.get("category","General")
            if CAT_RANK.get(new_cat,0) > CAT_RANK.get(existing["category"],0):
                existing["category"] = new_cat
            # Keep better source
            new_src = item.get("entity_type","")
            if SOURCE_RANK.get(new_src,0) > SOURCE_RANK.get(existing["source"],0):
                existing["source"] = new_src
                existing["description"] = item.get("text", item.get("description",""))

    # Convert to list, fix units
    result = []
    for idx, (key, item) in enumerate(groups.items(), 1):
        unit = item["unit"]
        if not unit or unit in ("-",""):
            unit = _infer_unit(item["clean_name"] + " " + item["description"])
        item["item_no"] = idx
        item["unit"]    = unit
        item["quantity"] = round(item["quantity"], 2)
        # If qty is still 0 but we saw this item N times, qty = N instances
        if item["quantity"] == 0 and item["count"] > 1:
            if unit in ("nos","sets"):
                item["quantity"] = float(item["count"])
        result.append(item)

    return result


# ── Group by category ──────────────────────────────────────────────────────────
def group_boq_by_category(boq_items: List[Dict]) -> Dict:
    grouped: dict = {}
    for item in boq_items:
        cat = item.get("category","General")
        if cat not in grouped:
            grouped[cat] = {"count":0,"items":[]}
        grouped[cat]["items"].append(item)
        grouped[cat]["count"] += 1
    return grouped


# ── Apply Layer Geometry ───────────────────────────────────────────────────────
def apply_layer_geometry(boq_items: List[Dict], layer_summary: Dict) -> List[Dict]:
    """
    If a layer has significant line length, and we have ONE linear item
    (pipe/cable) on that layer with 0 quantity, give it the layer's length.
    """
    layer_to_items = defaultdict(list)
    for item in boq_items:
        l = item.get("layer")
        if l: layer_to_items[l].append(item)
    
    for lname, ldata in layer_summary.items():
        llen = float(ldata.get("line_length", 0) or 0) + float(ldata.get("polyline_length", 0) or 0)
        if llen < 5: continue 
        
        items = layer_to_items.get(lname, [])
        linear_items = [i for i in items if i.get("unit") == "Rmt"]
        
        if len(linear_items) == 1:
            target = linear_items[0]
            if target.get("quantity", 0) == 0:
                target["description"] = (target.get("description","") + f" (Qty from geometry length on layer {lname})").strip()
                target["quantity"] = round(llen, 2)
    return boq_items


# ── generate_boq (heuristic fallback) ─────────────────────────────────────────
def generate_boq(raw: Dict) -> List[Dict]:
    """Fallback when AI unavailable. Uses raw texts directly."""
    all_raw = raw.get("texts",[]) + [
        {"text": b.get("description",""), "clean_name": b.get("clean_name",""),
         "category": b.get("category","General"), "quantity": 1,
         "unit": "nos", "entity_type":"ATTRIB"}
        for b in raw.get("blocks_with_attribs",[])
    ]
    consolidated = consolidate_items(all_raw)
    
    items_map = [
        ("wall_conduits","Electrical",raw.get("total_line_length",0),"m"),
        ("doors","Architecture",raw.get("door_count",0),"nos"),
        ("windows","Architecture",raw.get("window_count",0),"nos"),
        ("columns","Structural",raw.get("column_count",0),"nos"),
    ]
    next_no = len(consolidated)+1
    for key, cat, qty, unit in items_map:
        if qty and qty > 0:
            consolidated.append({
                "item_no": next_no, "category": cat,
                "clean_name": key.replace("_"," ").title(),
                "description": f"Extracted from geometry",
                "quantity": round(float(qty),2), "unit": unit, "count": 1,
            })
            next_no += 1
    return consolidated
