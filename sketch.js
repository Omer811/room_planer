// Guard: ensure critical DOM exists (useful if HTML tab is incomplete)
['btnAdd','btnSeed','itemList','canvas-holder','roomWidth','roomLength','zoom']
  .forEach(id => { if (!document.getElementById(id)) console.warn('Missing element:', id); });


// ------------ Utilities ------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => Math.random().toString(36).slice(2, 9);

// Pastel palette (nice defaults)
const PASTELS = [
  '#a3e1dc','#f7c5cc','#c7d2fe','#fde68a','#b9fbc0','#fbcfe8','#bfdbfe','#fcd5ce',
  '#caffbf','#ffd6a5','#fdffb6','#bdb2ff','#ffc6ff','#9bf6ff','#bde0fe','#cdeac0'
];
let pastelIndex = 0;
const nextPastel = () => PASTELS[(pastelIndex++) % PASTELS.length];

// ------------ Core Classes ------------
class Room {
  constructor(widthCm, lengthCm, snapEpsilonCm = 4) {
    this.widthCm = widthCm; this.lengthCm = lengthCm; this.snapEpsilonCm = snapEpsilonCm;
  }
  walls() { return {left:0, right:this.widthCm, bottom:0, top:this.lengthCm}; }
}

class Item {
  constructor(init) {
    this.id = uid();
    this.name = init?.name || 'Item';
    this.pos = init?.pos || { xCm: 10, yCm: 10 };
    this.size = init?.size || { wCm: 50, lCm: 50, hCm: 50 };
    this.zFromFloorCm = init?.zFromFloorCm ?? 0;
    this.rotationDeg = init?.rotationDeg ?? 0; // 0 or 90
    this.isHangable = !!init?.isHangable;
    this.isCarpet = !!init?.isCarpet;
    this.color = init?.color || nextPastel();
    this.strokeColor = '#333333';
    this.__invalid = false;
  }
  topZ(){ return (this.isCarpet?0:this.zFromFloorCm) + (this.isCarpet?0:this.size.hCm); }
  footprintAABB(){
    const w = (this.rotationDeg===0) ? this.size.wCm : this.size.lCm;
    const l = (this.rotationDeg===0) ? this.size.lCm : this.size.wCm;
    return {x:this.pos.xCm, y:this.pos.yCm, w, l};
  }
  static aabbOverlap(a,b){
    return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.l <= b.y || b.y + b.l <= a.y);
  }
  verticalOverlap(other){
    if (this.isCarpet || other.isCarpet) return false; // carpets don't cause vertical conflict
    const A0 = this.zFromFloorCm, A1 = this.topZ();
    const B0 = other.zFromFloorCm, B1 = other.topZ();
    return !(A1 <= B0 || B1 <= A0);
  }
}

class HumanProbe {
  constructor(){ this.pos = {xCm: 60, yCm: 60}; this.radiusCm = 30; }
  collidesWith(item){
    if (item.isCarpet) return false;
    if (item.zFromFloorCm >= 10) return false; // elevated enough
    const a = item.footprintAABB();
    const cx = this.pos.xCm, cy = this.pos.yCm;
    const nx = clamp(cx, a.x, a.x+a.w), ny = clamp(cy, a.y, a.y+a.l);
    const dx = cx - nx, dy = cy - ny;
    return (dx*dx + dy*dy) <= this.radiusCm*this.radiusCm;
  }
}

class Scene {
  constructor(room){
    this.room = room; this.items = []; this.human = new HumanProbe();
  }
  add(item){ this.items.push(item); refreshList(); }
  remove(id){ this.items = this.items.filter(i=>i.id!==id); refreshList(); }
  get(id){ return this.items.find(i=>i.id===id); }

  anyCollision(candidate){
    for(const it of this.items){
      if (it.id===candidate.id) continue;
      if (candidate.isCarpet || it.isCarpet) continue;
      if (Item.aabbOverlap(candidate.footprintAABB(), it.footprintAABB()) && candidate.verticalOverlap(it)) return true;
    }
    // Keep inside room bounds
    const a = candidate.footprintAABB();
    if (a.x < 0 || a.y < 0 || a.x + a.w > this.room.widthCm || a.y + a.l > this.room.lengthCm) return true;
    return false;
  }

