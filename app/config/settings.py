import os
import re

# ─── AI Model Configuration ──────────────────────────────────
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "models/gemini-embedding-001")
# Primary LLM (gemini-2.5-flash: best quality, 20 req/day free tier)
LLM_MODEL_PRIMARY = os.getenv("LLM_MODEL", "gemini-2.5-flash")
# Fallback LLM (gemini-2.0-flash: good quality, 1500 req/day free tier)
LLM_MODEL_FALLBACK = os.getenv("LLM_MODEL_FALLBACK", "gemini-2.0-flash")
# Full model fallback chain — each has its own free-tier quota
LLM_MODEL_CHAIN = [
    LLM_MODEL_PRIMARY,
    LLM_MODEL_FALLBACK,
    "gemini-2.0-flash-lite",
    "gemini-2.5-pro",
]

# ─── Table Detection ─────────────────────────────────────────
HEADER_SCAN_LIMIT = 20

HEADER_KEYWORDS = [
    "description", "item", "material", "equipment", "particulars",
    "qty", "quantity", "unit", "rate", "amount", "brand", "make",
    "specification", "scope", "work", "supply", "no.", "sl",
    "sr", "s.no", "uom",
]

INVALID_ROW_KEYWORDS = [
    "total", "subtotal", "sub-total", "sub total", "grand total",
    "note", "notes", "boq", "schedule", "summary", "page",
    "annexure", "appendix", "revision", "issued", "prepared",
    "checked", "approved", "signature", "date", "ref",
    "bill of quantities", "bill no", "section total",
]

# Phrases that indicate non-material descriptions (drawings, designs, scope text)
NON_MATERIAL_PHRASES = [
    "drawing", "drawings", "consultancy", "design and development",
    "architectural design", "3d view", "walkthrough", "submission",
    "colour scheme", "marking plan", "floor plan", "elevation",
    "cross section", "working drawing", "layout plan", "layout detail",
    "as per direction", "as per the detailed", "as per specification",
    "as applicable", "bid document", "tender document",
    "cpwd specification", "bureau of indian standard", "latest norm",
    "code of practice", "govt publication", "regulation",
    "engineer-in-charge", "scope of work", "agency shall",
    "providing consultancy", "soil testing", "cbr value",
    "development of detailed", "generation of 2d", "generation of 3d",
    "coordination of all", "integration of all",
    "better project management", "all floor plans",
    "all elevations", "sections through", "for all the buildings",
    "conforming to the technology", "barricading",
    "preparation & submission", "preparation and submission",
    "horticulture drawing",
    "nominal dia", "item description",
    "mechanical utility services",
    "material handling service",
    "sit&c of", "sitc of",
]

SECTION_KEYWORDS = [
    "building", "hall", "laboratory", "block", "tower", "wing",
    "floor", "basement", "roof", "terrace", "site", "area",
    "zone", "phase", "package", "section",
]

# ─── Text Cleaning ───────────────────────────────────────────
IGNORE_WORDS = [
    "floor", "depth", "nominal", "dia", "from", "upto",
    "thick", "thickness", "wide", "width", "high", "height",
    "long", "length", "above", "below", "level", "grade",
    "including", "excluding", "approx", "approximately",
    "minimum", "maximum", "average", "as per", "refer",
]

MAX_PRODUCT_LENGTH = 500
MAX_REASONABLE_QUANTITY = 999999

DIMENSION_PATTERN = re.compile(
    r"\b\d+(\.\d+)?\s*(mm|cm|m|meter|metre|inch|ft|feet)\b", re.IGNORECASE
)

DEPTH_PATTERN = re.compile(
    r"\b\d+(\.\d+)?\s*(mm|m|cm)\s*(deep|depth)\b", re.IGNORECASE
)

