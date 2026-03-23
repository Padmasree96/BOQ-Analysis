"""
FlyyyAI — 6-agent LangGraph BOQ Extraction Pipeline
====================================================

Pipeline:
  reader → reconstructor (SRR) → embedder → extractor → category → aggregator

All known bug fixes baked in from the start:
  - datetime instead of pd.Timestamp (Bug A)
  - Description-only embeddings, no qty/unit in vectors (Bug B)
  - Self-row filtering in vector retrieval (Bug C)
  - Unicode Ø/ø in specificity regex (Bug D)
  - Structural Row Reconstruction agent (SRR architecture)
"""

import os
import re
import json
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, TypedDict, Any

import pandas as pd
from loguru import logger
from dotenv import load_dotenv

from langgraph.graph import StateGraph, END
load_dotenv()

# ── Optional imports — degrade gracefully ──────────────────────
try:
    from langchain_google_genai import (
        ChatGoogleGenerativeAI,
        GoogleGenerativeAIEmbeddings,
    )
    HAS_LANGCHAIN = True
except ImportError:
    HAS_LANGCHAIN = False
    logger.warning("langchain-google-genai not installed — AI agents disabled")

try:
    from langchain_community.vectorstores import FAISS
    from langchain_core.documents import Document
    HAS_FAISS = True
except ImportError:
    HAS_FAISS = False
    logger.warning("FAISS not installed — vector search disabled")

# ── Config ─────────────────────────────────────────────────────
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
FAISS_DISTANCE_THRESHOLD = 1.2  # L2 distance threshold for relevance

_KNOWLEDGE_DIR = Path(__file__).parent.parent / "knowledge"
_GRAPH_PATH = _KNOWLEDGE_DIR / "material_graph.json"
_ONTOLOGY_PATH = _KNOWLEDGE_DIR / "boq_ontology.json"

# Import existing project utilities
from app.config.settings import (
    EMBEDDING_MODEL,
    EPC_CATEGORY_RULES,
    HEADER_KEYWORDS,
    NON_MATERIAL_PHRASES,
    get_config,
)
from app.services.boq_table_detector import detect_header_row
from app.services.column_identifier import identify_columns
from app.services.category_classifier import classify_category
from app.services.graph_matcher import learn_material
from app.utils.text_cleaner import clean_text, is_valid_product, is_section_header
from app.utils.data_cleaner import clean_dataframe_structure
from app.utils.product_normalizer import consolidate_duplicates
from app.services.boq_extractor import extract_materials_from_text


# ═══════════════════════════════════════════════════════════════
#  State Definition
# ═══════════════════════════════════════════════════════════════

class BOQState(TypedDict, total=False):
    """Shared state flowing through the LangGraph pipeline."""
    file_path: str
    industry: str
    # reader output
    raw_rows: List[Dict[str, Any]]
    sheet_names: List[str]
    total_sheets: int
    sheets_with_data: int
    # embedder output
    vector_store: Any  # FAISS instance (not serializable, lives in memory)
    # extractor output
    extracted_items: List[Dict[str, Any]]
    # category output
    categorized_items: List[Dict[str, Any]]
    new_categories: List[str]
    # aggregator output
    final_items: List[Dict[str, Any]]
    categories: Dict[str, List[Dict[str, Any]]]
    specificity_score: float
    low_confidence_count: int
    total_items: int


# ═══════════════════════════════════════════════════════════════
#  Agent 1: READER — raw Excel rows
# ═══════════════════════════════════════════════════════════════

