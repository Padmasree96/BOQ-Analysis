import sys
import os
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.cad_parser import parse_dxf
from loguru import logger

def test():
    dxf_path = r"e:\boq to cad\AutoCAD-drawings-.dwg-.dxf-and-generates-detailed-Bill-of-Quantities-BOQ-\backend\converted\DEANSGATE PHASE 2 - NORTH BLOCK ELECTRICAL LAYOUT - 22.07.25.dxf"
    if not os.path.exists(dxf_path):
        logger.error(f"DXF not found: {dxf_path}")
        return
        
    logger.info(f"Parsing DXF: {dxf_path}")
    data = parse_dxf(dxf_path)
    
    logger.info(f"Extraction stats: {data['extraction_stats']}")
    logger.info(f"Total texts extracted: {len(data['texts'])}")
    logger.info(f"Unique layers found: {len(data['layer_summary'])}")
    
    # Show first 5 items
    for i, item in enumerate(data['texts'][:5]):
        logger.info(f"Item {i+1}: {item}")

if __name__ == "__main__":
    test()
