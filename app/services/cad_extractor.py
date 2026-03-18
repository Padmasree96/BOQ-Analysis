"""
FlyyyAI — CAD / DWG Material Extractor
=======================================
Supports:
  .dwg / .dxf  →  parsed with ezdxf
  .pdf         →  extracted with pdfplumber, then sent to Gemini AI

Entry point: extract_materials_from_cad(file_bytes, filename, llm=None)
Returns the same item dict schema as BOQ extraction.
"""

import os
import re
import json
from pathlib import Path
from typing import Dict, List, Optional

from loguru import logger

# ── Constants ──────────────────────────────────────────────────────────────────

CAD_EXTRACTION_PROMPT = """
You are a senior Construction Engineer reading CAD drawing text.

Extract ALL materials from the drawing content below.
This may include:
  - Material schedules / legend tables
  - Cable schedules (cable size, type, route, quantity)
  - Pipe schedules (pipe dia, material, pressure rating)
  - Equipment lists (item tag, description, quantity)
  - Room/zone material call-outs
  - Keynotes and material annotations

For EACH material found return:
{
  "description": "specific material name with full spec",
  "quantity": number or null,
  "unit": "m / nos / set / kg or null",
  "zone": "room/area/floor if mentioned",
  "drawing_ref": "drawing number or sheet if mentioned",
  "category": one of the EPC categories,
  "is_specific": true or false
}

EPC categories: Civil & Structural | Electrical |
Plumbing & Drainage | Mechanical & HVAC |
Finishing & Interiors | External Development |
Fire Protection | IT & Communication | General

RULES:
  - Extract specific grades (FRLS, XLPE, PPR PN10)
  - Extract sizes (2.5sqmm, 25mm dia, DN50)
  - Never fabricate — only what is in the drawing text
  - If material schedule table exists, extract each row
  - Return ONLY valid JSON array, no explanation

If nothing found: []
"""


# ── LLM factory ────────────────────────────────────────────────────────────────

def _get_llm():
    """Create and return a Gemini LLM instance using env config."""
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI
        api_key = os.getenv("GOOGLE_API_KEY", "")
        if not api_key:
            raise EnvironmentError("GOOGLE_API_KEY not set in environment")
        return ChatGoogleGenerativeAI(
            model=os.getenv("CAD_LLM_MODEL", "gemini-2.0-flash"),
            google_api_key=api_key,
            temperature=0.1,
            max_retries=1,
            timeout=int(os.getenv("CAD_LLM_TIMEOUT", "45")),
        )
    except Exception as e:
        logger.error(f"[CAD] LLM init failed: {e}")
        raise


# ── DWG / DXF text extractor ───────────────────────────────────────────────────

def extract_text_from_dwg(file_bytes: bytes) -> str:
    """
    Extract all text entities from a DWG/DXF file using ezdxf.

    Reads:
      - MTEXT entities (material schedules, notes)
      - TEXT entities (labels, call-outs)
      - INSERT block attributes (title block info)
    """
    import ezdxf
    import io

    try:
        doc = ezdxf.read(io.BytesIO(file_bytes))
        texts = []

        def _collect(entity):
            try:
                if entity.dxftype() == "TEXT":
                    val = entity.dxf.text.strip()
                    if val and len(val) > 2:
                        texts.append(val)
                elif entity.dxftype() == "MTEXT":
                    val = entity.plain_mtext().strip()
                    if val and len(val) > 2:
                        texts.append(val)
                elif entity.dxftype() == "INSERT":
                    for attrib in entity.attribs:
                        val = attrib.dxf.text.strip()
                        if val and len(val) > 2:
                            texts.append(val)
            except Exception:
                pass

        # Model space
        for entity in doc.modelspace():
            _collect(entity)

        # All other layouts
        for layout in doc.layouts:
            for entity in layout:
                try:
                    if entity.dxftype() in ("TEXT", "MTEXT", "INSERT"):
                        _collect(entity)
                except Exception:
                    continue

        # Deduplicate while preserving order
        seen = set()
        unique = []
        for t in texts:
            if t not in seen:
                seen.add(t)
                unique.append(t)

        result = "\n".join(unique)
        logger.info(f"[CAD] DWG extracted {len(unique)} unique text entities")
        return result

    except Exception as e:
        logger.error(f"[CAD] DWG parse failed: {e}")
        return ""