  findSupportUnder(hangable){
    const f = hangable.footprintAABB();
    let best = null, bestTop = -Infinity;
    for(const it of this.items){
      if (it.id===hangable.id) continue;
      if (it.isCarpet) continue;
      if (Item.aabbOverlap(f, it.footprintAABB())){
        const top = it.topZ();
        if (top > bestTop) { bestTop = top; best = it; }
      }
    }
    return best;
  }

  snapToWalls(m){
    const a = m.footprintAABB();
    const eps = this.room.snapEpsilonCm;
    const {left,right,bottom,top} = this.room.walls();
    // x
    if (Math.abs(a.x-left) <= eps) m.pos.xCm = left;
    if (Math.abs((a.x+a.w)-right) <= eps) m.pos.xCm = right - a.w;
    // y
    if (Math.abs(a.y-bottom) <= eps) m.pos.yCm = bottom;
    if (Math.abs((a.y+a.l)-top) <= eps) m.pos.yCm = top - a.l;
  }

  // Hard snap: move item to the closest wall regardless of epsilon
  snapToNearestWall(m){
    const a = m.footprintAABB();
    const {left,right,bottom,top} = this.room.walls();
    const distLeft = Math.max(0, a.x - left);
    const distRight = Math.max(0, right - (a.x + a.w));
    const distBottom = Math.max(0, a.y - bottom);
    const distTop = Math.max(0, top - (a.y + a.l));
    const dists = [
      { side:'left', d: distLeft },
      { side:'right', d: distRight },
      { side:'bottom', d: distBottom },
      { side:'top', d: distTop },
    ];
    dists.sort((x,y)=> x.d - y.d);
    const nearest = dists[0]?.side;
    if (nearest === 'left') m.pos.xCm = left;
    else if (nearest === 'right') m.pos.xCm = right - a.w;
    else if (nearest === 'bottom') m.pos.yCm = bottom;
    else if (nearest === 'top') m.pos.yCm = top - a.l;
    // Keep within bounds after move
    clampInsideRoom(m);
  }

  snapToNeighbors(m){
    const eps = this.room.snapEpsilonCm;
    const a = m.footprintAABB();
    let bestDx=0,bestDy=0,foundX=false,foundY=false;
    for(const it of this.items){
      if (it.id===m.id) continue;
      const b = it.footprintAABB();
      const vOverlap = !(a.y + a.l <= b.y || b.y + b.l <= a.y);
      if (vOverlap){
        const dx1 = b.x - (a.x + a.w); if (Math.abs(dx1)<=eps && (!foundX || Math.abs(dx1)<Math.abs(bestDx))) { bestDx=dx1; foundX=true; }
        const dx2 = (b.x + b.w) - a.x; if (Math.abs(dx2)<=eps && (!foundX || Math.abs(dx2)<Math.abs(bestDx))) { bestDx=dx2; foundX=true; }
      }
      const hOverlap = !(a.x + a.w <= b.x || b.x + b.w <= a.x);
      if (hOverlap){
        const dy1 = b.y - (a.y + a.l); if (Math.abs(dy1)<=eps && (!foundY || Math.abs(dy1)<Math.abs(bestDy))) { bestDy=dy1; foundY=true; }
        const dy2 = (b.y + b.l) - a.y; if (Math.abs(dy2)<=eps && (!foundY || Math.abs(dy2)<Math.abs(bestDy))) { bestDy=dy2; foundY=true; }
      }
    }
    if (foundX) m.pos.xCm += bestDx;
    if (foundY) m.pos.yCm += bestDy;
  }
}

