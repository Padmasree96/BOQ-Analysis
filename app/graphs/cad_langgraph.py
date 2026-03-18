"""
FlyyyAI — 5-agent LangGraph CAD Extraction Pipeline
====================================================

Pipeline:
  reader → text_reconstructor → embedder → material_extractor → aggregator

Mirrors the BOQ LangGraph architecture but tuned for CAD drawings:
  - DWG/DXF → ezdxf text entity extraction
  - PDF text  → pdfplumber text + table extraction
  - PDF image → PyMuPDF page-to-image + Gemini Vision (fallback for vector drawings)
  - LLM (Gemini) for structured material parsing
  - FAISS for semantic deduplication across drawing sheets
"""

import os
import re
import io
import time
import base64
import json
from pathlib import Path
from typing import Dict, List, Any, Optional, TypedDict

from loguru import logger
from dotenv import load_dotenv
from langgraph.graph import StateGraph, END

load_dotenv()

# ── Optional imports ──────────────────────────────────────────
try:
    from langchain_google_genai import (
        ChatGoogleGenerativeAI,
        GoogleGenerativeAIEmbeddings,
    )
    HAS_LANGCHAIN = True
except ImportError:
    HAS_LANGCHAIN = False

try:
    from langchain_community.vectorstores import FAISS
    from langchain_core.documents import Document
    HAS_FAISS = True
except ImportError:
    HAS_FAISS = False

try:
    import fitz  # pymupdf
    HAS_PYMUPDF = True
except Exception:          # catches ImportError AND OSError (Windows paging file)
    HAS_PYMUPDF = False

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

logger.info(
    f"[CAD Pipeline] HAS_LANGCHAIN={HAS_LANGCHAIN} "
    f"HAS_FAISS={HAS_FAISS} "
    f"HAS_PYMUPDF={HAS_PYMUPDF}"
)

# Max pages to render for vision extraction (keep costs reasonable)
_MAX_VISION_PAGES = int(os.getenv("CAD_MAX_VISION_PAGES", "15"))


# ═══════════════════════════════════════════════════════════════
#  State Definition
# ═══════════════════════════════════════════════════════════════

class CADState(TypedDict, total=False):
    file_bytes: bytes
    filename: str
    industry: str
    # reader output
    raw_text: str
    text_entities: List[str]
    tables: List[List[str]]
    page_count: int
    file_type: str
    use_vision: bool                        # True when pdfplumber yield was too low
    vision_pages: List[Dict[str, Any]]      # [{page_num, base64}] for Gemini Vision
    # reconstructor output
    sections: List[Dict[str, Any]]
    # embedder output
    vector_store: Any
    # extractor output
    extracted_items: List[Dict[str, Any]]
    # aggregator output
    final_items: List[Dict[str, Any]]
    categories: Dict[str, List[Dict[str, Any]]]
    total_items: int


# ═══════════════════════════════════════════════════════════════
#  Agent 1: READER — extract raw text from drawing file
# ═══════════════════════════════════════════════════════════════

def agent_cad_reader(state: CADState) -> dict:
    """
    Read the drawing file and extract all text entities.
    DWG/DXF: ezdxf text/mtext/insert entities
    PDF text: pdfplumber text + tables per page
    PDF vision: PyMuPDF page render (fallback for vector/architectural drawings)
    """
    file_bytes = state["file_bytes"]
    filename = state["filename"]
    ext = Path(filename).suffix.lower()

    logger.info(f"[CAD Agent 1: READER] Reading {filename} ({ext})")

    text_entities = []
    tables = []
    page_count = 0
    use_vision = False
    vision_pages = []

    if ext in (".dwg", ".dxf"):
        text_entities, tables = _read_dwg(file_bytes)
        page_count = 1

    elif ext == ".pdf":
        text_entities, tables, page_count = _read_pdf(file_bytes)

        # Count only structured table rows — these are what matter for material extraction
        table_row_count = sum(1 for t in text_entities if t.startswith("[TABLE ROW]"))
        total_chars     = sum(len(t) for t in text_entities)

        logger.info(
            f"[CAD Reader] pdfplumber: {page_count} pages, "
            f"{total_chars} chars, {table_row_count} table rows"
        )

        # Architectural drawings: pdfplumber captures floor-plan labels and
        # dimension text (hundreds of chars) but ZERO table rows because
        # schedule tables are drawn as vector graphics, not text tables.
        # Decision rule: need ≥ 8 structured table rows to trust text path.
        if table_row_count < 8:
            logger.info(
                f"[CAD Reader] Only {table_row_count} table rows — "
                "PDF likely uses visual schedule tables. Switching to Gemini Vision."
            )
            use_vision = True
            vision_pages = _render_pdf_pages(file_bytes, max_pages=_MAX_VISION_PAGES)
            logger.info(f"[CAD Reader] Rendered {len(vision_pages)} pages for vision extraction")
        else:
            logger.info(
                f"[CAD Reader] {table_row_count} table rows found — using text pipeline"
            )

    else:
        logger.warning(f"[CAD Reader] Unsupported: {ext}")

    raw_text = "\n".join(text_entities)
    logger.info(
        f"[CAD Reader] {len(text_entities)} text entities, "
        f"{len(tables)} tables, {page_count} pages, vision={use_vision}"
    )

    return {
        "raw_text": raw_text,
        "text_entities": text_entities,
        "tables": tables,
        "page_count": page_count,
        "file_type": ext.lstrip("."),
        "use_vision": use_vision,
        "vision_pages": vision_pages,
    }


