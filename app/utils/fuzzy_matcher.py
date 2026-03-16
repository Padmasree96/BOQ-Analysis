from rapidfuzz import fuzz, process
from typing import Optional, List, Tuple


def fuzzy_match(query: str, choices: List[str], threshold: int = 70) -> Optional[str]:
    """Return the best fuzzy match from choices, or None if below threshold."""
    if not query or not choices:
        return None
    result = process.extractOne(query.lower(), [c.lower() for c in choices], scorer=fuzz.token_sort_ratio)
    if result and result[1] >= threshold:
        return choices[result[2]]
    return None


def fuzzy_match_with_score(
    query: str, choices: List[str], threshold: int = 70
) -> Optional[Tuple[str, float]]:
    """Return (best_match, score) or None if below threshold."""
    if not query or not choices:
        return None
    result = process.extractOne(query.lower(), [c.lower() for c in choices], scorer=fuzz.token_sort_ratio)
    if result and result[1] >= threshold:
        return (choices[result[2]], result[1])
    return None


def are_similar(text1: str, text2: str, threshold: int = 85) -> bool:
    """Check if two strings are similar enough to be considered duplicates."""
    if not text1 or not text2:
        return False
    score = fuzz.token_sort_ratio(text1.lower(), text2.lower())
    return score >= threshold