def agent_reader(state: BOQState) -> dict:
    """Read all sheets from the Excel file and collect raw rows."""
    file_path = state["file_path"]
    industry = state.get("industry", "construction")
    logger.info(f"[Agent 1: READER] Reading {file_path}")

    config = get_config(industry)
    field_mapping = config["field_mapping"]
    threshold = config["thresholds"]["fuzzy_match_threshold"]

    try:
        xls = pd.ExcelFile(file_path)
    except Exception as e:
        logger.error(f"Failed to open Excel: {e}")
        return {
            "raw_rows": [],
            "sheet_names": [],
            "total_sheets": 0,
            "sheets_with_data": 0,
        }

    all_rows: List[Dict] = []
    sheets_with_data = 0

    for sheet_name in xls.sheet_names:
        try:
            df = pd.read_excel(xls, sheet_name=sheet_name, header=None)
        except Exception:
            continue

        if df.empty or df.shape[0] < 2:
            continue

        header_row = detect_header_row(df)

        # Apply header
        if header_row > 0 and header_row < len(df):
            new_header = df.iloc[header_row].astype(str).tolist()
            df = df.iloc[header_row + 1:].reset_index(drop=True)
            df.columns = new_header
        else:
            df.columns = [str(c) for c in df.columns]

        df = clean_dataframe_structure(df)
        if df.empty:
            continue

        col_map = identify_columns(df.columns.tolist(), field_mapping, threshold)
        desc_col = col_map.get("description")
        qty_col = col_map.get("quantity")
        unit_col = col_map.get("unit")
        brand_col = col_map.get("brand")

        if not desc_col:
            continue

        sheet_has_data = False

        for row_idx, (_, row) in enumerate(df.iterrows()):
            raw_desc = str(row.get(desc_col, "")).strip()
            desc = clean_text(raw_desc)
            if not desc or desc == "nan":
                continue

            qty = _safe_float(row.get(qty_col)) if qty_col else None
            unit = str(row.get(unit_col, "-")).strip() if unit_col else "-"
            if not unit or unit == "nan":
                unit = "-"
            brand = str(row.get(brand_col, "Generic")).strip() if brand_col else "Generic"
            if not brand or brand == "nan":
                brand = "Generic"

            all_rows.append({
                "sheet": sheet_name,
                "row_index": row_idx,
                "description": desc,
                "quantity": qty,
                "unit": unit,
                "brand": brand,
            })
            sheet_has_data = True

        if sheet_has_data:
            sheets_with_data += 1

    logger.info(
        f"[Reader] {len(xls.sheet_names)} sheets → "
        f"{len(all_rows)} raw rows from {sheets_with_data} sheets"
    )

    return {
        "raw_rows": all_rows,
        "sheet_names": xls.sheet_names,
        "total_sheets": len(xls.sheet_names),
        "sheets_with_data": sheets_with_data,
    }


# ═══════════════════════════════════════════════════════════════
#  Agent 2: RECONSTRUCTOR (SRR) — merge multi-row items
# ═══════════════════════════════════════════════════════════════

def agent_reconstructor(state: BOQState) -> dict:
    """
    Structural Row Reconstruction (SRR).

    BOQ Excel files often spread one logical item across multiple rows.
    This agent groups continuation rows into their parent item,
    producing one logical item per BOQ entry before embedding.

    Reconstruction signals:
      1. Row starts with an item number (1.1, 4.2, a) → new item
      2. Row has a quantity → this ends the current logical item
      3. Row text is a continuation → merge into previous item
    """
    logger.info("[Agent 2: RECONSTRUCTOR] Reconstructing logical BOQ items...")

    raw_rows = state.get("raw_rows", [])
    if not raw_rows:
        return {"raw_rows": []}

    reconstructed: List[Dict] = []
    current_item: Dict = {}

    for row in raw_rows:
        desc = str(row.get("description", "")).strip()
        qty = row.get("quantity")
        unit = row.get("unit")

        if not desc:
            if current_item:
                reconstructed.append(current_item)
                current_item = {}
            continue

        # Signal 1: Row starts with an item number
        is_item_start = bool(re.match(
            r"^(\d+\.?\d*\.?\d*|[a-zA-Z]\)|\([a-zA-Z]\))\s+\w",
            desc,
        ))

        # Signal 2: Row has a non-zero quantity
        has_quantity = qty is not None and qty > 0

        if is_item_start:
            if current_item:
                reconstructed.append(current_item)
            current_item = {
                "sheet": row.get("sheet", ""),
                "row_index": row.get("row_index", 0),
                "description": desc,
                "quantity": qty,
                "unit": unit,
                "brand": row.get("brand", "Generic"),
            }

        elif has_quantity and not current_item:
            # Standalone row with qty
            reconstructed.append({
                "sheet": row.get("sheet", ""),
                "row_index": row.get("row_index", 0),
                "description": desc,
                "quantity": qty,
                "unit": unit,
                "brand": row.get("brand", "Generic"),
            })

        elif has_quantity and current_item:
            # Quantity row closes the current item
            if len(desc) > 10 and desc not in current_item["description"]:
                current_item["description"] += " " + desc
            current_item["quantity"] = qty
            current_item["unit"] = unit or current_item.get("unit")
            reconstructed.append(current_item)
            current_item = {}

        else:
            # Continuation row — merge description
            if current_item:
                noise = [
                    "as per", "refer", "all complete", "note:",
                    "specification", "as directed", "including all",
                ]
                is_noise = any(n in desc.lower() for n in noise)
                if not is_noise and len(desc) > 8:
                    current_item["description"] += " " + desc
            else:
                current_item = {
                    "sheet": row.get("sheet", ""),
                    "row_index": row.get("row_index", 0),
                    "description": desc,
                    "quantity": qty,
                    "unit": unit,
                    "brand": row.get("brand", "Generic"),
                }

    # Flush last item
    if current_item:
        reconstructed.append(current_item)

    logger.info(
        f"[Reconstructor] {len(raw_rows)} raw rows → "
        f"{len(reconstructed)} logical BOQ items"
    )
    return {"raw_rows": reconstructed}


