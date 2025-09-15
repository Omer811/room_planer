# room_planer

## Tests

An in‑browser test runner is included. It exercises:
- Seeding sample data and verifying items
- Selecting and editing item dimensions, rotation, color, flags
- Adding, duplicating, deleting items
- Undo/redo
- Room resize and zoom
- Basic position clamping logic

How to run:
- Open `tests/runner.html` in a browser (use a local server or open directly). It loads the app and p5.js, then runs tests.
- The top bar shows totals and pass/fail counts. The log panel prints detailed messages and a final scene snapshot for debugging.

Files:
- `tests/runner.html` – harness page (loads the full UI and p5)
- `tests/test-runner.js` – test framework and suite with verbose logging

Notes:
- The runner manipulates the real UI elements (by setting inputs and clicking buttons) so behavior matches the app.
- If a test fails, check the log panel for the exact assertion and values. You can also open DevTools and inspect `scene`.
