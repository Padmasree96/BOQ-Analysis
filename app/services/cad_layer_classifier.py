"""
cad_layer_classifier.py  —  Map AutoCAD layer names to EPC categories.

Rules checked top-to-bottom; first match wins.
Firefighting is checked FIRST because fire pipe keywords overlap with Piping.
"""

_RULES: list[tuple[list[str], str]] = [

    # ── Firefighting — FIRST (overlaps with piping) ───────────────────────────
    (["fp-","fp_","fire","sprink","sprk","sprnk","hydrant","hose",
      "fm200","novec","deluge","suppres","exting","smoke","alarm",
      "facp","detection","mcp-","fss-"],
     "Firefighting"),

    # ── Mechanical / HVAC ─────────────────────────────────────────────────────
    (["m-","m_","mech","hvac","hvac-","ahu","fcu","vrf","vrv","duct",
      "diffus","damper","chiller","cooling","heating","ventil","exhaust",
      "fan-","fan_","compres","boiler","ac-","a/c-","acm-",
      "chw","chwp","hw-","hw_","ref-","refrig","refriger","solar"],
     "Mechanical"),

    # ── Electrical ────────────────────────────────────────────────────────────
    (["e-","e_","elec","elect","el-","light","lighting","cable","cbl",
      "panel","switch","socket","db-","db_","mcc","pcc","busbar",
      "earthing","grounding","earth","lt-","ht-","hv-","lv-","mv-",
      "elv-","elv_","ups-","gen-","dg-","emer","exit-","conduit",
      "tray","trunking","raceway","rmu-","kiosk-","feeder-"],
     "Electrical"),

    # ── Piping / Plumbing ─────────────────────────────────────────────────────
    (["p-","p_","pipe","piping","valve","flange","reducer","elbow",
      "tee-","drain","sewer","plumb","plmb","water","supply","sanitary",
      "san-","san_","gas-","gas_","lpg","med-gas","medgas","cw-","cw_",
      "soil","waste","vent-","storm","riser","hume"],
     "Piping"),

    # ── Structural ────────────────────────────────────────────────────────────
    (["s-","s_","struct","steel","beam","column","brace","truss",
      "found","footing","slab","rcc","rebar","reinf","pile","raft","grid"],
     "Structural"),

    # ── Civil ─────────────────────────────────────────────────────────────────
    (["c-","c_","civil","road","pave","curb","kerb","landscape","grade",
      "excav","backfill","retaining","boundary","survey","topo","contour","site"],
     "Civil"),

    # ── Instrumentation / BMS ─────────────────────────────────────────────────
    (["i-","i_","inst","instrument","control","dcs","plc","scada",
      "sensor","transmit","gauge","meter","signal","bms","bas","ddc","ems"],
     "Instrumentation"),

    # ── Architecture / Finishing ──────────────────────────────────────────────
    (["a-","a_","arch","wall","door","window","ceil","floor","roof",
      "stair","facade","partition","clad","finish","tile","paint",
      "plaster","int-","fitout","interior","furn"],
     "Architecture"),

    # ── Telecom / IT ─────────────────────────────────────────────────────────
    (["t-","t_","tel","telecom","comm","data","fiber","fibre","cctv",
      "pa-","network","it-","cat6","cat5","lan-","wifi","ict"],
     "Telecom"),
]


def classify_layer(layer_name: str) -> str:
    """Return EPC category for a layer name. Returns 'General' if no rule matches."""
    if not layer_name:
        return "General"
    lower = layer_name.lower().strip()
    for patterns, category in _RULES:
        for pat in patterns:
            if lower.startswith(pat) or pat in lower:
                return category
    return "General"


def classify_layers(names: list[str]) -> dict[str, str]:
    return {n: classify_layer(n) for n in names}


def get_categories() -> list[str]:
    return [cat for _, cat in _RULES] + ["General"]
