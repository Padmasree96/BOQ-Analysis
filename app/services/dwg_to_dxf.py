"""
dwg_to_dxf.py — DWG to DXF converter.
"""

import os
import glob
import subprocess
import shutil
import platform
from pathlib import Path
from typing import Optional

def _find_oda() -> Optional[str]:
    path = shutil.which("ODAFileConverter")
    if path: return path

    if platform.system() == "Windows":
        pattern = r"C:\Program Files\ODA\ODAFileConverter*\ODAFileConverter.exe"
        found = sorted(glob.glob(pattern), reverse=True)
        if found: return found[0]

        pattern_x86 = r"C:\Program Files (x86)\ODA\ODAFileConverter*\ODAFileConverter.exe"
        found_x86 = sorted(glob.glob(pattern_x86), reverse=True)
        if found_x86: return found_x86[0]
    return None

_ODA_PATH = _find_oda()
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "converted")
os.makedirs(OUTPUT_DIR, exist_ok=True)

def convert_dwg_to_dxf(dwg_path: str) -> str:
    oda = _ODA_PATH or _find_oda()
    if not oda:
        raise FileNotFoundError("ODA File Converter not found.")

    input_dir = os.path.dirname(os.path.abspath(dwg_path))
    cmd = [oda, input_dir, OUTPUT_DIR, "ACAD2018", "DXF", "0", "1"]

    subprocess.run(cmd, check=True, timeout=120, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    filename = Path(dwg_path).stem + ".dxf"
    dxf_path = os.path.join(OUTPUT_DIR, filename)

    if not os.path.exists(dxf_path):
        found = list(Path(OUTPUT_DIR).glob("*.dxf"))
        if found: dxf_path = str(found[0])
        else: raise RuntimeError(f"ODA output not found at {OUTPUT_DIR}")
    return dxf_path
