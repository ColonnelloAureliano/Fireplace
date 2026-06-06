(function(){
  "use strict";

  /* ── DOM refs ─────────────────────────── */
  const hearth   = document.getElementById("hearth");
  const canvas   = document.getElementById("drawCanvas");
  const ctx      = canvas.getContext("2d");
  const prompt   = document.getElementById("prompt");
  const overlay  = document.getElementById("whiteOverlay");

  /* ── state ────────────────────────────── */
  let activated     = false;
  let drawing       = false;
  let strokes       = [];
  let currentStroke = [];
  let idleTimer     = null;
  const IDLE_MS     = 1200;

  /* ── canvas sizing ────────────────────── */
  function resizeCanvas(){
    canvas.width  = hearth.clientWidth;
    canvas.height = hearth.clientHeight;
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  /* ── pointer position helper ──────────── */
  function ptrXY(e){
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  /* ── activate prompt on first tap ─────── */
  hearth.addEventListener("pointerdown", function(){
    if(!activated){
      activated = true;
      prompt.classList.add("visible");
    }
  });

  /* ── drawing ──────────────────────────── */
  function startDraw(e){
    if(!activated) return;
    e.preventDefault();
    drawing = true;
    currentStroke = [];
    currentStroke.push(ptrXY(e));
    clearTimeout(idleTimer);
  }
  function moveDraw(e){
    if(!drawing) return;
    e.preventDefault();
    const p = ptrXY(e);
    currentStroke.push(p);
    drawEmber(p);
    clearTimeout(idleTimer);
  }
  function endDraw(){
    if(!drawing) return;
    drawing = false;
    if(currentStroke.length > 2) strokes.push(currentStroke.slice());
    currentStroke = [];
    clearTimeout(idleTimer);
    if(strokes.length > 0) idleTimer = setTimeout(checkPassword, IDLE_MS);
  }

  canvas.addEventListener("mousedown",  startDraw);
  canvas.addEventListener("mousemove",  moveDraw);
  canvas.addEventListener("mouseup",    endDraw);
  canvas.addEventListener("mouseleave", endDraw);
  canvas.addEventListener("touchstart", startDraw, {passive:false});
  canvas.addEventListener("touchmove",  moveDraw,  {passive:false});
  canvas.addEventListener("touchend",   endDraw);

  /* ── ember glow effect ────────────────── */
  function drawEmber(p){
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    let g = ctx.createRadialGradient(p.x,p.y,0, p.x,p.y,14);
    g.addColorStop(0,"rgba(255,100,0,0.9)");
    g.addColorStop(0.4,"rgba(220,40,0,0.5)");
    g.addColorStop(1,"rgba(100,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x,p.y,14,0,Math.PI*2); ctx.fill();
    let g2 = ctx.createRadialGradient(p.x,p.y,0, p.x,p.y,5);
    g2.addColorStop(0,"rgba(255,220,180,1)");
    g2.addColorStop(1,"rgba(255,80,0,0)");
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(p.x,p.y,5,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  /* ── fade trail animation ─────────────── */
  function fadeTrail(cb){
    let n = 0;
    const step = ()=>{
      n++;
      if(n > 30){
        ctx.clearRect(0,0,canvas.width,canvas.height);
        if(cb) cb();
        return;
      }
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.07)";
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.restore();
      requestAnimationFrame(step);
    };
    step();
  }

  /* ═══════════════════════════════════════════════════════════
     ██  "H"  RECOGNITION  ENGINE
     ═══════════════════════════════════════════════════════════ */

  function rasterise(pts, G, bb){
    const grid = Array.from({length:G}, ()=> new Float32Array(G));
    const bw = bb.maxX - bb.minX || 1;
    const bh = bb.maxY - bb.minY || 1;
    pts.forEach(p=>{
      const gx = Math.min(G-1, Math.max(0, Math.floor((p.x - bb.minX) / bw * G)));
      const gy = Math.min(G-1, Math.max(0, Math.floor((p.y - bb.minY) / bh * G)));
      grid[gy][gx] = 1;
      if(gx>0)   grid[gy][gx-1] = Math.max(grid[gy][gx-1], 0.6);
      if(gx<G-1) grid[gy][gx+1] = Math.max(grid[gy][gx+1], 0.6);
      if(gy>0)   grid[gy-1][gx] = Math.max(grid[gy-1][gx], 0.6);
      if(gy<G-1) grid[gy+1][gx] = Math.max(grid[gy+1][gx], 0.6);
    });
    return grid;
  }

  function zoneDensity(grid, r0, r1, c0, c1){
    let s = 0;
    const area = (r1 - r0 + 1) * (c1 - c0 + 1);
    for(let r = r0; r <= r1; r++)
      for(let c = c0; c <= c1; c++)
        s += (grid[r] && grid[r][c]) || 0;
    return area > 0 ? s / area : 0;
  }

  function bbox(pts){
    let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
    pts.forEach(p=>{
      if(p.x<minX) minX=p.x; if(p.x>maxX) maxX=p.x;
      if(p.y<minY) minY=p.y; if(p.y>maxY) maxY=p.y;
    });
    return {minX, maxX, minY, maxY};
  }

  /* ── main recognition ──────────────────── */
  function checkPassword(){
    const all = strokes.flat();
    if(all.length < 15){ resetScene(); return; }

    const bb = bbox(all);
    const bw = bb.maxX - bb.minX;
    const bh = bb.maxY - bb.minY;
    if(bw < 20 || bh < 20){ resetScene(); return; }

    const G = 10;
    const grid = rasterise(all, G, bb);

    let score = 0;
    const log = [];

    /* 1: left column (vertical left stroke) */
    const leftCol = zoneDensity(grid, 0, G-1, 0, 2);
    if(leftCol > 0.25) score++;
    log.push(`leftCol=${leftCol.toFixed(2)} ${leftCol>0.25?"✓":"✗"}`);

    /* 2: right column (vertical right stroke) */
    const rightCol = zoneDensity(grid, 0, G-1, 7, 9);
    if(rightCol > 0.25) score++;
    log.push(`rightCol=${rightCol.toFixed(2)} ${rightCol>0.25?"✓":"✗"}`);

    /* 3: middle crossbar */
    const midBar = zoneDensity(grid, 3, 6, 2, 7);
    if(midBar > 0.20) score++;
    log.push(`midBar=${midBar.toFixed(2)} ${midBar>0.20?"✓":"✗"}`);

    /* 4: top-center EMPTY → rejects A, M, W */
    const topCenter = zoneDensity(grid, 0, 2, 3, 6);
    if(topCenter < 0.18) score++;
    log.push(`topCenter_empty=${topCenter.toFixed(2)} ${topCenter<0.18?"✓":"✗"}`);

    /* 5: bottom-center EMPTY → rejects 8, 0, B */
    const botCenter = zoneDensity(grid, 7, 9, 3, 6);
    if(botCenter < 0.18) score++;
    log.push(`botCenter_empty=${botCenter.toFixed(2)} ${botCenter<0.18?"✓":"✗"}`);

    /* 6: top-left has ink */
    const topLeft = zoneDensity(grid, 0, 3, 0, 3);
    if(topLeft > 0.15) score++;
    log.push(`topLeft=${topLeft.toFixed(2)} ${topLeft>0.15?"✓":"✗"}`);

    /* 7: top-right has ink */
    const topRight = zoneDensity(grid, 0, 3, 7, 9);
    if(topRight > 0.15) score++;
    log.push(`topRight=${topRight.toFixed(2)} ${topRight>0.15?"✓":"✗"}`);

    /* 8: aspect ratio */
    const aspect = bw / bh;
    if(aspect > 0.4 && aspect < 2.0) score++;
    log.push(`aspect=${aspect.toFixed(2)} ${(aspect>0.4&&aspect<2.0)?"✓":"✗"}`);

    /* ── decision ──────────────────────────── */
    const pass = score >= 6;
    log.push(`SCORE=${score}/8 → ${pass?"✅ PASS":"❌ FAIL"}`);
    console.log("H Recognition:", log.join(" | "));

    if(pass){
      overlay.classList.add("active");
    } else {
      resetScene();
    }
  }

  /* ── reset ─────────────────────────────── */
  function resetScene(){
    fadeTrail(()=>{
      strokes = [];
      prompt.classList.remove("visible");
      activated = false;
    });
  }

})();