class HistoryManager {
  constructor(){ this.undoStack = []; this.redoStack = []; this.current = null; }
  snapshot(){ return JSON.stringify(serialize()); }
  // Push the new state; we internally keep the previous as undo target
  push(newState){
    if (this.current!=null) {
      this.undoStack.push(this.current);
      if (this.undoStack.length>50) this.undoStack.shift();
    }
    this.current = newState;
    this.redoStack.length=0;
  }
  undo(){
    if (!this.undoStack.length) return null;
    const prev = this.undoStack.pop();
    if (this.current!=null) this.redoStack.push(this.current);
    this.current = prev;
    return prev;
  }
  redo(){
    if (!this.redoStack.length) return null;
    const next = this.redoStack.pop();
    if (this.current!=null) this.undoStack.push(this.current);
    this.current = next;
    return next;
  }
  clear(){ this.undoStack.length=0; this.redoStack.length=0; this.current = this.snapshot(); }
}

// Expose certain constructors for tests and external tools
window.Item = Item;
window.Scene = Scene;
window.Room = Room;

// ------------ p5 Integration ------------
let scene, hist, pixelsPerCm = 2, selectedId = null, dragCtx = null;
let cnv;

function setup(){
  scene = new Scene(new Room(400, 300, 4));
  hist = new HistoryManager();
  pixelsPerCm = parseFloat(document.getElementById('zoom').value);
  // Clamp initial zoom to fit screen
  pixelsPerCm = clamp(pixelsPerCm, 0.1, computeMaxZoom());
  const Zinit = document.getElementById('zoom'); if (Zinit) Zinit.value = pixelsPerCm;
  // Expose key globals for external tools/tests
  window.scene = scene;
  window.hist = hist;
  window.pixelsPerCm = pixelsPerCm;
  window.setSelectedId = function(id){ selectedId = id; refreshSelectedPanel(); refreshList(); };
  createOrResizeCanvas();
  setupPaletteUI();
  attachUI();
  updatePills();
  // Recompute zoom/canvas on window resize to ensure fit
  window.addEventListener('resize', ()=>{ createOrResizeCanvas(); });
  // Initialize history current state baseline
  hist.current = hist.snapshot();
}

function isMouseInCanvas(){
  return mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height;
}

function createOrResizeCanvas(){
  // Update zoom input constraints based on available space
  const Z = document.getElementById('zoom');
  const uiMax = computeMaxZoom();
  if (Z){
    Z.max = String(uiMax);
    // Ensure min is not higher than max
    if ((parseFloat(Z.min)||0.5) > uiMax) Z.min = String(uiMax);
  }
  // Clamp current zoom so canvas fits the visible area
  const clamped = clamp(pixelsPerCm, 0.1, uiMax);
  if (clamped !== pixelsPerCm){
    pixelsPerCm = clamped;
    if (Z) Z.value = String(pixelsPerCm);
    window.pixelsPerCm = pixelsPerCm;
  }
  const W = scene.room.widthCm * pixelsPerCm + 40;
  const H = scene.room.lengthCm * pixelsPerCm + 40;
  if (!cnv) cnv = createCanvas(W, H);
  else resizeCanvas(W, H);
  cnv.parent(document.getElementById('canvas-holder'));
}

function draw(){
  background(255);
  drawRoom();
  drawGrid();
  // draw carpets first
  for(const it of scene.items.filter(i=>i.isCarpet)) drawItem(it);
  for(const it of scene.items.filter(i=>!i.isCarpet)) drawItem(it);
  drawHuman();
  drawOverlay();
  updateCursorPill();
}

function worldToScreenX(xCm){ return 20 + xCm * pixelsPerCm; }
function worldToScreenY(yCm){ return height - (20 + yCm * pixelsPerCm); }
function screenToWorld(x,y){
  const xCm = (x - 20) / pixelsPerCm;
  const yCm = (height - y - 20) / pixelsPerCm;
  return { xCm, yCm };
}

