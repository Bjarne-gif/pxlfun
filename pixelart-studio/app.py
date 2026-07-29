"""
Pixel Art Studio – Flask Backend
Speichert Projekte (Frames + Metadaten) als JSON in ./data/
GIF-Export via Pillow.
"""

import json
import os
import io
import uuid
from datetime import datetime
from flask import Flask, render_template, request, jsonify, Response

try:
    from PIL import Image
    PILLOW_AVAILABLE = True
except ImportError:
    PILLOW_AVAILABLE = False

app = Flask(__name__)
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)


# ── Helpers ──────────────────────────────────────────────────────────────────

def project_path(pid: str) -> str:
    return os.path.join(DATA_DIR, f"{pid}.json")


def load_project(pid: str) -> dict | None:
    p = project_path(pid)
    if not os.path.exists(p):
        return None
    with open(p) as f:
        return json.load(f)


def save_project_to_disk(data: dict) -> None:
    data["updated"] = datetime.now().isoformat()
    with open(project_path(data["id"]), "w") as f:
        json.dump(data, f, indent=2)


def make_empty_frame(cols: int) -> list:
    return [[None] * cols for _ in range(cols)]


def hex_to_rgb(hex_color: str) -> tuple:
    h = hex_color.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


# ── Routes ───────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/projects", methods=["GET"])
def list_projects():
    result = []
    for fn in os.listdir(DATA_DIR):
        if fn.endswith(".json"):
            with open(os.path.join(DATA_DIR, fn)) as f:
                d = json.load(f)
                result.append({
                    "id": d["id"],
                    "name": d["name"],
                    "cols": d["cols"],
                    "frames": len(d["frames"]),
                    "updated": d.get("updated", ""),
                })
    result.sort(key=lambda x: x["updated"], reverse=True)
    return jsonify(result)


@app.route("/api/projects", methods=["POST"])
def create_project():
    d = request.json or {}
    pid = str(uuid.uuid4())[:8]
    cols = int(d.get("cols", 16))
    proj = {
        "id": pid,
        "name": d.get("name", "Neues Projekt"),
        "cols": cols,
        "fps": int(d.get("fps", 4)),
        "frames": [make_empty_frame(cols)],
        "created": datetime.now().isoformat(),
        "updated": datetime.now().isoformat(),
    }
    save_project_to_disk(proj)
    return jsonify(proj), 201


@app.route("/api/projects/<pid>", methods=["GET"])
def get_project(pid):
    proj = load_project(pid)
    if not proj:
        return jsonify({"error": "Nicht gefunden"}), 404
    return jsonify(proj)


@app.route("/api/projects/<pid>", methods=["PUT"])
def update_project(pid):
    if not os.path.exists(project_path(pid)):
        return jsonify({"error": "Nicht gefunden"}), 404
    data = request.json
    data["id"] = pid  # safety
    save_project_to_disk(data)
    return jsonify({"ok": True})


@app.route("/api/projects/<pid>", methods=["DELETE"])
def delete_project(pid):
    p = project_path(pid)
    if os.path.exists(p):
        os.remove(p)
    return jsonify({"ok": True})


@app.route("/api/projects/<pid>/export/gif")
def export_gif(pid):
    if not PILLOW_AVAILABLE:
        return jsonify({"error": "Pillow nicht installiert (pip install Pillow)"}), 500
    proj = load_project(pid)
    if not proj:
        return jsonify({"error": "Nicht gefunden"}), 404

    cols = proj["cols"]
    fps = proj.get("fps", 4)
    scale = max(4, min(32, 512 // cols))  # auto-scale so output is ~512px
    size = cols * scale

    pil_frames = []
    for frame_data in proj["frames"]:
        img = Image.new("RGB", (size, size), (255, 255, 255))
        pixels = img.load()
        for r in range(cols):
            for c in range(cols):
                color_hex = frame_data[r][c]
                if color_hex:
                    rgb = hex_to_rgb(color_hex)
                    for pr in range(scale):
                        for pc in range(scale):
                            pixels[c * scale + pc, r * scale + pr] = rgb
        # Convert to palette mode for GIF
        pil_frames.append(img.convert("P", palette=Image.ADAPTIVE))

    if not pil_frames:
        return jsonify({"error": "Keine Frames"}), 400

    buf = io.BytesIO()
    duration_ms = max(20, int(1000 / fps))
    pil_frames[0].save(
        buf,
        format="GIF",
        save_all=True,
        append_images=pil_frames[1:],
        loop=0,
        duration=duration_ms,
        disposal=2,
    )
    buf.seek(0)
    safe_name = "".join(c for c in proj["name"] if c.isalnum() or c in "- _").strip() or "export"
    return Response(
        buf,
        mimetype="image/gif",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.gif"'},
    )


if __name__ == "__main__":
    print("Pixel Art Studio läuft auf http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=True)
