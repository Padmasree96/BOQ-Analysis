from typing import List, Dict
from app.utils.fuzzy_matcher import are_similar
from loguru import logger


def consolidate_duplicates(items: List[Dict]) -> List[Dict]:
    """Merge near-duplicate items by fuzzy-matching descriptions."""
    if not items:
        return items

    consolidated = []
    used = set()

    for i, item in enumerate(items):
        if i in used:
            continue

        merged = item.copy()

        for j in range(i + 1, len(items)):
            if j in used:
                continue
            if are_similar(item["description"], items[j]["description"]):
                # Merge: sum quantities, keep the longer description
                merged["quantity"] = merged.get("quantity", 0) + items[j].get(
                    "quantity", 0
                )
                if len(items[j]["description"]) > len(merged["description"]):
                    merged["description"] = items[j]["description"]
                # Keep the more specific category
                if merged.get("category") == "Uncategorized" and items[j].get(
                    "category"
                ) != "Uncategorized":
                    merged["category"] = items[j]["category"]
                used.add(j)

        consolidated.append(merged)
        used.add(i)

    logger.info(
        f"Consolidated {len(items)} items → {len(consolidated)} unique items"
    )
    return consolidated
