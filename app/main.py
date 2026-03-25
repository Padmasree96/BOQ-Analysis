from dotenv import load_dotenv
load_dotenv()  # Load .env before anything else

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.api.routes import router
from app.api.auth_routes import auth_router

app = FastAPI(
    title="MyFlyai — Construction BOQ Intelligence",
    description="AI-powered Bill of Quantities extraction and analysis",
    version="1.0.0",
)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all routes
app.include_router(router)
app.include_router(auth_router)


@app.get("/")
async def root():
    return {
        "name": "MyFlyai — Construction BOQ Intelligence",
        "version": "1.0.0",
        "status": "running",
        "endpoints": [
            "POST /extract",
            "POST /upload-excel",
            "POST /extract-langgraph",
            "POST /extract-cad",
            "POST /analyze",
            "POST /risk",
            "GET /graph-stats",
            "GET /docs",
        ],
    }


logger.info("MyFlyai API started")