function computeMaxZoom(){
  const holder = document.getElementById('canvas-holder');
  if (!holder) return 10; // sensible default
  // Available size inside holder (already accounts for layout and toolbar)
  // Subtract a small fudge to avoid scrollbar due to rounding.
  const availW = Math.max(100, holder.clientWidth - 2);
  const availH = Math.max(100, holder.clientHeight - 2);
  const pad = 40; // canvas margins we add (20 each side)
  const maxZx = (availW - pad) / Math.max(1, scene.room.widthCm);
  const maxZy = (availH - pad) / Math.max(1, scene.room.lengthCm);
  let z = Math.max(0.1, Math.min(maxZx, maxZy));
  if (!isFinite(z)) z = 1;
  // Floor to 3 decimals to ensure canvas <= holder
  return Math.max(0.1, Math.floor(z * 1000) / 1000);
}

function drawRoom(){
  const x0 = worldToScreenX(0), y0 = worldToScreenY(0);
  const x1 = worldToScreenX(scene.room.widthCm), y1 = worldToScreenY(scene.room.lengthCm);
  noFill(); stroke(30); strokeWeight(2);
  rect(x0, y1, x1-x0, y0-y1);
  document.getElementById('canvasSizePill').textContent = `${scene.room.widthCm}×${scene.room.lengthCm} cm`;
}

function drawGrid(){
  const step = 50; // 50 cm major grid
  stroke('#eef2f7'); strokeWeight(1);
  for(let x=0; x<=scene.room.widthCm; x+=step){
    const sx = worldToScreenX(x);
    line(sx, worldToScreenY(0), sx, worldToScreenY(scene.room.lengthCm));
  }
  for(let y=0; y<=scene.room.lengthCm; y+=step){
    const sy = worldToScreenY(y);
    line(worldToScreenX(0), sy, worldToScreenX(scene.room.widthCm), sy);
  }
}

function drawItem(it){
  const a = it.footprintAABB();
  const x = worldToScreenX(a.x), y = worldToScreenY(a.y + a.l);
  const w = a.w * pixelsPerCm, h = a.l * pixelsPerCm;
  const isSel = (it.id===selectedId);
  push();
  stroke(it.__invalid? '#dc2626' : isSel? '#4f46e5' : '#374151');
  strokeWeight(isSel? 2:1.25);
  if (it.isCarpet){
    fill(it.color + '55');
  } else {
    fill(it.color);
  }
  rect(x, y, w, h, 8);
  noStroke(); fill(0,0,0,160); textSize(12); textAlign(LEFT, TOP);
  text(it.name, x+6, y+4);
  if (!it.isCarpet && it.zFromFloorCm>0){
    fill(255); stroke('#64748b'); strokeWeight(1); rect(x+w-84, y+h-22, 78, 18, 10);
    noStroke(); fill('#0f172a'); textAlign(RIGHT, CENTER); text(`z=${it.zFromFloorCm}cm`, x+w-6, y+h-13);
  }
  pop();
}

function drawHuman(){
  const c = scene.human;
  const cx = worldToScreenX(c.pos.xCm), cy = worldToScreenY(c.pos.yCm);
  const r = c.radiusCm * pixelsPerCm;
  let collide = scene.items.some(it => c.collidesWith(it));
  noFill(); stroke(collide? '#dc2626': '#059669'); strokeWeight(2);
  circle(cx, cy, 2*r);
  noStroke(); fill('#111827'); textSize(12); textAlign(CENTER, CENTER);
  text('Human', cx, cy);
}

function drawOverlay(){
  if (!dragCtx) return;
  const status = document.getElementById('statusPill');
  if (dragCtx.human) { status.textContent = 'Dragging human probe'; return; }
  const item = scene.get(dragCtx.id);
  if (!item) return;
  status.textContent = item.__invalid? 'Invalid position (overlap or out of bounds)' : 'Dragging';
}

function updateCursorPill(){
  const world = screenToWorld(mouseX, mouseY);
  document.getElementById('cursorPill').textContent = `${Math.round(world.xCm)} , ${Math.round(world.yCm)} cm`;
}