# ═══════════════════════════════════════════════════════════════
#  Agent 3: EMBEDDER — FAISS vector index (description-only)
# ═══════════════════════════════════════════════════════════════

def agent_embedder(state: BOQState) -> dict:
    """
    Build a FAISS vector index from reconstructed rows.

    Bug Fix B: Only embed description text — qty/unit stay in metadata.
    Mixing numbers into text damages semantic similarity.
    """
    logger.info("[Agent 3: EMBEDDER] Building FAISS vector index...")

    raw_rows = state.get("raw_rows", [])
    if not raw_rows:
        return {"vector_store": None}

    if not HAS_LANGCHAIN or not HAS_FAISS or not GOOGLE_API_KEY:
        logger.warning("Embedder skipped — missing deps or API key")
        return {"vector_store": None}

    try:
        embeddings = GoogleGenerativeAIEmbeddings(
            model=EMBEDDING_MODEL,
            google_api_key=GOOGLE_API_KEY,
        )
    except Exception as e:
        logger.error(f"Failed to init embeddings: {e}")
        return {"vector_store": None}

    documents: List[Document] = []
    for row in raw_rows:
        # Bug Fix B: description ONLY — no qty/unit in vector content
        content = row["description"]

        metadata = {
            "sheet": row.get("sheet", ""),
            "row_index": row.get("row_index", 0),
            "quantity": row.get("quantity"),
            "unit": row.get("unit", "-"),
            "brand": row.get("brand", "Generic"),
        }
        documents.append(Document(page_content=content, metadata=metadata))

    try:
        vector_store = FAISS.from_documents(documents, embeddings)
        logger.info(f"[Embedder] Indexed {len(documents)} documents into FAISS")
    except Exception as e:
        logger.error(f"FAISS indexing failed: {e}")
        return {"vector_store": None}

    return {"vector_store": vector_store}


# ═══════════════════════════════════════════════════════════════
#  Agent 4: EXTRACTOR — LLM + vector context
# ═══════════════════════════════════════════════════════════════

_EXTRACT_PROMPT = """You are a construction BOQ (Bill of Quantities) expert.

Given a raw BOQ row description, extract the specific material or work item.

SIMILAR ITEMS FROM THIS BOQ (for context):
{source_context}

RAW DESCRIPTION:
{description}

INSTRUCTIONS:
- Return the clean material/product name
- Include brand if mentioned, otherwise "Generic"
- Identify the EPC category
- Rate your confidence 0.0 to 1.0

Return JSON:
{{"material": "...", "brand": "...", "category": "...", "confidence": 0.0}}
"""


