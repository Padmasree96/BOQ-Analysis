import os
import tempfile
from pathlib import Path
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


# ── Real Indian construction vendor database ───────────────────────────────────

VENDOR_SEED: List[Dict] = [

    # ── ELECTRICAL ──────────────────────────────────────────────────────────────
    {
        "id": "v-polycab",
        "name": "Polycab India Ltd",
        "email": "projectsales@polycab.com",
        "phone": "+91-22-6789-9000",
        "location": "Mumbai, Maharashtra",
        "categories": ["Electrical"],
        "specialization": ["Wires & Cables", "Conduits", "Wiring Accessories"],
        "rating": 4.8,
        "type": "recommended",
        "contact_person": "Projects Division",
        "certifications": ["ISO 9001:2015", "BIS Certified", "NABL Accredited"],
        "past_projects": [
            {"project": "Apollo Hospital Phase 1", "material": "FRLS Cable", "qty": "8,000 m", "delivery": 4.9, "quality": 4.8},
            {"project": "DLF Tech Park", "material": "XLPE Cable", "qty": "7,000 m", "delivery": 4.7, "quality": 4.9},
        ],
        "makes_approved": True,
        "gst_no": "27AAACF3267L1ZZ",
        "type_badge": "recommended",
    },
    {
        "id": "v-havells",
        "name": "Havells India Ltd",
        "email": "institutionalsales@havells.com",
        "phone": "+91-120-3331000",
        "location": "Noida, Uttar Pradesh",
        "categories": ["Electrical"],
        "specialization": ["Switchgear", "MCB/MCCB", "Cables", "LED Lighting"],
        "rating": 4.7,
        "type": "recommended",
        "contact_person": "Enterprise & Projects Team",
        "certifications": ["ISO 9001:2015", "ISO 14001", "BIS Certified"],
        "past_projects": [
            {"project": "Godrej BKC Office", "material": "MCB Distribution Board", "qty": "45 Nos", "delivery": 4.8, "quality": 4.7},
            {"project": "Prestige Tech Park", "material": "LED Fixtures", "qty": "1200 Nos", "delivery": 4.6, "quality": 4.9},
        ],
        "makes_approved": True,
        "gst_no": "09AAACH3013H1ZC",
        "type_badge": "recommended",
    },
    {
        "id": "v-kei",
        "name": "KEI Industries Ltd",
        "email": "projects@kei-ind.com",
        "phone": "+91-11-26926300",
        "location": "New Delhi",
        "categories": ["Electrical"],
        "specialization": ["HT Cables", "LT Cables", "Control Cables", "XLPE Cables"],
        "rating": 4.5,
        "type": "past",
        "contact_person": "Mr. Anil Gupta — Project Sales",
        "certifications": ["ISO 9001:2015", "BIS Licensed"],
        "past_projects": [
            {"project": "NTPC Power Plant", "material": "HT XLPE Cable", "qty": "12,000 m", "delivery": 4.5, "quality": 4.6},
        ],
        "makes_approved": False,
        "gst_no": "07AAACK3849H1ZZ",
        "type_badge": "past",
    },
    {
        "id": "v-finolex",
        "name": "Finolex Cables Ltd",
        "email": "sales.projects@finolex.com",
        "phone": "+91-20-27407100",
        "location": "Pune, Maharashtra",
        "categories": ["Electrical"],
        "specialization": ["Building Wires", "Coaxial Cables", "Optical Fibre"],
        "rating": 4.4,
        "type": "new",
        "contact_person": "Regional Project Manager",
        "certifications": ["ISO 9001:2015", "BIS Certified"],
        "past_projects": [],
        "makes_approved": False,
        "type_badge": "new",
    },
    {
        "id": "v-legrand",
        "name": "Legrand (India) Pvt Ltd",
        "email": "projects.india@legrand.com",
        "phone": "+91-80-41936400",
        "location": "Bengaluru, Karnataka",
        "categories": ["Electrical", "IT & Communication"],
        "specialization": ["Switchgear", "Modular Switches", "Cable Management", "Data Networking"],
        "rating": 4.6,
        "type": "recommended",
        "contact_person": "Projects & Specifications Team",
        "certifications": ["ISO 9001:2015", "CE Marked"],
        "past_projects": [
            {"project": "Embassy Tech Village", "material": "Cable Trunking & Tray", "qty": "2,500 m", "delivery": 4.8, "quality": 4.7},
        ],
        "makes_approved": True,
        "type_badge": "recommended",
    },

    # ── PLUMBING & DRAINAGE ─────────────────────────────────────────────────────
    {
        "id": "v-supreme",
        "name": "Supreme Industries Ltd",
        "email": "pipes.projects@supremeindustries.net",
        "phone": "+91-22-25169200",
        "location": "Mumbai, Maharashtra",
        "categories": ["Plumbing & Drainage"],
        "specialization": ["CPVC Pipes", "uPVC Pipes", "SWR Pipes", "HDPE Pipes"],
        "rating": 4.6,
        "type": "recommended",
        "contact_person": "Piping Systems Division",
        "certifications": ["ISO 9001:2015", "BIS IS:4985", "ASTM Certified"],
        "past_projects": [
            {"project": "Max Hospital Delhi", "material": "CPVC Hot & Cold Pipe", "qty": "3,200 m", "delivery": 4.6, "quality": 4.7},
        ],
        "makes_approved": True,
        "type_badge": "recommended",
    },
    {
        "id": "v-astral",
        "name": "Astral Ltd",
        "email": "projectsales@astralpipes.com",
        "phone": "+91-79-66167200",
        "location": "Ahmedabad, Gujarat",
        "categories": ["Plumbing & Drainage"],
        "specialization": ["CPVC Pipes & Fittings", "uPVC Drainage", "PPR Pipes"],
        "rating": 4.7,
        "type": "recommended",
        "contact_person": "Mr. Jatin Mehta — Projects",
        "certifications": ["ISO 9001:2015", "NSF Certified", "BIS"],
        "past_projects": [
            {"project": "Hiranandani Gardens", "material": "CPVC Pipe System", "qty": "5,000 m", "delivery": 4.9, "quality": 4.8},
        ],
        "makes_approved": True,
        "type_badge": "recommended",
    },
    {
        "id": "v-wavin",
        "name": "Wavin India Pvt Ltd",
        "email": "projects@wavin.in",
        "phone": "+91-20-27141000",
        "location": "Pune, Maharashtra",
        "categories": ["Plumbing & Drainage"],
        "specialization": ["uPVC Pipes", "HDPE Drainage", "Soil & Waste System"],
        "rating": 4.5,
        "type": "past",
        "contact_person": "Technical Projects Team",
        "certifications": ["ISO 9001:2015", "BIS IS:4985"],
        "past_projects": [],
        "makes_approved": False,
        "type_badge": "past",
    },

    # ── CIVIL & STRUCTURAL ──────────────────────────────────────────────────────
    {
        "id": "v-ultratech",
        "name": "UltraTech Cement Ltd",
        "email": "bulksales@ultratechcement.com",
        "phone": "+91-22-66917800",
        "location": "Mumbai, Maharashtra",
        "categories": ["Civil & Structural"],
        "specialization": ["OPC Cement", "PPC Cement", "Ready Mix Concrete", "Dry Mix Products"],
        "rating": 4.8,
        "type": "recommended",
        "contact_person": "Bulk & Projects Division",
        "certifications": ["ISO 9001:2015", "ISO 14001", "BIS"],
        "past_projects": [
            {"project": "Bandra-Kurla Complex Tower", "material": "PPC Cement", "qty": "2,500 MT", "delivery": 4.7, "quality": 4.9},
        ],
        "makes_approved": True,
        "type_badge": "recommended",
    },
    {
        "id": "v-tata-steel",
        "name": "Tata Steel Ltd",
        "email": "construction@tatasteel.com",
        "phone": "+91-657-6612233",
        "location": "Jamshedpur, Jharkhand",
        "categories": ["Civil & Structural"],
        "specialization": ["TMT Reinforcement Bar", "Structural Steel", "HR Plates", "MS Channels"],
        "rating": 4.9,
        "type": "recommended",
        "contact_person": "Construction Products Division",
        "certifications": ["ISO 9001:2015", "BIS IS:1786", "CE Marked"],
        "past_projects": [
            {"project": "Mumbai Metro Line 3", "material": "TMT Fe500D Rebar", "qty": "850 MT", "delivery": 4.8, "quality": 5.0},
        ],
        "makes_approved": True,
        "type_badge": "recommended",
    },
    {
        "id": "v-jsw",
        "name": "JSW Steel Ltd",
        "email": "projects@jsw.in",
        "phone": "+91-22-42861000",
        "location": "Mumbai, Maharashtra",
        "categories": ["Civil & Structural"],
        "specialization": ["TMT Rebar", "HR Coils", "Galvanised Steel", "Pre-engineered Buildings"],
        "rating": 4.7,
        "type": "past",
        "contact_person": "Projects & Infrastructure Sales",
        "certifications": ["ISO 9001:2015", "BIS IS:1786"],
        "past_projects": [],
        "makes_approved": False,
        "type_badge": "past",
    },

    # ── MECHANICAL & HVAC ───────────────────────────────────────────────────────
    {
        "id": "v-daikin",
        "name": "Daikin Air Conditioning India Pvt Ltd",
        "email": "commercial.projects@daikin.co.in",
        "phone": "+91-11-40505060",
        "location": "New Delhi",
        "categories": ["Mechanical & HVAC"],
        "specialization": ["AHU", "Chillers", "VRV/VRF Systems", "FCU", "Precision AC"],
        "rating": 4.7,
        "type": "recommended",
        "contact_person": "Commercial HVAC Projects",
        "certifications": ["ISO 9001:2015", "AHRI Certified", "BEE 5-Star"],
        "past_projects": [
            {"project": "Infosys Campus Bengaluru", "material": "VRV System", "qty": "450 TR", "delivery": 4.7, "quality": 4.8},
        ],
        "makes_approved": True,
        "type_badge": "recommended",
    },
    {
        "id": "v-bluestar",
        "name": "Blue Star Ltd",
        "email": "projectsales@bluestarindia.com",
        "phone": "+91-22-66654000",
        "location": "Mumbai, Maharashtra",
        "categories": ["Mechanical & HVAC"],
        "specialization": ["Chillers", "AHU", "FCU", "Ducted AC", "Cold Rooms"],
        "rating": 4.6,
        "type": "recommended",
        "contact_person": "Central Projects Division",
        "certifications": ["ISO 9001:2015", "AHRI", "BEE"],
        "past_projects": [
            {"project": "Fortis Hospital", "material": "Chiller + AHU", "qty": "600 TR", "delivery": 4.5, "quality": 4.7},
        ],
        "makes_approved": True,
        "type_badge": "recommended",
    },
    {
        "id": "v-ductman",
        "name": "National Ductfab Pvt Ltd",
        "email": "info@nationalductfab.com",
        "phone": "+91-44-42146666",
        "location": "Chennai, Tamil Nadu",
        "categories": ["Mechanical & HVAC"],
        "specialization": ["GI Ductwork", "Insulated Duct", "Flexible Duct", "Diffusers"],
        "rating": 4.3,
        "type": "new",
        "contact_person": "Mr. Rajan — Technical Sales",
        "certifications": ["ISO 9001:2015", "SMACNA Compliant"],
        "past_projects": [],
        "makes_approved": False,
        "type_badge": "new",
    },

    # ── FIRE PROTECTION ─────────────────────────────────────────────────────────
    {
        "id": "v-honeywell",
        "name": "Honeywell Automation India Ltd",
        "email": "fire.india@honeywell.com",
        "phone": "+91-20-67720000",
        "location": "Pune, Maharashtra",
        "categories": ["Fire Protection"],
        "specialization": ["Fire Alarm Systems", "Addressable Detectors", "Fire Suppression", "Sprinklers"],
        "rating": 4.7,
        "type": "recommended",
        "contact_person": "Fire Safety Projects Team",
        "certifications": ["ISO 9001:2015", "UL Listed", "FM Approved", "BIS"],
        "past_projects": [
            {"project": "Wipro HQ", "material": "Addressable Fire Alarm", "qty": "1 System", "delivery": 4.8, "quality": 4.7},
        ],
        "makes_approved": True,
        "type_badge": "recommended",
    },
    {
        "id": "v-minimax",
        "name": "Minimax India Pvt Ltd",
        "email": "sales@minimaxindia.com",
        "phone": "+91-44-28140200",
        "location": "Chennai, Tamil Nadu",
        "categories": ["Fire Protection"],
        "specialization": ["Fire Hydrant System", "Sprinkler System", "FM200 Suppression", "Fire Pumps"],
        "rating": 4.5,
        "type": "past",
        "contact_person": "Projects Division",
        "certifications": ["ISO 9001:2015", "VdS Certified", "TAC Approved"],
        "past_projects": [
            {"project": "Chennai IT Park", "material": "Sprinkler System", "qty": "1 System", "delivery": 4.4, "quality": 4.6},
        ],
        "makes_approved": True,
        "type_badge": "past",
    },

    # ── FINISHING & INTERIORS ───────────────────────────────────────────────────
    {
        "id": "v-kajaria",
        "name": "Kajaria Ceramics Ltd",
        "email": "projects@kajariaceramics.com",
        "phone": "+91-11-39898000",
        "location": "New Delhi",
        "categories": ["Finishing & Interiors"],
        "specialization": ["Vitrified Tiles", "Ceramic Tiles", "Porcelain Slabs", "Sanitary Ware"],
        "rating": 4.6,
        "type": "recommended",
        "contact_person": "Project Sales Division",
        "certifications": ["ISO 9001:2015", "Green Building Certified"],
        "past_projects": [
            {"project": "Lodha World Towers", "material": "Vitrified Tiles", "qty": "8,000 sqm", "delivery": 4.6, "quality": 4.8},
        ],
        "makes_approved": True,
        "type_badge": "recommended",
    },
    {
        "id": "v-asianpaints",
        "name": "Asian Paints Ltd",
        "email": "b2bsales@asianpaints.com",
        "phone": "+91-22-39818000",
        "location": "Mumbai, Maharashtra",
        "categories": ["Finishing & Interiors"],
        "specialization": ["Exterior Paint", "Interior Emulsion", "Waterproofing", "Texture Finish"],
        "rating": 4.7,
        "type": "recommended",
        "contact_person": "Projects & Specifications Team",
        "certifications": ["ISO 9001:2015", "Green Seal Certified"],
        "past_projects": [
            {"project": "Tata Elxsi Campus", "material": "Exterior & Interior Paint", "qty": "15,000 L", "delivery": 4.7, "quality": 4.8},
        ],
        "makes_approved": True,
        "type_badge": "recommended",
    },

    # ── IT & COMMUNICATION ──────────────────────────────────────────────────────
    {
        "id": "v-systimax",
        "name": "CommScope India Pvt Ltd (Systimax)",
        "email": "india.projects@commscope.com",
        "phone": "+91-80-66540000",
        "location": "Bengaluru, Karnataka",
        "categories": ["IT & Communication"],
        "specialization": ["Structured Cabling", "Fibre Optic", "Data Networking", "PA Systems"],
        "rating": 4.6,
        "type": "recommended",
        "contact_person": "Enterprise Solutions",
        "certifications": ["ISO 9001:2015", "ISO/IEC 11801"],
        "past_projects": [
            {"project": "Deloitte India HQ", "material": "Structured Cabling Cat6A", "qty": "1 System", "delivery": 4.6, "quality": 4.7},
        ],
        "makes_approved": True,
        "type_badge": "recommended",
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
                from_name = body.requester_name or smtp_from
                msg["From"] = f"{from_name} <{smtp_user}>"
                msg["To"] = vendor_email
                msg["Subject"] = subject
                # Always set Reply-To to the engineer's email so vendors reply directly
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


# ══════════════════════════════════════════════════════════════════════════════
# NEW FEATURE ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

# ── POST /extract-cad ─────────────────────────────────────────────────────────

_ALLOWED_CAD_EXTS = {".dwg", ".dxf", ".pdf"}
_CAD_MAX_BYTES = int(os.getenv("CAD_MAX_FILE_MB", "50")) * 1024 * 1024


@router.post("/extract-cad")
async def extract_cad_file(
    file: UploadFile = File(...),
    industry: str = Query(default="construction"),
):
    """
    Extract material schedule from a CAD drawing file.
    Uses 5-agent LangGraph pipeline: reader → reconstructor → embedder → extractor → aggregator.
    Supports .dwg, .dxf, .pdf
    """
    ext = Path(file.filename).suffix.lower()
    if ext not in _ALLOWED_CAD_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{ext}'. Allowed: {sorted(_ALLOWED_CAD_EXTS)}",
        )

    contents = await file.read()
    if len(contents) > _CAD_MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum allowed: {os.getenv('CAD_MAX_FILE_MB','50')} MB",
        )

    try:
        from app.graphs.cad_langgraph import run_cad_extraction
        result = run_cad_extraction(contents, file.filename)
        return result

    except Exception as e:
        logger.error(f"[Route] CAD extraction failed: {e}")
        raise HTTPException(status_code=500, detail=f"CAD extraction failed: {str(e)}")