// ------------ Hit-testing & Interaction ------------
function pickTopmost(world){
  const hc = scene.human; const dx = world.xCm - hc.pos.xCm, dy = world.yCm - hc.pos.yCm;
  if (dx*dx + dy*dy <= hc.radiusCm*hc.radiusCm) return { id: 'HUMAN', human:true };
  const all = [...scene.items];
  for (let i=all.length-1; i>=0; --i){
    const it = all[i];
    const a = it.footprintAABB();
    if (world.xCm>=a.x && world.xCm<=a.x+a.w && world.yCm>=a.y && world.yCm<=a.y+a.l){
      return {id: it.id};
    }
  }
  return null;
}

function mousePressed(){
  if (!isMouseInCanvas()) return; // ignore clicks outside the canvas (e.g., in the sidebar)
  const w = screenToWorld(mouseX, mouseY);
  const hit = pickTopmost(w);
  if (hit){
    selectedId = hit.human? null : hit.id;
    if (hit.human){
      dragCtx = { human:true, offset:{ dx: w.xCm - scene.human.pos.xCm, dy: w.yCm - scene.human.pos.yCm } };
    } else {
      const it = scene.get(hit.id);
      dragCtx = {
        id: it.id,
        offset:{ dx: w.xCm - it.pos.xCm, dy: w.yCm - it.pos.yCm },
        snapshot: hist.snapshot()
      };
    }
    refreshSelectedPanel();
  } else {
    selectedId = null; refreshSelectedPanel();
  }
}

function clampInsideRoom(item){
  const a = item.footprintAABB();
  item.pos.xCm = clamp(item.pos.xCm, 0, scene.room.widthCm - a.w);
  item.pos.yCm = clamp(item.pos.yCm, 0, scene.room.lengthCm - a.l);
}

function mouseDragged(){
  if (!dragCtx || !isMouseInCanvas()) return;
  const w = screenToWorld(mouseX, mouseY);
  if (dragCtx.human){
    scene.human.pos.xCm = clamp(w.xCm - dragCtx.offset.dx, 0, scene.room.widthCm);
    scene.human.pos.yCm = clamp(w.yCm - dragCtx.offset.dy, 0, scene.room.lengthCm);
    return;
  }
  const it = scene.get(dragCtx.id); if (!it) return;
  it.pos.xCm = w.xCm - dragCtx.offset.dx;
  it.pos.yCm = w.yCm - dragCtx.offset.dy;
  clampInsideRoom(it);
  scene.snapToWalls(it);
  scene.snapToNeighbors(it);
  if (it.isHangable){
    const supp = scene.findSupportUnder(it);
    if (supp) it.zFromFloorCm = supp.topZ(); else it.zFromFloorCm = Math.max(0, it.zFromFloorCm);
  } else {
    it.zFromFloorCm = 0;
  }
  it.__invalid = scene.anyCollision(it);
}

function mouseReleased(){
  if (!dragCtx) return;
  if (!isMouseInCanvas() && !dragCtx.human) { dragCtx = null; return; }
  if (!dragCtx.human){
    const it = scene.get(dragCtx.id);
    if (it && it.__invalid){
      applySerialized(JSON.parse(dragCtx.snapshot));
    } else {
      hist.push(hist.snapshot());
    }
  }
  dragCtx = null; updateStatus('Ready'); refreshList(); refreshSelectedPanel();
}

function keyPressed(){
  if (key === 'Delete' || key === 'Backspace') onDeleteSelected();
  if (key === 'r' || key === 'R') rotateSelected();
  if ((key==='z'||key==='Z') && (keyIsDown(CONTROL) || keyIsDown(META))) onUndo();
  if ((key==='y'||key==='Y') && (keyIsDown(CONTROL) || keyIsDown(META))) onRedo();
}

// ------------ UI Wiring ------------
function updateStatus(s){ document.getElementById('statusPill').textContent = s; }

function setupPaletteUI(){
  const el = document.getElementById('palette');
  el.innerHTML = '';
  PASTELS.forEach(col=>{
    const sw = document.createElement('div'); sw.className='swatch'; sw.style.background = col;
    sw.title = col;
    sw.onclick = ()=>{ document.getElementById('addColor').value = col; };
    el.appendChild(sw);
  });
}