def agent_extractor(state: BOQState) -> dict:
    """
    Extract materials using LLM with FAISS vector context.

    Falls back to rule-based classification if LLM is unavailable.
    Bug Fix C: Filters out self-row from vector retrieval results.
    """
    logger.info("[Agent 4: EXTRACTOR] Extracting materials...")

    raw_rows = state.get("raw_rows", [])
    vector_store = state.get("vector_store")

    if not raw_rows:
        return {"extracted_items": []}

    # Try LLM extraction
    llm = None
    if HAS_LANGCHAIN and GOOGLE_API_KEY:
        try:
            llm = ChatGoogleGenerativeAI(
                model="gemini-2.5-flash",
                google_api_key=GOOGLE_API_KEY,
                temperature=0.1,
                max_retries=1,
                timeout=30,
            )
        except Exception as e:
            logger.warning(f"LLM init failed, falling back to rules: {e}")

    extracted: List[Dict] = []

    for row in raw_rows:
        desc = row["description"]

        # Skip section headers
        if is_section_header(desc):
            continue

        # ── Long descriptions: use keywords for category, keep specific desc ──
        if len(desc) > 80:
            found_materials = extract_materials_from_text(desc)
            if found_materials:
                # Use the category from keyword match, but keep
                # the ORIGINAL specific description from the BOQ row
                # (trimmed to the first meaningful clause)
                specific_desc = _extract_specific_description(desc)
                best_cat = found_materials[0]["category"]
                extracted.append({
                    "description": specific_desc,
                    "brand": row.get("brand", "Generic"),
                    "quantity": row.get("quantity") or 0.0,
                    "unit": row.get("unit", "-"),
                    "category": best_cat,
                    "confidence_score": 0.85,
                    "is_specific": _is_already_specific(specific_desc),
                    "sheet": row.get("sheet", ""),
                    "row_index": row.get("row_index", 0),
                })
                continue
            # No materials found in long text — fall through but validate
            if not is_valid_product(desc):
                continue
        else:
            # Short descriptions: if it contains a known material keyword,
            # keep it even if is_valid_product rejects it (e.g. "With 3.5C x 400 sq.mm XLPE cable")
            has_material_keyword = bool(extract_materials_from_text(desc))
            if not has_material_keyword and not is_valid_product(desc):
                continue

        # ── Get similar context from FAISS ──────────────────────
        source_context = ""
        if vector_store is not None:
            try:
                similar_docs = vector_store.similarity_search_with_score(desc, k=4)

                # Bug Fix C: filter out the same row itself
                current_row_idx = row.get("row_index", -1)
                source_context = "\n".join([
                    f"- {doc.page_content}"
                    for doc, score in similar_docs
                    if score <= FAISS_DISTANCE_THRESHOLD
                    and doc.metadata.get("row_index") != current_row_idx
                ])
            except Exception:
                pass

        # ── Try LLM extraction ──────────────────────────────────
        material_name = desc
        brand = row.get("brand", "Generic")
        category = "Uncategorized"
        confidence = 0.5

        if llm and len(desc) > 15:
            try:
                prompt = _EXTRACT_PROMPT.format(
                    source_context=source_context or "(none)",
                    description=desc,
                )
                response = llm.invoke(prompt, timeout=30)
                content = response.content

                # Parse JSON from response
                json_match = re.search(r"\{[\s\S]*?\}", content)
                if json_match:
                    parsed = json.loads(json_match.group())
                    material_name = parsed.get("material", desc).strip()
                    if parsed.get("brand") and parsed["brand"] != "Generic":
                        brand = parsed["brand"]
                    if parsed.get("category") and parsed["category"] != "Uncategorized":
                        category = parsed["category"]
                    confidence = float(parsed.get("confidence", 0.5))
            except Exception as e:
                logger.debug(f"LLM extraction failed for row, using rules: {e}")

        # ── Fallback: rule-based classification ────────────────
        if category == "Uncategorized":
            category = classify_category(material_name)

        is_specific = _is_already_specific(material_name)

        extracted.append({
            "description": material_name,
            "brand": brand,
            "quantity": row.get("quantity") or 0.0,
            "unit": row.get("unit", "-"),
            "category": category,
            "confidence_score": round(confidence, 2),
            "is_specific": is_specific,
            "sheet": row.get("sheet", ""),
            "row_index": row.get("row_index", 0),
        })

    logger.info(f"[Extractor] Extracted {len(extracted)} materials")
    return {"extracted_items": extracted}


# ═══════════════════════════════════════════════════════════════
#  Agent 5: CATEGORY — validate + discover new categories
# ═══════════════════════════════════════════════════════════════

_KNOWN_CATEGORIES = set(EPC_CATEGORY_RULES.keys()) | {"Uncategorized"}


def agent_category(state: BOQState) -> dict:
    """
    Validate categories and discover new ones.

    If an LLM returns a category not in our known set,
    evaluate whether it's a valid new category and save it.
    """
    logger.info("[Agent 5: CATEGORY] Validating categories...")

    items = state.get("extracted_items", [])
    new_categories: List[str] = []

    for item in items:
        cat = item.get("category", "Uncategorized")

        if cat not in _KNOWN_CATEGORIES and cat != "Uncategorized":
            # LLM suggested a novel category — keep it but track
            if cat not in new_categories:
                new_categories.append(cat)
                _save_new_category(cat, item["description"])
                logger.info(f"New category discovered: {cat}")

        # Learning loop: save high-confidence LLM-classified items
        if (
            item.get("confidence_score", 0) >= 0.7
            and cat != "Uncategorized"
        ):
            learn_material(
                item["description"],
                cat,
                item.get("unit", "-"),
                source="langgraph_llm",
            )

    logger.info(
        f"[Category] {len(items)} items validated, "
        f"{len(new_categories)} new categories discovered"
    )

    return {
        "categorized_items": items,
        "new_categories": new_categories,
    }


