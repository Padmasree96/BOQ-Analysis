"""
FlyyyAI — BOQ vs CAD Comparison Engine
=======================================
Compares extracted BOQ items against extracted CAD items.

Issue types:
  SPEC_MISMATCH   — same item, but CAD has more detail than BOQ
  QTY_MISMATCH    — same item, but quantities differ beyond tolerance
  MISSING_IN_CAD  — item in BOQ not found in CAD drawing
  MISSING_IN_BOQ  — item in CAD drawing not found in BOQ

Entry points:
  compare_boq_vs_cad(boq_items, cad_items, qty_tolerance_pct) → ComparisonResult
  build_engineer_report(result, ...) → str (plain-text email body)
"""

import os
from datetime import date
from typing import Dict, List, Optional

from pydantic import BaseModel
from loguru import logger


# ── Pydantic models ────────────────────────────────────────────────────────────

class ComparisonIssue(BaseModel):
    issue_type: str
    # "SPEC_MISMATCH" | "MISSING_IN_BOQ" | "MISSING_IN_CAD" | "QTY_MISMATCH"
    severity: str          # "HIGH" | "MEDIUM" | "LOW"
    boq_item: Optional[Dict] = None
    cad_item: Optional[Dict] = None
    message: str
    recommendation: str
    qty_variance_pct: Optional[float] = None


class ComparisonResult(BaseModel):
    total_boq_items: int
    total_cad_items: int
    matched_count: int
    issues: List[ComparisonIssue]
    issues_count: int
    is_approved: bool      # True only when zero issues found
    match_score: float     # percentage of BOQ items matched in CAD


# ── Main comparison function ───────────────────────────────────────────────────

def compare_boq_vs_cad(
    boq_items: List[Dict],
    cad_items: List[Dict],
    qty_tolerance_pct: float = None,
) -> ComparisonResult:
    """
    Compare BOQ extracted items vs CAD extracted items.

    Matching uses RapidFuzz token_set_ratio (threshold: 70).
    Flags:
      - Quantity variance beyond tolerance (default 10%)
      - Specificity gap (CAD description significantly more detailed)
      - Items missing in CAD (LOW severity — may just not be drawn)
      - Items in CAD missing from BOQ (HIGH severity — cost impact)
    """
    from rapidfuzz import fuzz

    if qty_tolerance_pct is None:
        qty_tolerance_pct = float(os.getenv("BOQ_QTY_TOLERANCE_PCT", "10.0"))

    issues: List[ComparisonIssue] = []
    matched_boq_indices: set = set()
    matched_cad_indices: set = set()

    for bi, boq_item in enumerate(boq_items):
        boq_desc = boq_item.get("description", "").lower()
        boq_qty = float(boq_item.get("quantity") or 0)

        best_score = 0
        best_ci: Optional[int] = None

        for ci, cad_item in enumerate(cad_items):
            cad_desc = cad_item.get("description", "").lower()
            score = fuzz.token_set_ratio(boq_desc, cad_desc)
            if score > best_score:
                best_score = score
                best_ci = ci

        if best_score >= 70 and best_ci is not None:
            cad_item = cad_items[best_ci]
            cad_qty = float(cad_item.get("quantity") or 0)

            matched_boq_indices.add(bi)
            matched_cad_indices.add(best_ci)

            # Quantity mismatch check
            if boq_qty > 0 and cad_qty > 0:
                variance = abs(boq_qty - cad_qty) / boq_qty * 100
                if variance > qty_tolerance_pct:
                    issues.append(ComparisonIssue(
                        issue_type="QTY_MISMATCH",
                        severity="MEDIUM",
                        boq_item=boq_item,
                        cad_item=cad_item,
                        message=(
                            f"'{boq_item['description']}': "
                            f"BOQ qty={boq_qty}, CAD qty={cad_qty} "
                            f"({variance:.1f}% variance)"
                        ),
                        recommendation=(
                            "Verify site measurement against BOQ. "
                            "Update BOQ quantity if drawing is more recent."
                        ),
                        qty_variance_pct=round(variance, 2),
                    ))

            # Specificity gap check
            boq_words = len(boq_item.get("description", "").split())
            cad_words = len(cad_item.get("description", "").split())
            if cad_words > boq_words + 3:
                issues.append(ComparisonIssue(
                    issue_type="SPEC_MISMATCH",
                    severity="HIGH",
                    boq_item=boq_item,
                    cad_item=cad_item,
                    message=(
                        f"BOQ says '{boq_item['description']}' (generic). "
                        f"CAD specifies '{cad_item['description']}' (detailed). "
                        f"BOQ needs specification update."
                    ),
                    recommendation=(
                        "Update BOQ description to match the CAD specification. "
                        "Generic specs may cause procurement errors."
                    ),
                ))

        else:
            # BOQ item not found in CAD
            if bi not in matched_boq_indices:
                issues.append(ComparisonIssue(
                    issue_type="MISSING_IN_CAD",
                    severity="LOW",
                    boq_item=boq_item,
                    message=(
                        f"'{boq_item.get('description', '')}' is in BOQ "
                        f"but not found in the CAD drawing."
                    ),
                    recommendation=(
                        "Verify if this item should appear in the drawings. "
                        "May be a legitimate BOQ-only line item."
                    ),
                ))

    # CAD items not matched to any BOQ item
    for ci, cad_item in enumerate(cad_items):
        if ci not in matched_cad_indices:
            issues.append(ComparisonIssue(
                issue_type="MISSING_IN_BOQ",
                severity="HIGH",
                cad_item=cad_item,
                message=(
                    f"'{cad_item.get('description', '')}' is in the CAD drawing "
                    f"but missing from the BOQ."
                ),
                recommendation=(
                    "Add this item to the BOQ. Missing items may significantly "
                    "affect project cost and procurement."
                ),
            ))

    matched_count = len(matched_boq_indices)
    total_boq = len(boq_items)
    match_score = round(matched_count / max(total_boq, 1) * 100, 1)

    logger.info(
        f"[Compare] BOQ={total_boq} | CAD={len(cad_items)} | "
        f"Matched={matched_count} | Issues={len(issues)} | Score={match_score}%"
    )

    return ComparisonResult(
        total_boq_items=total_boq,
        total_cad_items=len(cad_items),
        matched_count=matched_count,
        issues=issues,
        issues_count=len(issues),
        is_approved=len(issues) == 0,
        match_score=match_score,
    )