def _read_dwg(file_bytes: bytes):
    """
    Advanced DWG/DXF parser using ezdxf.
    Extracts: TEXT, MTEXT, INSERT (block attributes), DIMENSION texts,
    polyline/line route lengths, and layer structure.
    Returns text_entities (with location + layer tags) and structured tables.
    """
    import ezdxf
    from ezdxf.entities import DXFGraphic
    import math

    texts = []
    tables = []
    layer_entities: Dict[str, list] = {}   # layer -> [entities with positions]
    block_instances: Dict[str, list] = {}  # block_name -> [attrib dicts]
    polyline_lengths: Dict[str, float] = {}  # layer -> total length
    dimension_texts: list = []

    try:
        doc = ezdxf.read(io.BytesIO(file_bytes))
    except Exception as e:
        logger.error(f"[CAD Reader] DWG/DXF parse failed: {e}")
        return texts, tables

    seen_text = set()

    def _pos(entity):
        """Get approximate (x, y) position from any entity."""
        try:
            if hasattr(entity.dxf, 'insert'):
                p = entity.dxf.insert
                return (round(p.x, 1), round(p.y, 1))
            if hasattr(entity.dxf, 'text_midpoint'):
                p = entity.dxf.text_midpoint
                return (round(p.x, 1), round(p.y, 1))
        except Exception:
            pass
        return (0, 0)

    def _line_length(start, end):
        """Euclidean distance between two Vec3/tuple points."""
        try:
            return math.sqrt(
                (end.x - start.x) ** 2 +
                (end.y - start.y) ** 2 +
                (getattr(end, 'z', 0) - getattr(start, 'z', 0)) ** 2
            )
        except Exception:
            return 0

    def collect(entity, source_label="MODELSPACE"):
        """Process a single DXF entity."""
        try:
            dxftype = entity.dxftype()
            layer = getattr(entity.dxf, 'layer', 'default')

            # ── TEXT entity ──────────────────────────────────
            if dxftype == "TEXT":
                val = entity.dxf.text.strip()
                if val and len(val) > 1 and val not in seen_text:
                    seen_text.add(val)
                    pos = _pos(entity)
                    entry = f"[TEXT L:{layer}] {val}"
                    texts.append(entry)
                    layer_entities.setdefault(layer, []).append({
                        "type": "text", "value": val,
                        "x": pos[0], "y": pos[1], "layer": layer,
                    })

            # ── MTEXT entity (multiline) ─────────────────────
            elif dxftype == "MTEXT":
                val = entity.plain_mtext().strip()
                if val and len(val) > 1 and val not in seen_text:
                    seen_text.add(val)
                    pos = _pos(entity)
                    entry = f"[MTEXT L:{layer}] {val}"
                    texts.append(entry)
                    layer_entities.setdefault(layer, []).append({
                        "type": "mtext", "value": val,
                        "x": pos[0], "y": pos[1], "layer": layer,
                    })

            # ── INSERT (block reference with attributes) ─────
            elif dxftype == "INSERT":
                block_name = entity.dxf.name
                attribs = {}
                for attrib in entity.attribs:
                    tag = attrib.dxf.tag.strip()
                    val = attrib.dxf.text.strip()
                    if val and len(val) > 1:
                        attribs[tag] = val
                        key = f"{tag}={val}"
                        if key not in seen_text:
                            seen_text.add(key)
                            texts.append(f"[BLOCK {block_name} L:{layer}] {tag}: {val}")

                if attribs:
                    block_instances.setdefault(block_name, []).append(attribs)
                    layer_entities.setdefault(layer, []).append({
                        "type": "block", "block_name": block_name,
                        "attribs": attribs, "layer": layer,
                        "x": _pos(entity)[0], "y": _pos(entity)[1],
                    })

            # ── DIMENSION entity ─────────────────────────────
            elif dxftype == "DIMENSION":
                try:
                    dim_text = getattr(entity.dxf, 'text', '')
                    actual = getattr(entity.dxf, 'actual_measurement', None)
                    if dim_text and dim_text.strip():
                        dimension_texts.append(dim_text.strip())
                        texts.append(f"[DIM L:{layer}] {dim_text.strip()}")
                    elif actual is not None:
                        dimension_texts.append(f"{actual:.1f}")
                        texts.append(f"[DIM L:{layer}] {actual:.1f}")
                except Exception:
                    pass

            # ── LINE entity (route lengths) ──────────────────
            elif dxftype == "LINE":
                try:
                    length = _line_length(entity.dxf.start, entity.dxf.end)
                    polyline_lengths[layer] = polyline_lengths.get(layer, 0) + length
                except Exception:
                    pass

            # ── POLYLINE / LWPOLYLINE (route lengths) ────────
            elif dxftype in ("POLYLINE", "LWPOLYLINE"):
                try:
                    pts = list(entity.get_points(format='xyz')) if dxftype == "LWPOLYLINE" else []
                    if dxftype == "POLYLINE":
                        pts = [v.dxf.location for v in entity.vertices]
                    total = 0
                    for j in range(1, len(pts)):
                        p0, p1 = pts[j-1], pts[j]
                        dx = p1[0] - p0[0]
                        dy = p1[1] - p0[1]
                        dz = (p1[2] if len(p1) > 2 else 0) - (p0[2] if len(p0) > 2 else 0)
                        total += math.sqrt(dx*dx + dy*dy + dz*dz)
                    if entity.is_closed and len(pts) > 2:
                        p0, p1 = pts[-1], pts[0]
                        dx = p1[0] - p0[0]
                        dy = p1[1] - p0[1]
                        total += math.sqrt(dx*dx + dy*dy)
                    polyline_lengths[layer] = polyline_lengths.get(layer, 0) + total
                except Exception:
                    pass

        except Exception:
            pass

    # ── Scan all layouts ─────────────────────────────────────
    try:
        for entity in doc.modelspace():
            collect(entity, "MODELSPACE")
    except Exception as e:
        logger.warning(f"[CAD Reader] Modelspace scan error: {e}")

    try:
        for layout in doc.layouts:
            lname = layout.name
            if lname == "Model":
                continue
            for entity in layout:
                collect(entity, f"LAYOUT:{lname}")
    except Exception as e:
        logger.warning(f"[CAD Reader] Layout scan error: {e}")

    # ── Build structured summary tables ──────────────────────
    # Block summary: each block type with count and common attribs
    for bname, instances in block_instances.items():
        if len(instances) >= 1:
            common_tags = set()
            for inst in instances:
                common_tags.update(inst.keys())
            for inst in instances:
                row = [bname] + [inst.get(t, '') for t in sorted(common_tags)]
                tables.append(row)
                row_text = " | ".join(str(c) for c in row if c)
                texts.append(f"[TABLE ROW] {row_text}")

    # Route lengths per layer
    for layer, total_len in sorted(polyline_lengths.items(), key=lambda x: -x[1]):
        if total_len > 100:  # only meaningful routes
            texts.append(f"[ROUTE L:{layer}] total_length={total_len:.0f} drawing_units")

    # Layer summary
    layer_counts = {k: len(v) for k, v in layer_entities.items()}
    for layer, count in sorted(layer_counts.items(), key=lambda x: -x[1]):
        texts.append(f"[LAYER_SUMMARY] {layer}: {count} entities")

    logger.info(
        f"[CAD Reader DWG] {len(texts)} text entities, "
        f"{len(block_instances)} block types ({sum(len(v) for v in block_instances.values())} instances), "
        f"{len(polyline_lengths)} routed layers, "
        f"{len(dimension_texts)} dimensions, "
        f"{len(layer_entities)} active layers"
    )

    return texts, tables


