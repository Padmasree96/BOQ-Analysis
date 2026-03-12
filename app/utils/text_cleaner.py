import re
from app.config.settings import (
    INVALID_ROW_KEYWORDS,
    MAX_PRODUCT_LENGTH,
    DIMENSION_PATTERN,
    MATERIAL_KEYWORDS,
    NON_MATERIAL_PHRASES,
)


def clean_text(text: str) -> str:
    """Normalize and clean raw text from Excel cells."""
    if not isinstance(text, str):
        return ""
    text = text.strip()
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"[^\x20-\x7E\u00A0-\u00FF]", "", text)
    return text


def is_section_header(text: str) -> bool:
    """Check if text is a building/section header rather than a material.

    Examples rejected:
      'Science Laboratory Building (Ground +2 upper floors) at all depths'
      'Engineering Hall Building Item Description'
      'Substation Building measuring about 1 Acre'
    """
    text_lower = text.lower().strip()

    # Patterns that indicate section headers / building descriptions
    _SECTION_PATTERNS = [
        r"\bbuilding\b.*\b(ground|floor|upper|storey|story|basement)\b",
        r"\bbuilding\b.*\b(measuring|area|acre|sqm|sq\.?\s*m)\b",
        r"\b(hall|laboratory|substation|tower|wing|block)\b.*\bbuilding\b",
        r"\bitem\s+description\b",
        r"\bat\s+all\s+(depths?|heights?|floors?|levels?)\b",
        r"\b(ground\s*\+?\s*\d+\s*upper\s*floor)",
        r"\bmeasuring\s+about\b",
        r"\b(outside\s*&?\s*up\s+to\s+the\s+building)\b",
        r"\batriums?\s+in\b",
        r"\bsit\s*&\s*t\s*c\s+of\b",  # SIT&C of ... (service description)
        r"\bcomplete\s+design\b.*\bengineering\b",
    ]
    for pat in _SECTION_PATTERNS:
        if re.search(pat, text_lower):
            return True

    return False


def is_valid_product(text: str) -> bool:
    """Check whether a cleaned string looks like a real material/product.

    Rejects: totals, notes, drawings, designs, scope descriptions,
    sentence fragments, pure numbers, section headers, and overly long text.
    """
    if not text or len(text) < 8:
        return False
    if len(text) > MAX_PRODUCT_LENGTH:
        return False

    text_lower = text.lower().strip()

    # Reject rows that are clearly totals, notes, or section headers
    for kw in INVALID_ROW_KEYWORDS:
        if text_lower.startswith(kw):
            return False

    # Reject non-material descriptions (drawings, designs, consultancy, etc.)
    for phrase in NON_MATERIAL_PHRASES:
        if phrase in text_lower:
            return False

    # Reject building/section headers
    if is_section_header(text):
        return False

    # Reject pure numbers / dimension-only strings
    if re.fullmatch(r"[\d\s.,\-/]+", text):
        return False
    if DIMENSION_PATTERN.fullmatch(text):
        return False

    # Must contain at least one letter
    if not re.search(r"[a-zA-Z]", text):
        return False

    # Reject list markers like "a)", "b)", "c)", "d)", "e)", "f)", "g)"
    if re.match(r"^[a-g]\)\s", text_lower):
        return False

    # Reject fragments starting with lowercase conjunctions/prepositions
    if re.match(
        r"^(including |for |the |and |or |with |in |on |at |to |of |by |from )",
        text_lower,
    ):
        return False

    return True


def is_material_description(text: str) -> bool:
    """Check if text contains any known material keyword."""
    text_lower = text.lower()
    for kw in MATERIAL_KEYWORDS:
        if kw.lower() in text_lower:
            return True
    return False
