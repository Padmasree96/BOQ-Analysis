"""
cad_graph.py  —  AI-powered BOQ generation using Gemini 2.0 Flash.
"""

import os
import re
import json
import time
from typing import Optional, List, Dict, Any

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
    clean_name:  str   = Field(description="Short material name, max 80 chars")
    description: str   = Field(description="Full description as found in drawing")
    quantity:    float = Field(description="Numeric quantity, 0 if not stated")
    unit:        str   = Field(description="m / nos / sets / kg / m² / m³ / Rmt")

class BOQList(BaseModel):
    items: List[BOQItem]


# ── System prompt ─────────────────────────────────────────────────────────────

_SYSTEM = """You are an expert Quantity Surveyor and MEP Engineer.
Extract EVERY distinct material and component from the CAD data.

CATEGORY PRIORITY:
  1. Firefighting
  2. Mechanical
  3. Electrical
  4. Piping
  5. Structural
  6. Civil
  7. Architecture
  8. Instrumentation
  9. General

RULES:
  - clean_name: short readable name, max 80 chars.
  - quantity: use drawing annotation if present, else 0.
  - unit: Rmt for cable/pipe, nos for equipment, m² for area, m³ for volume.
  - DO NOT extract pricing or rates.
"""

_CAT_KW = {
    "Firefighting":    ["sprinkler","fire pump","fm200","hose reel","fire alarm","facp"],
    "Mechanical":      ["ahu","fcu","vrf","vrv","duct","chiller","fan","damper"],
    "Electrical":      ["cable","conduit","mdb","smdb","sdb","db","mcb","mccb","light"],
    "Piping":          ["pipe","valve","pump","tank","wc","basin","drain","trap"],
    "Structural":      ["concrete","rebar","steel","slab","column","beam"],
    "Civil":           ["road","paving","excavation","manhole","kerb"],
    "Architecture":    ["tile","paint","partition","false ceiling","door","window"],
}

def _local_classify(name: str) -> str:
    low = name.lower()
    for cat, kws in _CAT_KW.items():
        if any(kw in low for kw in kws): return cat
    return ""

def _geo_prompt(raw: dict) -> str:
    parts = ["=== GEOMETRY & LAYER SUMMARY ==="]
    parts.append(f"Layers: {list(raw.get('layer_summary', {}).keys())}")
    parts.append(f"Blocks: Doors={raw.get('door_count')}, Windows={raw.get('window_count')}")
    return "\n".join(parts)

def _text_prompt(chunk: str, num: int, total: int) -> str:
    return f"=== CAD TEXT DATA chunk {num}/{total} ===\n{chunk}\n\nExtract BOQ items."

def generate_boq_with_ai(raw: dict) -> Optional[List[Dict]]:
    if not GENAI_AVAILABLE: return None
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key: return None

    client = genai.Client(api_key=api_key)
    all_items: list[dict] = []
    counter = 1

    def _call(prompt: str) -> list[dict]:
        nonlocal counter
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
            items = parsed.get("items", [])
            for item in items:
                item["item_no"] = counter
                counter += 1
            return items
        except Exception as e:
            print(f"[AI Error] {e}")
            return []

    combined = raw.get("combined_text", "")
    if combined:
        chunks = [combined[i:i+6000] for i in range(0, len(combined), 5700)]
        for idx, chunk in enumerate(chunks, 1):
            items = _call(_text_prompt(chunk, idx, len(chunks)))
            all_items.extend(items)

    # Deduplicate
    unique_map = {}
    for item in all_items:
        key = item.get("clean_name","").lower()
        if not key: continue
        if key in unique_map:
            unique_map[key]["quantity"] += item.get("quantity", 0)
        else:
            unique_map[key] = item

    result = []
    for idx, item in enumerate(unique_map.values(), 1):
        item["item_no"] = idx
        item["category"] = _local_classify(item["clean_name"]) or item.get("category", "General")
        result.append(item)

    return result
