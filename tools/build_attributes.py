#!/usr/bin/env python3
"""Build wizard attributes (size, colors, behaviors) for every species.

Sources, in priority order:
  1. tools/data/attribute-overrides.json   hand fixes per species code (optional)
  2. tools/data/family-attributes.json     hand-curated family + genus defaults
  3. colors mined from the common name and the Wikipedia description

Writes tools/data/attributes.json keyed by eBird code:
  {"sizes": [1..4], "colors": [...], "behaviors": [...], "colorSource": "name+text" | "family"}
"""
import json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
PACK = ROOT / "app/assets/data/species-na.json"
FAMILY = ROOT / "tools/data/family-attributes.json"
WIKI = ROOT / "tools/data/wiki-info.json"
OVERRIDES = ROOT / "tools/data/attribute-overrides.json"
OUT = ROOT / "tools/data/attributes.json"

COLORS = ["black", "gray", "white", "brown", "red", "yellow", "green", "blue", "orange"]

# Word patterns that imply each color tag. Rufous/chestnut count as both red and brown,
# matching how Merlin's "red/rufous" and "brown/buff" choices overlap in practice.
COLOR_WORDS = {
    "black":  r"\bblack(?:ish)?\b|\bsooty\b|\bjet\b",
    "gray":   r"\bgr[ae]y(?:ish)?\b|\bslate[- ]?(?:gray|grey|colou?red)?\b|\bash(?:y|-gray|-grey)\b",
    "white":  r"\bwhit(?:e|ish)\b|\bsnowy\b|\bivory\b",
    "brown":  r"\bbrown(?:ish)?\b|\bbuff(?:y)?\b|\btan\b|\btawny\b|\brufous\b|\bchestnut\b|\bcinnamon\b|\brusty\b|\bsandy\b|\bdusky\b",
    "red":    r"\bred(?:dish)?\b|\bcrimson\b|\bscarlet\b|\bvermilion\b|\brufous\b|\bchestnut\b|\brusty\b|\bpink(?:ish)?\b|\brose\b|\brosy\b|\bruby\b",
    "yellow": r"\byellow(?:ish)?\b|\bgolden\b|\bgold\b|\blemon\b",
    "green":  r"\bgreen(?:ish)?\b|\bolive\b|\bemerald\b",
    "blue":   r"\bblue(?:ish)?\b|\bazure\b|\bcobalt\b|\bindigo\b|\bviolet\b|\bpurpl(?:e|ish)\b",
    "orange": r"\borange\b|\bapricot\b|\bflame\b",
}
COLOR_RE = {c: re.compile(p, re.I) for c, p in COLOR_WORDS.items()}

# Phrases in descriptions that mention color words without describing the bird.
NOISE = re.compile(r"\b(?:red list|greenland|green(?:land|house)|black sea|white sea|red sea|yellow sea|blue ridge|orange county|green(?:e)?ry|evergreen|redwood|blackbird|goldfinch)\b", re.I)


def mine_colors(text):
    text = NOISE.sub(" ", text or "")
    found = [c for c in COLORS if COLOR_RE[c].search(text)]
    return found


def main():
    species = json.loads(PACK.read_text())["species"]
    fam = json.loads(FAMILY.read_text())
    wiki = json.loads(WIKI.read_text()) if WIKI.exists() else {}
    # Overrides are keyed by common name so they stay readable; resolve to codes here.
    raw_overrides = json.loads(OVERRIDES.read_text()) if OVERRIDES.exists() else {}
    by_common = {s["common"]: s["code"] for s in species}
    overrides, unknown = {}, []
    for name, ov in raw_overrides.items():
        if name.startswith("_"):
            continue
        code = by_common.get(name)
        if code:
            overrides[code] = ov
        else:
            unknown.append(name)
    if unknown:
        print("WARNING: override names not in pack:", ", ".join(unknown))

    out, missing_family, from_family = {}, set(), 0
    for s in species:
        base = fam["families"].get(s["family"])
        if not base:
            missing_family.add(s["family"])
            base = {"sizes": [2], "behaviors": ["trees"], "colors": ["brown"]}
        genus = s["sci"].split()[0]
        g = fam["genera"].get(genus, {})
        rec = {
            "sizes": g.get("sizes", base["sizes"]),
            "behaviors": g.get("behaviors", base["behaviors"]),
        }

        # Colors: the name is high precision; the description adds the rest. Family as last resort.
        name_colors = mine_colors(s["common"])
        desc = (wiki.get(s["code"]) or {}).get("description", "")
        text_colors = mine_colors(desc)
        colors = list(dict.fromkeys(name_colors + text_colors))
        if colors:
            rec["colorSource"] = "name+text"
        else:
            colors = g.get("colors", base["colors"])
            rec["colorSource"] = "family"
            from_family += 1
        rec["colors"] = colors[:5]

        ov = overrides.get(s["code"])
        if ov:
            rec.update({k: v for k, v in ov.items() if k in ("sizes", "colors", "behaviors")})
            rec["colorSource"] = "override" if "colors" in ov else rec["colorSource"]
        out[s["code"]] = rec

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=0))
    print("wrote %d species; overrides applied: %d; colors from family fallback: %d; families without defaults: %s" % (
        len(out), len(overrides), from_family, sorted(missing_family) or "none"))


if __name__ == "__main__":
    main()
