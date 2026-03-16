from loguru import logger
from app.config.settings import EPC_CATEGORY_RULES
from app.services.ontology_mapper import map_to_category
from app.services.graph_matcher import match_material

def classify_category(product: str) -> str:
    """4-layer classification pipeline for BOQ items.

    L1: EPC_CATEGORY_RULES keyword match (settings.py)
    L2: Ontology word-boundary regex (boq_ontology.json)
    L3: Knowledge Graph synonym search (material_graph.json)
    L4: Return 'Uncategorized' — routes.py sends to Gemini if needed
    """
    if not product:
        return "Uncategorized"

    product_lower = product.lower().strip()

    # ── Layer 1: EPC keyword rules ────────────────────────────
    for category, keywords in EPC_CATEGORY_RULES.items():
        for keyword in keywords:
            if keyword.lower() in product_lower:
                logger.debug(f"L1 match: '{keyword}' → {category}")
                return category

    # ── Layer 2: Ontology word-boundary regex ─────────────────
    ontology_result = map_to_category(product)
    if ontology_result != "Uncategorized":
        logger.debug(f"L2 ontology match → {ontology_result}")
        return ontology_result

    # ── Layer 3: Knowledge graph synonym search ───────────────
    graph_category, graph_name = match_material(product)
    if graph_category:
        logger.debug(f"L3 graph match: '{graph_name}' → {graph_category}")
        return graph_category

    # ── Layer 4: Uncategorized (Gemini handles in routes.py) ──
    logger.debug(f"No classification for: '{product[:60]}...'")
    return "Uncategorized"
