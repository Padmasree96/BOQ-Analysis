"""
cad_ai_engine.py  —  AI-powered BOQ generation using Gemini 2.0 Flash.

Adapted from backend/cad_graph.py for the BOQ-Analysis app.

Key features:
  1. Geometry chunk sent FIRST  (layer names + equipment counts)
  2. Text chunks sent with 6000-char window and 300-char overlap
     → 100% of text reaches Gemini (old code truncated at 8000 chars)
  3. Prompt explicitly asks for clean_name (short spec, max 80 chars)
  4. Category priority in prompt: Firefighting checked before Plumbing
  5. Local category override AFTER AI returns (fixes AI hallucinations)
  6. Exponential back-off on 429 quota errors
  7. Deduplication on clean_name (case-insensitive) with quantity summation
"""

import os
import re
import json
import time
from typing import Optional

from loguru import logger
from pydantic import BaseModel, Field

try:
    from google import genai
    from google.genai import types
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False


# ── Pydantic schema ───────────────────────────────────────────────────────────

class BOQItem(BaseModel):
    item_no:     int   = Field(description="Sequential number starting from 1")
    category:    str   = Field(description="EPC discipline category")
    clean_name:  str   = Field(description="Short material name, max 80 chars — e.g. '200mm uPVC Pipe', 'AHU-B1-01', '3C x 95mm² XLPE Cable'")
    description: str   = Field(description="Full description as found in drawing")
    quantity:    float = Field(description="Numeric quantity, 0 if not stated")
    unit:        str   = Field(description="m / nos / sets / kg / m² / m³ / Rmt  (use '-' if unknown)")

class BOQList(BaseModel):
    items: list[BOQItem]


# ── System prompt ─────────────────────────────────────────────────────────────

_SYSTEM = """You are an expert Quantity Surveyor and MEP Engineer specialising in
Bill of Quantities (BOQ) generation from AutoCAD drawings for Indian construction projects.

CATEGORY PRIORITY — check in this order, first match wins:
  1. Firefighting   → sprinkler, fire pipe, FM200, hose reel, fire pump, FACP, MCP, deluge, Novec
  2. Mechanical     → AHU, FCU, duct, chiller, VRF, diffuser, chilled water, fan, damper, thermostat
  3. Electrical     → cable, conduit, MDB, DB, MCB, MCCB, transformer, UPS, trunking, tray, light, earthing
  4. Piping         → pipe (non-fire/HVAC), valve, pump, tank, WC, basin, drain, trap, water meter
  5. Structural     → concrete, rebar, steel, slab, column, beam, formwork
  6. Civil          → road, paving, excavation, hume pipe, manhole, kerb
  7. Architecture   → tile, paint, partition, false ceiling, door, window, flooring
  8. Instrumentation→ sensor, BMS, DDC, SCADA, transmitter, gauge
  9. General        → anything that doesn't fit the above

RULES:
  - Extract EVERY distinct material, equipment item, fitting, and component
  - clean_name: short readable name, max 80 chars, strip "Providing and fixing", "Supply and install" etc.
  - quantity: use the number from the drawing annotation if present, else 0
  - unit: Rmt for cable/pipe runs, nos for equipment, m² for area, m³ for volume
  - item_no: sequential from 1
  - DO NOT skip anything — if unsure, include it as category "General"
  - SKIP: pure dimension numbers, grid refs, revision marks, title block text
"""


# ── Local category keyword map ─────────────────────────────────────────────────

