(function(){
  "use strict";

  /* ── DOM ──────────────────────────────── */
  const hearth  = document.getElementById("hearth");
  const canvas  = document.getElementById("drawCanvas");
  const ctx     = canvas.getContext("2d");
  const prompt  = document.getElementById("prompt");
  const overlay = document.getElementById("whiteOverlay");

  /* ── state ────────────────────────────── */
  let activated     = false;
  let drawing       = false;
  let strokes       = [];
  let currentStroke = [];
  let idleTimer     = null;
  const IDLE_MS     = 1200;

  /* ── canvas size ──────────────────────── */
  function resizeCanvas(){
    canvas.width  = hearth.clientWidth;
    canvas.height = hearth.clientHeight;
    computeZones();
  }
  window.addEventListener("resize", resizeCanvas);

  /* ═══════════════════════════════════════════════════════════
     ██  DYNAMIC ZONE COMPUTATION FROM BRICK POSITIONS
     ═══════════════════════════════════════════════════════════ */
  let zones = { CL: 0.25, CR: 0.75, MID: 0.50 };

  function computeZones(){
    const hR = hearth.getBoundingClientRect();
    if(hR.width === 0 || hR.height === 0) return;

    const bt1 = document.querySelector(".bt1").getBoundingClientRect();
    const bt2 = document.querySelector(".bt2").getBoundingClientRect();
    const bt3 = document.querySelector(".bt3").getBoundingClientRect();
    const bl1 = document.querySelector(".bl1").getBoundingClientRect();
    const bl2 = document.querySelector(".bl2").getBoundingClientRect();

    zones = {
      CL:  ((bt1.right + bt2.left) / 2 - hR.left) / hR.width,
      CR:  ((bt2.right + bt3.left) / 2 - hR.left) / hR.width,
      MID: ((bl1.bottom + bl2.top) / 2 - hR.top) / hR.height
    };
    console.log("Zones:", JSON.stringify(zones));
  }

  window.addEventListener("load", ()=>{ resizeCanvas(); computeZones(); });

  /* ── pointer helper ───────────────────── */
  function ptrXY(e){
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  /* ── activate ─────────────────────────── */
  hearth.addEventListener("pointerdown", function(){
    if(!activated){ activated = true; prompt.classList.add("visible"); }
  });

  /* ── drawing ──────────────────────────── */
  function startDraw(e){
    if(!activated) return;
    e.preventDefault(); drawing = true;
    currentStroke = []; currentStroke.push(ptrXY(e));
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

  /* ── ember glow ───────────────────────── */
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

  /* ── fade trail ───────────────────────── */
  function fadeTrail(cb){
    let n = 0;
    const step = ()=>{
      n++;
      if(n > 30){ ctx.clearRect(0,0,canvas.width,canvas.height); if(cb) cb(); return; }
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
     ██  ZONE-BASED  "H"  RECOGNITION
     ═══════════════════════════════════════════════════════════

     ┌──────────┬──────────────┬──────────┐
     │   L-T    │     C-T      │   R-T    │
     ├──────────┼──────────────┼──────────┤
     │   L-M    │     C-M      │   R-M    │ ← crossbar
     ├──────────┼──────────────┼──────────┤
     │   L-B    │     C-B      │   R-B    │
     └──────────┴──────────────┴──────────┘
       0 → CL    CL → CR       CR → 1
  */

  const BAND = 0.14;

  function zoneDensity(pts, W, H, x0f, x1f, y0f, y1f){
    const x0=x0f*W, x1=x1f*W, y0=y0f*H, y1=y1f*H;
    let n=0;
    for(let i=0;i<pts.length;i++){
      if(pts[i].x>=x0 && pts[i].x<x1 && pts[i].y>=y0 && pts[i].y<y1) n++;
    }
    const area = (x1-x0)*(y1-y0);
    return area>0 ? n/area : 0;
  }

  function checkPassword(){
    const all = strokes.flat();
    if(all.length < 20){ resetScene(); return; }

    const W = canvas.width, H = canvas.height;
    const {CL, CR, MID} = zones;
    const MT = Math.max(0, MID - BAND);
    const MB = Math.min(1, MID + BAND);

    let score = 0;
    const log = [];

    const LT = zoneDensity(all,W,H,  0, CL,  0, MT);
    const CT = zoneDensity(all,W,H, CL, CR,  0, MT);
    const RT = zoneDensity(all,W,H, CR,  1,  0, MT);
    const LM = zoneDensity(all,W,H,  0, CL, MT, MB);
    const CM = zoneDensity(all,W,H, CL, CR, MT, MB);
    const RM = zoneDensity(all,W,H, CR,  1, MT, MB);
    const LB = zoneDensity(all,W,H,  0, CL, MB,  1);
    const CB = zoneDensity(all,W,H, CL, CR, MB,  1);
    const RB = zoneDensity(all,W,H, CR,  1, MB,  1);

    const maxD  = Math.max(LT,CT,RT,LM,CM,RM,LB,CB,RB);
    const inkTh = maxD * 0.15;
    const empTh = maxD * 0.25;

    if(LT>inkTh) score++; log.push(`LT=${LT.toFixed(4)} ${LT>inkTh?"✓":"✗"}`);
    if(LM>inkTh) score++; log.push(`LM=${LM.toFixed(4)} ${LM>inkTh?"✓":"✗"}`);
    if(LB>inkTh) score++; log.push(`LB=${LB.toFixed(4)} ${LB>inkTh?"✓":"✗"}`);
    if(RT>inkTh) score++; log.push(`RT=${RT.toFixed(4)} ${RT>inkTh?"✓":"✗"}`);
    if(RM>inkTh) score++; log.push(`RM=${RM.toFixed(4)} ${RM>inkTh?"✓":"✗"}`);
    if(RB>inkTh) score++; log.push(`RB=${RB.toFixed(4)} ${RB>inkTh?"✓":"✗"}`);
    if(CM>inkTh) score++; log.push(`CM=${CM.toFixed(4)} ${CM>inkTh?"✓":"✗"}`);
    if(CT<empTh) score++; log.push(`CT_emp=${CT.toFixed(4)} ${CT<empTh?"✓":"✗"}`);
    if(CB<empTh) score++; log.push(`CB_emp=${CB.toFixed(4)} ${CB<empTh?"✓":"✗"}`);

    const pass = score >= 7;
    log.push(`th:ink=${inkTh.toFixed(4)} emp=${empTh.toFixed(4)}`);
    log.push(`SCORE=${score}/9 → ${pass?"✅ PASS":"❌ FAIL"}`);
    console.log("H Recognition:", log.join(" | "));

    if(pass){ overlay.classList.add("active"); }
    else    { resetScene(); }
  }

  function resetScene(){
    fadeTrail(()=>{
      strokes = [];
      prompt.classList.remove("visible");
      activated = false;
    });
  }

})();
