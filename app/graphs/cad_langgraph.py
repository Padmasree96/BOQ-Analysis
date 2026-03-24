"""
cad_langgraph.py — Orchestrates the CAD-to-BOQ extraction pipeline.

Rewritten to use the dedicated backend modules (cad_parser, cad_ai_engine, boq_engine)
instead of the complex 1656-line LangGraph implementation.
Provides a clear `run_cad_extraction` entry point for the API route.
"""

import os
import tempfile
from pathlib import Path
from typing import Dict, List, Any

from loguru import logger

# Import the new backend-adapted modules
from app.services.dwg_to_dxf import convert_dwg_to_dxf
from app.services.cad_parser import parse_dxf
from app.services.cad_ai_engine import generate_boq_with_ai
from app.services.boq_template import map_to_boq
from app.services.boq_engine import consolidate_items, group_boq_by_category, apply_layer_geometry, generate_boq

# Retain old pdfplumber fallback logic just for PDFs
from app.services.cad_extractor import extract_materials_from_cad


def run_cad_extraction(file_bytes: bytes, filename: str) -> Dict[str, Any]:
    """
    Main entry point for CAD extraction from API routes.
    Orchestrates the DWG/DXF pipeline using specialized CAD parsers
    and Gemini AI.
    
    Fallback to cad_extractor text pipeline for PDFs.
    """
    ext = Path(filename).suffix.lower()
    logger.info(f"[CAD Pipeline] Starting extraction for {filename} ({ext})")

    if ext == ".pdf":
        # Keep using the existing PDF logic from cad_extractor.py
        logger.info("[CAD Pipeline] File is PDF, routing to pdf extractor...")
        items = extract_materials_from_cad(file_bytes, filename)
        
        # We process PDF items through boq_engine for consistent formatting
        # Group, assign item_no, compute totals
        consolidated = consolidate_items(items)
        categories = group_boq_by_category(consolidated)
        
        return {
            "filename": filename,
            "extracted_items": len(consolidated),
            "items": consolidated,
            "categories": categories,
            "source": "cad",
            "file_type": "pdf",
            "page_count": 0, # PDF page counting not returned by extract_materials_from_cad currently
            "used_vision": False
        }
        
    # === DWG / DXF Pipeline ===
    
    tmpdir = tempfile.mkdtemp(prefix="cad_boq_")
    filepath = os.path.join(tmpdir, filename)
    
    try:
        # Write bytes to disk for parser/converter
        with open(filepath, "wb") as f:
            f.write(file_bytes)
            
        # 1. Convert DWG to DXF if necessary
        dxf_path = filepath
        if ext == ".dwg":
            logger.info(f"[CAD Pipeline] Converting DWG to DXF: {filename}")
            try:
                dxf_path = convert_dwg_to_dxf(filepath)
            except Exception as e:
                logger.error(f"[CAD Pipeline] DWG conversion failed: {e}")
                raise RuntimeError(f"DWG conversion failed. Is ODA File Converter installed? Error: {e}")

        # 2. Parse DXF (extracts ALL entities, geometry, layers)
        logger.info(f"[CAD Pipeline] Parsing DXF: {dxf_path}")
        raw_data = parse_dxf(dxf_path)
        stats = raw_data.get("extraction_stats", {})
        logger.info(f"[CAD Pipeline] Parsed {stats.get('total_text_entities', 0)} text entities")

        # 3. AI Extraction
        ai_used = False
        found_items = []
        
        has_ai_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if has_ai_key:
            logger.info("[CAD Pipeline] Sending raw data to Gemini AI...")
            found_items = generate_boq_with_ai(raw_data)
            if found_items:
                ai_used = True
                logger.info(f"[CAD Pipeline] AI generated {len(found_items)} items")

        # 4. Fallback if AI fails or is disabled
        if not found_items:
            logger.info("[CAD Pipeline] AI failed or disabled, using heuristic rules")
            found_items = map_to_boq(raw_data)
            
        if not found_items:
            logger.info("[CAD Pipeline] Heuristic rules failed, using geometry fallback")
            found_items = generate_boq(raw_data)

        # 5. Consolidation & Layer Linking
        # AI output is already somewhat consolidated, but this ensures consistent formatting/units
        logger.info("[CAD Pipeline] Consolidating items...")
        boq_items = consolidate_items(found_items)
        
        # Link geometry (e.g., pipes with 0 qty get length from layer)
        boq_items = apply_layer_geometry(boq_items, raw_data.get("layer_summary", {}))
        
        # Group items by category for final structure
        categories = group_boq_by_category(boq_items)

        logger.info(f"[CAD Pipeline] Success: {len(boq_items)} items across {len(categories)} categories")

        return {
            "filename": filename,
            "extracted_items": len(boq_items),
            "items": boq_items,
            "categories": categories,
            "source": "cad",
            "file_type": ext.lstrip("."),
            "ai_used": ai_used,
            "page_count": 1,
            "used_vision": False,
            "extraction_stats": stats
        }

    finally:
        # Cleanup temp directory
        try:
            import shutil
            shutil.rmtree(tmpdir, ignore_errors=True)
        except Exception:
            pass