_CAT_KW = {
    "Firefighting":    ["sprinkler","fire pump","fm200","hose reel","fire alarm",
                        "facp","mcp","deluge","jockey","novec","suppression","fire pipe"],
    "Mechanical":      ["ahu","fcu","vrf","vrv","duct","chiller","cooling tower",
                        "diffuser","grille","chilled water","fan coil","damper","thermostat"],
    "Electrical":      ["cable","conduit","mdb","smdb","sdb","ldb"," db ","mcb","mccb",
                        "acb","transformer","ups","trunking","cable tray","light fitting",
                        "earthing","socket","luminaire","led","ats","vfd","rmu","kiosk"],
    "Piping":          ["pipe","valve","pump","tank","wc","basin","shower","drain","trap",
                        "water meter","faucet","toilet","urinal","hume"],
    "Structural":      ["concrete","rebar","steel","slab","column","beam","formwork",
                        "rcc","reinforcement","brc mesh"],
    "Civil":           ["road","paving","excavation","manhole","kerb","backfill",
                        "inspection chamber","cable chamber"],
    "Architecture":    ["tile","paint","gypsum","partition","false ceiling","door",
                        "window","flooring","carpet","glazing"],
    "Instrumentation": ["sensor","bms","ddc","scada","transmitter","pressure gauge",
                        "flow meter","level indicator"],
}

def _local_classify(name: str) -> str:
    low = name.lower()
    for cat, kws in _CAT_KW.items():
        if any(kw in low for kw in kws):
            return cat
    return ""

_ACTION_RE = re.compile(
    r"^(providing\s+and\s+fixing|supply\s+and\s+install|supplying\s+and\s+fixing|"
    r"supply\s+install|providing|supply|install|fixing|furnishing|laying)\s+",
    re.IGNORECASE,
)
def _strip(t: str) -> str:
    return _ACTION_RE.sub("", t.strip()).strip()


# ── Geometry prompt builder ───────────────────────────────────────────────────

def _geo_prompt(raw: dict) -> str:
    parts = ["=== GEOMETRY & LAYER SUMMARY ==="]
    parts.append(f"Total line length: {raw.get('total_line_length',0)} units")
    parts.append(f"Polylines: {raw.get('polyline_count',0)}  length: {raw.get('polyline_total_length',0)}")
    parts.append(f"Closed area: {raw.get('closed_polyline_area',0)} sq units")
    parts.append(f"Circles: {raw.get('circle_count',0)}  Arcs: {raw.get('arc_count',0)}")
    parts.append(f"Doors: {raw.get('door_count',0)}  Windows: {raw.get('window_count',0)}")
    parts.append(f"Columns: {raw.get('column_count',0)}  Other blocks: {raw.get('other_block_count',0)}")
    parts.append("")
    ls = raw.get("layer_summary", {})
    if ls:
        parts.append("── LAYERS ──")
        for lname, info in sorted(ls.items()):
            parts.append(
                f"  {lname} [{info['category']}]: "
                f"lines={info['line_length']}u  poly={info['polyline_length']}u  "
                f"texts={info['text_count']}  blocks={info['block_count']}"
            )
    parts.append("\nExtract BOQ items from this geometry and layer data.")
    return "\n".join(parts)


# ── Text chunk prompt builder ─────────────────────────────────────────────────

def _text_prompt(chunk: str, num: int, total: int) -> str:
    return (
        f"=== CAD TEXT DATA  chunk {num}/{total} ===\n"
        f"Each line: [CATEGORY/LAYER] text  or  [BLOCK:name/LAYER] TAG=value\n\n"
        f"Extract EVERY material, equipment item, fitting, and component.\n"
        f"Include cables, pipes, panels, valves, lights, earthing strips, conduits, hume pipes.\n\n"
        f"{chunk}\n\n"
        f"=== END CHUNK {num} ===\n"
        f"Be exhaustive. Do not skip anything. Output all items from this chunk."
    )


# ── Main function ─────────────────────────────────────────────────────────────

