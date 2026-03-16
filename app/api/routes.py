import os
import tempfile
from typing import Dict, List, Optional
from fastapi import APIRouter, UploadFile, File, Query, HTTPException
from loguru import logger
from pydantic import BaseModel

from app.models.boq_schema import AnalyzeRequest
from app.services.excel_analyzer import process_excel
from app.services.category_classifier import classify_category
from app.services.graph_matcher import graph_stats, learn_material
from app.graphs.excel_graph import extract_with_ai
from app.graphs.boq_langgraph import run_boq_extraction
from app.analytics.boq_analyzer import analyze_boq
from app.analytics.risk_engine import detect_risks
from app.utils.product_normalizer import consolidate_duplicates

router = APIRouter()


@router.post("/extract")
async def extract_boq(
    file: UploadFile = File(...),
    industry: str = Query(default="construction"),
):
    """Rule-based extraction only (no AI, fast)."""
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only .xlsx or .xls files accepted")

    # Check file size (max 10MB)
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File exceeds 10MB limit")

    # Save to temp file
    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        result = process_excel(tmp_path, industry)
        return result
    except Exception as e:
        logger.error(f"Extraction failed: {e}")
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")
    finally:
        try:
            os.unlink(tmp_path)
        except PermissionError:
            pass  # Windows file lock — will be cleaned up by OS


@router.post("/upload-excel")
async def upload_excel(
    file: UploadFile = File(...),
    industry: str = Query(default="construction"),
):
    """Gemini AI extraction with rule-based fallback + learning loop."""
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only .xlsx or .xls files accepted")

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File exceeds 10MB limit")

    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        # Step 1: Rule-based extraction
        result = process_excel(tmp_path, industry)
        items = result.get("items", [])

        # Step 2: Find uncategorized items for AI classification
        uncategorized = [i for i in items if i.get("category") == "Uncategorized"]

        if uncategorized:
            logger.info(
                f"{len(uncategorized)} uncategorized items — sending to Gemini AI"
            )

            # Build text from uncategorized items for AI
            raw_text = "\n".join(
                [i["description"] for i in uncategorized if i.get("description")]
            )

            if raw_text.strip():
                try:
                    ai_result = extract_with_ai(raw_text, industry)
                    ai_items = ai_result.get("items", [])
                except Exception as ai_err:
                    logger.warning(f"AI extraction failed, using rule-based only: {ai_err}")
                    ai_items = []

                # Build lookup from AI results
                ai_lookup = {}
                for ai_item in ai_items:
                    desc = ai_item.get("description", "").lower().strip()
                    if desc and ai_item.get("category") != "Uncategorized":
                        ai_lookup[desc] = ai_item

                # Update uncategorized items with AI classifications
                for item in items:
                    if item.get("category") != "Uncategorized":
                        continue

                    desc_lower = item["description"].lower().strip()

                    # Direct match
                    if desc_lower in ai_lookup:
                        ai_item = ai_lookup[desc_lower]
                        item["category"] = ai_item["category"]
                        # Learning loop: save to graph
                        learn_material(
                            item["description"],
                            ai_item["category"],
                            item.get("unit", "-"),
                            source="llm",
                        )
                        continue

                    # Partial match: check if any AI description is in this item
                    for ai_desc, ai_item in ai_lookup.items():
                        if ai_desc in desc_lower or desc_lower in ai_desc:
                            item["category"] = ai_item["category"]
                            learn_material(
                                item["description"],
                                ai_item["category"],
                                item.get("unit", "-"),
                                source="llm",
                            )
                            break

        # Consolidate and regroup
        items = consolidate_duplicates(items)
        from app.services.boq_extractor import group_by_category

        categories = group_by_category(items)

        result["items"] = items
        result["categories"] = categories
        result["extracted_items"] = len(items)

        return result

    except Exception as e:
        logger.error(f"Upload processing failed: {e}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")
    finally:
        try:
            os.unlink(tmp_path)
        except PermissionError:
            pass  # Windows file lock — will be cleaned up by OS


@router.post("/analyze")
async def analyze_items(request: AnalyzeRequest):
    """Analyze extracted BOQ items for category summaries and insights."""
    try:
        result = analyze_boq(request.items)
        return result
    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/risk")
