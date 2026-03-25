import difflib
from typing import Optional, List, Tuple


def _token_sort_ratio(s1: str, s2: str) -> float:
    t1 = " ".join(sorted(s1.split()))
    t2 = " ".join(sorted(s2.split()))
    return difflib.SequenceMatcher(None, t1, t2).ratio() * 100


def fuzzy_match(query: str, choices: List[str], threshold: int = 70) -> Optional[str]:
    """Return the best fuzzy match from choices, or None if below threshold."""
    if not query or not choices:
        return None
    
    query_lower = query.lower()
    best_match = None
    best_score = 0.0
    
    for i, choice in enumerate(choices):
        score = _token_sort_ratio(query_lower, choice.lower())
        if score > best_score:
            best_score = score
            best_match = choice
            
    if best_score >= threshold:
        return best_match
    return None


def fuzzy_match_with_score(
    query: str, choices: List[str], threshold: int = 70
) -> Optional[Tuple[str, float]]:
    """Return (best_match, score) or None if below threshold."""
    if not query or not choices:
        return None
        
    query_lower = query.lower()
    best_match = None
    best_score = 0.0
    
    for i, choice in enumerate(choices):
        score = _token_sort_ratio(query_lower, choice.lower())
        if score > best_score:
            best_score = score
            best_match = choice
            
    if best_score >= threshold:
        return (best_match, best_score)
    return None


def are_similar(text1: str, text2: str, threshold: int = 85) -> bool:
    """Check if two strings are similar enough to be considered duplicates."""
    if not text1 or not text2:
        return False
    score = _token_sort_ratio(text1.lower(), text2.lower())
    return score >= threshold
