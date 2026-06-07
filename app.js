(function(){
  "use strict";

  /* inject ember pulse animation */
  var styleEl = document.createElement("style");
  styleEl.textContent = "@keyframes emberPulse{0%{transform:translate(-50%,-50%) scale(1);box-shadow:0 0 20px 8px rgba(255,120,20,0.6),0 0 40px 16px rgba(255,80,0,0.3),inset 0 -3px 6px rgba(0,0,0,0.3),inset 0 2px 4px rgba(255,255,200,0.3);}100%{transform:translate(-50%,-50%) scale(1.15);box-shadow:0 0 30px 12px rgba(255,120,20,0.9),0 0 60px 24px rgba(255,80,0,0.5),inset 0 -3px 6px rgba(0,0,0,0.3),inset 0 2px 4px rgba(255,255,200,0.4);}}";
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

  var STORY = "L\u2019Isola Viscontea, situata a Lecco dove il Lago di Como torna a essere il fiume Adda, \u00e8 un piccolo gioiello di origine artificiale: nacque nel quindicesimo secolo come accumulo di detriti e materiali di scavo durante i lavori di costruzione e ampliamento del vicino Ponte Azzone Visconti. Sulla sua funzione originaria ci sono pareri discordanti: alcuni storici pensano fosse un piccolo avamposto di controllo per la navigazione e i dazi sul fiume, altri una semplice casa di pescatori.";

  /* voice params: deep old man */
  var VOICE_RATE  = 0.75;
  var VOICE_PITCH = 0.6;

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
        console.log("AudioContext unlocked");
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

    setTimeout(function(){
      try{ tryAutoNarration(); }catch(e){ console.error("Narr err:", e); }
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

  /* === NARRATION === */
  var italianVoice = null;
  var resumeTimer  = null;

  /* known male Italian TTS voice names across platforms */
  var MALE_NAMES = ["luca", "giorgio", "marco", "andrea", "paolo", "carlo",
                    "cosimo", "google italiano", "male"];

  function findVoice(){
    if(typeof speechSynthesis === "undefined") return;
    try{
      var voices = speechSynthesis.getVoices();
      if(!voices || !voices.length) return;

      var itVoices = [];
      for(var i = 0; i < voices.length; i++){
        if(voices[i].lang === "it-IT" || (voices[i].lang && voices[i].lang.indexOf("it") === 0)){
          itVoices.push(voices[i]);
        }
      }
      if(!itVoices.length) return;

      /* try to find a male voice */
      for(var m = 0; m < MALE_NAMES.length; m++){
        for(var v = 0; v < itVoices.length; v++){
          if(itVoices[v].name.toLowerCase().indexOf(MALE_NAMES[m]) >= 0){
            italianVoice = itVoices[v];
            console.log("Male voice:", italianVoice.name);
            return;
          }
        }
      }

      /* log all Italian voices for debug */
      console.log("Italian voices (" + itVoices.length + "):");
      for(var x = 0; x < itVoices.length; x++){
        console.log("  " + itVoices[x].name + " [" + itVoices[x].lang + "]");
      }

      /* fallback: last voice (often male on iOS) or first */
      italianVoice = itVoices.length > 1 ? itVoices[itVoices.length - 1] : itVoices[0];
      console.log("Fallback voice:", italianVoice.name);
    }catch(e){}
  }

  if(typeof speechSynthesis !== "undefined"){
    findVoice();
    try{ speechSynthesis.addEventListener("voiceschanged", findVoice); }catch(e){}
  }

  function keepAlive(){
    try{
      if(typeof speechSynthesis !== "undefined" && speechSynthesis.speaking && !speechSynthesis.paused){
        speechSynthesis.pause();
        speechSynthesis.resume();
      }
    }catch(e){}
    resumeTimer = setTimeout(keepAlive, 8000);
  }

  /* create utterance with nonno settings */
  function makeUtter(){
    if(!italianVoice) findVoice();
    var utter = new SpeechSynthesisUtterance(STORY);
    utter.lang = "it-IT";
    utter.rate = VOICE_RATE;
    utter.pitch = VOICE_PITCH;
    utter.volume = 0.85;
    if(italianVoice) utter.voice = italianVoice;

    utter.onstart = function(){
      speechStarted = true;
      console.log("Speech CONFIRMED started");
      /* remove ember if still visible */
      var old = document.getElementById("listenBtn");
      if(old){ old.style.opacity = "0"; setTimeout(function(){ try{ old.remove(); }catch(x){} }, 400); }
    };
    utter.onend = function(){
      clearTimeout(resumeTimer);
      console.log("Narration ended, loop in 4s");
      setTimeout(function(){
        if(fireOn){ try{ speakStory(); }catch(e){} }
      }, 4000);
    };
    utter.onerror = function(ev){
      clearTimeout(resumeTimer);
      console.warn("Speech error:", ev.error);
      speechStarted = false;
      showListenButton();
    };
    return utter;
  }

  function speakStory(){
    if(!fireOn) return;
    if(typeof speechSynthesis === "undefined") return;
    try{
      var utter = makeUtter();
      /* NOTE: speechStarted is set ONLY in onstart callback, not here */
      speechSynthesis.speak(utter);
      clearTimeout(resumeTimer);
      keepAlive();
    }catch(e){}
  }

  /* === GLOWING EMBER BUTTON === */
  function showListenButton(){
    if(speechStarted) return;
    var old = document.getElementById("listenBtn");
    if(old) old.remove();

    var btn = document.createElement("div");
    btn.id = "listenBtn";
    /* pure CSS incandescent ball - no emoji */
    btn.style.cssText = [
      "position:absolute",
      "top:38%",
      "left:50%",
      "width:54px",
      "height:54px",
      "transform:translate(-50%,-50%)",
      "z-index:10",
      "cursor:pointer",
      "border-radius:50%",
      "background:radial-gradient(circle at 40% 35%, #fff8e0 0%, #ffcc33 15%, #ff8800 40%, #cc3300 70%, #661100 100%)",
      "box-shadow:0 0 20px 8px rgba(255,120,20,0.6), 0 0 40px 16px rgba(255,80,0,0.3), inset 0 -3px 6px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,200,0.3)",
      "animation:emberPulse 1.2s ease-in-out infinite alternate",
      "transition:opacity 0.4s, transform 0.4s"
    ].join(";") + ";";
    hearth.appendChild(btn);
    console.log("Ember button shown");

    function handleTap(e){
      e.preventDefault();
      e.stopPropagation();
      btn.style.opacity = "0";
      btn.style.pointerEvents = "none";
      setTimeout(function(){ try{ btn.remove(); }catch(ex){} }, 400);

      /* DIRECT speak in gesture handler - no cancel, no setTimeout */
      if(typeof speechSynthesis !== "undefined"){
        try{
          var utter = makeUtter();
          speechSynthesis.speak(utter);
          clearTimeout(resumeTimer);
          keepAlive();
          console.log("Speaking from ember tap");
        }catch(ex){ console.error("Ember speak err:", ex); }
      }
    }

    btn.addEventListener("touchend", handleTap, false);
    btn.addEventListener("click", handleTap, false);
  }

  function tryAutoNarration(){
    if(typeof speechSynthesis === "undefined") return;
    console.log("Trying auto-narration...");
    speakStory();

    /* check after 2s if onstart fired */
    setTimeout(function(){
      if(!speechStarted){
        console.warn("Auto-narration failed, showing ember");
        showListenButton();
      }
    }, 2000);
  }

})();