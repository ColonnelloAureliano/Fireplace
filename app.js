(function(){
  "use strict";

  /* inject red ember pulse animation */
  var styleEl = document.createElement("style");
  styleEl.textContent = "@keyframes emberPulse{0%{transform:translate(-50%,-50%) scale(1);box-shadow:0 0 18px 6px rgba(220,20,0,0.6),0 0 36px 14px rgba(180,0,0,0.3),inset 0 -3px 6px rgba(0,0,0,0.4),inset 0 2px 4px rgba(255,180,120,0.3);}100%{transform:translate(-50%,-50%) scale(1.15);box-shadow:0 0 28px 10px rgba(220,20,0,0.9),0 0 56px 22px rgba(180,0,0,0.5),inset 0 -3px 6px rgba(0,0,0,0.4),inset 0 2px 4px rgba(255,180,120,0.4);}}";
  document.head.appendChild(styleEl);

  var hearth   = document.getElementById("hearth");
  var canvas   = document.getElementById("drawCanvas");
  var ctx      = canvas.getContext("2d");
  var promptEl = document.getElementById("prompt");
  var glow     = document.getElementById("glow");
  var logs     = document.querySelectorAll(".log");
  var bricks   = document.querySelectorAll(".brick");

  var activated     = false;
  var drawing       = false;
  var fireOn        = false;
  var strokes       = [];
  var currentStroke = [];
  var idleTimer     = null;
  var IDLE_MS       = 1200;
  var particles     = [];
  var globalAudioCtx = null;
  var audioPrimed    = false;
  var speechStarted  = false;

  /* === NARRATION via MP3 file === */
  var racconto   = new Audio("racconto.mp3");
  racconto.loop  = true;
  racconto.volume = 0.8;

  function resizeCanvas(){
    if(fireOn) return;
    canvas.width  = hearth.clientWidth;
    canvas.height = hearth.clientHeight;
    computeZones();
  }
  window.addEventListener("resize", resizeCanvas);

  var zones = { CL:0.25, CR:0.75, MID:0.50 };

  function computeZones(){
    var hR = hearth.getBoundingClientRect();
    if(!hR.width) return;
    var b1 = document.querySelector(".bt1").getBoundingClientRect();
    var b2 = document.querySelector(".bt2").getBoundingClientRect();
    var b3 = document.querySelector(".bt3").getBoundingClientRect();
    var l1 = document.querySelector(".bl1").getBoundingClientRect();
    var l2 = document.querySelector(".bl2").getBoundingClientRect();
    zones.CL  = ((b1.right + b2.left) / 2 - hR.left) / hR.width;
    zones.CR  = ((b2.right + b3.left) / 2 - hR.left) / hR.width;
    zones.MID = ((l1.bottom + l2.top) / 2  - hR.top)  / hR.height;
  }
  window.addEventListener("load", function(){ resizeCanvas(); computeZones(); });

  /* === AUDIO CONTEXT PRIMING === */
  function primeAudioCtx(){
    if(!globalAudioCtx){
      try{
        var AC = window.AudioContext || window.webkitAudioContext;
        if(AC){ globalAudioCtx = new AC(); }
      }catch(e){}
    }
    if(globalAudioCtx && globalAudioCtx.state === "suspended"){
      try{ globalAudioCtx.resume(); }catch(e){}
    }
    if(globalAudioCtx && !audioPrimed){
      try{
        var sb = globalAudioCtx.createBuffer(1, 1, globalAudioCtx.sampleRate);
        var ss = globalAudioCtx.createBufferSource();
        ss.buffer = sb;
        ss.connect(globalAudioCtx.destination);
        ss.start();
        audioPrimed = true;
      }catch(e){}
    }
  }

  document.addEventListener("touchend", primeAudioCtx, {once: true});
  document.addEventListener("click",    primeAudioCtx, {once: true});
  hearth.addEventListener("touchend", function(){ primeAudioCtx(); }, false);
  hearth.addEventListener("click",    function(){ primeAudioCtx(); }, false);

  function ptrXY(e){
    var r = canvas.getBoundingClientRect();
    var t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  hearth.addEventListener("pointerdown", function(){
    if(!activated && !fireOn){
      activated = true;
      promptEl.classList.add("visible");
    }
  });

  function startDraw(e){
    if(!activated || fireOn) return;
    e.preventDefault(); drawing = true;
    currentStroke = [ptrXY(e)];
    clearTimeout(idleTimer);
  }
  function moveDraw(e){
    if(!drawing) return;
    e.preventDefault();
    var p = ptrXY(e);
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

  function drawEmber(p){
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 14);
    g.addColorStop(0, "rgba(255,100,0,0.9)");
    g.addColorStop(0.4, "rgba(220,40,0,0.5)");
    g.addColorStop(1, "rgba(100,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 2); ctx.fill();
    var g2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 5);
    g2.addColorStop(0, "rgba(255,220,180,1)");
    g2.addColorStop(1, "rgba(255,80,0,0)");
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function fadeTrail(cb){
    var n = 0;
    function step(){
      n++;
      if(n > 30){ ctx.clearRect(0, 0, canvas.width, canvas.height); if(cb) cb(); return; }
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.07)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      requestAnimationFrame(step);
    }
    step();
  }

  var BAND = 0.14;
  function zoneDensity(pts, W, H, x0f, x1f, y0f, y1f){
    var x0 = x0f * W, x1 = x1f * W, y0 = y0f * H, y1 = y1f * H;
    var n = 0;
    for(var i = 0; i < pts.length; i++){
      if(pts[i].x >= x0 && pts[i].x < x1 && pts[i].y >= y0 && pts[i].y < y1) n++;
    }
    var a = (x1 - x0) * (y1 - y0);
    return a > 0 ? n / a : 0;
  }

  function checkPassword(){
    var all = [];
    for(var s = 0; s < strokes.length; s++){
      for(var p = 0; p < strokes[s].length; p++){
        all.push(strokes[s][p]);
      }
    }
    if(all.length < 20){ resetScene(); return; }
    var W = canvas.width, H = canvas.height;
    var CL = zones.CL, CR = zones.CR, MID = zones.MID;
    var MT = Math.max(0, MID - BAND), MB = Math.min(1, MID + BAND);
    var score = 0;
    var LT = zoneDensity(all, W, H, 0, CL, 0, MT);
    var CT = zoneDensity(all, W, H, CL, CR, 0, MT);
    var RT = zoneDensity(all, W, H, CR, 1, 0, MT);
    var LM = zoneDensity(all, W, H, 0, CL, MT, MB);
    var CM = zoneDensity(all, W, H, CL, CR, MT, MB);
    var RM = zoneDensity(all, W, H, CR, 1, MT, MB);
    var LB = zoneDensity(all, W, H, 0, CL, MB, 1);
    var CB = zoneDensity(all, W, H, CL, CR, MB, 1);
    var RB = zoneDensity(all, W, H, CR, 1, MB, 1);
    var maxD = Math.max(LT, CT, RT, LM, CM, RM, LB, CB, RB);
    var inkTh = maxD * 0.15, empTh = maxD * 0.25;
    if(LT > inkTh) score++;
    if(LM > inkTh) score++;
    if(LB > inkTh) score++;
    if(RT > inkTh) score++;
    if(RM > inkTh) score++;
    if(RB > inkTh) score++;
    if(CM > inkTh) score++;
    if(CT < empTh) score++;
    if(CB < empTh) score++;
    console.log("H score: " + score + "/9");
    if(score >= 7){ ignite(); }
    else          { resetScene(); }
  }

  function resetScene(){
    fadeTrail(function(){
      strokes = [];
      promptEl.classList.remove("visible");
      activated = false;
    });
  }

  /* === IGNITE === */
  function ignite(){
    fireOn = true;
    console.log("IGNITE");
    promptEl.classList.remove("visible");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if(globalAudioCtx && globalAudioCtx.state === "suspended"){
      try{ globalAudioCtx.resume(); }catch(e){}
    }
    for(var i = 0; i < logs.length; i++) logs[i].classList.add("burning");
    for(var j = 0; j < bricks.length; j++) bricks[j].classList.add("warm");
    glow.classList.add("active");
    try{ startFireAnimation(); }catch(e){ console.error("Fire err:", e); }
    try{ startCrackling(); }catch(e){ console.error("Crack err:", e); }
    /*
     * ALWAYS show ember button + try autoplay racconto.mp3.
     * If autoplay works (desktop), hide the button automatically.
     * If autoplay fails (mobile), button stays visible for user tap.
     */
    setTimeout(function(){
      showListenButton();
      racconto.play().then(function(){
        speechStarted = true;
        console.log("Racconto autoplay OK");
        /* hide ember button since autoplay worked */
        var old = document.getElementById("listenBtn");
        if(old){
          old.style.opacity = "0";
          old.style.transform = "translate(-50%,-50%) scale(0.3)";
          setTimeout(function(){ try{ old.remove(); }catch(ex){} }, 500);
        }
      }).catch(function(e){
        console.log("Racconto autoplay blocked, waiting for tap:", e);
      });
    }, 2500);
  }

  /* === FIRE PARTICLES === */
  function Particle(type){
    var W = canvas.width, H = canvas.height;
    this.type = type;
    this.x = W * (0.12 + Math.random() * 0.76);
    this.y = H * (0.68 + Math.random() * 0.20);
    if(type === "flame"){
      this.size = 6 + Math.random() * 18;
      this.vx = (Math.random() - 0.5) * 0.8;
      this.vy = -(1.0 + Math.random() * 2.5);
      this.maxLife = 50 + Math.random() * 40;
    } else {
      this.size = 1.5 + Math.random() * 3;
      this.vx = (Math.random() - 0.5) * 1.2;
      this.vy = -(0.8 + Math.random() * 2.0);
      this.maxLife = 70 + Math.random() * 60;
    }
    this.life = 0;
  }

  function updateP(p){
    p.life++;
    p.x += p.vx + (Math.random() - 0.5) * 0.6;
    p.y += p.vy;
    p.vy *= 0.995;
    if(p.type === "flame") p.size *= 0.985;
    return p.life < p.maxLife && p.size > 0.5;
  }

  function drawP(p){
    var t = p.life / p.maxLife;
    var r, g, b, a;
    if(p.type === "flame"){
      if(t < 0.15){ r = 255; g = 240; b = 200; a = 0.9; }
      else if(t < 0.4){ r = 255; g = 200; b = 50; a = 0.8 - t * 0.5; }
      else if(t < 0.7){ r = 255; g = 120; b = 20; a = 0.6 - t * 0.4; }
      else { r = 200; g = 40; b = 10; a = Math.max(0, 0.4 - t * 0.4); }
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      var gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      gr.addColorStop(0, "rgba(" + r + "," + g + "," + b + "," + a + ")");
      gr.addColorStop(0.4, "rgba(" + r + "," + Math.max(0, g - 40) + "," + Math.max(0, b - 10) + "," + (a * 0.6) + ")");
      gr.addColorStop(1, "rgba(" + Math.max(0, r - 60) + ",0,0,0)");
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      a = Math.max(0, 1 - t);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      var gr2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      gr2.addColorStop(0, "rgba(255,220,150," + a + ")");
      gr2.addColorStop(0.5, "rgba(255,140,40," + (a * 0.6) + ")");
      gr2.addColorStop(1, "rgba(200,60,0,0)");
      ctx.fillStyle = gr2;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function startFireAnimation(){
    var W = canvas.width, H = canvas.height;
    function loop(){
      ctx.clearRect(0, 0, W, H);
      for(var i = 0; i < 4; i++) particles.push(new Particle("flame"));
      if(Math.random() < 0.3) particles.push(new Particle("ember"));
      var alive = [];
      for(var j = 0; j < particles.length; j++){
        if(updateP(particles[j])){ drawP(particles[j]); alive.push(particles[j]); }
      }
      particles = alive;
      requestAnimationFrame(loop);
    }
    loop();
  }

  /* === CRACKLING === */
  function startCrackling(){
    var a = globalAudioCtx;
    if(!a){
      var AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return;
      try{ a = new AC(); globalAudioCtx = a; }catch(e){ return; }
    }
    if(a.state === "suspended") try{ a.resume(); }catch(e){}
    var len = 2 * a.sampleRate;
    var buf = a.createBuffer(1, len, a.sampleRate);
    var d = buf.getChannelData(0);
    var last = 0;
    for(var i = 0; i < len; i++){
      var w = Math.random() * 2 - 1;
      d[i] = (last + 0.02 * w) / 1.02;
      last = d[i]; d[i] *= 3.5;
    }
    var src = a.createBufferSource(); src.buffer = buf; src.loop = true;
    var lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 180;
    var rG = a.createGain(); rG.gain.value = 0.25;
    src.connect(lp); lp.connect(rG); rG.connect(a.destination); src.start();
    var hB = a.createBuffer(1, len, a.sampleRate);
    var hd = hB.getChannelData(0);
    for(var k = 0; k < len; k++) hd[k] = Math.random() * 2 - 1;
    var hS = a.createBufferSource(); hS.buffer = hB; hS.loop = true;
    var bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 3000; bp.Q.value = 2;
    var hGn = a.createGain(); hGn.gain.value = 0.06;
    hS.connect(bp); bp.connect(hGn); hGn.connect(a.destination); hS.start();
    function pop(){
      try{
        var now = a.currentTime;
        var pL = Math.floor(a.sampleRate * (0.01 + Math.random() * 0.04));
        var pB = a.createBuffer(1, pL, a.sampleRate);
        var pd = pB.getChannelData(0);
        for(var pi = 0; pi < pL; pi++) pd[pi] = Math.random() * 2 - 1;
        var pS = a.createBufferSource(); pS.buffer = pB;
        var pBP = a.createBiquadFilter(); pBP.type = "bandpass";
        pBP.frequency.value = 600 + Math.random() * 3000; pBP.Q.value = 3 + Math.random() * 12;
        var pG = a.createGain();
        pG.gain.setValueAtTime(0.12 + Math.random() * 0.22, now);
        pG.gain.exponentialRampToValueAtTime(0.001, now + 0.02 + Math.random() * 0.06);
        pS.connect(pBP); pBP.connect(pG); pG.connect(a.destination);
        pS.start(now); pS.stop(now + 0.1);
      }catch(e){}
      if(fireOn) setTimeout(pop, 80 + Math.random() * 500);
    }
    setTimeout(pop, 400);
    function crack(){
      try{
        var now = a.currentTime;
        var cL = Math.floor(a.sampleRate * 0.06);
        var cB = a.createBuffer(1, cL, a.sampleRate);
        var cd = cB.getChannelData(0);
        var v = 0.5 + Math.random() * 0.5;
        for(var ci = 0; ci < cL; ci++){ cd[ci] = (Math.random() * 2 - 1) * v; v *= 0.997; }
        var cS = a.createBufferSource(); cS.buffer = cB;
        var cG = a.createGain();
        cG.gain.setValueAtTime(0.3 + Math.random() * 0.15, now);
        cG.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        cS.connect(cG); cG.connect(a.destination); cS.start(now); cS.stop(now + 0.1);
      }catch(e){}
      if(fireOn) setTimeout(crack, 1500 + Math.random() * 4000);
    }
    setTimeout(crack, 1000);
  }

  /* === RED GLOWING EMBER BUTTON === */
  function showListenButton(){
    var old = document.getElementById("listenBtn");
    if(old) old.remove();
    var btn = document.createElement("div");
    btn.id = "listenBtn";
    btn.style.cssText = [
      "position:absolute",
      "top:38%",
      "left:50%",
      "width:50px",
      "height:50px",
      "transform:translate(-50%,-50%)",
      "z-index:10",
      "cursor:pointer",
      "border-radius:50%",
      "background:radial-gradient(circle at 40% 35%, #ffd0a0 0%, #ee4422 25%, #cc1100 50%, #880000 75%, #440000 100%)",
      "box-shadow:0 0 18px 6px rgba(220,20,0,0.6), 0 0 36px 14px rgba(180,0,0,0.3), inset 0 -3px 6px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,180,120,0.3)",
      "animation:emberPulse 1.2s ease-in-out infinite alternate",
      "transition:opacity 0.4s, transform 0.4s"
    ].join(";") + ";";
    hearth.appendChild(btn);
    console.log("Ember button shown");

    function handleTap(e){
      e.preventDefault();
      e.stopPropagation();
      btn.style.opacity = "0";
      btn.style.transform = "translate(-50%,-50%) scale(0.3)";
      btn.style.pointerEvents = "none";
      setTimeout(function(){ try{ btn.remove(); }catch(ex){} }, 500);

      racconto.play().then(function(){
        speechStarted = true;
        console.log("Racconto started from ember tap");
      }).catch(function(ex){ console.error("Racconto play err:", ex); });
    }
    btn.addEventListener("touchend", handleTap, false);
    btn.addEventListener("click", handleTap, false);
  }

})();