function attachUI(){
  const W = document.getElementById('roomWidth');
  const L = document.getElementById('roomLength');
  const E = document.getElementById('snapEps');
  const Z = document.getElementById('zoom');
  [W,L,E].forEach(inp=> inp.addEventListener('change', ()=>{
    scene.room.widthCm = parseFloat(W.value)||scene.room.widthCm;
    scene.room.lengthCm = parseFloat(L.value)||scene.room.lengthCm;
    scene.room.snapEpsilonCm = parseFloat(E.value)||scene.room.snapEpsilonCm;
    createOrResizeCanvas();
  }));
  Z.addEventListener('change', ()=>{
    const maxZ = computeMaxZoom();
    const minZ = parseFloat(Z.min) || 0.5;
    let z = parseFloat(Z.value);
    if (!isFinite(z)) z = pixelsPerCm;
    pixelsPerCm = clamp(z, Math.max(0.1, minZ), maxZ);
    Z.value = String(pixelsPerCm);
    window.pixelsPerCm = pixelsPerCm;
    createOrResizeCanvas();
  });

  document.getElementById('btnSeed').onclick = seedSample;
  document.getElementById('btnAdd').onclick = onAddItem;

  document.getElementById('btnDelete').onclick = onDeleteSelected;
  document.getElementById('btnDuplicate').onclick = onDuplicateSelected;
  document.getElementById('btnSnapWalls').onclick = onSnapSelectedToWall;
  document.getElementById('btnRotate').onclick = rotateSelected;

  document.getElementById('probeR').addEventListener('change', (e)=>{
    scene.human.radiusCm = parseFloat(e.target.value)||scene.human.radiusCm;
  });

  document.getElementById('btnUndo').onclick = onUndo;
  document.getElementById('btnRedo').onclick = onRedo;
  document.getElementById('btnExport').onclick = onExport;
  document.getElementById('importFile').addEventListener('change', onImport);

  ['selW','selL','selH','selZ','selRot','selColor','selHang','selCarpet'].forEach(id=>{
    const el = document.getElementById(id);
    // Apply changes both on commit and while typing for immediacy
    el.addEventListener('change', onSelectedEdit);
    el.addEventListener('input', onSelectedEdit);
  });
}

function onAddItem(){
  const name = document.getElementById('addName').value.trim() || `Item ${scene.items.length+1}`;
  const w = parseFloat(document.getElementById('addW').value)||50;
  const l = parseFloat(document.getElementById('addL').value)||50;
  const h = parseFloat(document.getElementById('addH').value)||50;
  const isHang = document.getElementById('addHang').checked;
  const isCarpet = document.getElementById('addCarpet').checked;
  let color = document.getElementById('addColor').value;
  if (color.toLowerCase() === '#000000') color = nextPastel();
  const item = new Item({ name, size:{wCm:w,lCm:l,hCm:h}, isHangable:isHang, isCarpet, color });
  if (isCarpet) item.zFromFloorCm = 0;
  scene.add(item);
  hist.push(hist.snapshot());
  refreshList();
  updateStatus('Item added');
}

function refreshList(){
  const list = document.getElementById('itemList');
  list.innerHTML = '';
  scene.items.forEach(it=>{
    const card = document.createElement('div'); card.className = 'item-card' + (selectedId===it.id?' selected':'');
    const left = document.createElement('div');
    left.innerHTML = `<div style="display:flex; align-items:center; gap:8px;">
      <div class="swatch" style="width:18px; height:18px; border-radius:4px; background:${it.color}"></div>
      <strong>${it.name}</strong>
      ${it.isCarpet?'<span class="badge">carpet</span>':''}
      ${it.isHangable?'<span class="badge">hangable</span>':''}
    </div>
    <div class="meta">${Math.round(it.size.wCm)}×${Math.round(it.size.lCm)}×${Math.round(it.size.hCm)} cm · z=${Math.round(it.zFromFloorCm)}</div>`;
    const right = document.createElement('div');
    const btn = document.createElement('button'); btn.className='btn'; btn.textContent='Select';
    btn.onclick = ()=>{ selectedId = it.id; refreshSelectedPanel(); refreshList(); };
    right.appendChild(btn);
    card.appendChild(left); card.appendChild(right);
    list.appendChild(card);
  });
  refreshSelectedPanel();
}