def _read_pdf(file_bytes: bytes):
    import pdfplumber

    texts = []
    tables = []
    max_pages = int(os.getenv("MAX_CAD_PDF_PAGES", "30"))

    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            page_count = min(len(pdf.pages), max_pages)

            for i, page in enumerate(pdf.pages[:max_pages]):
                # Extract text
                text = page.extract_text()
                if text and text.strip():
                    texts.append(f"[PAGE {i + 1}] {text.strip()}")

                # Extract tables (material schedules)
                page_tables = page.extract_tables()
                for table in page_tables:
                    if table and len(table) > 1:
                        for row in table:
                            if row:
                                row_text = " | ".join(str(c) for c in row if c)
                                if row_text.strip():
                                    tables.append(row)
                                    texts.append(f"[TABLE ROW] {row_text}")

    except Exception as e:
        logger.error(f"[CAD Reader] PDF parse failed: {e}")
        page_count = 0

    return texts, tables, page_count


def _render_pdf_pages(file_bytes: bytes, max_pages: int = 15) -> List[Dict]:
    """
    Render PDF pages to PNG images using PyMuPDF for Gemini Vision extraction.
    Falls back gracefully if PyMuPDF is not installed.
    """
    if not HAS_PYMUPDF:
        logger.warning("[CAD Reader] PyMuPDF not installed — cannot render PDF pages. "
                       "Run: pip install pymupdf")
        return []

    vision_pages = []
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        num_pages = min(len(doc), max_pages)

        for i in range(num_pages):
            try:
                page = doc[i]
                # 1.5× zoom gives ~144 DPI — readable for Gemini Vision
                mat = fitz.Matrix(1.5, 1.5)
                pix = page.get_pixmap(matrix=mat, alpha=False)
                png_bytes = pix.tobytes("png")
                b64 = base64.b64encode(png_bytes).decode("utf-8")
                vision_pages.append({
                    "page_num": i + 1,
                    "base64": b64,
                    "width": pix.width,
                    "height": pix.height,
                })
                logger.debug(f"[CAD Reader] Rendered page {i+1} ({pix.width}×{pix.height})")
            except Exception as e:
                logger.warning(f"[CAD Reader] Page {i+1} render failed: {e}")

        doc.close()

    except Exception as e:
        logger.error(f"[CAD Reader] PDF render failed: {e}")

    return vision_pages


# ═══════════════════════════════════════════════════════════════
#  Agent 2: TEXT RECONSTRUCTOR — group text into logical sections
# ═══════════════════════════════════════════════════════════════