# ─── EPC Category Rules (Layer 1 classification) ─────────────
EPC_CATEGORY_RULES = {
    "Civil & Structural": [
        "concrete", "cement", "sand", "aggregate", "rebar", "reinforcement",
        "steel", "structural steel", "formwork", "shuttering", "excavation",
        "foundation", "pile", "piling", "backfill", "grading", "rcc",
        "masonry", "brick", "block", "mortar", "plaster", "waterproofing",
        "grouting", "beam", "column", "slab", "footing", "retaining wall",
        "precast", "grating", "ms grating", "manhole", "curb", "kerb",
        "expansion joint", "anchor bolt", "base plate",
    ],
    "Plumbing & Drainage": [
        "pipe", "piping", "ppr", "hdpe", "upvc", "cpvc", "gi pipe",
        "valve", "ball valve", "gate valve", "check valve", "butterfly valve",
        "pump", "submersible pump", "booster pump", "water tank",
        "overhead tank", "underground tank", "sanitary", "closet",
        "wash basin", "urinal", "faucet", "tap", "shower", "floor trap",
        "drainage", "sewer", "manhole cover", "septic", "sump",
        "water supply", "plumbing", "cistern", "geyser", "water heater",
        "coupling", "elbow", "tee", "reducer", "flange",
    ],
    "Electrical": [
        "cable", "wire", "wiring", "conduit", "electrical",
        "distribution board", "db", "mcb", "mccb", "elcb", "rccb",
        "switchgear", "panel", "transformer", "ups", "generator",
        "led", "light", "lighting", "luminaire", "fitting",
        "socket", "switch", "plug", "power point",
        "earthing", "grounding", "lightning", "lightning conductor",
        "cable tray", "cable ladder", "busbar", "bus duct",
        "it conduit", "telephone", "public address", "pa system",
        "cctv", "access control", "intercom", "fire alarm",
        "xlpe", "armoured cable", "lt cable", "ht cable",
        "power wiring", "point wiring", "internal wiring",
    ],
    "HVAC": [
        "hvac", "air conditioning", "ac", "ahu", "air handling unit",
        "fcu", "fan coil unit", "chiller", "cooling tower",
        "duct", "ductwork", "gi duct", "diffuser", "grille",
        "damper", "vav", "thermostat", "refrigerant", "compressor",
        "exhaust fan", "ventilation", "fresh air", "return air",
        "split ac", "cassette ac", "vrf", "vrv", "insulation",
        "chilled water", "hot water pipe",
    ],
    "Firefighting": [
        "sprinkler", "fire sprinkler", "fire hydrant", "hydrant",
        "fire extinguisher", "fire pump", "fire alarm system",
        "smoke detector", "heat detector", "fire hose",
        "fire door", "fire damper", "firefighting",
        "fire suppression", "fm200", "clean agent",
        "fire rated", "fire stop", "fire sealant",
        "wet riser", "dry riser", "fire tank",
    ],
    "Finishing & Interior": [
        "tile", "vitrified", "ceramic", "porcelain", "marble",
        "granite", "stone", "flooring", "wall cladding",
        "paint", "painting", "primer", "putty", "emulsion",
        "enamel", "texture", "wallpaper",
        "false ceiling", "gypsum", "grid ceiling", "pop",
        "door", "window", "aluminium door", "aluminium window",
        "wooden door", "glass door", "glazing",
        "partition", "drywall", "gypsum board",
        "hardware", "handle", "lock", "hinge", "closer",
        "handrail", "railing", "balustrade",
        "carpet", "vinyl", "epoxy", "pu coating",
    ],
    "External Works": [
        "road", "asphalt", "bitumen", "pavement", "paving",
        "kerb", "kerbstone", "curb", "curbstone",
        "fencing", "boundary wall", "gate", "barrier",
        "landscaping", "garden", "grass", "turf", "planting",
        "irrigation", "drip irrigation", "sprinkler irrigation",
        "parking", "bollard", "signage", "road marking",
        "street light", "pole", "outdoor lighting",
        "swale", "storm drain", "culvert", "catch basin",
        "retaining", "gabion", "geotextile",
    ],
    "Other": [
        "furniture", "shelving", "rack", "locker", "bench",
        "elevator", "lift", "escalator", "dumbwaiter",
        "solar", "solar panel", "inverter",
        "kitchen", "laundry", "gas piping", "lpg",
        "bms", "building management", "automation",
        "swimming pool", "spa", "sauna",
    ],
}

# Flat list of all material keywords
MATERIAL_KEYWORDS = []
for keywords in EPC_CATEGORY_RULES.values():
    MATERIAL_KEYWORDS.extend(keywords)

# ─── Industry Configurations ─────────────────────────────────
INDUSTRY_CONFIGS = {
    "construction": {
        "field_mapping": {
            "description": [
                "description", "item description", "particulars",
                "material", "scope of work", "item", "work description",
                "name", "specification",
            ],
            "brand": ["brand", "make", "manufacturer", "supplier"],
            "quantity": ["qty", "quantity", "qnty", "total qty", "total quantity"],
            "unit": ["unit", "uom", "unit of measurement"],
        },
        "thresholds": {
            "header_scan_limit": HEADER_SCAN_LIMIT,
            "min_description_length": 8,
            "fuzzy_match_threshold": 70,
        },
    },
}


def get_config(industry: str = "construction") -> dict:
    """Return configuration for the given industry."""
    return INDUSTRY_CONFIGS.get(industry, INDUSTRY_CONFIGS["construction"])
