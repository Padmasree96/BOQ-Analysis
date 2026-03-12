# MyFlyai — Construction BOQ Intelligence Platform

> AI-powered Bill of Quantities extraction, classification, and risk analysis engine for the construction & EPC industry.

---

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Extraction Pipeline](#extraction-pipeline)
- [4-Layer Classification Engine](#4-layer-classification-engine)
- [Knowledge Base & Learning Loop](#knowledge-base--learning-loop)
- [API Reference](#api-reference)
- [Frontend Dashboard](#frontend-dashboard)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Tech Stack](#tech-stack)
- [How It Works — End to End](#how-it-works--end-to-end)
- [Risk Engine](#risk-engine)
- [Troubleshooting](#troubleshooting)

---

## Overview

**MyFlyai** takes raw construction BOQ Excel files — often containing long paragraphs, merged cells, multi-line descriptions, and inconsistent formatting — and transforms them into structured, categorized material lists with analytics and risk scoring.

### What It Solves

| Problem | Solution |
|---------|----------|
| BOQ cells contain paragraphs, not item names | Knowledge-based material scanning extracts individual materials from long text |
| No standard column naming across contractors | Fuzzy column matching auto-detects description, quantity, unit, brand columns |
| Materials are uncategorized | 4-layer classification pipeline (rules → ontology → graph → AI) |
| New materials appear in every project | Gemini AI learning loop — classifies once, remembers forever |
| No visibility into project risk | Automated risk engine scores extraction quality, category balance, price volatility |

### Key Numbers

| Metric | Value |
|--------|-------|
| Knowledge base entries | 513+ material keywords (auto-built from 3 sources) |
| Construction categories | 8 (Civil, Electrical, Plumbing, HVAC, Firefighting, Finishing, External, Other) |
| Ontology keywords | 272 across 7 categories |
| Seed materials (graph) | 40 with 205 synonyms (grows via AI learning loop) |
| Classification layers | 4 (EPC → Ontology → Graph → Gemini AI) |

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                          │
│  ┌──────────┐  ┌──────────────┐  ┌────────┐  ┌──────────────┐  │
│  │UploadZone│  │ResultsDashboard│  │DataTable│  │CategorySidebar│ │
│  └────┬─────┘  └──────▲───────┘  └───▲────┘  └──────▲───────┘  │
│       │               │              │               │           │
│       └───────────────┴──────────────┴───────────────┘           │
│                            BoqService.js (Axios)                 │
└──────────────────────────────┬───────────────────────────────────┘
                               │ HTTP (port 5173 → proxy → 8000)
┌──────────────────────────────▼───────────────────────────────────┐
│                        BACKEND (FastAPI)                          │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │                    API Layer (routes.py)                  │     │
│  │  POST /extract  POST /upload-excel  POST /analyze        │     │
│  │  POST /risk     GET /graph-stats                         │     │
│  └─────────┬───────────────┬──────────────────┬────────────┘     │
│            │               │                  │                   │
│  ┌─────────▼──────┐ ┌─────▼──────────┐ ┌────▼─────────────┐    │
│  │ Excel Analyzer  │ │ BOQ Analyzer   │ │ Risk Engine      │    │
│  │ (orchestrator)  │ │ (analytics)    │ │ (risk scoring)   │    │
│  └────────┬────────┘ └────────────────┘ └──────────────────┘    │
│           │                                                      │
│  ┌────────▼─────────────────────────────────────────────┐       │
│  │              EXTRACTION PIPELINE                      │       │
│  │                                                       │       │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │       │
│  │  │Header Detector│  │Column Matcher │  │Text Cleaner│ │       │
│  │  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │       │
│  │         │                 │                 │         │       │
│  │  ┌──────▼─────────────────▼─────────────────▼──────┐ │       │
│  │  │            BOQ Extractor (core engine)           │ │       │
│  │  │  • Material lookup scan (long text)              │ │       │
│  │  │  • Validate + classify (short text)              │ │       │
│  │  └──────────────────────┬──────────────────────────┘ │       │
│  │                         │                             │       │
│  │  ┌──────────────────────▼──────────────────────────┐ │       │
│  │  │         4-LAYER CLASSIFICATION ENGINE            │ │       │
│  │  │  L1: EPC Keyword Match (settings.py)            │ │       │
│  │  │  L2: Ontology Regex (boq_ontology.json)         │ │       │
│  │  │  L3: Knowledge Graph (material_graph.json)      │ │       │
│  │  │  L4: Google Gemini AI (gemini-2.0-flash)        │ │       │
│  │  └──────────────────────┬──────────────────────────┘ │       │
│  │                         │                             │       │
│  │  ┌──────────────────────▼──────────────────────────┐ │       │
│  │  │  Deduplication + Normalization + Grouping       │ │       │
│  │  └────────────────────────────────────────────────-┘ │       │
│  └───────────────────────────────────────────────────────┘       │
│                                                                   │
│  ┌───────────────────────────────────────────────────────┐       │
│  │              KNOWLEDGE BASE (JSON files)               │       │
│  │  ┌──────────────────┐  ┌────────────────────────────┐ │       │
│  │  │ boq_ontology.json│  │ material_graph.json        │ │       │
│  │  │ (234 keywords)   │  │ (40 materials + synonyms)  │ │       │
│  │  │ (static)         │  │ (dynamic — grows via AI)   │ │       │
│  │  └──────────────────┘  └────────────────────────────┘ │       │
│  └───────────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────────┘
```

---

## Extraction Pipeline

When a BOQ Excel file is uploaded, this is the step-by-step process:

### Step 1 — File Intake & Sheet Iteration

```
Excel file (.xlsx / .xls)
  └── Sheet 1: "Civil Works"
  └── Sheet 2: "Electrical"
  └── Sheet 3: "HVAC"
  └── ... (processes ALL sheets)
```

The `excel_analyzer.process_excel()` orchestrator opens the workbook and iterates every sheet.

### Step 2 — Header Row Detection

```python
# boq_table_detector.py
# Scans the first 20 rows of each sheet
# Counts matches against HEADER_KEYWORDS:
#   "description", "item", "material", "qty", "quantity",
#   "unit", "rate", "amount", "brand", "make", "uom" ...
# Returns the row with the most keyword hits
```

Many BOQ files have title rows, logo rows, or metadata before the actual table starts. The detector skips these automatically.

### Step 3 — Fuzzy Column Matching

```python
# column_identifier.py
# Maps actual Excel column names to semantic fields using RapidFuzz

# "Item Description"    →  description  (via fuzzy match at 70% threshold)
# "Qty"                 →  quantity
# "Unit of Measurement" →  unit
# "Manufacturer"        →  brand
```

This handles the reality that every contractor names their columns differently.

### Step 4 — Multiline Description Merging

```
Before:                              After:
Row 1: "Supply and install"          Row 1: "Supply and install complete
Row 2: "complete HVAC system"               HVAC system with all ductwork"
Row 3: "with all ductwork"                  (qty=5, unit=set)
        (qty=5, unit=set)
```

Continuation rows (text without numeric values) are merged into the preceding row.

### Step 5 — Material Extraction (The Core)

Two paths based on description length:

**Long Text (> 80 characters) — Knowledge-Based Material Scanning:**
```
Input:  "Providing and fixing of complete fire alarm system including
         smoke detectors, heat detectors, manual call points, hooters,
         fire alarm panel, response indicator, junction boxes, wiring
         with 1.5 sq mm 2 core armoured cable..."

Output: [
  {description: "Fire Alarm System",    category: "Firefighting"},
  {description: "Smoke Detector",       category: "Firefighting"},
  {description: "Fire Alarm Panel",     category: "Firefighting"},
  {description: "Cable",               category: "Electrical"},
]
```

The `extract_materials_from_text()` function scans against a pre-built lookup of 513+ material keywords (sorted longest-first for priority), using word-boundary regex matching.

**Short Text (≤ 80 characters) — Validate + Classify:**
```
Input:  "RCC Work M40 Grade"

Validation: is_valid_product() ✓
  - Not a total/note/section header
  - Not a drawing/design description
  - Not a building name
  - Contains letters, not just numbers

Classification: classify_category()
  → L1: "concrete" keyword match → "Civil & Structural" ✓
```

### Step 6 — Filtering

Items are rejected if they match any of these patterns:

| Filter | Example Rejected |
|--------|------------------|
| Section headers | "Science Laboratory Building (Ground +2 upper floors)" |
| Non-material text | "Architectural designs and development of detailed drawings" |
| Totals/notes | "Total amount", "Note: All items as per specification" |
| Pure numbers | "1234.56" |
| Dimension-only | "200mm x 300mm" |
| List markers | "a) Including all accessories" |
| Fragment starters | "including all necessary items" |

### Step 7 — Deduplication

```python
# product_normalizer.py
# Uses RapidFuzz (85% threshold) to merge near-duplicates:

# "RCC Work"     + "RCC Work M40"     → "RCC Work M40"     (keeps longer)
# qty: 500       + qty: 300           → qty: 800            (sums)
# cat: Uncategorized + cat: Civil     → cat: Civil          (keeps specific)
```

### Step 8 — Category Grouping

Items are grouped into a `{category: [items]}` dictionary for the response and dashboard display.

---

## 4-Layer Classification Engine

```
┌─────────────────────────────────────────────────────────┐
│  Input: "XLPE armoured cable 3.5 core 240 sq mm"       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Layer 1: EPC Keyword Match (settings.py)               │
│  ┌───────────────────────────────────────────────┐      │
│  │ Check: does text contain "cable"?  → YES      │      │
│  │ Result: "Electrical" ✓  STOP                  │      │
│  └───────────────────────────────────────────────┘      │
│                                                         │
│  Layer 2: Ontology Regex (boq_ontology.json)            │
│  ┌───────────────────────────────────────────────┐      │
│  │ Word-boundary regex: \bcable\b in text?       │      │
│  │ (only reached if L1 misses)                   │      │
│  └───────────────────────────────────────────────┘      │
│                                                         │
│  Layer 3: Knowledge Graph (material_graph.json)         │
│  ┌───────────────────────────────────────────────┐      │
│  │ Match against 40 materials + 150+ synonyms    │      │
│  │ (only reached if L1 + L2 miss)                │      │
│  └───────────────────────────────────────────────┘      │
│                                                         │
│  Layer 4: "Uncategorized"                               │
│  ┌───────────────────────────────────────────────┐      │
│  │ Flagged for Gemini AI classification           │      │
│  │ (in /upload-excel endpoint only)              │      │
│  └───────────────────────────────────────────────┘      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Layer Details

| Layer | Source File | Data Source | Matching Method | Speed |
|-------|------------|-------------|-----------------|-------|
| L1 | `settings.py` | `EPC_CATEGORY_RULES` (8 categories, ~180 keywords) | Case-insensitive substring | ~0.01ms |
| L2 | `ontology_mapper.py` | `boq_ontology.json` (7 categories, ~234 keywords) | Word-boundary regex (`\bkeyword\b`) | ~0.1ms |
| L3 | `graph_matcher.py` | `material_graph.json` (40+ materials, 150+ synonyms) | Word-boundary regex on canonical names + synonyms | ~0.2ms |
| L4 | `excel_graph.py` | Google Gemini 2.0 Flash API | LLM structured extraction | ~2-5s per chunk |

---

## Knowledge Base & Learning Loop

### Static Knowledge: `boq_ontology.json`

```json
{
  "Civil & Structural": ["cement", "sand", "aggregate", "rebar", "reinforcement", ...],
  "Plumbing & Drainage": ["ppr pipe", "hdpe pipe", "upvc pipe", "ball valve", ...],
  "Electrical": ["cable", "wire", "conduit", "distribution board", "led", ...],
  "HVAC": ["ahu", "air handling unit", "chiller", "cooling tower", "duct", ...],
  "Firefighting": ["sprinkler", "fire hydrant", "smoke detector", "fire pump", ...],
  "Finishing & Interior": ["vitrified tile", "ceramic tile", "false ceiling", ...],
  "External Works": ["road", "asphalt", "fencing", "landscaping", "parking", ...]
}
```

### Dynamic Knowledge: `material_graph.json`

```json
{
  "version": "1.0",
  "materials": [
    {
      "name": "Power Wiring",
      "category": "Electrical",
      "synonyms": ["power cable", "LT cable", "submain cable", "power wiring"],
      "typical_unit": "m",
      "source": "seed"
    },
    {
      "name": "Thermoplastic Pipe",
      "category": "Plumbing & Drainage",
      "synonyms": ["thermoplastic"],
      "typical_unit": "-",
      "source": "llm",
      "learned_at": "2026-03-12T10:30:00Z"
    }
  ]
}
```

### Learning Loop Flow

```
1. User uploads BOQ
2. Rule-based extraction finds: "Thermoplastic pipe" → Uncategorized
3. Gemini AI classifies: "Plumbing & Drainage"
4. graph_matcher.learn_material() saves to material_graph.json
5. Next upload: "Thermoplastic pipe" → instant L3 match → no AI needed
```

This means the system gets smarter with every upload.

---

## API Reference

### `POST /extract`

Rule-based extraction only. Fast, no external API calls.

**Request:**
```bash
curl -X POST "http://localhost:8000/extract?industry=construction" \
  -F "file=@BOQ.xlsx"
```

**Response:**
```json
{
  "total_sheets": 6,
  "sheets_with_data": 6,
  "extracted_items": 82,
  "items": [
    {
      "description": "RCC Work",
      "brand": "Generic",
      "quantity": 8841.0,
      "unit": "-",
      "category": "Civil & Structural"
    }
  ],
  "categories": {
    "Civil & Structural": [...],
    "Electrical": [...],
    "Plumbing & Drainage": [...]
  }
}
```

### `POST /upload-excel`

Full extraction with AI enhancement. Rule-based first, then Gemini for uncategorized items + learning loop.

**Request:** Same as `/extract`

**Response:** Same shape, but with AI-improved categories and new materials saved to graph.

### `POST /analyze`

Category analytics and insights.

**Request:**
```json
{
  "items": [
    {"description": "RCC Work", "quantity": 8841, "category": "Civil & Structural"},
    {"description": "Cable", "quantity": 11450, "category": "Electrical"}
  ]
}
```

**Response:**
```json
{
  "category_summary": {
    "Civil & Structural": {
      "count": 21,
      "total_quantity": 98432.0,
      "items_preview": ["RCC Work", "Concrete", "Reinforcement"]
    }
  },
  "top_5_by_quantity": [
    {"description": "Bitumen", "quantity": 32815.0, "category": "External Works"}
  ],
  "uncategorized": 0,
  "total_items": 82,
  "categories_found": 8
}
```

### `POST /risk`

Procurement and data-quality risk assessment.

**Request:** Same as `/analyze`

**Response:**
```json
{
  "risk_score": 25,
  "risk_level": "Low",
  "category_distribution": {
    "Civil & Structural": 25.6,
    "Electrical": 20.7
  },
  "flags": [
    {
      "type": "missing_quantities",
      "severity": "Medium",
      "message": "32% of items have zero quantity",
      "recommendation": "Review BOQ for missing quantity data"
    }
  ],
  "total_items_analyzed": 82
}
```

### `GET /graph-stats`

Knowledge graph statistics.

**Response:**
```json
{
  "total_materials": 42,
  "by_source": {"seed": 40, "llm": 2},
  "by_category": {
    "Electrical": 10,
    "Plumbing & Drainage": 9,
    "Civil & Structural": 6
  }
}
```

### Error Responses

| Status | Condition |
|--------|-----------|
| `400` | Invalid file type (not .xlsx/.xls) |
| `400` | File too large (>10 MB) |
| `500` | Processing error with detail message |

---

## Frontend Dashboard

### Components

| Component | Description |
|-----------|-------------|
| `Header` | Top navigation with branding and platform tagline |
| `UploadZone` | Drag-and-drop file upload with validation, loading state, and error display |
| `ResultsDashboard` | 4 stat cards + PieChart (category split) + BarChart (items per category) + risk flags + top 5 items |
| `CategorySidebar` | Clickable category list with item counts and color indicators for filtering |
| `DataTable` | Scrollable table showing all extracted items with category badges, supports filtering |

### User Flow

```
1. Open http://localhost:5173
2. Drag & drop a BOQ Excel file onto the upload zone
3. Click "Extract Materials"
4. View the dashboard:
   ├── Stat cards: Total Sheets, Materials Extracted, Categories, Risk Score
   ├── Pie chart: Category distribution
   ├── Bar chart: Items per category
   ├── Risk flags with severity and recommendations
   └── Top 5 materials by quantity
5. Click a category in the sidebar to filter the data table
6. Click "All Trades" to reset the filter
```

---

## Project Structure

```
MyFlyai/
├── .env.example                     # Environment variable template
├── .gitignore                       # Git ignore rules
├── README.md                        # This file
├── requirements.txt                 # Python dependencies
│
├── app/                             # ─── BACKEND ───────────────────
│   ├── __init__.py
│   ├── main.py                      # FastAPI app entry point + CORS
│   │
│   ├── api/
│   │   └── routes.py                # All 5 API endpoints
│   │
│   ├── config/
│   │   └── settings.py              # EPC rules, keywords, filters, configs
│   │
│   ├── models/
│   │   └── boq_schema.py            # Pydantic data models (BOQItem, etc.)
│   │
│   ├── services/                    # ─── EXTRACTION PIPELINE ───────
│   │   ├── excel_analyzer.py        # Top-level orchestrator
│   │   ├── boq_table_detector.py    # Auto-detect header rows
│   │   ├── column_identifier.py     # Fuzzy column matching
│   │   ├── boq_extractor.py         # Core extraction + material scanning
│   │   ├── category_classifier.py   # 4-layer classification cascade
│   │   ├── ontology_mapper.py       # L2: Ontology word-boundary matching
│   │   ├── graph_matcher.py         # L3: Knowledge graph + learning loop
│   │   └── paragraph_splitter.py    # Multi-system cell splitter
│   │
│   ├── graphs/
│   │   └── excel_graph.py           # L4: Google Gemini AI extraction
│   │
│   ├── analytics/
│   │   ├── boq_analyzer.py          # Category summaries + top items
│   │   └── risk_engine.py           # Risk scoring (4 risk types)
│   │
│   ├── utils/
│   │   ├── text_cleaner.py          # Text validation + section header detection
│   │   ├── fuzzy_matcher.py         # RapidFuzz wrappers
│   │   ├── data_cleaner.py          # DataFrame cleanup
│   │   └── product_normalizer.py    # Near-duplicate merging
│   │
│   └── knowledge/                   # ─── KNOWLEDGE BASE ───────────
│       ├── boq_ontology.json        # 7 categories × ~34 keywords (static)
│       └── material_graph.json      # 40+ materials + synonyms (dynamic)
│
└── boq-frontend/                    # ─── FRONTEND ──────────────────
    ├── package.json                 # NPM dependencies
    ├── vite.config.js               # Vite build config
    ├── tailwind.config.js           # Tailwind CSS config
    ├── postcss.config.js            # PostCSS config
    ├── index.html                   # HTML entry point
    ├── start-dev.bat                # Windows dev launcher
    │
    └── src/
        ├── main.jsx                 # React entry point
        ├── index.css                # Tailwind imports + global styles
        ├── App.jsx                  # Root component (state + orchestration)
        │
        ├── services/
        │   └── BoqService.js        # Axios API client (5 methods)
        │
        └── components/
            ├── Header.jsx           # Top navigation bar
            ├── UploadZone.jsx       # Drag-and-drop file upload
            ├── ResultsDashboard.jsx  # Charts, stats, risk flags
            ├── CategorySidebar.jsx  # Category filter sidebar
            └── DataTable.jsx        # Material items table
```

---

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- Google Gemini API key (free tier — optional, only needed for AI-enhanced extraction)

### Backend Setup

```bash
cd MyFlyai

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and add your GOOGLE_API_KEY (optional)

# Start the server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend Setup

```bash
cd boq-frontend

# Install dependencies
npm install

# Start dev server
npm run dev
# → Opens at http://localhost:5173
```

### Windows Quick Start

```batch
:: Backend (Terminal 1)
cd MyFlyai
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

:: Frontend (Terminal 2)
cd MyFlyai\boq-frontend
npm install
npm run dev
```

### Verify Installation

```bash
# Backend health check
curl http://localhost:8000/

# Knowledge graph stats
curl http://localhost:8000/graph-stats

# Test extraction
curl -X POST http://localhost:8000/extract -F "file=@your-boq.xlsx"
```

---

## Configuration

### Environment Variables (`.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_API_KEY` | No | Google Gemini API key. Only needed for `/upload-excel` AI fallback. Rule-based extraction (`/extract`) works without it. |
| `APP_ENV` | No | `development` or `production`. Default: `development` |

### Key Settings (`app/config/settings.py`)

| Setting | Default | Description |
|---------|---------|-------------|
| `HEADER_SCAN_LIMIT` | 20 | How many rows to scan for header detection |
| `MAX_PRODUCT_LENGTH` | 500 | Max characters for a valid product description |
| `MAX_REASONABLE_QUANTITY` | 999,999 | Cap on parsed quantities to prevent data errors |
| `EPC_CATEGORY_RULES` | 8 categories | Layer 1 keyword-to-category mapping |
| `NON_MATERIAL_PHRASES` | 45 phrases | Phrases that indicate non-material text (drawings, designs, etc.) |
| `INVALID_ROW_KEYWORDS` | 19 keywords | Row prefixes to skip (totals, notes, appendix, etc.) |

---

## Tech Stack

### Backend

| Technology | Purpose |
|-----------|---------|
| **FastAPI** | Async web framework with auto-generated OpenAPI docs |
| **Pandas** | Excel file reading and DataFrame manipulation |
| **RapidFuzz** | High-performance fuzzy string matching (column identification, deduplication) |
| **LangChain** + **Google Gemini** | AI-powered material extraction (Layer 4) |
| **Loguru** | Structured logging |
| **python-dotenv** | Environment variable management |
| **python-multipart** | File upload handling |

### Frontend

| Technology | Purpose |
|-----------|---------|
| **React 18** | Component-based UI |
| **Vite 5** | Fast build tool with HMR |
| **Tailwind CSS** | Utility-first styling |
| **Recharts** | Charts (PieChart, BarChart) |
| **Framer Motion** | Animations and transitions |
| **Axios** | HTTP client with timeout handling |
| **Lucide React** | Icon library |

---

## How It Works — End to End

```
USER                    FRONTEND                     BACKEND
 │                         │                            │
 │  Drag & drop BOQ.xlsx   │                            │
 │─────────────────────────>│                            │
 │                         │  POST /upload-excel         │
 │                         │───────────────────────────> │
 │                         │                            │
 │                         │              ┌─────────────┤
 │                         │              │ For each sheet:
 │                         │              │  1. detect_header_row()
 │                         │              │  2. identify_columns()
 │                         │              │  3. merge_multiline_descriptions()
 │                         │              │  4. For each row:
 │                         │              │     Long? → material scan
 │                         │              │     Short? → validate + classify
 │                         │              │  5. consolidate_duplicates()
 │                         │              │  6. group_by_category()
 │                         │              ├─────────────┤
 │                         │              │ AI Phase:
 │                         │              │  7. Filter uncategorized
 │                         │              │  8. Gemini AI classify
 │                         │              │  9. learn_material() → save
 │                         │              │ 10. Re-deduplicate + regroup
 │                         │              └─────────────┤
 │                         │                            │
 │                         │  {items, categories, ...}  │
 │                         │<─────────────────────────── │
 │                         │                            │
 │                         │  POST /analyze             │
 │                         │───────────────────────────> │
 │                         │  {category_summary, top_5}  │
 │                         │<─────────────────────────── │
 │                         │                            │
 │                         │  POST /risk                │
 │                         │───────────────────────────> │
 │                         │  {risk_score, flags}        │
 │                         │<─────────────────────────── │
 │                         │                            │
 │  Dashboard renders      │                            │
 │<─────────────────────────│                            │
 │  Charts + Table + Risks │                            │
```

---

## Risk Engine

The risk engine (`app/analytics/risk_engine.py`) analyzes extraction quality and procurement risk.

### Risk Types

| Risk Type | Severity | Trigger | Points |
|-----------|----------|---------|--------|
| `extraction_quality` | High | >15% items uncategorized | 30 |
| `category_imbalance` | Medium | One category has >60% of all items | 15 |
| `price_volatility` | Low | Volatile categories (Electrical, HVAC, Firefighting) with >5 items | 5 |
| `missing_quantities` | Medium | >30% of items have zero quantity | 15 |

### Risk Score Calculation

```
Score = sum of triggered risk points (capped at 100)

  >= 60  →  "High"    (red)
  >= 30  →  "Medium"  (amber)
  <  30  →  "Low"     (green)
```

Each flag includes a `recommendation` field with actionable guidance.

---

## Performance

| Operation | Typical Time | Notes |
|-----------|-------------|-------|
| Rule-based extraction (`/extract`) | ~1-3 seconds | No external API calls. Processes all sheets locally. |
| AI-enhanced extraction (`/upload-excel`) | ~8-15 seconds | Depends on uncategorized item count and Gemini response time. |
| Analytics (`/analyze`) | < 100ms | In-memory computation only. |
| Risk assessment (`/risk`) | < 100ms | In-memory computation only. |
| Material lookup build (startup) | ~200ms | 513+ entries compiled from 3 knowledge sources on server start. |

### Scaling Characteristics

- **File size**: Tested with BOQ files up to 10 MB, 6+ sheets, 600+ raw rows
- **Material lookup**: O(n) scan per description, mitigated by longest-match-first ordering
- **Deduplication**: O(n²) fuzzy comparison — works well for typical BOQ sizes (< 500 items)
- **AI calls**: Chunked at 8000 chars with 500-char overlap to stay within Gemini token limits

---

## Limitations

| Limitation | Impact | Workaround |
|-----------|--------|------------|
| **Tabular BOQ format required** | Complex merged-cell layouts may lose data during pandas parsing | Pre-process heavily merged files in Excel before upload |
| **Keyword-based matching** | Unusual or abbreviated material names may not match the knowledge base | Add new keywords to `boq_ontology.json` or rely on Gemini (L4) to learn them |
| **No cost/price intelligence** | The system extracts quantities but does not compute costs | Cost analysis requires rate columns which vary by region and contractor |
| **Single-language support** | English-only material matching and classification | Translations would require parallel keyword lists in each language |
| **Gemini free tier limits** | AI extraction may fail under heavy usage (429 quota errors) | System gracefully falls back to rule-based extraction; upgrade to paid tier for production |
| **No multi-user persistence** | Knowledge graph is stored as a local JSON file | For production: migrate to a database (PostgreSQL + JSONB) |
| **No authentication** | API is open, no user sessions or role-based access | Add JWT/OAuth middleware for production deployment |

### What This System Does NOT Do

- Does **not** generate cost estimates or pricing
- Does **not** connect to supplier databases
- Does **not** replace human BOQ review — it accelerates the first-pass extraction
- Does **not** handle scanned/image PDFs (only structured Excel files)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **CORS errors in browser** | Ensure backend runs with `--host 0.0.0.0`. Check `allow_origins=["*"]` in `main.py` |
| **"No description column found"** | The sheet may have unusual column names. Add aliases to `INDUSTRY_CONFIGS.field_mapping.description` in `settings.py` |
| **Too many/few items extracted** | Adjust `NON_MATERIAL_PHRASES` or knowledge base keywords |
| **Gemini 429 (quota exhausted)** | The free tier has limits. The system gracefully falls back to rule-based extraction |
| **Windows file lock errors** | Close any Excel files before uploading. Temp files are cleaned automatically |
| **Frontend can't connect to backend** | Verify backend is on port 8000 and frontend Vite proxy is configured |
| **"0 items extracted"** | Check if the Excel has actual data rows below the header. Try adjusting `HEADER_SCAN_LIMIT` |

---

## License

MIT

---

Built with FastAPI, React, and Google Gemini AI.