def agent_text_reconstructor(state: CADState) -> dict:
    """
    Group raw text entities into logical sections, then MERGE by type
    to keep the total number of LLM calls low (max ~6).
    When use_vision=True, creates one 'vision' section per rendered page.
    """
    logger.info("[CAD Agent 2: RECONSTRUCTOR] Grouping text into sections...")

    text_entities = state.get("text_entities", [])
    vision_pages = state.get("vision_pages", [])
    use_vision = state.get("use_vision", False)

    # ── Vision path: one section per rendered page ──────────────
    if use_vision and vision_pages:
        sections = []
        for vp in vision_pages:
            sections.append({
                "type": "vision_page",
                "page": str(vp["page_num"]),
                "content": f"[VISION PAGE {vp['page_num']}]",
                "base64": vp["base64"],
                "entity_count": 1,
            })
        logger.info(f"[CAD Reconstructor] Vision mode: {len(sections)} page sections")
        return {"sections": sections}

    # ── Text path ────────────────────────────────────────────────

    # Schedule header detection map
    _SCHED_HEADERS = [
        ("SCHEDULE OF FINISHES",    "finish_schedule"),
        ("SCHEDULE OF DOORS",       "door_window_schedule"),
        ("SCHEDULE OF WINDOWS",     "door_window_schedule"),
        ("SCHEDULE OF IRONMONGERY", "door_window_schedule"),
        ("SCHEDULE OF HARDWARE",    "door_window_schedule"),
        ("EQUIPMENT LIST",          "equipment_list"),
        ("EQUIPMENT SCHEDULE",      "equipment_list"),
        ("CABLE SCHEDULE",          "cable_schedule"),
        ("PIPE SCHEDULE",           "pipe_schedule"),
        ("PLUMBING SCHEDULE",       "pipe_schedule"),
        ("FIRE FIGHTING",           "material_schedule"),
        ("WATER TANK",              "material_schedule"),
    ]

    def _detect_sched_type(row_upper: str) -> Optional[str]:
        for kw, st in _SCHED_HEADERS:
            if kw in row_upper:
                return st
        return None

    # ── Buckets: one list of rows per section type ──────────────
    # We collect ALL content per type, then emit ONE merged section.
    buckets: Dict[str, List[str]] = {}

    # 1) Parse table rows — detect schedule headers to assign types
    table_rows = [e.replace("[TABLE ROW] ", "")
                  for e in text_entities if e.startswith("[TABLE ROW]")]

    current_type = None
    for row in table_rows:
        stype = _detect_sched_type(row.upper())
        if stype:
            current_type = stype
        bucket_key = current_type or "material_schedule"
        buckets.setdefault(bucket_key, []).append(row)

    # 2) Parse page-level text — only keep pages with schedule keywords
    _SCHED_PAGE_KW = [
        "schedule of", "equipment list", "cable schedule", "pipe schedule",
        "general notes", "specifications", "fire fighting", "water tank",
        "finish", "flooring", "skirting",
    ]

    for entity in text_entities:
        if not entity.startswith("[PAGE "):
            continue
        clean = re.sub(r"^\[PAGE \d+\]\s*", "", entity)
        lower = clean.lower()

        if len(clean) < 20:
            continue
        if not any(kw in lower for kw in _SCHED_PAGE_KW):
            continue

        # Classify the page text
        if any(kw in lower for kw in ["cable schedule", "cable size", "conductor"]):
            stype = "cable_schedule"
        elif any(kw in lower for kw in ["pipe schedule", "pipe dia", "piping"]):
            stype = "pipe_schedule"
        elif any(kw in lower for kw in ["equipment", "tag no", "equipment list"]):
            stype = "equipment_list"
        elif any(kw in lower for kw in ["schedule of doors", "schedule of windows",
                                         "door schedule", "window schedule"]):
            stype = "door_window_schedule"
        elif any(kw in lower for kw in ["finish", "flooring", "skirting",
                                         "schedule of finishes"]):
            stype = "finish_schedule"
        elif any(kw in lower for kw in ["general notes", "specifications"]):
            stype = "general_drawing"
        else:
            stype = "material_schedule"

        buckets.setdefault(stype, []).append(clean)

    # ── Build merged sections (one per type) ────────────────────
    # Cap each section at 15000 chars to stay within LLM context
    _MAX_SECTION_CHARS = 15000
    sections = []
    for stype, rows in buckets.items():
        content = "\n".join(rows)
        if len(content.strip()) < 20:
            continue
        # Truncate if massive — keep the first N chars
        if len(content) > _MAX_SECTION_CHARS:
            content = content[:_MAX_SECTION_CHARS] + "\n... (truncated)"
        sections.append({
            "type": stype,
            "content": content,
            "entity_count": len(rows),
        })

    logger.info(
        f"[CAD Reconstructor] {len(buckets)} types → {len(sections)} merged sections "
        f"(types: {list(buckets.keys())})"
    )
    return {"sections": sections}


# ═══════════════════════════════════════════════════════════════
#  Agent 3: EMBEDDER — FAISS vector index for dedup
# ═══════════════════════════════════════════════════════════════

def agent_cad_embedder(state: CADState) -> dict:
    """Build FAISS index from section content for dedup in extraction.
    Skipped for vision-only pipelines."""
    logger.info("[CAD Agent 3: EMBEDDER] Building vector index...")

    # Skip FAISS for vision pages — they don't have text content to embed
    if state.get("use_vision"):
        logger.info("[CAD Embedder] Vision mode — skipping FAISS")
        return {"vector_store": None}

    sections = state.get("sections", [])
    if not sections or not HAS_LANGCHAIN or not HAS_FAISS or not GOOGLE_API_KEY:
        return {"vector_store": None}

    try:
        embeddings = GoogleGenerativeAIEmbeddings(
            model="models/text-embedding-004",
            google_api_key=GOOGLE_API_KEY,
        )

        documents = []
        for sec in sections:
            content = sec["content"]
            max_chunk = 2000
            chunks = [content[i:i + max_chunk] for i in range(0, len(content), max_chunk)]
            for chunk in chunks:
                documents.append(Document(
                    page_content=chunk,
                    metadata={"type": sec["type"], "page": sec.get("page", "")},
                ))

        if documents:
            vector_store = FAISS.from_documents(documents, embeddings)
            logger.info(f"[CAD Embedder] Indexed {len(documents)} chunks into FAISS")
            return {"vector_store": vector_store}

    except Exception as e:
        logger.error(f"[CAD Embedder] Failed: {e}")

    return {"vector_store": None}


