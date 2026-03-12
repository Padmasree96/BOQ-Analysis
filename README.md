# MyFlyai — Construction BOQ Intelligence

AI-powered Bill of Quantities extraction and analysis platform.

## What it does

1. **Upload** a BOQ Excel file (.xlsx/.xls)
2. **AI extracts** all raw materials from every sheet
3. **Classifies** each item into construction categories (4-layer pipeline)
4. **Analyzes** category distribution, top items, and project risks
5. **Displays** a structured dashboard with charts and tables

## Quick Start

### Backend
```bash
cd MyFlyai
pip install -r requirements.txt
cp .env.example .env      # Add your GOOGLE_API_KEY
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd boq-frontend
npm install
npm run dev               # Opens at http://localhost:5173
```

### Test
```bash
curl http://localhost:8000/graph-stats
curl -X POST http://localhost:8000/upload-excel -F "file=@BOQ.xlsx"
```

## Classification Pipeline

| Layer | Method | Source |
|-------|--------|--------|
| L1 | EPC keyword match | `settings.py` |
| L2 | Ontology word-boundary regex | `boq_ontology.json` |
| L3 | Knowledge graph synonyms | `material_graph.json` |
| L4 | Google Gemini AI | Only for uncategorized items |

Items classified by Gemini are saved to the knowledge graph (learning loop).

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/extract` | Rule-based extraction (fast) |
| POST | `/upload-excel` | AI extraction + learning loop |
| POST | `/analyze` | Category analytics |
| POST | `/risk` | Risk assessment |
| GET | `/graph-stats` | Knowledge graph statistics |

## Tech Stack

- **Backend:** FastAPI + Pandas + RapidFuzz + LangChain + Gemini
- **Frontend:** React 18 + Vite + Tailwind CSS + Recharts + Framer Motion