function refreshSelectedPanel(){
  const info = document.getElementById('selectedInfo');
  const btnDel = document.getElementById('btnDelete');
  const btnDup = document.getElementById('btnDuplicate');
  const btnSnap = document.getElementById('btnSnapWalls');
  const it = scene.get(selectedId);
  if (!it){
    info.textContent = 'No item selected';
    btnDel.disabled = btnDup.disabled = btnSnap.disabled = true;
    return;
  }
  info.textContent = `${it.name} — position (${Math.round(it.pos.xCm)}, ${Math.round(it.pos.yCm)}) cm`;
  btnDel.disabled = btnDup.disabled = btnSnap.disabled = false;
  document.getElementById('selW').value = it.size.wCm;
  document.getElementById('selL').value = it.size.lCm;
  document.getElementById('selH').value = it.size.hCm;
  document.getElementById('selZ').value = it.zFromFloorCm;
  document.getElementById('selRot').value = it.rotationDeg;
  document.getElementById('selColor').value = rgbToHex(it.color);
  document.getElementById('selHang').checked = it.isHangable;
  document.getElementById('selCarpet').checked = it.isCarpet;
}

function onSelectedEdit(){
  const it = scene.get(selectedId); if (!it) return;
  const W = parseFloat(document.getElementById('selW').value)||it.size.wCm;
  const L = parseFloat(document.getElementById('selL').value)||it.size.lCm;
  const H = parseFloat(document.getElementById('selH').value)||it.size.hCm;
  let Z = parseFloat(document.getElementById('selZ').value);
  const rot = parseInt(document.getElementById('selRot').value,10);
  const col = document.getElementById('selColor').value;
  const hang = document.getElementById('selHang').checked;
  const carpet = document.getElementById('selCarpet').checked;
  it.size.wCm = W; it.size.lCm = L; it.size.hCm = H;
  it.rotationDeg = rot;
  it.isHangable = hang; it.isCarpet = carpet;
  it.color = col;
  if (carpet){ it.zFromFloorCm = 0; }
  else if (!hang){ it.zFromFloorCm = 0; }
  else { it.zFromFloorCm = Math.max(0, isNaN(Z)? it.zFromFloorCm : Z); }
  // Normalize position and constraints similar to dragging
  clampInsideRoom(it);
  scene.snapToWalls(it);
  scene.snapToNeighbors(it);
  it.__invalid = scene.anyCollision(it);
  // Persist, update UI and status
  hist.push(hist.snapshot());
  refreshList();
  refreshSelectedPanel();
  updateStatus(it.__invalid ? 'Edited (invalid overlap)' : 'Edited');
}

function onDeleteSelected(){
  if (!selectedId) return; scene.remove(selectedId); selectedId = null; hist.push(hist.snapshot()); updateStatus('Deleted');
}

function onDuplicateSelected(){
  const it = scene.get(selectedId); if (!it) return;
  const copy = new Item(JSON.parse(JSON.stringify(it)));
  copy.id = uid(); copy.pos.xCm += 5; copy.pos.yCm += 5; copy.name = it.name+" copy";
  scene.add(copy); hist.push(hist.snapshot()); updateStatus('Duplicated');
}

function onSnapSelectedToWall(){
  const it = scene.get(selectedId); if (!it) return;
  scene.snapToNearestWall(it);
  hist.push(hist.snapshot());
  refreshList();
  refreshSelectedPanel();
  updateStatus('Snapped to nearest wall');
}

function rotateSelected(){
  const it = scene.get(selectedId); if (!it) return;
  it.rotationDeg = (it.rotationDeg===0?90:0);
  clampInsideRoom(it);
  scene.snapToWalls(it);
  scene.snapToNeighbors(it);
  it.__invalid = scene.anyCollision(it);
  hist.push(hist.snapshot());
  refreshList();
  refreshSelectedPanel();
  updateStatus(it.__invalid ? 'Rotated (invalid overlap)' : 'Rotated');
}