# ═══════════════════════════════════════════════════════════════
#  Agent 4: MATERIAL EXTRACTOR — LLM structured extraction
# ═══════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════
#  Rule-based material extraction (fallback when LLM unavailable)
# ═══════════════════════════════════════════════════════════════

# Construction material keywords → category mapping
_MATERIAL_PATTERNS = {
    # Finishing & Interiors
    r"(?i)(granite|marble|vitrified|ceramic|tiles?|flooring|skirting|cladding|false ceiling|"
    r"lay-in|seamless board|putty|emulsion paint|textured paint|acrylic|laminate|"
    r"panelling|plywood|wpc|hpl|dado|epoxy|hardonite|vdf|kota stone|terrazzo|"
    r"carpet|vinyl|parquet|wallpaper|veneer|corian)": "Finishing & Interiors",

    # Doors & Windows (also Finishing)
    r"(?i)(steel door|fire.?rated door|rolling shutter|glass door|flush door|"
    r"alumini?um.*(?:window|door|sliding|fixed|louver)|ventilator|glazing|"
    r"structural glazing|fanlight|panic bar|door.*\d+\s*x\s*\d+|window.*\d+\s*x\s*\d+|"
    r"teak wood|shutter)": "Finishing & Interiors",

    # Fire Protection
    r"(?i)(fire.*rated|fire.*door|fire.*hose|fire.*extinguisher|sprinkler|wet riser|"
    r"fire.*alarm|smoke detector|fire.*hydrant|fire.*fighting|fire.*pump)": "Fire Protection",

    # Civil & Structural
    r"(?i)(rcc|concrete|steel structure|beam|column|slab|foundation|pile|"
    r"reinforcement|fe\s*500|m\s*\d{2}|deck sheet|screed|masonry|brick|block|"
    r"waterproof|damp proof|plinth|retaining wall|rebar)": "Civil & Structural",

    # Electrical
    r"(?i)(cable|conduit|switch.*gear|transformer|panel.*board|db|mcc|pcc|"
    r"bus.?duct|earthing|lightning|led|luminaire|lamp|wiring|circuit|"
    r"xlpe|frls|armoured|lv.*panel|hv.*panel|ups|dg.?set|generator)": "Electrical",

    # Plumbing & Drainage
    r"(?i)(pipe|plumbing|drainage|sewage|sewer|manhole|gully|trap|"
    r"cistern|flush valve|faucet|tap|basin|wc|urinal|"
    r"water tank|oht|ugt|pump|cpvc|upvc|ppr|hdpe|gi pipe|gutter|downtake)": "Plumbing & Drainage",

    # Mechanical & HVAC
    r"(?i)(ahu|fahu|chiller|cooling tower|duct|damper|diffuser|"
    r"hvac|vrf|vav|fcu|air.?conditioning|exhaust fan|blower|"
    r"eot crane|lift|elevator|escalator|freight)": "Mechanical & HVAC",

    # IT & Communication
    r"(?i)(cctv|camera|access control|intercom|pa system|"
    r"network|fiber optic|cat\s*6|data.*rack|server.*rack|"
    r"bms|building management|scada)": "IT & Communication",
}

# Patterns that capture quantity + unit from text
_QTY_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s*(nos?|numbers?|sets?|sqm|sq\.?\s*m|m|rm|cum|kg|tonnes?|"
    r"pairs?|lots?|each|units?|lengths?|rolls?|sheets?|bundles?)\b",
    re.IGNORECASE
)

# Size/spec patterns that mean this is a specific item
_SIZE_RE = re.compile(
    r"\d+\s*(?:x|×|X)\s*\d+|\d+\s*mm|\d+\s*sqmm|DN\s*\d+|\d+\s*dia|"
    r"\d+C\s*x\s*\d+|\d+\s*THK|PN\s*\d+",
    re.IGNORECASE
)

# Lines that are just drawing notes, not materials
_SKIP_RE = re.compile(
    r"(?i)^(scale|date|drawn|checked|approved|revision|ref|dwg|issue|"
    r"north|section|elevation|plan|detail|note|all dimensions|"
    r"do not scale|copyright|confidential|page|sheet|title|project|"
    r"client|architect|engineer|consultant|room name|sr\.?\s*no|"
    r"sl\.?\s*no|s\.?\s*no|description|remarks?|type|size|material|"
    r"services areas like|columns shown|design by|epc contractor|"
    r"\d{1,2}/\d{1,2}/\d{2,4}|LAYER_SUMMARY|ROUTE L:)",
)


