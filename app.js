(function(){
  "use strict";

  /* ── DOM refs ─────────────────────────── */
  const hearth   = document.getElementById("hearth");
  const canvas   = document.getElementById("drawCanvas");
  const ctx      = canvas.getContext("2d");
  const prompt   = document.getElementById("prompt");
  const overlay  = document.getElementById("whiteOverlay");

  /* ── state ────────────────────────────── */
  let activated   = false;   // user tapped the hearth once
  let drawing     = false;
  let strokes     = [];      // array of strokes, each stroke = [{x,y},…]
  let currentStroke = [];
  let idleTimer   = null;
  const IDLE_MS   = 1200;    // wait after last stroke before checking

  /* ── helpers ──────────────────────────── */
  function resizeCanvas(){
    canvas.width  = hearth.clientWidth;
    canvas.height = hearth.clientHeight;
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  /* ── pointer helpers (touch + mouse) ─── */
  function ptrXY(e){
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  /* ── activate prompt on first tap ─────── */
  hearth.addEventListener("pointerdown", function firstTap(){
    if(!activated){
      activated = true;
      prompt.classList.add("visible");
    }
  }, {once:false});

  /* ── drawing with ember trail ─────────── */
  function startDraw(e){
    if(!activated) return;
    e.preventDefault();
    drawing = true;
    currentStroke = [];
    const p = ptrXY(e);
    currentStroke.push(p);
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

  function endDraw(e){
    if(!drawing) return;
    drawing = false;
    if(currentStroke.length > 2){
      strokes.push(currentStroke.slice());
    }
    currentStroke = [];
    // start idle timer
    clearTimeout(idleTimer);
    if(strokes.length > 0){
      idleTimer = setTimeout(checkPassword, IDLE_MS);
    }
  }

  /* ── attach events ─────────────────────── */
  canvas.addEventListener("mousedown",  startDraw);
  canvas.addEventListener("mousemove",  moveDraw);
  canvas.addEventListener("mouseup",    endDraw);
  canvas.addEventListener("mouseleave", endDraw);
  canvas.addEventListener("touchstart", startDraw, {passive:false});
  canvas.addEventListener("touchmove",  moveDraw,  {passive:false});
  canvas.addEventListener("touchend",   endDraw);

  /* ── draw a single ember point ──────── */
  function drawEmber(p){
    // outer glow
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(p.x,p.y,0, p.x,p.y,14);
    g.addColorStop(0,"rgba(255,100,0,0.9)");
    g.addColorStop(0.4,"rgba(220,40,0,0.5)");
    g.addColorStop(1,"rgba(100,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x,p.y,14,0,Math.PI*2);
    ctx.fill();
    // bright core
    ctx.globalCompositeOperation = "lighter";
    const g2 = ctx.createRadialGradient(p.x,p.y,0, p.x,p.y,5);
    g2.addColorStop(0,"rgba(255,220,180,1)");
    g2.addColorStop(1,"rgba(255,80,0,0)");
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(p.x,p.y,5,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  /* ── fade out the ember trail ────────── */
  function fadeTrail(cb){
    let alpha = 1;
    const step = ()=>{
      alpha -= 0.04;
      if(alpha <=0){
        ctx.clearRect(0,0,canvas.width,canvas.height);
        if(cb) cb();
        return;
      }
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = `rgba(0,0,0,0.06)`;
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.restore();
      requestAnimationFrame(step);
    };
    step();
  }

  /* ── recognition logic ──────────────── */
  function checkPassword(){
    // flatten all strokes into a point cloud
    const all = strokes.flat();
    if(all.length < 10){ resetScene(); return; }

    const W = canvas.width, H = canvas.height;

    // bounding box of all points
    let minX=W, maxX=0, minY=H, maxY=0;
    all.forEach(p=>{
      if(p.x<minX) minX=p.x;
      if(p.x>maxX) maxX=p.x;
      if(p.y<minY) minY=p.y;
      if(p.y>maxY) maxY=p.y;
    });

    const bw = maxX-minX, bh = maxY-minY;
    if(bw < 20 || bh < 20){ resetScene(); return; }

    // normalise points to 0..1
    const norm = all.map(p=>({
      x:(p.x-minX)/bw,
      y:(p.y-minY)/bh
    }));

    // create a small grid (pixel image) 20x20 from the strokes
    const G = 20;
    const grid = Array.from({length:G}, ()=> new Float32Array(G));
    norm.forEach(p=>{
      const gx = Math.min(G-1, Math.floor(p.x*G));
      const gy = Math.min(G-1, Math.floor(p.y*G));
      grid[gy][gx] = 1;
      // spread to neighbours for thickness
      if(gx>0)   grid[gy][gx-1] = Math.max(grid[gy][gx-1],0.5);
      if(gx<G-1) grid[gy][gx+1] = Math.max(grid[gy][gx+1],0.5);
      if(gy>0)   grid[gy-1][gx] = Math.max(grid[gy-1][gx],0.5);
      if(gy<G-1) grid[gy+1][gx] = Math.max(grid[gy+1][gx],0.5);
    });

    // ── build ideal "L3" template on same 20×20 grid ──
    const tpl = Array.from({length:G}, ()=> new Float32Array(G));

    // "L" occupies left portion columns 1-8
    // vertical stroke of L: col 2-3, rows 1-17
    for(let r=1;r<=17;r++) { tpl[r][2]=1; tpl[r][3]=1; }
    // horizontal stroke of L: row 16-17, cols 2-8
    for(let c=2;c<=8;c++) { tpl[16][c]=1; tpl[17][c]=1; }

    // "3" occupies right portion columns 11-18
    // top bar row 2-3, cols 11-18
    for(let c=11;c<=18;c++){ tpl[2][c]=1; tpl[3][c]=1; }
    // right side upper: col 17-18, rows 2-9
    for(let r=2;r<=9;r++){ tpl[r][17]=1; tpl[r][18]=1; }
    // middle bar row 9-10, cols 12-18
    for(let c=12;c<=18;c++){ tpl[9][c]=1; tpl[10][c]=1; }
    // right side lower: col 17-18, rows 10-17
    for(let r=10;r<=17;r++){ tpl[r][17]=1; tpl[r][18]=1; }
    // bottom bar row 16-17, cols 11-18
    for(let c=11;c<=18;c++){ tpl[16][c]=1; tpl[17][c]=1; }

    // spread template too
    const tpl2 = Array.from({length:G}, (_,r)=> Float32Array.from(tpl[r]));
    for(let r=0;r<G;r++) for(let c=0;c<G;c++){
      if(tpl[r][c]===1){
        if(r>0) tpl2[r-1][c]=Math.max(tpl2[r-1][c],0.5);
        if(r<G-1) tpl2[r+1][c]=Math.max(tpl2[r+1][c],0.5);
        if(c>0) tpl2[r][c-1]=Math.max(tpl2[r][c-1],0.5);
        if(c<G-1) tpl2[r][c+1]=Math.max(tpl2[r][c+1],0.5);
      }
    }

    // ── compare: correlation ──────────────────────
    let dot=0, magA=0, magB=0;
    for(let r=0;r<G;r++) for(let c=0;c<G;c++){
      const a=grid[r][c], b=tpl2[r][c];
      dot  += a*b;
      magA += a*a;
      magB += b*b;
    }
    const sim = (magA && magB) ? dot / (Math.sqrt(magA)*Math.sqrt(magB)) : 0;

    // ── also check structural features ───────────
    // Left half should have ink, right half should have ink
    let leftInk=0, rightInk=0;
    for(let r=0;r<G;r++) for(let c=0;c<G;c++){
      if(c < G/2) leftInk += grid[r][c];
      else        rightInk += grid[r][c];
    }
    const balanced = (leftInk > 5 && rightInk > 5);

    // aspect ratio of bounding box should be wider than tall or roughly square
    const aspect = bw / bh;
    const okAspect = aspect > 0.6 && aspect < 3.5;

    // ── decision ─────────────────────────────────
    const pass = sim > 0.25 && balanced && okAspect;

    if(pass){
      // SUCCESS → white flash
      overlay.classList.add("active");
    } else {
      resetScene();
    }
  }

  function resetScene(){
    fadeTrail(()=>{
      strokes = [];
      prompt.classList.remove("visible");
      activated = false;
    });
  }

})();