# ── Engineer report builder ────────────────────────────────────────────────────

def build_engineer_report(
    result: ComparisonResult,
    project_name: str,
    boq_filename: str,
    cad_filename: str,
) -> str:
    """
    Build a plain-text email body for engineer review when issues are found.
    Also used as a summary even when is_approved=True.
    """
    lines = [
        "BOQ vs CAD Comparison Report",
        "=" * 60,
        f"Project      : {project_name}",
        f"BOQ File     : {boq_filename}",
        f"CAD File     : {cad_filename}",
        f"Date         : {date.today().strftime('%d %B %Y')}",
        f"Match Score  : {result.match_score}%",
        f"Matched Items: {result.matched_count} / {result.total_boq_items}",
        f"Issues Found : {result.issues_count}",
        "=" * 60,
    ]

    if result.issues_count == 0:
        lines += [
            "",
            "✅ All items matched. BOQ is consistent with CAD drawings.",
            "   Procurement can proceed.",
        ]
    else:
        # Group by severity for readability
        high   = [i for i in result.issues if i.severity == "HIGH"]
        medium = [i for i in result.issues if i.severity == "MEDIUM"]
        low    = [i for i in result.issues if i.severity == "LOW"]

        issue_num = 1
        for group_label, group in [
            ("HIGH PRIORITY", high),
            ("MEDIUM PRIORITY", medium),
            ("LOW PRIORITY", low),
        ]:
            if not group:
                continue
            lines.append(f"\n── {group_label} ({len(group)} issues) ──")
            for issue in group:
                lines.append(f"\nISSUE {issue_num}: [{issue.severity}] {issue.issue_type}")
                lines.append(f"  {issue.message}")
                lines.append(f"  → {issue.recommendation}")
                if issue.qty_variance_pct:
                    lines.append(f"  Quantity Variance: {issue.qty_variance_pct}%")
                issue_num += 1

    lines += [
        "",
        "=" * 60,
        "Please review and correct the BOQ before proceeding to procurement.",
        "",
        "This report was generated by FlyyyAI Construction Intelligence Platform.",
    ]

    return "\n".join(lines)