# ── POST /compare ─────────────────────────────────────────────────────────────

class CompareRequest(BaseModel):
    boq_items: List[Dict]
    cad_items: List[Dict]
    project_name: str = "Construction Project"
    boq_filename: str = "BOQ.xlsx"
    cad_filename: str = "Drawing.dwg"
    qty_tolerance_pct: float = 10.0


@router.post("/compare")
async def compare_extractions(body: CompareRequest):
    """
    Compare BOQ extracted items vs CAD extracted items.

    Returns matched / mismatched / missing items.
    is_approved=True means it is safe to proceed to the vendor page.
    """
    from app.services.comparison_engine import compare_boq_vs_cad, build_engineer_report

    try:
        result = compare_boq_vs_cad(
            body.boq_items,
            body.cad_items,
            body.qty_tolerance_pct,
        )

        email_body = build_engineer_report(
            result,
            body.project_name,
            body.boq_filename,
            body.cad_filename,
        )

        return {
            **result.model_dump(),
            "email_body": email_body,
            "email_subject": (
                f"FlyyyAI BOQ Review — {body.project_name} — "
                f"{result.issues_count} Issue(s) Found"
            ),
        }

    except Exception as e:
        logger.error(f"[Route] Comparison failed: {e}")
        raise HTTPException(status_code=500, detail=f"Comparison failed: {str(e)}")