def _rule_based_extract(sections: list, state: dict) -> list:
    """
    Extract materials from CAD text without any LLM.
    Uses regex patterns to identify construction materials from text entities.
    Works offline, zero cost, instant results.
    """
    logger.info("[CAD Extractor] Running rule-based extraction (no LLM)")

    items = []
    seen_descs = set()
    filename = state.get("filename", "")

    for section in sections:
        stype = section.get("type", "general_drawing")
        content = section.get("content", "")

        for line in content.split("\n"):
            line = line.strip()
            if not line or len(line) < 4:
                continue

            # Strip tag prefixes
            clean = re.sub(r"^\[(PAGE \d+|TABLE ROW|TEXT L:.*?|MTEXT L:.*?|BLOCK .*?|DIM .*?)\]\s*", "", line)
            clean = clean.strip()
            if not clean or len(clean) < 5:
                continue

            # Skip drawing notes / noise
            if _SKIP_RE.match(clean):
                continue

            # Skip garbled text (too many uppercase single chars = scrambled OCR)
            words = clean.split()
            if len(words) > 3:
                single_char_words = sum(1 for w in words if len(w) == 1 and w.isalpha())
                if single_char_words > len(words) * 0.4:
                    continue

            # Skip overly long combined lines (concatenated table text)
            if len(clean) > 120:
                # Try splitting on common delimiters and take the material-matching part
                parts = re.split(r"[|/]|\d+\.\s+", clean)
                best_part = None
                best_cat = None
                for part in parts:
                    part = part.strip()
                    if len(part) < 5 or len(part) > 100:
                        continue
                    for pattern, category in _MATERIAL_PATTERNS.items():
                        if re.search(pattern, part):
                            best_part = part
                            best_cat = category
                            break
                    if best_part:
                        break
                if best_part:
                    clean = best_part
                else:
                    continue

            # Try to match material patterns
            matched_cat = None
            for pattern, category in _MATERIAL_PATTERNS.items():
                if re.search(pattern, clean):
                    matched_cat = category
                    break

            if not matched_cat:
                continue

            # Normalize description
            desc = clean.strip()
            # Remove trailing punctuation noise
            desc = re.sub(r"[\.\,\;]+$", "", desc).strip()
            # Uppercase for consistency
            desc = desc.upper()
            if len(desc) < 5 or len(desc) > 100:
                continue
            # Material descriptions are typically 2-12 words
            word_count = len(desc.split())
            if word_count > 14 or word_count < 2:
                continue

            # Deduplicate
            desc_key = re.sub(r"\s+", " ", desc.lower())
            desc_key = re.sub(r"[^a-z0-9 ]", "", desc_key).strip()
            if desc_key in seen_descs or len(desc_key) < 4:
                continue
            seen_descs.add(desc_key)

            # Extract quantity
            qty_match = _QTY_RE.search(clean)
            qty = float(qty_match.group(1)) if qty_match else None
            unit = qty_match.group(2) if qty_match else None

            # Detect specificity
            is_specific = bool(_SIZE_RE.search(clean))

            # Extract zone from text context
            zone = None
            zone_match = re.search(
                r"(?i)(entrance lobby|corridor|office|meeting room|server room|control room|"
                r"conference room|toilet|staircase|balcony|terrace|highbay|lobby|"
                r"ground floor|first floor|second floor|basement|service area|"
                r"vehicle lobby|labs? )",
                clean
            )
            if zone_match:
                zone = zone_match.group(1).strip().upper()

            items.append({
                "description": desc,
                "quantity": qty,
                "unit": unit,
                "zone": zone,
                "drawing_ref": None,
                "category": matched_cat,
                "is_specific": is_specific,
                "source": "cad",
                "drawing_file": filename,
                "section_type": stype,
                "page": "",
            })

    logger.info(f"[CAD Extractor] Rule-based: {len(items)} materials found")
    return items


_CAD_EXTRACT_PROMPT = """You are a senior Construction Engineer analysing CAD drawing text.

SECTION TYPE: {section_type}
SIMILAR CONTEXT FROM DRAWING:
{context}

DRAWING CONTENT:
{content}

Extract ALL construction materials from this drawing content.
For each material return a JSON object:
{{
  "description": "specific material name with full specification",
  "quantity": number or null,
  "unit": "m / nos / set / kg / sqm or null",
  "zone": "room / area / floor if mentioned, else null",
  "drawing_ref": "drawing number or sheet ref if visible, else null",
  "category": "one of the EPC categories below",
  "is_specific": true if has grade/size/spec, false if generic
}}

EPC categories: Civil & Structural | Electrical | Plumbing & Drainage |
Mechanical & HVAC | Finishing & Interiors | External Development |
Fire Protection | IT & Communication | General

RULES:
- Extract specific grades: FRLS, XLPE, PPR PN10, Fe500D, M25
- Extract sizes: 2.5sqmm, 25mm dia, DN50, 4C x 16sqmm
- For cable schedules: each cable type is one item
- For pipe schedules: each pipe type/size is one item
- NEVER fabricate — only extract what is written in the text
- Return ONLY a valid JSON array, no explanation
- If nothing found: return []"""


_ARCH_VISION_PROMPT = """You are a senior Construction Quantity Surveyor and Engineer.
Carefully examine this architectural/engineering drawing page image and extract every
construction material, item, and quantity that is visible.

Look specifically for these schedule tables and lists:

1. SCHEDULE OF DOORS — look for a table with columns like:
   Type (D1, D2, D3, FD1, FD2...), Size (W×H in mm), Material (Flush door, Fire door,
   Shutter...), Hardware (hinges, handle, lock), Quantity (nos)

2. SCHEDULE OF WINDOWS — look for a table with columns like:
   Type (W1, W2, ALW-1, ALV-1...), Size (W×H in mm), Material (Aluminum, uPVC, GI...),
   Glazing (clear glass, tinted, wired), Quantity (nos)

3. SCHEDULE OF FINISHES — a table listing room-by-room finishes:
   Room name | Floor finish | Skirting | Wall finish | Ceiling finish
   Examples: "Vitrified tiles 600×600", "Kota stone", "IPS", "Gypsum false ceiling",
   "OBD paint", "Ceramic tiles dado", "Marble flooring", "Epoxy coating"

4. EQUIPMENT LIST — tables or notes listing:
   Equipment tag, Description, Capacity/size, Quantity
   Examples: "EOT Crane 20T", "Passenger lift 13-person", "AHU 10000 CFM",
   "DG Set 500 kVA", "Transformer 1000 kVA", "Pump", "Water tank"

5. MATERIAL NOTES / GENERAL NOTES — any text specifying:
   - Concrete grades (M25, M30, M40)
   - Steel grades (Fe500D, Fe415)
   - Brick / block specifications
   - Waterproofing, insulation, cladding specs

6. STRUCTURAL MEMBERS — columns, beams, slabs with sizes, RCC grades

7. FIRE FIGHTING — wet risers, sprinklers, fire hose cabinets, hydrants, sizes

8. PLUMBING — water tanks (capacity in CUM/litres), pipe materials, sanitary fixtures

For each item/row you find, output a JSON object:
{{
  "description": "complete item description with size, grade, or specification",
  "quantity": number or null,
  "unit": "nos / sqm / m / set / CUM / kg / etc. — null if not stated",
  "zone": "room name, floor, or area label — null if not stated",
  "drawing_ref": "drawing type or sheet title visible on the page — null if not visible",
  "category": "one of: Civil & Structural | Finishing & Interiors | Electrical | Mechanical & HVAC | Fire Protection | Plumbing & Drainage | General",
  "is_specific": true if description has a size/grade/brand, false if generic
}}

CRITICAL RULES:
- Extract EVERY row from every schedule table visible on this page
- Do NOT skip any item even if quantity is missing
- For finish schedules: each room × finish-type combination is one item
- For door/window schedules: each type row is one item (use the type code as drawing_ref)
- NEVER fabricate items not visible in the image
- Return ONLY a valid JSON array, nothing else
- If the page has no material information: return []"""


