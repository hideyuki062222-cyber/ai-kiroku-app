"""Cache public application dependencies for isolated Chromium QA; no Supabase access."""
import argparse
import hashlib
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
    # Frozen production handoff before the room list improvement.
    for name in ["index.html", "app.js", "app.css", "core.js"]:
        target = assets / ("handoff-rooms-before-" + name)
        url = "https://raw.githubusercontent.com/hideyuki062222-cyber/ai-kiroku-app/d834ee9211abd6e5289d183e2faf2df1a1ddee5e/handoff/" + name
        subprocess.run(["curl", "-fsSL", "--max-time", "30", url, "-o", str(target)], check=True)
        manifest.append({"path": "handoff-rooms-before/" + name, "pinned": str(target)})
    # Frozen production facts UI before the November quality/usability revision.
    quality_before = assets / "record-quality-before"
    quality_before.mkdir(exist_ok=True)
    for name in ["index.html", "record-facts-core.js", "record-facts-ui.js", "record-facts.css"]:
        url = "https://raw.githubusercontent.com/hideyuki062222-cyber/ai-kiroku-app/8d162e6483d9ce2cb2c8ebe17636bc4defd6ca04/" + name
        subprocess.run(["curl", "-fsSL", "--max-time", "30", url, "-o", str(quality_before / name)], check=True)
    for version, name in [("2.57.4/dist/umd/supabase.min.js", "supabase-2.57.4.js"), ("2", "supabase-v2.js")]:
        url = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@" + version
        subprocess.run(["curl", "-fsSL", "--max-time", "30", url, "-o", str(assets / name)], check=True)
    # Historical UI comparisons use immutable commits and verified file bytes.
    versions = json.loads((ROOT / "tests/fixtures/record_ui_versions.json").read_text())
    for label, version in versions.items():
        folder = assets / ("record-ui-" + label)
        folder.mkdir(exist_ok=True)
        for name, expected in version["files"].items():
            target = folder / name
            if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != expected:
                url = "https://raw.githubusercontent.com/hideyuki062222-cyber/ai-kiroku-app/" + version["commit"] + "/" + name
                subprocess.run(["curl", "-fsSL", "--max-time", "30", url, "-o", str(target)], check=True)
            if hashlib.sha256(target.read_bytes()).hexdigest() != expected:
                raise ValueError("Historical UI asset hash mismatch: " + label + "/" + name)
    (assets / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    print("Prepared public source and SDK assets:", assets)


if __name__ == "__main__":
    main()