# ── PDF drawing text extractor ─────────────────────────────────────────────────

def extract_text_from_pdf_drawing(file_bytes: bytes) -> str:
    """
    Extract text from a PDF drawing (vector or scanned).
    Uses pdfplumber; also extracts tables (material schedules).
    """
    import pdfplumber
    import io

    try:
        texts = []
        max_pages = int(os.getenv("MAX_CAD_PDF_PAGES", "30"))

        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for i, page in enumerate(pdf.pages[:max_pages]):
                text = page.extract_text()
                if text and text.strip():
                    texts.append(f"--- DRAWING PAGE {i + 1} ---\n{text.strip()}")

                # Extract tables (material schedules are often tables)
                tables = page.extract_tables()
                for table in tables:
                    if table:
                        rows = [
                            " | ".join(str(c) for c in row if c)
                            for row in table
                            if row
                        ]
                        if rows:
                            texts.append("TABLE:\n" + "\n".join(rows))

        result = "\n\n".join(texts)
        logger.info(f"[CAD] PDF extracted content from {len(texts)} sections/tables")
        return result

    except Exception as e:
        logger.error(f"[CAD] PDF parse failed: {e}")
        return ""


# ── JSON response parser ───────────────────────────────────────────────────────

def _parse_json_response(content: str) -> List[Dict]:
    """Parse a JSON array from an LLM response string safely."""
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


# ── Main entry point ───────────────────────────────────────────────────────────

def extract_materials_from_cad(
    file_bytes: bytes,
    filename: str,
    llm=None,
) -> List[Dict]:
    """
    Extract material schedule from a CAD drawing file.

    Supported extensions: .dwg, .dxf, .pdf

    Steps:
      1. Detect file type and extract raw text
      2. Chunk text if too long
      3. Send to Gemini AI for structured material extraction
      4. Return list of material dicts (same schema as BOQ extraction)
    """
    if not file_bytes or not filename:
        return []

    ext = Path(filename).suffix.lower()

    # Step 1: Extract raw text
    if ext in (".dwg", ".dxf"):
        raw_text = extract_text_from_dwg(file_bytes)
    elif ext == ".pdf":
        raw_text = extract_text_from_pdf_drawing(file_bytes)
    else:
        logger.warning(f"[CAD] Unsupported format: {ext}")
        return []

    if not raw_text.strip():
        logger.warning("[CAD] No text extracted from drawing")
        return []

    # Step 2: Get LLM
    if llm is None:
        try:
            llm = _get_llm()
        except Exception as e:
            logger.error(f"[CAD] LLM not available: {e}")
            return []

    # Step 3: Chunk and send to AI
    max_chars = int(os.getenv("CAD_CONTEXT_MAX_CHARS", "8000"))
    max_chunks = int(os.getenv("CAD_MAX_CHUNKS", "5"))
    chunks = [raw_text[i: i + max_chars] for i in range(0, len(raw_text), max_chars)]

    all_items: List[Dict] = []

    for chunk_idx, chunk in enumerate(chunks[:max_chunks]):
        try:
            response = llm.invoke([
                {"role": "system", "content": CAD_EXTRACTION_PROMPT},
                {
                    "role": "user",
                    "content": f"DRAWING CONTENT (part {chunk_idx + 1}):\n{chunk}",
                },
            ])
            items = _parse_json_response(response.content.strip())
            for item in items:
                item["source"] = "cad"
                item["drawing_file"] = filename
            all_items.extend(items)
            logger.info(
                f"[CAD] Chunk {chunk_idx + 1}/{min(len(chunks), max_chunks)}: "
                f"{len(items)} items extracted"
            )
        except Exception as e:
            logger.error(f"[CAD] Chunk {chunk_idx + 1} extraction failed: {e}")

    logger.info(f"[CAD] Total extracted: {len(all_items)} materials from {filename}")
    return all_items
