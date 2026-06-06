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

  /* ── pointer helper ───────────────────── */
  function ptrXY(e){
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  /* ── activate on first tap ────────────── */
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
     ██  ZONE-BASED  "H"  RECOGNITION
     ══════════════════════════════════════════════════════════

     The brick frame creates a natural 3×3 grid in the hearth:

     Vertical splits (from gaps between top/bottom bricks):
       colLeft   : 0.00 – 0.30
       colCenter : 0.30 – 0.70
       colRight  : 0.70 – 1.00

     Horizontal split (from gap between side bricks):
       rowTop    : 0.00 – 0.35
       rowMid    : 0.35 – 0.65
       rowBot    : 0.65 – 1.00

     ┌──────┬──────────┬──────┐
     │ L-T  │   C-T    │ R-T  │
     ├──────┼──────────┼──────┤
     │ L-M  │   C-M    │ R-M  │  ← crossbar zone
     ├──────┼──────────┼──────┤
     │ L-B  │   C-B    │ R-B  │
     └──────┴──────────┴──────┘

     H pattern:
       ✓ ink: LT, LM, LB  (left stroke)
       ✓ ink: RT, RM, RB  (right stroke)
       ✓ ink: CM           (crossbar)
       ✗ empty: CT         (rejects A, M)
       ✗ empty: CB         (rejects 8, 0)
   */

  const CL = 0.30, CR = 0.70;
  const RT_LINE = 0.35, RB_LINE = 0.65;

  function zoneCount(pts, W, H, x0f, x1f, y0f, y1f){
    const x0 = x0f*W, x1 = x1f*W, y0 = y0f*H, y1 = y1f*H;
    let n = 0;
    for(let i = 0; i < pts.length; i++){
      if(pts[i].x >= x0 && pts[i].x < x1 &&
         pts[i].y >= y0 && pts[i].y < y1) n++;
    }
    return n;
  }

  function zoneDensity(pts, W, H, x0f, x1f, y0f, y1f){
    const area = (x1f-x0f)*W * (y1f-y0f)*H;
    return area > 0 ? zoneCount(pts,W,H,x0f,x1f,y0f,y1f)/area : 0;
  }

  /* ── main check ───────────────────────── */
  function checkPassword(){
    const all = strokes.flat();
    if(all.length < 20){ resetScene(); return; }

    const W = canvas.width, H = canvas.height;
    let score = 0;
    const log = [];

    /* 9 zone densities */
    const LT = zoneDensity(all,W,H, 0, CL, 0,       RT_LINE);
    const CT = zoneDensity(all,W,H, CL,CR, 0,       RT_LINE);
    const RTop=zoneDensity(all,W,H, CR, 1, 0,       RT_LINE);

    const LM = zoneDensity(all,W,H, 0, CL, RT_LINE, RB_LINE);
    const CM = zoneDensity(all,W,H, CL,CR, RT_LINE, RB_LINE);
    const RM = zoneDensity(all,W,H, CR, 1, RT_LINE, RB_LINE);

    const LB = zoneDensity(all,W,H, 0, CL, RB_LINE, 1);
    const CB = zoneDensity(all,W,H, CL,CR, RB_LINE, 1);
    const RBot=zoneDensity(all,W,H, CR, 1, RB_LINE, 1);

    /* adaptive thresholds based on max density */
    const maxD = Math.max(LT,CT,RTop,LM,CM,RM,LB,CB,RBot);
    const inkTh = maxD * 0.15;
    const empTh = maxD * 0.25;

    /* 1-3: left column has ink */
    if(LT>inkTh) score++; log.push(`LT=${LT.toFixed(4)} ${LT>inkTh?"✓":"✗"}`);
    if(LM>inkTh) score++; log.push(`LM=${LM.toFixed(4)} ${LM>inkTh?"✓":"✗"}`);
    if(LB>inkTh) score++; log.push(`LB=${LB.toFixed(4)} ${LB>inkTh?"✓":"✗"}`);

    /* 4-6: right column has ink */
    if(RTop>inkTh) score++; log.push(`RT=${RTop.toFixed(4)} ${RTop>inkTh?"✓":"✗"}`);
    if(RM>inkTh)   score++; log.push(`RM=${RM.toFixed(4)} ${RM>inkTh?"✓":"✗"}`);
    if(RBot>inkTh) score++; log.push(`RB=${RBot.toFixed(4)} ${RBot>inkTh?"✓":"✗"}`);

    /* 7: center-middle has ink (crossbar) */
    if(CM>inkTh) score++; log.push(`CM=${CM.toFixed(4)} ${CM>inkTh?"✓":"✗"}`);

    /* 8: center-top EMPTY (rejects A, M) */
    if(CT<empTh) score++; log.push(`CT_empty=${CT.toFixed(4)} ${CT<empTh?"✓":"✗"}`);

    /* 9: center-bottom EMPTY (rejects 8, 0, B) */
    if(CB<empTh) score++; log.push(`CB_empty=${CB.toFixed(4)} ${CB<empTh?"✓":"✗"}`);

    const pass = score >= 7;
    log.push(`th:ink=${inkTh.toFixed(4)} emp=${empTh.toFixed(4)}`);
    log.push(`SCORE=${score}/9 → ${pass?"✅ PASS":"❌ FAIL"}`);
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