# ═══════════════════════════════════════════════════════════════
#  Agent 6: AGGREGATOR — dedup, score, finalize
# ═══════════════════════════════════════════════════════════════

def agent_aggregator(state: BOQState) -> dict:
    """
    Final aggregation: deduplicate, compute specificity score,
    group by category, and produce the final output.
    """
    logger.info("[Agent 6: AGGREGATOR] Aggregating results...")

    items = state.get("categorized_items", [])

    if not items:
        return {
            "final_items": [],
            "categories": {},
            "specificity_score": 0.0,
            "low_confidence_count": 0,
            "total_items": 0,
        }

    # Deduplicate using consolidate_duplicates from existing code
    deduped = consolidate_duplicates(items)

    # Compute specificity score
    specific_count = sum(1 for i in deduped if i.get("is_specific"))
    specificity_score = round(
        (specific_count / len(deduped)) * 100, 1
    ) if deduped else 0.0

    # Count low confidence items
    low_confidence = sum(
        1 for i in deduped
        if i.get("confidence_score", 1.0) < 0.5
    )

    # Group by category
    categories: Dict[str, List[Dict]] = {}
    for item in deduped:
        cat = item.get("category", "Uncategorized")
        categories.setdefault(cat, []).append(item)

    logger.info(
        f"[Aggregator] {len(deduped)} final items, "
        f"specificity={specificity_score}%, "
        f"low_conf={low_confidence}"
    )

    return {
        "final_items": deduped,
        "categories": categories,
        "specificity_score": specificity_score,
        "low_confidence_count": low_confidence,
        "total_items": len(deduped),
    }


# ═══════════════════════════════════════════════════════════════
#  Graph Builder
# ═══════════════════════════════════════════════════════════════

def build_boq_graph():
    """
    6-agent LangGraph pipeline:
    reader → reconstructor → embedder → extractor → category → aggregator
    """
    graph = StateGraph(BOQState)

    graph.add_node("reader", agent_reader)
    graph.add_node("reconstructor", agent_reconstructor)
    graph.add_node("embedder", agent_embedder)
    graph.add_node("extractor", agent_extractor)
    graph.add_node("category", agent_category)
    graph.add_node("aggregator", agent_aggregator)

    graph.set_entry_point("reader")
    graph.add_edge("reader", "reconstructor")
    graph.add_edge("reconstructor", "embedder")
    graph.add_edge("embedder", "extractor")
    graph.add_edge("extractor", "category")
    graph.add_edge("category", "aggregator")
    graph.add_edge("aggregator", END)

    return graph.compile()


# ═══════════════════════════════════════════════════════════════
#  Public API
# ═══════════════════════════════════════════════════════════════

_compiled_graph = None


def _get_graph():
    """Lazy-compile the graph once."""
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_boq_graph()
    return _compiled_graph


def run_boq_extraction(
    file_path: str,
    industry: str = "construction",
) -> Dict:
    """
    Run the full 6-agent LangGraph extraction pipeline.

    Returns dict with keys:
      total_sheets, sheets_with_data, total_items, items,
      categories, specificity_score, low_confidence_count,
      new_categories
    """
    graph = _get_graph()

    initial_state = {
        "file_path": file_path,
        "industry": industry,
    }

    result = graph.invoke(initial_state)

    return {
        "total_sheets": result.get("total_sheets", 0),
        "sheets_with_data": result.get("sheets_with_data", 0),
        "extracted_items": result.get("total_items", 0),
        "total_items": result.get("total_items", 0),
        "items": result.get("final_items", []),
        "categories": result.get("categories", {}),
        "specificity_score": result.get("specificity_score", 0.0),
        "low_confidence_count": result.get("low_confidence_count", 0),
        "new_categories": result.get("new_categories", []),
    }


# ═══════════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════════