async def assess_risk(request: AnalyzeRequest):
    """Detect procurement and data-quality risks in BOQ items."""
    try:
        result = detect_risks(request.items)
        return result
    except Exception as e:
        logger.error(f"Risk assessment failed: {e}")
        raise HTTPException(status_code=500, detail=f"Risk assessment failed: {str(e)}")


@router.get("/graph-stats")
async def get_graph_stats():
    """Return material knowledge graph statistics."""
    try:
        stats = graph_stats()
        return stats
    except Exception as e:
        logger.error(f"Graph stats failed: {e}")
        raise HTTPException(status_code=500, detail=f"Graph stats failed: {str(e)}")


@router.post("/extract-langgraph")
async def extract_langgraph(
    file: UploadFile = File(...),
    industry: str = Query(default="construction"),
):
    """6-agent LangGraph pipeline: reader → reconstructor → embedder → extractor → category → aggregator."""
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only .xlsx or .xls files accepted")

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File exceeds 10MB limit")

    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        result = run_boq_extraction(tmp_path, industry)
        return result
    except Exception as e:
        logger.error(f"LangGraph extraction failed: {e}")
        raise HTTPException(status_code=500, detail=f"LangGraph extraction failed: {str(e)}")
    finally:
        try:
            os.unlink(tmp_path)
        except PermissionError:
            pass


# ── Vendor models ──────────────────────────────────────────────────────────────

class VendorOut(BaseModel):
    id: str
    name: str
    email: str
    categories: List[str]
    rating: float
    type: str               # "recommended" | "past" | "new"
    contact_person: str


class MaterialItem(BaseModel):
    description: str
    quantity: Optional[float] = None
    unit: Optional[str] = "-"
    category: Optional[str] = ""


class VendorQuoteRequest(BaseModel):
    vendor_emails: List[str]
    materials: List[MaterialItem]
    project_name: str = "Construction Project"
    requester_name: str = "Project Manager"
    requester_email: str = ""
    reply_by_days: int = 7


# ── In-memory vendor seed (replace with DB later) ─────────────────────────────

VENDOR_SEED: List[Dict] = [
    {
        "id": "v001",
        "name": "Polycab Wires Ltd",
        "email": "procurement@polycab.com",
        "categories": ["Electrical"],
        "rating": 4.8,
        "type": "recommended",
        "contact_person": "Sales Team",
    },
    {
        "id": "v002",
        "name": "Havells India Ltd",
        "email": "b2b@havells.com",
        "categories": ["Electrical"],
        "rating": 4.5,
        "type": "recommended",
        "contact_person": "Enterprise Sales",
    },
    {
        "id": "v003",
        "name": "KEI Industries",
        "email": "exports@kei-ind.com",
        "categories": ["Electrical"],
        "rating": 4.3,
        "type": "past",
        "contact_person": "Mr. Rajan",
    },
    {
        "id": "v004",
        "name": "Finolex Cables",
        "email": "sales@finolex.com",
        "categories": ["Electrical"],
        "rating": 4.1,
        "type": "new",
        "contact_person": "Regional Sales",
    },
    {
        "id": "v005",
        "name": "Supreme Industries",
        "email": "pipes@supremeindustries.net",
        "categories": ["Plumbing & Drainage"],
        "rating": 4.6,
        "type": "recommended",
        "contact_person": "Pipes Division",
    },
    {
        "id": "v006",
        "name": "Astral Pipes",
        "email": "projects@astralpipes.com",
        "categories": ["Plumbing & Drainage"],
        "rating": 4.4,
        "type": "past",
        "contact_person": "Mr. Mehta",
    },
    {
        "id": "v007",
        "name": "Ultratech Cement",
        "email": "bulk@ultratechcement.com",
        "categories": ["Civil & Structural"],
        "rating": 4.7,
        "type": "recommended",
        "contact_person": "Bulk Sales",
    },
    {
        "id": "v008",
        "name": "TATA Steel",
        "email": "construction@tatasteel.com",
        "categories": ["Civil & Structural"],
        "rating": 4.9,
        "type": "past",
        "contact_person": "Project Division",
    },
    {
        "id": "v009",
        "name": "Daikin India",
        "email": "projects@daikin.co.in",
        "categories": ["Mechanical & HVAC"],
        "rating": 4.5,
        "type": "recommended",
        "contact_person": "Commercial HVAC",
    },
    {
        "id": "v010",
        "name": "Honeywell Fire",
        "email": "firesales@honeywell.com",
        "categories": ["Fire Protection"],
        "rating": 4.6,
        "type": "new",
        "contact_person": "Fire Systems Team",
    },
]