def generate_boq_with_ai(raw: dict) -> Optional[list[dict]]:
    """
    Generate BOQ using Gemini AI.
    Sends geometry summary + ALL text chunks.
    Returns list of BOQ item dicts, or None if AI unavailable.
    """
    if not GENAI_AVAILABLE:
        logger.warning("[cad_ai_engine] google-genai not installed — skipping AI")
        return None

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        logger.warning("[cad_ai_engine] No API key found in environment")
        return None

    client      = genai.Client(api_key=api_key)
    all_items:  list[dict] = []
    counter     = 1
    wait_secs   = 2
    consec_fail = 0

    def _call(prompt: str) -> list[dict]:
        nonlocal wait_secs, consec_fail, counter
        for attempt in range(3):
            try:
                resp = client.models.generate_content(
                    model="gemini-2.0-flash",
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=_SYSTEM,
                        response_mime_type="application/json",
                        response_schema=BOQList,
                        temperature=0.1,
                    ),
                )
                parsed = json.loads(resp.text)
                items  = parsed.get("items", parsed) if isinstance(parsed, dict) else parsed
                result = []
                for item in items:
                    item["item_no"] = counter
                    counter += 1
                    result.append(item)
                consec_fail = 0
                wait_secs   = 2   # reset backoff on success
                return result
            except Exception as e:
                err = str(e)
                if "429" in err or "RESOURCE_EXHAUSTED" in err:
                    wait_secs = min(wait_secs * 2, 60)
                    logger.warning(f"[cad_ai_engine] Rate limited — waiting {wait_secs}s (attempt {attempt+1})")
                    time.sleep(wait_secs)
                    if attempt == 2:
                        consec_fail += 1
                else:
                    logger.error(f"[cad_ai_engine] Error: {err[:120]}")
                    consec_fail += 1
                    break
        return []

    # ── Chunk 0: Geometry ─────────────────────────────────────────────────────
    geo_items = _call(_geo_prompt(raw))
    all_items.extend(geo_items)
    logger.info(f"[cad_ai_engine] Geometry chunk: {len(geo_items)} items")
    time.sleep(1)

    # ── Chunks 1…N: Text data ─────────────────────────────────────────────────
    combined = raw.get("combined_text", "")
    CHUNK    = 6000
    OVERLAP  = 300

    if combined:
        total_chunks = max(1, (len(combined) // (CHUNK - OVERLAP)) + 1)
        for idx, i in enumerate(range(0, len(combined), CHUNK - OVERLAP), 1):
            if consec_fail >= 3:
                logger.warning("[cad_ai_engine] Too many failures — stopping AI")
                break
            chunk_text = combined[i: i + CHUNK]
            items      = _call(_text_prompt(chunk_text, idx, total_chunks))
            all_items.extend(items)
            logger.info(f"[cad_ai_engine] Chunk {idx}/{total_chunks}: {len(items)} items")
            time.sleep(1)

    # ── Deduplicate and Sum Quantities ────────────────────────────────────────
    # If same item name appears in multiple chunks, we must sum their quantities
    unique_map: dict[str, dict] = {}
    for item in all_items:
        name = str(item.get("clean_name", "")).strip()
        key  = name.lower()
        if not key or len(key) < 3: continue
        
        qty = float(item.get("quantity", 0))
        if key in unique_map:
            unique_map[key]["quantity"] += qty
            if len(str(item.get("description",""))) > len(str(unique_map[key].get("description",""))):
                unique_map[key]["description"] = item.get("description")
        else:
            unique_map[key] = {
                "clean_name":  name,
                "description": item.get("description", ""),
                "quantity":    qty,
                "unit":        item.get("unit", "nos"),
                "category":    item.get("category", "General"),
            }

    unique = sorted(unique_map.values(), key=lambda x: x["clean_name"])
    for idx, item in enumerate(unique, 1):
        item["item_no"] = idx

    # ── Local category override (fix AI errors) ───────────────────────────────
    result: list[dict] = []
    for item in unique:
        cname   = item.get("clean_name", "")
        desc    = item.get("description", "")
        ai_cat  = item.get("category", "General")
        local   = _local_classify(cname) or _local_classify(desc)
        # Override only if AI said "General" or local is more specific
        final_cat = local if local else ai_cat

        # Backfill empty clean_name
        if not cname or len(cname) < 3:
            cname = _strip(desc)[:80]

        result.append({
            "item_no":    item.get("item_no", 1),
            "category":   final_cat,
            "clean_name": cname or "Unknown Item",
            "description":desc,
            "quantity":   round(float(item.get("quantity", 0)), 2),
            "unit":       item.get("unit", "nos"),
        })

    logger.info(f"[cad_ai_engine] Final: {len(result)} unique items")
    return result if result else None
