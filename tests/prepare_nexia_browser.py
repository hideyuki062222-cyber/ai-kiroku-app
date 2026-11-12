"""Cache public application dependencies for isolated Chromium QA; no Supabase access."""
import argparse
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets", type=Path, default=ROOT / "work" / "nexia-browser-assets")
    args = parser.parse_args()
    assets = args.assets.resolve()
    assets.mkdir(parents=True, exist_ok=True)
    manifest = []
    for relative in ["index.html", "assignment/index.html", "handoff/index.html", "cashbook/index.html"]:
        source = (ROOT / relative).read_text(encoding="utf-8")
        url = re.search(r'https://raw\.githubusercontent\.com/[^\s\x22\x27]+', source).group()
        target = assets / (relative.replace("/", "-") + ".pinned.html")
        subprocess.run(["curl", "-fsSL", "--max-time", "30", url, "-o", str(target)], check=True)
        manifest.append({"path": relative, "pinned": str(target)})
    for version, name in [("2.57.4/dist/umd/supabase.min.js", "supabase-2.57.4.js"), ("2", "supabase-v2.js")]:
        url = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@" + version
        subprocess.run(["curl", "-fsSL", "--max-time", "30", url, "-o", str(assets / name)], check=True)
    (assets / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    print("Prepared public source and SDK assets:", assets)


if __name__ == "__main__":
    main()
