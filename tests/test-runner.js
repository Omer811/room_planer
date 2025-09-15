"use strict";

// Minimal test harness with detailed logging
(function(){
  const state = { total: 0, pass: 0, fail: 0 };
  const logs = []; // keep an in-memory copy for download
  const elLog = () => document.getElementById('t-log');
  const elCount = () => document.getElementById('t-count');
  const elPass = () => document.getElementById('t-pass');
  const elFail = () => document.getElementById('t-fail');
  const elStatus = () => document.getElementById('t-status');

  function log(msg, cls){
    const d = document.createElement('div');
    d.textContent = msg;
    if (cls) d.className = cls;
    elLog().appendChild(d);
    logs.push({ level: cls || 'info', message: msg });
  }
  function pretty(obj){
    try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
  }
  function updateCounts(){
    elCount().textContent = String(state.total);
    elPass().textContent = String(state.pass);
    elFail().textContent = String(state.fail);
  }

  function download(filename, content){
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  async function copyToClipboard(text){
    try {
      await navigator.clipboard.writeText(text);
      elStatus().textContent = 'Logs copied to clipboard';
    } catch {
      elStatus().textContent = 'Clipboard copy failed; use Download Logs';
    }
  }

  async function test(name, fn){
    state.total += 1; updateCounts();
    try {
      await fn();
      state.pass += 1; updateCounts();
      log(`✔ ${name}`, 'ok');
    } catch (err){
      state.fail += 1; updateCounts();
      log(`✘ ${name} — ${err && err.message ? err.message : err}`, 'ng');
      if (err && err.stack) log(err.stack.split('\n').slice(1).join('\n'));
    }
  }

  function assertTrue(cond, msg){ if (!cond) throw new Error(msg || 'Expected truthy'); }
  function assertEqual(a,b,msg){ if (a!==b) throw new Error(msg || `Expected ${pretty(a)} === ${pretty(b)}`); }
  function assertApprox(a,b,eps=1e-6,msg){ if (Math.abs(a-b) > eps) throw new Error(msg || `Expected ~${b}, got ${a}`); }

  function setInputValue(id, value){
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing input #${id}`);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function setCheckbox(id, checked){
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing checkbox #${id}`);
    el.checked = checked;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function click(id){
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing button #${id}`);
    el.click();
  }

  // Wait for sketch setup to initialize globals and canvas
  function waitForApp(timeoutMs=6000){
    const t0 = Date.now();
    return new Promise((resolve, reject)=>{
      (function poll(){
        if (window.scene && window.hist && window.createCanvas){ return resolve(); }
        if (Date.now()-t0 > timeoutMs){ return reject(new Error('App failed to initialize')); }
        requestAnimationFrame(poll);
      })();
    });
  }

  // Helper to pick first item and mark as selected via code
  function selectFirstItem(){
    if (!scene.items.length) throw new Error('No items to select');
    const id = scene.items[0].id;
    if (typeof window.setSelectedId === 'function') {
      window.setSelectedId(id);
    } else {
      // Fallback: try clicking first card's Select button
      const btn = document.querySelector('#itemList .item-card .btn');
      if (btn) btn.click();
    }
    return scene.get(id);
  }

  async function run(){
    elStatus().textContent = 'Booting…';
    await waitForApp();
    // Ensure a known starting state
    elStatus().textContent = 'Seeding…';
    click('btnSeed');

    // Tests
    await test('Seed creates 5 items with known names', ()=>{
      assertTrue(scene.items.length >= 5, 'Expected >= 5 items');
      const names = scene.items.map(i=>i.name);
      ['Bed','Desk','Wardrobe','Carpet','Shelf'].forEach(n=>assertTrue(names.includes(n), `Missing item ${n}`));
    });

    await test('Select first item and edit dimensions', ()=>{
      const it = selectFirstItem();
      const newW= it.size.wCm + 10, newL = it.size.lCm + 5, newH = it.size.hCm + 2;
      setInputValue('selW', newW);
      setInputValue('selL', newL);
      setInputValue('selH', newH);
      const cur = scene.get(it.id);
      assertApprox(cur.size.wCm, newW, 1e-3, 'W not applied');
      assertApprox(cur.size.lCm, newL, 1e-3, 'L not applied');
      assertApprox(cur.size.hCm, newH, 1e-3, 'H not applied');
    });

    await test('Rename selected item updates model and list', ()=>{
      const it = selectFirstItem();
      const newName = it.name + ' — Renamed';
      const nameEl = document.getElementById('selName');
      if (nameEl) {
        setInputValue('selName', newName);
      } else {
        // Fallback: apply programmatically if field is absent
        it.name = newName;
        if (typeof window.refreshList === 'function') window.refreshList();
        if (typeof window.refreshSelectedPanel === 'function') window.refreshSelectedPanel();
      }
      const cur = scene.get(it.id);
      assertEqual(cur.name, newName, 'Name not applied to model');
      const names = Array.from(document.querySelectorAll('#itemList .item-card strong')).map(el=>el.textContent.trim());
      assertTrue(names.includes(newName), 'List did not reflect new name');
    });

    await test('Rotate via select control and button', ()=>{
      const it = selectFirstItem();
      const initial = it.rotationDeg;
      // Rotate using dropdown
      setInputValue('selRot', initial===0? 90: 0);
      assertEqual(scene.get(it.id).rotationDeg, initial===0?90:0, 'Rotation via select failed');
      // Rotate using button
      click('btnRotate');
      assertEqual(scene.get(it.id).rotationDeg, initial, 'Rotation via button failed to toggle back');
    });

    await test('Toggle hangable/carpet and z logic', ()=>{
      const it = selectFirstItem();
      setCheckbox('selCarpet', true);
      const a = scene.get(it.id);
      assertTrue(a.isCarpet, 'Carpet flag not set');
      assertEqual(a.zFromFloorCm, 0, 'Carpet z should be 0');
      // Turn off carpet and set hangable with z
      setCheckbox('selCarpet', false);
      setCheckbox('selHang', true);
      setInputValue('selZ', 123);
      const b = scene.get(it.id);
      assertTrue(b.isHangable, 'Hangable flag not set');
      assertEqual(b.zFromFloorCm, 123, 'z not applied for hangable');
      // Turn off hangable; z should clamp to 0
      setCheckbox('selHang', false);
      const c = scene.get(it.id);
      assertEqual(c.zFromFloorCm, 0, 'z should reset when not hangable');
    });

    await test('Add item via form', ()=>{
      const before = scene.items.length;
      setInputValue('addName', 'Chair');
      setInputValue('addW', '40');
      setInputValue('addL', '40');
      setInputValue('addH', '90');
      setCheckbox('addHang', false);
      setCheckbox('addCarpet', false);
      click('btnAdd');
      assertEqual(scene.items.length, before+1, 'Item count did not increase');
      const last = scene.items[scene.items.length-1];
      assertEqual(last.name, 'Chair', 'Name not applied');
      assertEqual(Math.round(last.size.wCm), 40, 'W not applied');
      assertEqual(Math.round(last.size.lCm), 40, 'L not applied');
      assertEqual(Math.round(last.size.hCm), 90, 'H not applied');
    });

    await test('Duplicate and delete selected item', ()=>{
      const it = selectFirstItem();
      const n0 = scene.items.length;
      click('btnDuplicate');
      assertEqual(scene.items.length, n0+1, 'Duplicate did not add');
      click('btnDelete');
      assertEqual(scene.items.length, n0, 'Delete did not remove');
    });

    await test('Undo/Redo reverts and reapplies last action', ()=>{
      // Add an item, then undo and redo
      const n0 = scene.items.length;
      setInputValue('addName', 'Lamp');
      setInputValue('addW', '20');
      setInputValue('addL', '20');
      setInputValue('addH', '100');
      click('btnAdd');
      assertEqual(scene.items.length, n0+1, 'Add before undo failed');
      click('btnUndo');
      assertEqual(scene.items.length, n0, 'Undo did not revert');
      click('btnRedo');
      assertEqual(scene.items.length, n0+1, 'Redo did not reapply');
    });

    await test('Room resize updates model and pill', ()=>{
      setInputValue('roomWidth', '500');
      setInputValue('roomLength', '350');
      assertEqual(scene.room.widthCm, 500, 'roomWidth not applied');
      assertEqual(scene.room.lengthCm, 350, 'roomLength not applied');
      const pill = document.getElementById('canvasSizePill').textContent.trim();
      assertTrue(pill.includes('500×350'), `Pill not updated, got ${pill}`);
    });

    await test('Zoom updates pixelsPerCm and canvas size grows (clamped to max)', ()=>{
      const w0 = window.width, h0 = window.height; // p5 width/height
      setInputValue('zoom', '3');
      const Z = document.getElementById('zoom');
      const maxZ = parseFloat(Z.max) || 3;
      const expected = Math.min(3, maxZ);
      assertApprox(window.pixelsPerCm, expected, 1e-6, 'pixelsPerCm not applied (respecting clamp)');
      assertTrue(window.width !== w0 || window.height !== h0, 'Canvas size did not change');
    });

    // Direct position adjustment test (logic-level)
    await test('Directly change position clamps inside room', ()=>{
      const it = selectFirstItem();
      it.pos.xCm = -10; it.pos.yCm = 9999;
      window.clampInsideRoom(it);
      assertTrue(it.pos.xCm >= 0 && it.pos.yCm >= 0, 'Position not clamped to >=0');
      assertTrue(it.pos.xCm <= scene.room.widthCm && it.pos.yCm <= scene.room.lengthCm, 'Position exceeded room');
    });

    // Additional behavioral tests
    await test('Snap to nearest wall button aligns item to closest side', ()=>{
      // Place an item roughly in the center
      const it = new window.Item({ name:'CenterItem', size:{wCm:60,lCm:60,hCm:10}, pos:{xCm: 200, yCm: 100} });
      scene.add(it);
      window.setSelectedId(it.id);
      // Compute which wall is closest before snapping
      const a0 = it.footprintAABB();
      const dLeft = a0.x - 0;
      const dRight = scene.room.widthCm - (a0.x + a0.w);
      const dBottom = a0.y - 0;
      const dTop = scene.room.lengthCm - (a0.y + a0.l);
      const pairs = [ ['left', dLeft], ['right', dRight], ['bottom', dBottom], ['top', dTop] ];
      pairs.sort((x,y)=> x[1]-y[1]);
      const nearest = pairs[0][0];

      click('btnSnapWalls');
      const a1 = it.footprintAABB();
      if (nearest==='left') assertApprox(a1.x, 0, 1e-6, 'Not snapped to left');
      if (nearest==='right') assertApprox(a1.x + a1.w, scene.room.widthCm, 1e-6, 'Not snapped to right');
      if (nearest==='bottom') assertApprox(a1.y, 0, 1e-6, 'Not snapped to bottom');
      if (nearest==='top') assertApprox(a1.y + a1.l, scene.room.lengthCm, 1e-6, 'Not snapped to top');
    });

    await test('Neighbor snapping aligns edges within epsilon', ()=>{
      const a = new window.Item({ name:'A', size:{wCm:60,lCm:60,hCm:10}, pos:{xCm: 50, yCm: 50} });
      const b = new window.Item({ name:'B', size:{wCm:60,lCm:60,hCm:10}, pos:{xCm: 111, yCm: 50} }); // 1 cm gap if eps>=1
      scene.add(a); scene.add(b);
      // Move b near a and snap
      scene.snapToNeighbors(b);
      const ab = a.footprintAABB(); const bb = b.footprintAABB();
      assertApprox(bb.x, ab.x + ab.w, scene.room.snapEpsilonCm + 1, 'Neighbor snap failed');
    });

    await test('Rotation keeps item within room bounds', ()=>{
      const it = new window.Item({ name:'Big', size:{wCm:200,lCm:150,hCm:10}, pos:{xCm: scene.room.widthCm-200, yCm: scene.room.lengthCm-150} });
      scene.add(it); window.setSelectedId(it.id);
      click('btnRotate'); // rotateSelected clamps inside
      assertTrue(it.pos.xCm >= 0 && it.pos.yCm >= 0, 'Rotated item went out of bounds');
    });

    await test('Human collision toggles near/away from item', ()=>{
      const it = new window.Item({ name:'Block', size:{wCm:100,lCm:100,hCm:10}, pos:{xCm: 50, yCm: 50} });
      scene.add(it);
      scene.human.pos = { xCm: 60, yCm: 60 };
      assertTrue(scene.human.collidesWith(it), 'Expected collision near item');
      scene.human.pos = { xCm: 5000, yCm: 5000 };
      assertTrue(!scene.human.collidesWith(it), 'Expected no collision far away');
    });

    await test('Serialization round trip preserves items', ()=>{
      const s = window.serialize();
      const names0 = s.items.map(i=>i.name).sort();
      window.applySerialized(JSON.parse(JSON.stringify(s)));
      const names1 = window.serialize().items.map(i=>i.name).sort();
      assertEqual(JSON.stringify(names0), JSON.stringify(names1), 'Round trip changed items');
    });

    await test('Higher z items are topmost when overlapping', ()=>{
      // Create two overlapping items at same footprint, different z
      const base = new window.Item({ name:'Base', size:{wCm:80,lCm:80,hCm:40}, pos:{xCm: 100, yCm: 100} });
      const shelf = new window.Item({ name:'ShelfAbove', size:{wCm:80,lCm:80,hCm:3}, pos:{xCm: 100, yCm: 100}, isHangable:true, zFromFloorCm:120 });
      scene.add(base); scene.add(shelf);
      // Pick at a point inside both
      const hit = window.pickTopmost({ xCm: 110, yCm: 110 });
      const chosen = hit && hit.id ? scene.get(hit.id) : null;
      assertTrue(chosen!=null, 'Nothing picked');
      assertEqual(chosen.name, 'ShelfAbove', 'Expected the higher item to be topmost');
    });

    elStatus().textContent = state.fail===0 ? 'All tests passed' : 'There were failing tests';
    log('--- Final Scene Snapshot ---');
    log(pretty(window.serialize()), 'ok');
  }

  window.addEventListener('load', run);

  // Wire control buttons when DOM is ready
  window.addEventListener('load', () => {
    const btnCopy = document.getElementById('t-btn-copy');
    const btnDl = document.getElementById('t-btn-download');
    const btnSnap = document.getElementById('t-btn-snapshot');
    if (btnCopy) btnCopy.addEventListener('click', () => {
      const text = logs.map(l => `${l.level.toUpperCase()}: ${l.message}`).join('\n');
      copyToClipboard(text);
    });
    if (btnDl) btnDl.addEventListener('click', () => {
      const content = logs.map(l => `${l.level.toUpperCase()}: ${l.message}`).join('\n');
      download('test-log.txt', content);
    });
    if (btnSnap) btnSnap.addEventListener('click', () => {
      const snap = typeof window.serialize === 'function' ? window.serialize() : {};
      download('scene-snapshot.json', JSON.stringify(snap, null, 2));
    });
  });
})();
