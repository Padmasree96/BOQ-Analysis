import os
from typing import Dict, List
from loguru import logger

try:
    from langchain_google_genai import ChatGoogleGenerativeAI
    HAS_LANGCHAIN = True
except ImportError:
    HAS_LANGCHAIN = False
    logger.warning("langchain-google-genai not installed — AI extraction disabled")

from dotenv import load_dotenv

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

EXTRACTION_PROMPT = """You are a construction BOQ (Bill of Quantities) expert.
Extract all raw materials and items from the following text.
For each item, provide:
- description: the material or work item name
- brand: manufacturer/brand if mentioned, otherwise "Generic"
- quantity: numeric quantity if found, otherwise 0
- unit: unit of measurement if found, otherwise "-"
- category: one of these categories ONLY:
  Civil & Structural, Plumbing & Drainage, Electrical, HVAC,
  Firefighting, Finishing & Interior, External Works, Other

Return a JSON object with format: {{"items": [{{...}}, ...]}}

Industry context: {industry}

TEXT:
{chunk}
"""


def _chunk_text(text: str, chunk_size: int = 8000, overlap: int = 500) -> List[str]:
    """Split text into chunks with overlap."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start = end - overlap
    return chunks


def extract_with_ai(raw_text: str, industry: str = "construction") -> Dict:
    """Use Google Gemini AI to extract BOQ items from raw text.

    Splits text into chunks of 8000 chars with 500 overlap.
    For each chunk: send prompt to extract structured output.
    Returns {"items": [...all extracted items...]}
    If no API key: returns {"items": []}
    """
    if not GOOGLE_API_KEY:
        logger.warning("No GOOGLE_API_KEY found — skipping AI extraction")
        return {"items": []}

    if not HAS_LANGCHAIN:
        logger.warning("langchain-google-genai not available — skipping AI extraction")
        return {"items": []}

    if not raw_text or not raw_text.strip():
        return {"items": []}

    try:
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=GOOGLE_API_KEY,
            temperature=0.1,
            max_retries=1,
            timeout=30,
        )
    except Exception as e:
        logger.error(f"Failed to initialize Gemini: {e}")
        return {"items": []}

    chunks = _chunk_text(raw_text)
    all_items = []

    for i, chunk in enumerate(chunks):
        logger.info(f"Processing chunk {i + 1}/{len(chunks)} ({len(chunk)} chars)")

        prompt = EXTRACTION_PROMPT.format(industry=industry, chunk=chunk)

        try:
            response = llm.invoke(prompt, timeout=30)
            content = response.content

            # Try to parse JSON from response
            import json
            import re

            # Extract JSON from markdown code blocks if present
            json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", content)
            if json_match:
                content = json_match.group(1)

            parsed = json.loads(content.strip())
            items = parsed.get("items", [])

            # Normalize items
            for item in items:
                all_items.append({
                    "description": str(item.get("description", "")).strip(),
                    "brand": str(item.get("brand", "Generic")).strip() or "Generic",
                    "quantity": float(item.get("quantity", 0)),
                    "unit": str(item.get("unit", "-")).strip() or "-",
                    "category": str(item.get("category", "Uncategorized")).strip(),
                })

            logger.info(f"Chunk {i + 1}: extracted {len(items)} items")

        except Exception as e:
            logger.warning(f"Chunk {i + 1} extraction failed: {e}")
            continue

    logger.info(f"AI extraction total: {len(all_items)} items")
    return {"items": all_items}
