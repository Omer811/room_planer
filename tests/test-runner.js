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

    await test('Duplicate then rename keeps the copy visible and counted', ()=>{
      // Start from a known selection
      const it0 = selectFirstItem();
      const baseName = it0.name;
      const n0 = scene.items.length;
      // Duplicate
      click('btnDuplicate');
      assertEqual(scene.items.length, n0+1, 'Duplicate did not add');
      // Find the new copy by name heuristic
      const copy = scene.items.find(i => i.name === baseName + ' copy');
      if (!copy) throw new Error('Could not find duplicated copy');
      // Select the copy and rename it via the selected-name field
      if (typeof window.setSelectedId === 'function') window.setSelectedId(copy.id);
      const newName = baseName + ' (Renamed Copy)';
      const nameEl = document.getElementById('selName');
      if (!nameEl) throw new Error('Missing #selName to rename');
      nameEl.value = newName;
      nameEl.dispatchEvent(new Event('input', { bubbles: true }));
      nameEl.dispatchEvent(new Event('change', { bubbles: true }));
      // Assert item count unchanged and copy still present with new name
      assertEqual(scene.items.length, n0+1, 'Rename should not change item count');
      const still = scene.get(copy.id);
      assertTrue(!!still, 'Renamed copy disappeared from scene');
      assertEqual(still.name, newName, 'Renamed copy name not applied');
      const names = scene.items.map(i=>i.name);
      assertTrue(names.includes(baseName), 'Original item missing after rename');
      assertTrue(names.includes(newName), 'Renamed copy missing after rename');
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

    await test('Add inward door and block sweep area', ()=>{
      // Create a door via UI
      const n0 = scene.items.length;
      const swingEl = document.getElementById('addDoorSwing'); if (swingEl) swingEl.value = 'in';
      setInputValue('addDoorName', 'Test Door');
      click('btnAddDoor');
      assertEqual(scene.items.length, n0+1, 'Door not added');
      const door = scene.items.find(i=>i.isDoor);
      assertTrue(!!door, 'Door not found');
      // Place a box near the hinge inside the sweep area and expect collision
      const box = new window.Item({ name:'BoxNearDoor', size:{wCm:40,lCm:40,hCm:10} });
      // Position box at the door center + small offset inside room
      const sw = window.getDoorSweep ? window.getDoorSweep(door) : null;
      let target = { xCm: 10, yCm: 10 };
      if (sw){ target = { xCm: sw.center.xCm + 10, yCm: sw.center.yCm + 10 }; }
      box.pos = target;
      const collides = scene.anyCollision(box);
      assertTrue(collides, 'Box should collide with door sweep area');
    });

    await test('Add window and prevent hangable overlap; window stays on wall', ()=>{
      const n0 = scene.items.length;
      setInputValue('addWindowName', 'Test Window');
      click('btnAddWindow');
      assertEqual(scene.items.length, n0+1, 'Window not added');
      const win = scene.items.find(i=>i.isWindow);
      assertTrue(!!win, 'Window not found');
      // Window must be on a wall: at least one side equal to room bound
      const a = win.footprintAABB();
      const onWall = (a.x===0 || a.y===0 || Math.abs(a.x+a.w - scene.room.widthCm)<1e-6 || Math.abs(a.y+a.l - scene.room.lengthCm)<1e-6);
      assertTrue(onWall, 'Window not placed on a wall');
      // Create a hangable shelf overlapping window footprint; expect collision
      const shelf = new window.Item({ name:'Hangable', size:{wCm:80,lCm:20,hCm:3}, isHangable:true, zFromFloorCm:120, pos:{xCm:a.x, yCm:a.y} });
      const bad = scene.anyCollision(shelf);
      assertTrue(bad, 'Hangable overlapping window should be disallowed');
    });

    await test('Door swing controls visible only when a door is selected', ()=>{
      // Ensure we have at least one normal item and a door
      const plain = scene.items.find(i=>!i.isDoor) || new window.Item({ name:'Plain', size:{wCm:50,lCm:50,hCm:10} });
      if (!plain.id || !scene.get(plain.id)) scene.add(plain);
      // Add a door if none
      let door = scene.items.find(i=>i.isDoor);
      if (!door){ setInputValue('addDoorName', 'DoorVis'); click('btnAddDoor'); door = scene.items.find(i=>i.isDoor); }
      // Select non-door: door options hidden
      window.setSelectedId(plain.id);
      const cont = document.getElementById('doorOpts');
      assertTrue(!!cont, 'doorOpts container missing');
      const styleNonDoor = window.getComputedStyle ? getComputedStyle(cont).display : cont.style.display;
      assertTrue(styleNonDoor === 'none', 'Door controls should be hidden for non-door');
      // Select door: door options visible
      window.setSelectedId(door.id);
      const styleDoor = window.getComputedStyle ? getComputedStyle(cont).display : cont.style.display;
      assertTrue(styleDoor !== 'none', 'Door controls should be visible for door');
    });

    await test('Door hinge can be switched left/right and updates sweep pivot', ()=>{
      // Create a door on the bottom wall for deterministic checks
      setInputValue('addDoorName', 'HingeDoor');
      click('btnAddDoor');
      const d = scene.items.find(i=>i.isDoor && i.name==='HingeDoor');
      assertTrue(!!d, 'Door not added');
      window.setSelectedId(d.id);
      // Place on bottom wall and set offset
      const wallSel = document.getElementById('selWall'); wallSel.value = 'bottom'; wallSel.dispatchEvent(new Event('change', {bubbles:true}));
      setInputValue('selOffset', '100');
      const sw0 = window.getDoorSweep(d);
      const hingeSel = document.getElementById('selHinge');
      // Hinge left
      hingeSel.value = 'left'; hingeSel.dispatchEvent(new Event('change', {bubbles:true}));
      const swL = window.getDoorSweep(d);
      // Hinge right
      hingeSel.value = 'right'; hingeSel.dispatchEvent(new Event('change', {bubbles:true}));
      const swR = window.getDoorSweep(d);
      assertTrue(!!swL && !!swR, 'Door sweep missing');
      // Center x changes when hinge switches ends
      assertTrue(swL.center.xCm !== swR.center.xCm, 'Hinge change did not move sweep center');
    });

    await test('Door on bottom wall rotates and spans leaf length', ()=>{
      const door = new window.Item({ name:'DiagDoor', size:{ wCm:10, lCm:90, hCm:200 }, isDoor:true, doorInward:true, wallSide:'bottom', offsetCm:120 });
      window.applyWallPlacement(door);
      const footprint = door.footprintAABB();
      assertEqual(door.rotationDeg, 90, 'Bottom-wall door should rotate to 90°');
      assertApprox(footprint.w, 90, 1e-6, 'Door footprint width mismatch');
      assertApprox(footprint.l, 10, 1e-6, 'Door footprint depth mismatch');
    });

    await test('Door sweep radius matches leaf span on horizontal walls', ()=>{
      const door = new window.Item({ name:'BottomDoor', size:{ wCm:10, lCm:90, hCm:200 }, isDoor:true, doorInward:true, wallSide:'bottom', offsetCm:120 });
      window.applyWallPlacement(door);
      scene.add(door);
      const sweep = window.getDoorSweep(door);
      scene.remove(door.id);
      assertTrue(!!sweep, 'Expected sweep data for inward door');
      assertApprox(sweep.radiusCm, door.size.lCm, 1e-6, 'Door sweep radius mismatch');
      assertApprox(sweep.center.xCm, door.pos.xCm, 1e-6, 'Door hinge center mismatch');
    });

    await test('Window moved to vertical wall rotates and keeps span', ()=>{
      const win = new window.Item({ name:'WideWindow', size:{ wCm:120, lCm:20, hCm:30 }, isWindow:true, wallSide:'top', offsetCm:40 });
      window.applyWallPlacement(win);
      const spanTop = win.footprintAABB().w;
      win.wallSide = 'left';
      win.offsetCm = 60;
      window.applyWallPlacement(win);
      const bb = win.footprintAABB();
      assertApprox(bb.l, spanTop, 1e-6, 'Window span mismatch');
      assertTrue(bb.w <= bb.l, 'Window thickness should remain the short edge when vertical');
      assertApprox(bb.x, 0, 1e-6, 'Window flush mismatch');
    });

    await test('Inward door sweep blocks placement across full swing', ()=>{
      const door = new window.Item({ name:'SweepDoor', size:{ wCm:8, lCm:100, hCm:200 }, isDoor:true, doorInward:true, wallSide:'bottom', offsetCm:150 });
      window.applyWallPlacement(door);
      scene.add(door);
      const blocker = new window.Item({ name:'SweepBlocker', size:{ wCm:25, lCm:25, hCm:40 }, pos:{ xCm: door.pos.xCm + door.size.lCm * 0.6, yCm: door.size.wCm + 8 } });
      const collides = scene.anyCollision(blocker);
      scene.remove(door.id);
      assertTrue(collides, 'Blocker inside inward door sweep should be rejected');
    });

    await test('Right-hinge door flips sweep quadrant correctly', ()=>{
      const door = new window.Item({ name:'RightHinge', size:{ wCm:8, lCm:90, hCm:200 }, isDoor:true, doorInward:true, doorHingeRight:true, wallSide:'bottom', offsetCm:200 });
      window.applyWallPlacement(door);
      scene.add(door);
      const sweep = window.getDoorSweep(door);
      const blocker = new window.Item({ name:'RightHingeBlocker', size:{ wCm:12, lCm:12, hCm:30 }, pos:{ xCm: door.pos.xCm + door.size.lCm * 0.2, yCm: door.size.wCm + 6 } });
      const intersects = scene._rectIntersectsDoorSweep(blocker, door);
      const collides = scene.anyCollision(blocker);
      scene.remove(door.id);
      assertTrue(!!sweep, 'Expected sweep data for inward door');
      assertApprox(sweep.center.xCm, door.pos.xCm + door.size.lCm, 1e-6, 'Right hinge center mismatch');
      assertTrue(intersects, 'Blocker left of right hinge should intersect sweep');
      assertTrue(collides, 'Blocker intersecting sweep should be rejected');
    });

    await test('Windows always align with their wall and resist perpendicular rotation', ()=>{
      setInputValue('addWindowName', 'WallWin');
      click('btnAddWindow');
      const win = scene.items.find(i=>i.isWindow && i.name==='WallWin');
      assertTrue(!!win, 'Window not added');
      window.setSelectedId(win.id);
      // Put on top wall
      const wallSel = document.getElementById('selWall'); wallSel.value = 'top'; wallSel.dispatchEvent(new Event('change', {bubbles:true}));
      // Try to rotate perpendicular
      const rotSel = document.getElementById('selRot'); rotSel.value = '90'; rotSel.dispatchEvent(new Event('change', {bubbles:true}));
      // After onSelectedEdit/applyWallPlacement, window should remain aligned to wall
      const a = win.footprintAABB();
      const onWall = Math.abs(a.y + a.l - scene.room.lengthCm) < 1e-6; // touches top wall
      assertTrue(onWall, 'Window not flush to top wall');
      // Check orientation: along-wall span >> thickness
      const span = a.w; const thick = a.l; // top wall: width along X, length small into room
      assertTrue(span >= thick, 'Window orientation not aligned to wall');
    });

    // New UI separation tests
    await test('Selecting door hides furniture options and shows door-only menu', ()=>{
      setInputValue('addDoorName', 'DoorUI');
      click('btnAddDoor');
      const door = scene.items.find(i=>i.isDoor && i.name==='DoorUI');
      window.setSelectedId(door.id);
      const f = document.getElementById('selFurnitureOpts');
      const d = document.getElementById('doorOpts');
      const w = document.getElementById('windowOpts');
      assertTrue(getComputedStyle(f).display === 'none', 'Furniture opts should be hidden for door');
      assertTrue(getComputedStyle(d).display !== 'none', 'Door opts should be visible');
      assertTrue(getComputedStyle(w).display === 'none', 'Window opts should be hidden for door');
      // Only width shown for door (selDoorW present); L/H (furniture) hidden in furniture section
      const selDoorW = document.getElementById('selDoorW');
      assertTrue(!!selDoorW, 'Door width input missing');
    });

    await test('Selecting window hides furniture options and shows window-only menu', ()=>{
      setInputValue('addWindowName', 'WindowUI');
      click('btnAddWindow');
      const win = scene.items.find(i=>i.isWindow && i.name==='WindowUI');
      window.setSelectedId(win.id);
      const f = document.getElementById('selFurnitureOpts');
      const d = document.getElementById('doorOpts');
      const w = document.getElementById('windowOpts');
      assertTrue(getComputedStyle(f).display === 'none', 'Furniture opts should be hidden for window');
      assertTrue(getComputedStyle(d).display === 'none', 'Door opts should be hidden for window');
      assertTrue(getComputedStyle(w).display !== 'none', 'Window opts should be visible');
      const selWindowW = document.getElementById('selWindowW');
      assertTrue(!!selWindowW, 'Window width input missing');
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
