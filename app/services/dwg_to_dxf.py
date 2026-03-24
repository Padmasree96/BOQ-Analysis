"""
dwg_to_dxf.py — DWG to DXF converter using ODA File Converter.

Searches for ODA in:
  1. System PATH
  2. Common Windows install directories (C:\\Program Files\\ODA\\...)
"""

import os
import glob
import subprocess
import shutil
import platform
import tempfile
from pathlib import Path


def _find_oda() -> str | None:
    """Find ODAFileConverter executable. Returns path or None."""
    # 1. Check system PATH
    path = shutil.which("ODAFileConverter")
    if path:
        return path

    # 2. Check common Windows default locations
    if platform.system() == "Windows":
        # Glob all versions under C:\Program Files\ODA\
        pattern = r"C:\Program Files\ODA\ODAFileConverter*\ODAFileConverter.exe"
        found = sorted(glob.glob(pattern), reverse=True)  # newest version first
        if found:
            return found[0]

        # Also check Program Files (x86)
        pattern_x86 = r"C:\Program Files (x86)\ODA\ODAFileConverter*\ODAFileConverter.exe"
        found_x86 = sorted(glob.glob(pattern_x86), reverse=True)
        if found_x86:
            return found_x86[0]

    return None


# Pre-resolve ODA path at import time
_ODA_PATH = _find_oda()

# Use temp directories to avoid triggering uvicorn reload
UPLOAD_DIR = os.path.join(tempfile.gettempdir(), "cad_boq_uploads")
OUTPUT_DIR = os.path.join(tempfile.gettempdir(), "cad_boq_converted")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)


def get_oda_converter_path() -> str | None:
    """Return the ODA converter path, or None if not installed."""
    return _ODA_PATH or _find_oda()


def convert_dwg_to_dxf(dwg_path: str) -> str:
    """
    Convert a .dwg file on disk to .dxf using ODA File Converter.

    Args:
        dwg_path: Absolute path to the .dwg file.

    Returns:
        Absolute path to the converted .dxf file.

    Raises:
        FileNotFoundError — if ODA is not installed
        RuntimeError      — if conversion fails
    """
    oda = _ODA_PATH or _find_oda()  # re-check in case installed after import

    if not oda:
        raise FileNotFoundError(
            "ODA File Converter not found.\n\n"
            "Install it from: https://www.opendesign.com/guestfiles/oda_file_converter\n"
            "Or upload a .dxf file directly."
        )

    input_dir = os.path.dirname(os.path.abspath(dwg_path))
    abs_output = os.path.abspath(OUTPUT_DIR)

    cmd = [
        oda,
        input_dir,        # Input directory
        abs_output,       # Output directory
        "ACAD2018",       # Output version
        "DXF",            # Output format
        "0",              # Recurse = no
        "1",              # Audit = yes
    ]

    try:
        subprocess.run(
            cmd, check=True, timeout=120,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("DWG conversion timed out after 120 seconds.")
    except subprocess.CalledProcessError as e:
        raise RuntimeError(
            f"ODA Converter failed: {e.stderr.decode() if e.stderr else 'Unknown error'}"
        )

    # Find the output .dxf
    filename = Path(dwg_path).stem + ".dxf"
    dxf_path = os.path.join(abs_output, filename)

    if not os.path.exists(dxf_path):
        # ODA sometimes changes the name — search for any .dxf
        found = list(Path(abs_output).glob("*.dxf"))
        if found:
            dxf_path = str(found[0])
        else:
            raise RuntimeError(
                f"ODA ran but produced no .dxf output in {abs_output}"
            )

    return dxf_path
