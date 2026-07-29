# 🎨 Pixel Art Studio

Ein einfacher, erweiterbarer Pixel-Art-Editor als lokaler Webservice.  
Gebaut mit Flask + Vanilla JS. Kein Build-Schritt nötig.

## Features

- Zeichnen, Füllen (Flood-Fill), Radierer, Farbpipette
- 40-Farben-Palette + Custom Color Picker
- Grid-Größen: 8 × 8 bis 64 × 64
- **Animationen**: mehrere Frames pro Projekt, FPS-Steuerung, Live-Vorschau
- Projekte werden als JSON in `./data/` gespeichert
- Export: aktueller Frame als PNG, alle Frames als GIF (via Pillow serverseitig)
- Docker-ready

## Tastenkürzel

| Taste | Funktion |
|---|---|
| `B` | Stift (Brush) |
| `F` | Füllen |
| `E` | Radierer |
| `I` | Pipette |
| `← →` | Frame wechseln |
| `Strg+S` | Speichern |

## Setup (lokal)

```bash
git clone <repo-url>
cd pixelart-studio

python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python app.py
# → http://localhost:5000
```

## Setup (Docker)

```bash
docker compose up --build
# → http://localhost:5000
```

Projektdaten liegen in `./data/` und werden per Volume persistiert.

## Projektstruktur

```
pixelart-studio/
├── app.py                  # Flask-Backend, API-Endpunkte, GIF-Export
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── .gitignore
├── data/                   # Projekte als JSON (gitignored)
├── templates/
│   └── index.html          # Single-Page-Frontend
└── static/
    ├── style.css
    └── app.js              # Editor-Logik, Canvas, Frames, API-Calls
```

## API-Endpunkte

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET`    | `/api/projects`             | Alle Projekte auflisten |
| `POST`   | `/api/projects`             | Neues Projekt anlegen |
| `GET`    | `/api/projects/<id>`        | Projekt laden |
| `PUT`    | `/api/projects/<id>`        | Projekt speichern |
| `DELETE` | `/api/projects/<id>`        | Projekt löschen |
| `GET`    | `/api/projects/<id>/export/gif` | Projekt als GIF exportieren |

## Geplante Features (Roadmap)

- [ ] Undo / Redo (Strg+Z / Strg+Y)
- [ ] Symmetriemodus (horizontal / vertikal)
- [ ] Layer-System
- [ ] Sprite-Sheet-Export
- [ ] Zoom-Funktion
- [ ] Animiertes GIF direkt im Browser via gif.js
