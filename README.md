# Room Planner (p5.js)

Room Planner is a browser-based tool for quickly sketching interior layouts. It lets you drop furniture, snap items to walls, preview door swings, and explore walkability with a human probe so you can reason about space before committing to a final plan.

This project was created as part of a background course in the M.Des Design & Technology program at Bezalel Academy of Arts and Design, Jerusalem.

Try the live [demo](https://link-url-here.org](https://68d418dec0bcff11039088e1--fluffy-lollipop-4c6bb3.netlify.app)!
---

## Preview

![preview.gif](docs/preview.gif)

---

## What You Can Do

- Define the room footprint (width, length, wall snap epsilon).
- Add furniture with custom names, colors, and dimensions (W×L×H).
- Toggle special behaviors: carpets sit flush to the floor, hangable items rest on the highest support, doors/windows align to walls with swing previews.
- Drag items, snap to walls or neighbors, rotate 0°/90°, and keep everything inside the room bounds.
- Move a “human probe” circle to validate clearances and walkability.
- Undo/redo changes and import/export complete layouts as JSON.

---

## How to Run the App

1. **Clone or download** this repository.
2. **Serve the project** (recommended) or open it directly:
   - using a local server such as `npx serve .` or VS Code’s Live Server extension, then visit the printed URL, **or**
   - open `index.html` directly in a modern browser (Chrome/Edge/Firefox/Safari).
3. Use the controls in the sidebar to configure the room, add furniture, and manipulate items on the canvas.

Tips:
- The toolbar buttons (Rotate, Snap to wall, Duplicate, Delete, Undo/Redo) work on the currently selected item.
- Keyboard shortcuts: `Delete`, `R`, `Ctrl/Cmd + Z`, `Ctrl/Cmd + Y`.

---

## Running the Test Suite

The project ships with an in-browser regression suite that drives the real UI.

1. Open `tests/runner.html` in the same way you host or open the main app.
2. The top status bar shows how many tests ran, passed, or failed.
3. Scroll the log panel for detailed assertions and the final serialized scene snapshot.

Because the runner uses the actual DOM controls, any failing test usually mirrors an end-user bug. If a test fails, inspect the log entry or open DevTools to inspect `window.scene` for state details.

---

## Project Structure Highlights

- `index.html`, `sketch.js`, `style.css` – main application (p5.js sketch + UI wiring).
- `docs/` – preview video/GIF and marketing images (generated with `scripts/make-media.sh`).
- `tests/runner.html`, `tests/test-runner.js` – automated UI tests.
- `scripts/make-media.sh` – helper to regenerate the media assets.

Enjoy planning!