# ── GET /vendors ───────────────────────────────────────────────────────────────

@router.get("/vendors")
async def get_vendors(
    category: str = Query(None, description="Filter by category"),
    type: str = Query(None, description="Filter by type: recommended|past|new"),
):
    """
    Return vendor list.
    Optionally filter by material category and/or vendor type.
    Frontend uses this to show matched vendors for extracted items.
    """
    vendors = VENDOR_SEED

    if category:
        vendors = [
            v for v in vendors
            if any(category.lower() in c.lower() for c in v["categories"])
        ]

    if type:
        vendors = [v for v in vendors if v["type"] == type]

    return {"vendors": vendors, "total": len(vendors)}


# ── POST /email/vendor-quote ───────────────────────────────────────────────────

@router.post("/email/vendor-quote")
async def send_vendor_quote_email(body: VendorQuoteRequest):
    """
    Send material quote request email to selected vendors.

    Builds a professional email with project info, material table and
    reply deadline. Uses SMTP settings from environment variables.
    If SMTP is not configured, returns the email body as a preview.
    """
    import smtplib
    import datetime
    import os as _os
    from html import escape
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    def build_material_table(materials: List[MaterialItem]) -> str:
        lines = []
        lines.append(
            f"{'No.':<4} {'Material Description':<45} {'Qty':>10} {'Unit':<8} {'Category'}"
        )
        lines.append("-" * 90)
        for i, mat in enumerate(materials, 1):
            qty = str(mat.quantity) if mat.quantity is not None else "TBD"
            lines.append(
                f"{i:<4} {mat.description[:44]:<45} {qty:>10} "
                f"{(mat.unit or '-'):<8} {mat.category or ''}"
            )
        return "\n".join(lines)

    def build_material_rows_html(materials: List[MaterialItem]) -> str:
        rows = []
        for i, mat in enumerate(materials, 1):
            qty = str(mat.quantity) if mat.quantity is not None else "TBD"
            rows.append(
                "<tr>"
                f"<td style='padding:10px;border:1px solid #e5e7eb;text-align:center;'>{i}</td>"
                f"<td style='padding:10px;border:1px solid #e5e7eb;'>{escape(mat.description or '')}</td>"
                f"<td style='padding:10px;border:1px solid #e5e7eb;text-align:right;'>{escape(qty)}</td>"
                f"<td style='padding:10px;border:1px solid #e5e7eb;text-align:center;'>{escape(mat.unit or '-')}</td>"
                f"<td style='padding:10px;border:1px solid #e5e7eb;'>{escape(mat.category or '')}</td>"
                "</tr>"
            )
        return "".join(rows)

    reply_by = (
        datetime.date.today() + datetime.timedelta(days=body.reply_by_days)
    ).strftime("%d %B %Y")

    material_table = build_material_table(body.materials)
    material_rows_html = build_material_rows_html(body.materials)

    email_body = f"""Dear Vendor,

Greetings from {body.requester_name}.

We are working on a construction project and require the following
materials. Please provide your best quotation at the earliest.

Project: {body.project_name}
Quote Required By: {reply_by}

MATERIAL REQUIREMENTS:
{material_table}

Please include in your quotation:
    - Applicable taxes and duties
  - Delivery lead time
  - Quote validity period
  - Brand / make of material

Kindly reply to this email or contact:
  Name  : {body.requester_name}
  Email : {body.requester_email or 'reply to this email'}

Thank you for your prompt response.

Regards,
{body.requester_name}
{body.project_name}

---
This quote request was generated by FlyyyAI Construction Intelligence Platform.
"""

    email_html = f"""
<html>
    <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1f2937;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 0;background:#f8fafc;">
            <tr>
                <td align="center">
                    <table role="presentation" width="820" cellspacing="0" cellpadding="0" style="max-width:820px;width:95%;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
                        <tr>
                            <td style="background:#111827;color:#f9fafb;padding:18px 24px;">
                                <div style="font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:#f59e0b;font-weight:700;">FlyyyAI Construction Intelligence</div>
                                <div style="font-size:20px;font-weight:700;margin-top:6px;">Material Quote Request</div>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:24px;">
                                <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;">Dear Vendor,</p>
                                <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;">
                                    Greetings from {escape(body.requester_name)}. We are working on a construction project and request your quotation for the materials listed below.
                                </p>
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:14px 0 18px 0;border-collapse:separate;border-spacing:0;">
                                    <tr>
                                        <td style="background:#f8fafc;border:1px solid #e5e7eb;padding:10px;font-size:12px;"><strong>Project</strong><br/>{escape(body.project_name)}</td>
                                        <td style="background:#f8fafc;border:1px solid #e5e7eb;padding:10px;font-size:12px;"><strong>Quote Required By</strong><br/>{reply_by}</td>
                                    </tr>
                                </table>

                                <div style="font-size:13px;font-weight:700;margin:10px 0 8px 0;">Material Requirements</div>
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:12px;">
                                    <thead>
                                        <tr style="background:#111827;color:#f9fafb;">
                                            <th style="padding:10px;border:1px solid #1f2937;width:56px;">No.</th>
                                            <th style="padding:10px;border:1px solid #1f2937;text-align:left;">Material Description</th>
                                            <th style="padding:10px;border:1px solid #1f2937;width:90px;">Qty</th>
                                            <th style="padding:10px;border:1px solid #1f2937;width:90px;">Unit</th>
                                            <th style="padding:10px;border:1px solid #1f2937;width:190px;text-align:left;">Category</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {material_rows_html}
                                    </tbody>
                                </table>

                                <p style="margin:18px 0 8px 0;font-size:13px;font-weight:700;">Please include in your quotation:</p>
                                <ul style="margin:0 0 14px 18px;padding:0;font-size:13px;line-height:1.7;">
                                    <li>Applicable taxes and duties</li>
                                    <li>Delivery lead time</li>
                                    <li>Quote validity period</li>
                                    <li>Brand / make of material</li>
                                </ul>

                                <p style="margin:0 0 10px 0;font-size:13px;line-height:1.6;">
                                    Kindly reply to this email or contact:<br/>
                                    <strong>Name:</strong> {escape(body.requester_name)}<br/>
                                    <strong>Email:</strong> {escape(body.requester_email or 'reply to this email')}
                                </p>

                                <p style="margin:14px 0 0 0;font-size:13px;line-height:1.6;">
                                    Regards,<br/>
                                    {escape(body.requester_name)}<br/>
                                    {escape(body.project_name)}
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:12px 24px;background:#f8fafc;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280;">
                                This quote request was generated by FlyyyAI Construction Intelligence Platform.
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
</html>
"""

    subject = f"Material Quote Request — {body.project_name}"

    smtp_host = _os.getenv("SMTP_HOST", "")
    smtp_port = int(_os.getenv("SMTP_PORT", "587"))
    smtp_user = _os.getenv("SMTP_USER", "")
    smtp_pass = _os.getenv("SMTP_PASSWORD", "")
    smtp_from = _os.getenv("SMTP_FROM_NAME", "FlyyyAI Platform")

    sent_to: List[str] = []
    failed_to: List[str] = []
    smtp_configured = bool(smtp_host and smtp_user and smtp_pass)

    if smtp_configured:
        for vendor_email in body.vendor_emails:
            try:
                msg = MIMEMultipart("alternative")
                msg["From"] = f"{smtp_from} <{smtp_user}>"
                msg["To"] = vendor_email
                msg["Subject"] = subject
                if body.requester_email:
                    msg["Reply-To"] = body.requester_email
                msg.attach(MIMEText(email_body, "plain"))
                msg.attach(MIMEText(email_html, "html"))

                with smtplib.SMTP(smtp_host, smtp_port) as server:
                    server.starttls()
                    server.login(smtp_user, smtp_pass)
                    server.send_message(msg)

                sent_to.append(vendor_email)
                logger.info(f"[Email] Sent to {vendor_email}")

            except Exception as e:
                failed_to.append(vendor_email)
                logger.error(f"[Email] Failed for {vendor_email}: {e}")
    else:
        logger.warning("[Email] SMTP not configured — returning preview only")

    return {
        "success": smtp_configured and len(failed_to) == 0,
        "smtp_configured": smtp_configured,
        "sent_to": sent_to,
        "failed_to": failed_to,
        "preview_mode": not smtp_configured,
        "email_subject": subject,
        "email_body": email_body,
        "email_html": email_html,
        "vendors_count": len(body.vendor_emails),
        "materials_count": len(body.materials),
    }