# ── POST /email/engineer-report ───────────────────────────────────────────────

class EngineerEmailRequest(BaseModel):
    to_email: str
    subject: str
    body: str
    project_name: str = "Construction Project"


@router.post("/email/engineer-report")
async def send_engineer_report(body: EngineerEmailRequest):
    """
    Send BOQ vs CAD comparison report to an engineer via email.
    Falls back to preview mode when SMTP is not configured.
    """
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASSWORD", "")
    smtp_from = os.getenv("SMTP_FROM_NAME", "FlyyyAI Platform")
    configured = bool(smtp_host and smtp_user and smtp_pass)

    if configured:
        try:
            msg = MIMEMultipart()
            msg["From"]    = f"{smtp_from} <{smtp_user}>"
            msg["To"]      = body.to_email
            msg["Subject"] = body.subject
            msg.attach(MIMEText(body.body, "plain"))

            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.send_message(msg)

            logger.info(f"[Email] Engineer report sent to {body.to_email}")
            return {
                "success": True,
                "sent_to": body.to_email,
                "preview_mode": False,
            }
        except Exception as e:
            logger.error(f"[Email] Engineer report send failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "preview_mode": False,
            }
    else:
        logger.warning("[Email] SMTP not configured — returning preview for engineer report")
        return {
            "success": False,
            "preview_mode": True,
            "sent_to": body.to_email,
            "email_subject": body.subject,
            "email_body": body.body,
            "message": "SMTP not configured. Copy the email body and send manually.",
        }