def agent_material_extractor(state: CADState) -> dict:
    """
    Extract structured materials from each section using Gemini AI.
    Uses vision prompts for rendered PDF pages; text prompts for text sections.
    Includes rate-limit awareness: delays between calls + exponential backoff on 429.
    """
    logger.info("[CAD Agent 4: EXTRACTOR] Extracting materials with AI...")

    sections = state.get("sections", [])
    vector_store = state.get("vector_store")
    use_vision = state.get("use_vision", False)

    if not sections:
        return {"extracted_items": []}

    if not HAS_LANGCHAIN or not GOOGLE_API_KEY:
        logger.warning("[CAD Extractor] LLM not available — using rule-based extraction")
        return {"extracted_items": _rule_based_extract(sections, state)}

    # Model preference: try env override, then 2.5-flash, then 2.0-flash
    _MODELS = [
        os.getenv("CAD_LLM_MODEL", ""),
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
    ]
    _MODELS = [m for m in _MODELS if m]  # remove blanks

    llm = None
    chosen_model = None
    for model_name in _MODELS:
        try:
            candidate = ChatGoogleGenerativeAI(
                model=model_name,
                google_api_key=GOOGLE_API_KEY,
                temperature=0.1,
                max_retries=3,
                timeout=int(os.getenv("CAD_LLM_TIMEOUT", "120")),
            )
            # Quick probe to see if quota is available
            candidate.invoke([{"role": "user", "content": "Say OK"}])
            llm = candidate
            chosen_model = model_name
            logger.info(f"[CAD Extractor] Using model: {model_name}")
            break
        except Exception as e:
            logger.warning(f"[CAD Extractor] Model {model_name} unavailable: {str(e)[:80]}")

    if llm is None:
        logger.warning("[CAD Extractor] All LLM models exhausted — falling back to rule-based extraction")
        return {"extracted_items": _rule_based_extract(sections, state)}

    all_items = []
    max_chars = int(os.getenv("CAD_CONTEXT_MAX_CHARS", "18000"))
    inter_call_delay = float(os.getenv("CAD_CALL_DELAY_SEC", "3"))

    for idx, section in enumerate(sections):
        # Rate-limit: pause between LLM calls (skip before first)
        if idx > 0:
            time.sleep(inter_call_delay)

        # Retry with exponential backoff on 429
        max_retries = 3
        for attempt in range(max_retries):
            try:
                if section["type"] == "vision_page":
                    items = _extract_vision_section(section, llm, state)
                else:
                    items = _extract_text_section(
                        section, llm, vector_store, max_chars, state
                    )

                for item in items:
                    item["source"] = "cad"
                    item["drawing_file"] = state.get("filename", "")
                    item["section_type"] = section["type"]
                    item["page"] = section.get("page", "")

                all_items.extend(items)
                logger.info(
                    f"[CAD Extractor] Section {idx + 1}/{len(sections)} "
                    f"({section['type']}): {len(items)} items"
                )
                break  # success — exit retry loop

            except Exception as e:
                err_str = str(e)
                if "429" in err_str and attempt < max_retries - 1:
                    wait = (attempt + 1) * 15  # 15s, 30s, 45s
                    logger.warning(
                        f"[CAD Extractor] Rate limited on section {idx + 1}, "
                        f"waiting {wait}s (attempt {attempt + 1}/{max_retries})"
                    )
                    time.sleep(wait)
                else:
                    logger.error(f"[CAD Extractor] Section {idx + 1} failed: {e}")
                    break

    logger.info(f"[CAD Extractor] Total: {len(all_items)} raw items extracted")
    return {"extracted_items": all_items}


def _extract_text_section(
    section: dict,
    llm: Any,
    vector_store: Any,
    max_chars: int,
    state: CADState,
) -> List[Dict]:
    """Extract materials from a text-based section."""
    content = section["content"][:max_chars]
    if len(content.strip()) < 20:
        return []

    # Get FAISS context
    context = ""
    if vector_store:
        try:
            similar = vector_store.similarity_search_with_score(content[:500], k=3)
            context = "\n".join([
                f"- {doc.page_content[:200]}"
                for doc, score in similar
                if score <= 1.5
            ])
        except Exception:
            pass

    prompt = _CAD_EXTRACT_PROMPT.format(
        section_type=section["type"],
        context=context or "(no additional context)",
        content=content,
    )
    response = llm.invoke([{"role": "user", "content": prompt}])
    return _parse_json_response(response.content.strip())