def _safe_float(value) -> Optional[float]:
    """Safely convert a value to float, returns None if not numeric."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        if pd.isna(value):
            return None
        return float(value)
    if isinstance(value, str):
        cleaned = re.sub(r"[^\d.\-]", "", value.strip())
        try:
            return float(cleaned) if cleaned else None
        except ValueError:
            return None
    return None


def _is_already_specific(description: str) -> bool:
    """Check if a material description is already specific enough.

    Bug Fix D: handles both Ø (U+00D8) and ø (U+00F8) for diameter.
    """
    desc_lower = description.lower()

    specificity_patterns = [
        r"\d+\s*(mm|cm|m|inch|ft|sqm|sq\.?\s*m)",
        r"(dia|diameter|dn\s*\d+|[øØ]\s*\d+|nominal|pressure|pn\s*\d+)",
        r"(grade|class|type|series)\s*[\-:]?\s*\w+",
        r"\b(is|astm|bs|en|din)\s*[\-:]?\s*\d+",
        r"\d+\s*(hp|kw|kva|amp|volt|watt)",
        r"\b(frls|xlpe|pvc|hdpe|upvc|cpvc|gi|ms|ss|ci)\b",
    ]

    matches = sum(1 for p in specificity_patterns if re.search(p, desc_lower))
    return matches >= 2


def _extract_specific_description(desc: str) -> str:
    """Extract the meaningful material description from a long BOQ row.

    BOQ rows often look like:
      "Providing and laying 3.5C x 400 sq.mm Aluminium XLPE cable
       GFC detailed architectural drawings structural drawings..."

    This extracts just the material-specific part, stripping boilerplate.
    """
    # Remove common BOQ boilerplate prefixes
    boilerplate = [
        r"^providing\s+and\s+(laying|fixing|applying|placing|painting)\s+",
        r"^supplying?,?\s*(installation,?\s*)?testing\s+and\s+commiss?ioning\s+of\s+",
        r"^supply,?\s*installation,?\s*testing\s+and\s+commiss?ioning\s+of\s+",
        r"^sit\s*&?\s*c\s+of\s+",
        r"^designing,?\s*(providing\s+and\s+)?(execution|laying)\s+of\s+",
        r"^construction\s+of\s+",
        r"^providing\s+",
    ]

    cleaned = desc
    for pat in boilerplate:
        cleaned = re.sub(pat, "", cleaned, flags=re.IGNORECASE).strip()

    # Cut at GFC / architectural / structural / drawings boilerplate
    cut_patterns = [
        r"\s*GFC\s+detailed\b.*",
        r"\s*complete\s+as\s+per\s+(specification|drawing).*",
        r"\s*as\s+per\s+(IS|CPWD|design|specification|drawing).*",
        r"\s*conforming\s+to\s+(IS|CPWD|ASTM|BS).*",
        r"\s*including\s+all\s+(taxes?|charges?|transport).*",
    ]
    for pat in cut_patterns:
        cleaned = re.sub(pat, "", cleaned, flags=re.IGNORECASE).strip()

    # Cap at reasonable length
    if len(cleaned) > 120:
        # Try to cut at a natural break
        for sep in [",", " - ", " with ", " including "]:
            idx = cleaned.find(sep, 40)
            if 40 < idx < 120:
                cleaned = cleaned[:idx]
                break
        else:
            cleaned = cleaned[:120].rsplit(" ", 1)[0]

    # If cleaning stripped too much, fall back to first 100 chars of original
    if len(cleaned) < 10:
        cleaned = desc[:100].rsplit(" ", 1)[0]

    return cleaned.strip()


def _save_new_category(category: str, example_material: str) -> None:
    """Save a newly discovered category to the knowledge graph.

    Bug Fix A: uses datetime instead of pd.Timestamp.
    """
    try:
        graph_data = {"version": "1.0", "materials": []}
        if _GRAPH_PATH.exists():
            with open(_GRAPH_PATH, "r", encoding="utf-8") as f:
                graph_data = json.load(f)

        # Check if category already exists in any material
        for mat in graph_data.get("materials", []):
            if mat.get("category") == category:
                return  # Already known

        # Add a seed entry for this category
        graph_data["materials"].append({
            "name": example_material.strip(),
            "category": category,
            "synonyms": [],
            "typical_unit": "-",
            "source": "langgraph_discovery",
            "discovered_at": datetime.now(timezone.utc).isoformat(),
        })

        with open(_GRAPH_PATH, "w", encoding="utf-8") as f:
            json.dump(graph_data, f, indent=2, ensure_ascii=False)

        logger.info(f"Saved new category '{category}' to knowledge graph")
    except Exception as e:
        logger.error(f"Failed to save new category: {e}")