function onUndo(){ const s = hist.undo(); if (s) applySerialized(JSON.parse(s)); }
function onRedo(){ const s = hist.redo(); if (s) applySerialized(JSON.parse(s)); }

function onExport(){
  const data = serialize(); const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'room-planner.json'; a.click();
  URL.revokeObjectURL(url);
  document.getElementById('exportOut').textContent = 'Exported current scene to JSON.';
}

function onImport(e){
  const f = e.target.files[0]; if (!f) return;
  const fr = new FileReader();
  fr.onload = ()=>{ try { const data = JSON.parse(fr.result); applySerialized(data); hist.clear(); } catch(err){ alert('Invalid JSON'); } };
  fr.readAsText(f);
  e.target.value = '';
}

// ------------ Serialization ------------
function serialize(){
  return {
    room: { widthCm: scene.room.widthCm, lengthCm: scene.room.lengthCm, snapEpsilonCm: scene.room.snapEpsilonCm },
    items: scene.items.map(i=>({ id:i.id, name:i.name, pos:i.pos, size:i.size, zFromFloorCm:i.zFromFloorCm, rotationDeg:i.rotationDeg, isHangable:i.isHangable, isCarpet:i.isCarpet, color:i.color })),
    human: { pos: scene.human.pos, radiusCm: scene.human.radiusCm },
    pixelsPerCm
  };
}

function applySerialized(data){
  scene = new Scene(new Room(data.room.widthCm, data.room.lengthCm, data.room.snapEpsilonCm));
  pixelsPerCm = data.pixelsPerCm || pixelsPerCm;
  (data.items||[]).forEach(d=>{ const it = new Item(d); it.id = d.id||uid(); scene.add(it); });
  if (data.human){ scene.human.pos = data.human.pos; scene.human.radiusCm = data.human.radiusCm; }
  // Keep globals synced for test harness
  window.scene = scene;
  // Clamp zoom to fit after import
  pixelsPerCm = clamp(pixelsPerCm, 0.1, computeMaxZoom());
  window.pixelsPerCm = pixelsPerCm;
  createOrResizeCanvas(); refreshList(); refreshSelectedPanel(); updatePills();
  // Sync history current snapshot to this state
  if (hist) { hist.current = JSON.stringify(serialize()); }
}

function updatePills(){ document.getElementById('canvasSizePill').textContent = `${scene.room.widthCm}×${scene.room.lengthCm} cm`; }

function rgbToHex(col){
  if (/^#([0-9a-f]{3}){1,2}$/i.test(col)) return col;
  const m = col.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return '#888888';
  const r = (+m[1]).toString(16).padStart(2,'0');
  const g = (+m[2]).toString(16).padStart(2,'0');
  const b = (+m[3]).toString(16).padStart(2,'0');
  return `#${r}${g}${b}`;
}

// ------------ Seed Example ------------
function seedSample(){
  scene.items = [];
  pastelIndex = 0;
  scene.add(new Item({ name:'Bed', size:{wCm:160,lCm:200,hCm:40}, pos:{xCm:20,yCm:20} }));
  scene.add(new Item({ name:'Desk', size:{wCm:140,lCm:70,hCm:75}, pos:{xCm:210,yCm:30} }));
  scene.add(new Item({ name:'Wardrobe', size:{wCm:120,lCm:60,hCm:210}, pos:{xCm:260,yCm:180} }));
  scene.add(new Item({ name:'Carpet', size:{wCm:220,lCm:160,hCm:0}, isCarpet:true, pos:{xCm:90,yCm:90} }));
  scene.add(new Item({ name:'Shelf', size:{wCm:80,lCm:25,hCm:3}, isHangable:true, pos:{xCm:20,yCm:240}, zFromFloorCm:120 }));
  refreshList(); hist.push(hist.snapshot());
}