def _extract_vision_section(section: dict, llm: Any, state: CADState) -> List[Dict]:
    """
    Send a rendered PDF page image to Gemini Vision and extract materials.
    Uses HumanMessage with inline image data (base64 PNG).
    """
    from langchain_core.messages import HumanMessage

    b64 = section.get("base64", "")
    if not b64:
        return []

    message = HumanMessage(content=[
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{b64}"},
        },
        {
            "type": "text",
            "text": _ARCH_VISION_PROMPT,
        },
    ])

    response = llm.invoke([message])
    return _parse_json_response(response.content.strip())


# ═══════════════════════════════════════════════════════════════
#  Agent 5: AGGREGATOR — deduplicate, validate, finalize
# ═══════════════════════════════════════════════════════════════

def agent_cad_aggregator(state: CADState) -> dict:
    """
    Deduplicate extracted items, validate categories,
    group by category, and produce final output.
    """
    logger.info("[CAD Agent 5: AGGREGATOR] Deduplicating and finalizing...")

    items = state.get("extracted_items", [])
    if not items:
        return {"final_items": [], "categories": {}, "total_items": 0}

    # Deduplicate by normalized description
    seen = {}
    deduped = []
    for item in items:
        desc = item.get("description", "").strip()
        if not desc or len(desc) < 3:
            continue

        key = re.sub(r"\s+", " ", desc.lower().strip())
        key = re.sub(r"[^a-z0-9 ]", "", key)

        if key in seen:
            existing = seen[key]
            if item.get("quantity") and not existing.get("quantity"):
                existing["quantity"] = item["quantity"]
            if item.get("zone") and not existing.get("zone"):
                existing["zone"] = item["zone"]
            if item.get("drawing_ref") and not existing.get("drawing_ref"):
                existing["drawing_ref"] = item["drawing_ref"]
            continue

        seen[key] = item
        deduped.append(item)

    # Validate and normalise categories
    _CAT_MAP = {
        "finishing & interior":    "Finishing & Interiors",
        "finishing & interiors":   "Finishing & Interiors",
        "civil & structural":      "Civil & Structural",
        "electrical":              "Electrical",
        "plumbing & drainage":     "Plumbing & Drainage",
        "mechanical & hvac":       "Mechanical & HVAC",
        "external development":    "External Development",
        "fire protection":         "Fire Protection",
        "it & communication":      "IT & Communication",
        "general":                 "General",
    }
    valid_categories = set(_CAT_MAP.values())

    for item in deduped:
        raw_cat = (item.get("category") or "").strip()
        normalised = _CAT_MAP.get(raw_cat.lower(), None)
        if normalised:
            item["category"] = normalised
        elif raw_cat not in valid_categories:
            item["category"] = "General"

    # Group by category
    categories = {}
    for item in deduped:
        cat = item.get("category", "General")
        categories.setdefault(cat, []).append(item)

    logger.info(
        f"[CAD Aggregator] {len(items)} raw → {len(deduped)} unique items, "
        f"{len(categories)} categories"
    )

    return {
        "final_items": deduped,
        "categories": categories,
        "total_items": len(deduped),
    }


# ═══════════════════════════════════════════════════════════════
#  Graph Builder
# ═══════════════════════════════════════════════════════════════

def build_cad_graph():
    """
    5-agent LangGraph CAD pipeline:
    reader → reconstructor → embedder → extractor → aggregator
    """
    graph = StateGraph(CADState)

    graph.add_node("reader",        agent_cad_reader)
    graph.add_node("reconstructor", agent_text_reconstructor)
    graph.add_node("embedder",      agent_cad_embedder)
    graph.add_node("extractor",     agent_material_extractor)
    graph.add_node("aggregator",    agent_cad_aggregator)

    graph.set_entry_point("reader")
    graph.add_edge("reader",        "reconstructor")
    graph.add_edge("reconstructor", "embedder")
    graph.add_edge("embedder",      "extractor")
    graph.add_edge("extractor",     "aggregator")
    graph.add_edge("aggregator",    END)

    return graph.compile()


# ═══════════════════════════════════════════════════════════════
#  Public API
# ═══════════════════════════════════════════════════════════════

_compiled_cad_graph = None


def _get_cad_graph():
    global _compiled_cad_graph
    if _compiled_cad_graph is None:
        _compiled_cad_graph = build_cad_graph()
    return _compiled_cad_graph


def run_cad_extraction(file_bytes: bytes, filename: str) -> Dict:
    """
    Run the full 5-agent LangGraph CAD extraction pipeline.

    Returns dict with keys:
      filename, extracted_items (count), items, categories, source
    """
    graph = _get_cad_graph()

    initial_state = {
        "file_bytes": file_bytes,
        "filename": filename,
        "industry": "construction",
    }

    result = graph.invoke(initial_state)

    return {
        "filename": filename,
        "extracted_items": result.get("total_items", 0),
        "items": result.get("final_items", []),
        "categories": result.get("categories", {}),
        "source": "cad",
        "file_type": result.get("file_type", ""),
        "page_count": result.get("page_count", 0),
        "used_vision": result.get("use_vision", False),
    }


# ═══════════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════════

def _parse_json_response(content: str) -> List[Dict]:
    try:
        content = re.sub(r"```json\s*", "", content)
        content = re.sub(r"```\s*", "", content).strip()
        if content.startswith("["):
            return json.loads(content)
        match = re.search(r"\[.*\]", content, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception:
        pass
    return []
