"use strict";

(function(){
  function waitForApp(timeoutMs=6000){
    const t0 = Date.now();
    return new Promise((resolve, reject)=>{
      (function poll(){
        if (window.scene && document.querySelector('canvas')) return resolve();
        if (Date.now()-t0 > timeoutMs) return reject(new Error('App failed to initialize'));
        requestAnimationFrame(poll);
      })();
    });
  }

  async function recordAndDrive(){
    await waitForApp();
    const cnv = document.querySelector('canvas');
    const stream = cnv.captureStream(30);
    const chunks = [];
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      try {
        await fetch(`/upload?name=recording.webm`, { method: 'POST', body: blob });
        document.getElementById('statusPill').textContent = 'Uploaded recording.webm';
        // Optionally close the tab after a short delay
        setTimeout(()=> window.close(), 800);
      } catch (err) {
        document.getElementById('statusPill').textContent = 'Upload failed';
      }
    };
    rec.start();

    // Scripted interactions (~12 seconds total)
    const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));
    const step = async (fn, ms)=>{ await sleep(ms); fn(); };
    const sel = ()=>{
      const it = window.selectedId ? scene.get(window.selectedId) : null;
      if (it) return it;
      if (scene.items && scene.items.length){
        const first = scene.items[0];
        if (first) { window.setSelectedId(first.id); return first; }
      }
      return null;
    };
    const selectByName = (name)=>{
      if (!scene.items) return null;
      const it = scene.items.find(i=>i.name===name) || null;
      if (it && window.setSelectedId) window.setSelectedId(it.id);
      return it;
    };
    const moveBy = (it, dx, dy)=>{
      if (!it) return;
      const a = it.footprintAABB();
      const maxX = scene.room.widthCm - a.w;
      const maxY = scene.room.lengthCm - a.l;
      it.pos.xCm = Math.max(0, Math.min(maxX, it.pos.xCm + dx));
      it.pos.yCm = Math.max(0, Math.min(maxY, it.pos.yCm + dy));
    };
    

    // Ensure room fits view nicely (no UI dependency)
    await step(()=>{ scene.room.widthCm = 500; scene.room.lengthCm = 350; createOrResizeCanvas(); }, 200);

    // Seed sample or synthesize if unavailable
    await step(()=>{
      try { if (typeof window.seedSample === 'function') window.seedSample(); } catch(_){}
      if (!scene.items || scene.items.length === 0){
        // Minimal fallback seed
        scene.add(new window.Item({ name:'Bed', size:{wCm:160,lCm:200,hCm:40}, pos:{xCm:20,yCm:20} }));
        scene.add(new window.Item({ name:'Desk', size:{wCm:140,lCm:70,hCm:75}, pos:{xCm:210,yCm:30} }));
        scene.add(new window.Item({ name:'Wardrobe', size:{wCm:120,lCm:60,hCm:210}, pos:{xCm:260,yCm:180} }));
      }
    }, 250);

    // Select first item and move it along a short path
    await step(()=>{
      const it = scene.items && scene.items[0] ? scene.items[0] : null;
      if (!it){ return; }
      window.setSelectedId(it.id);
      it.pos.xCm = 10; it.pos.yCm = scene.room.lengthCm - it.footprintAABB().l - 10;
    }, 300);
    await step(()=>{ const it = sel(); if (it) it.pos.xCm += 80; }, 250);
    await step(()=>{ const it = sel(); if (it) it.pos.yCm = Math.max(0, it.pos.yCm - 60); }, 250);

    // Rotate selected
    await step(()=>{ window.rotateSelected(); }, 300);

    // Snap to nearest wall (call API directly)
    await step(()=>{ const it = sel(); if (it) scene.snapToNearestWall(it); }, 300);

    // Move item 2 (Wardrobe): nudge left and then down
    await step(()=>{ const it = selectByName('Wardrobe'); if (it) moveBy(it, -80, 0); }, 250);
    await step(()=>{ const it = sel(); if (it) moveBy(it, 0, 40); }, 250);

    // Add an item directly
    await step(()=>{
      const item = new window.Item({ name:'Demo Chair', size:{wCm:50,lCm:50,hCm:90} });
      scene.add(item);
      window.setSelectedId(item.id);
    }, 300);

    // Move new item in a small square, then rotate
    await step(()=>{ const it = sel(); if (it){ it.pos.xCm = 220; it.pos.yCm = 120; } }, 250);
    await step(()=>{ const it = sel(); if (it) it.pos.xCm += 40; }, 200);
    await step(()=>{ const it = sel(); if (it) it.pos.yCm += 40; }, 200);
    await step(()=>{ const it = sel(); if (it) it.pos.xCm -= 40; }, 200);
    await step(()=>{ const it = sel(); if (it) it.pos.yCm = Math.max(0, it.pos.yCm - 40); }, 200);
    await step(()=>{ window.rotateSelected(); }, 250);

    // Neighbor snap against nearby items
    await step(()=>{ const it = sel(); if (it) scene.snapToNeighbors(it); }, 250);

    // Slight zoom in and out to show fit
    await step(()=>{ window.pixelsPerCm = Math.min(window.pixelsPerCm*1.15, window.computeMaxZoom()); window.createOrResizeCanvas(); }, 250);
    await step(()=>{ window.pixelsPerCm = Math.max(window.pixelsPerCm*0.9, 0.5); window.createOrResizeCanvas(); }, 250);

    // Move human probe around
    await step(()=>{ scene.human.pos = { xCm: 60, yCm: 60 }; }, 300);
    await step(()=>{ scene.human.pos = { xCm: 200, yCm: 160 }; }, 300);
    await step(()=>{ scene.human.pos = { xCm: 380, yCm: 220 }; }, 300);

    // Finish recording
    await sleep(1500);
    rec.stop();
  }

  window.addEventListener('load', ()=>{ recordAndDrive().catch(err=>{ console.error(err); }); });
})();
