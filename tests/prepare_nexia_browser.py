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
        match = re.search(r'https://raw\.githubusercontent\.com/[^\s\x22\x27]+', source)
        # Fixed pre-change handoff is used only for before/after browser comparisons.
        if match:
            url = match.group()
        elif relative == "handoff/index.html":
            url = "https://raw.githubusercontent.com/hideyuki062222-cyber/ai-kiroku-app/91b47bf1827139706f49f970a1ec6c5126d46134/handoff/index.html"
        else:
            raise ValueError(f"Missing public asset source: {relative}")
        target = assets / (relative.replace("/", "-") + ".pinned.html")
        subprocess.run(["curl", "-fsSL", "--max-time", "30", url, "-o", str(target)], check=True)
        manifest.append({"path": relative, "pinned": str(target)})
    # Frozen production handoff before the two-action UI simplification.
    for name in ["index.html", "app.js", "app.css", "core.js"]:
        target = assets / ("handoff-actions-before-" + name)
        url = "https://raw.githubusercontent.com/hideyuki062222-cyber/ai-kiroku-app/a4263db18002fb6a41be49f0a1e069b8f264a5df/handoff/" + name
        subprocess.run(["curl", "-fsSL", "--max-time", "30", url, "-o", str(target)], check=True)
        manifest.append({"path": "handoff-actions-before/" + name, "pinned": str(target)})
    for version, name in [("2.57.4/dist/umd/supabase.min.js", "supabase-2.57.4.js"), ("2", "supabase-v2.js")]:
        url = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@" + version
        subprocess.run(["curl", "-fsSL", "--max-time", "30", url, "-o", str(assets / name)], check=True)
    (assets / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    print("Prepared public source and SDK assets:", assets)


if __name__ == "__main__":
    main()
