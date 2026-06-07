(function(){
  "use strict";

  /* ── DOM ──────────────────────────────── */
  const hearth  = document.getElementById("hearth");
  const canvas  = document.getElementById("drawCanvas");
  const ctx     = canvas.getContext("2d");
  const prompt  = document.getElementById("prompt");
  const glow    = document.getElementById("glow");
  const logs    = document.querySelectorAll(".log");
  const bricks  = document.querySelectorAll(".brick");

  /* ── state ────────────────────────────── */
  let activated     = false;
  let drawing       = false;
  let fireOn        = false;
  let strokes       = [];
  let currentStroke = [];
  let idleTimer     = null;
  const IDLE_MS     = 1200;

  /* ── narration text ───────────────────── */
  const STORY = "L\u2019Isola Viscontea, situata a Lecco dove il Lago di Como torna a essere il fiume Adda, \u00e8 un piccolo gioiello di origine artificiale: nacque nel XV secolo come accumulo di detriti e materiali di scavo durante i lavori di costruzione e ampliamento del vicino Ponte Azzone Visconti. Sulla sua funzione originaria ci sono pareri discordanti: alcuni storici pensano fosse un piccolo avamposto di controllo per la navigazione e i dazi sul fiume, altri una semplice casa di pescatori.";

  /* ── canvas size ──────────────────────── */
  function resizeCanvas(){
    if(fireOn) return;
    canvas.width  = hearth.clientWidth;
    canvas.height = hearth.clientHeight;
    computeZones();
  }
  window.addEventListener("resize", resizeCanvas);

  /* ═══════════════════════════════════════
     ██  DYNAMIC ZONES FROM BRICKS
     ═══════════════════════════════════════ */
  let zones = { CL:0.25, CR:0.75, MID:0.50 };

  function computeZones(){
    const hR = hearth.getBoundingClientRect();
    if(!hR.width) return;
    const bt1 = document.querySelector(".bt1").getBoundingClientRect();
    const bt2 = document.querySelector(".bt2").getBoundingClientRect();
    const bt3 = document.querySelector(".bt3").getBoundingClientRect();
    const bl1 = document.querySelector(".bl1").getBoundingClientRect();
    const bl2 = document.querySelector(".bl2").getBoundingClientRect();
    zones = {
      CL:  ((bt1.right + bt2.left)/2 - hR.left) / hR.width,
      CR:  ((bt2.right + bt3.left)/2 - hR.left) / hR.width,
      MID: ((bl1.bottom + bl2.top)/2  - hR.top)  / hR.height
    };
  }
  window.addEventListener("load", ()=>{ resizeCanvas(); computeZones(); });

  /* ── pointer helper ───────────────────── */
  function ptrXY(e){
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  /* ── activate ─────────────────────────── */
  hearth.addEventListener("pointerdown", ()=>{
    if(!activated && !fireOn){ activated = true; prompt.classList.add("visible"); }
  });

  /* ── drawing ──────────────────────────── */
  function startDraw(e){
    if(!activated || fireOn) return;
    e.preventDefault(); drawing = true;
    currentStroke = [ptrXY(e)];
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

  /* ── ember glow (drawing trail) ──────── */
  function drawEmber(p){
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    let g = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,14);
    g.addColorStop(0,"rgba(255,100,0,0.9)");
    g.addColorStop(0.4,"rgba(220,40,0,0.5)");
    g.addColorStop(1,"rgba(100,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x,p.y,14,0,Math.PI*2); ctx.fill();
    let g2 = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,5);
    g2.addColorStop(0,"rgba(255,220,180,1)");
    g2.addColorStop(1,"rgba(255,80,0,0)");
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(p.x,p.y,5,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  /* ── fade trail (on failure) ─────────── */
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

  /* ═══════════════════════════════════════
     ██  ZONE-BASED "H" RECOGNITION
     ═══════════════════════════════════════ */
  const BAND = 0.14;

  function zoneDensity(pts,W,H,x0f,x1f,y0f,y1f){
    const x0=x0f*W,x1=x1f*W,y0=y0f*H,y1=y1f*H;
    let n=0;
    for(let i=0;i<pts.length;i++){
      if(pts[i].x>=x0&&pts[i].x<x1&&pts[i].y>=y0&&pts[i].y<y1) n++;
    }
    const a=(x1-x0)*(y1-y0);
    return a>0?n/a:0;
  }

  function checkPassword(){
    const all = strokes.flat();
    if(all.length<20){ resetScene(); return; }

    const W=canvas.width, H=canvas.height;
    const {CL,CR,MID}=zones;
    const MT=Math.max(0,MID-BAND), MB=Math.min(1,MID+BAND);

    let score=0; const log=[];

    const LT=zoneDensity(all,W,H,0,CL,0,MT);
    const CT=zoneDensity(all,W,H,CL,CR,0,MT);
    const RT=zoneDensity(all,W,H,CR,1,0,MT);
    const LM=zoneDensity(all,W,H,0,CL,MT,MB);
    const CM=zoneDensity(all,W,H,CL,CR,MT,MB);
    const RM=zoneDensity(all,W,H,CR,1,MT,MB);
    const LB=zoneDensity(all,W,H,0,CL,MB,1);
    const CB=zoneDensity(all,W,H,CL,CR,MB,1);
    const RB=zoneDensity(all,W,H,CR,1,MB,1);

    const maxD=Math.max(LT,CT,RT,LM,CM,RM,LB,CB,RB);
    const inkTh=maxD*0.15, empTh=maxD*0.25;

    if(LT>inkTh)score++; log.push(`LT=${LT.toFixed(4)} ${LT>inkTh?"✓":"✗"}`);
    if(LM>inkTh)score++; log.push(`LM=${LM.toFixed(4)} ${LM>inkTh?"✓":"✗"}`);
    if(LB>inkTh)score++; log.push(`LB=${LB.toFixed(4)} ${LB>inkTh?"✓":"✗"}`);
    if(RT>inkTh)score++; log.push(`RT=${RT.toFixed(4)} ${RT>inkTh?"✓":"✗"}`);
    if(RM>inkTh)score++; log.push(`RM=${RM.toFixed(4)} ${RM>inkTh?"✓":"✗"}`);
    if(RB>inkTh)score++; log.push(`RB=${RB.toFixed(4)} ${RB>inkTh?"✓":"✗"}`);
    if(CM>inkTh)score++; log.push(`CM=${CM.toFixed(4)} ${CM>inkTh?"✓":"✗"}`);
    if(CT<empTh)score++; log.push(`CT_emp=${CT.toFixed(4)} ${CT<empTh?"✓":"✗"}`);
    if(CB<empTh)score++; log.push(`CB_emp=${CB.toFixed(4)} ${CB<empTh?"✓":"✗"}`);

    const pass = score >= 7;
    log.push(`SCORE=${score}/9 → ${pass?"✅":"❌"}`);
    console.log("H:", log.join(" | "));

    if(pass){ ignite(); }
    else    { resetScene(); }
  }

  function resetScene(){
    fadeTrail(()=>{
      strokes = [];
      prompt.classList.remove("visible");
      activated = false;
    });
  }

  /* ═══════════════════════════════════════════════════════════
     ██  🔥  FIRE  IGNITION
     ═══════════════════════════════════════════════════════════ */

  function ignite(){
    fireOn = true;
    prompt.classList.remove("visible");
    ctx.clearRect(0,0,canvas.width,canvas.height);

    logs.forEach(l => l.classList.add("burning"));
    bricks.forEach(b => b.classList.add("warm"));
    glow.classList.add("active");

    startFireAnimation();
    startCrackling();

    /* narration starts after fire settles in */
    setTimeout(startNarration, 2500);
  }

  /* ── fire particle system ────────────── */
  let particles = [];

  function Particle(type){
    const W = canvas.width, H = canvas.height;
    this.type = type;
    this.x  = W * (0.12 + Math.random() * 0.76);
    this.y  = H * (0.68 + Math.random() * 0.20);

    if(type === "flame"){
      this.size    = 6 + Math.random() * 18;
      this.vx      = (Math.random() - 0.5) * 0.8;
      this.vy      = -(1.0 + Math.random() * 2.5);
      this.maxLife  = 50 + Math.random() * 40;
    } else {
      this.size    = 1.5 + Math.random() * 3;
      this.vx      = (Math.random() - 0.5) * 1.2;
      this.vy      = -(0.8 + Math.random() * 2.0);
      this.maxLife  = 70 + Math.random() * 60;
    }
    this.life = 0;
  }

  function updateParticle(p){
    p.life++;
    p.x += p.vx + (Math.random() - 0.5) * 0.6;
    p.y += p.vy;
    p.vy *= 0.995;
    if(p.type === "flame") p.size *= 0.985;
    return p.life < p.maxLife && p.size > 0.5;
  }

  function drawParticle(p){
    const t = p.life / p.maxLife;
    let r,g,b,a;

    if(p.type === "flame"){
      if(t < 0.15){
        r=255; g=240; b=200; a=0.9;
      } else if(t < 0.4){
        r=255; g=200; b=50;  a=0.8 - t*0.5;
      } else if(t < 0.7){
        r=255; g=120; b=20;  a=0.6 - t*0.4;
      } else {
        r=200; g=40;  b=10;  a=Math.max(0, 0.4 - t*0.4);
      }

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const sz = p.size;
      const grad = ctx.createRadialGradient(p.x,p.y,0, p.x,p.y,sz);
      grad.addColorStop(0,   `rgba(${r},${g},${b},${a})`);
      grad.addColorStop(0.4, `rgba(${r},${Math.max(0,g-40)},${Math.max(0,b-10)},${a*0.6})`);
      grad.addColorStop(1,   `rgba(${Math.max(0,r-60)},0,0,0)`);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(p.x,p.y,sz,0,Math.PI*2); ctx.fill();
      ctx.restore();

    } else {
      a = Math.max(0, 1 - t);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const grad = ctx.createRadialGradient(p.x,p.y,0, p.x,p.y,p.size);
      grad.addColorStop(0, `rgba(255,220,150,${a})`);
      grad.addColorStop(0.5, `rgba(255,140,40,${a*0.6})`);
      grad.addColorStop(1, `rgba(200,60,0,0)`);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }

  function startFireAnimation(){
    const W = canvas.width, H = canvas.height;

    function loop(){
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(3,2,1,0.18)";
      ctx.fillRect(0,0,W,H);
      ctx.restore();

      for(let i = 0; i < 4; i++) particles.push(new Particle("flame"));
      if(Math.random() < 0.3) particles.push(new Particle("ember"));

      particles = particles.filter(p =>{
        const alive = updateParticle(p);
        if(alive) drawParticle(p);
        return alive;
      });

      requestAnimationFrame(loop);
    }
    loop();
  }

  /* ═══════════════════════════════════════════════════════════
     ██  🔊  CRACKLING SOUND  (Web Audio API)
     ═══════════════════════════════════════════════════════════ */

  function startCrackling(){
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    const a = new AC();

    const len = 2 * a.sampleRate;
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d   = buf.getChannelData(0);
    let last  = 0;
    for(let i = 0; i < len; i++){
      const w = Math.random() * 2 - 1;
      d[i] = (last + 0.02 * w) / 1.02;
      last = d[i];
      d[i] *= 3.5;
    }
    const src = a.createBufferSource();
    src.buffer = buf; src.loop = true;

    const lp = a.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 180;
    const rumbleGain = a.createGain();
    rumbleGain.gain.value = 0.25;

    src.connect(lp); lp.connect(rumbleGain);
    rumbleGain.connect(a.destination);
    src.start();

    const hissBuf = a.createBuffer(1, len, a.sampleRate);
    const hd = hissBuf.getChannelData(0);
    for(let i = 0; i < len; i++) hd[i] = Math.random() * 2 - 1;
    const hissSrc = a.createBufferSource();
    hissSrc.buffer = hissBuf; hissSrc.loop = true;

    const bp = a.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 3000; bp.Q.value = 2;
    const hissGain = a.createGain();
    hissGain.gain.value = 0.06;

    hissSrc.connect(bp); bp.connect(hissGain);
    hissGain.connect(a.destination);
    hissSrc.start();

    function pop(){
      const now = a.currentTime;
      const pLen = Math.floor(a.sampleRate * (0.01 + Math.random() * 0.04));
      const pBuf = a.createBuffer(1, pLen, a.sampleRate);
      const pd   = pBuf.getChannelData(0);
      for(let i = 0; i < pLen; i++) pd[i] = Math.random() * 2 - 1;
      const pSrc = a.createBufferSource();
      pSrc.buffer = pBuf;

      const pBP = a.createBiquadFilter();
      pBP.type = "bandpass";
      pBP.frequency.value = 600 + Math.random() * 3000;
      pBP.Q.value = 3 + Math.random() * 12;

      const pGain = a.createGain();
      pGain.gain.setValueAtTime(0.12 + Math.random() * 0.22, now);
      pGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02 + Math.random() * 0.06);

      pSrc.connect(pBP); pBP.connect(pGain);
      pGain.connect(a.destination);
      pSrc.start(now); pSrc.stop(now + 0.1);

      setTimeout(pop, 80 + Math.random() * 500);
    }
    setTimeout(pop, 400);

    function crack(){
      const now = a.currentTime;
      const cLen = Math.floor(a.sampleRate * 0.06);
      const cBuf = a.createBuffer(1, cLen, a.sampleRate);
      const cd   = cBuf.getChannelData(0);
      let v = 0.5 + Math.random() * 0.5;
      for(let i = 0; i < cLen; i++){
        cd[i] = (Math.random() * 2 - 1) * v;
        v *= 0.997;
      }
      const cSrc = a.createBufferSource();
      cSrc.buffer = cBuf;

      const cGain = a.createGain();
      cGain.gain.setValueAtTime(0.3 + Math.random() * 0.15, now);
      cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      cSrc.connect(cGain); cGain.connect(a.destination);
      cSrc.start(now); cSrc.stop(now + 0.1);

      setTimeout(crack, 1500 + Math.random() * 4000);
    }
    setTimeout(crack, 1000);
  }

  /* ═══════════════════════════════════════════════════════════
     ██  🎙️  NARRATION  (Web Speech API)
     ═══════════════════════════════════════════════════════════
     Old storyteller: slow rate, deep pitch, Italian voice.
     Loops with a 4-second pause between readings.
     Chrome workaround: periodic pause/resume prevents cutoff.
  */

  let italianVoice = null;
  let resumeTimer  = null;

  /* pre-load Italian voice */
  function findItalianVoice(){
    const voices = speechSynthesis.getVoices();
    if(!voices.length) return;
    italianVoice =
      voices.find(v => v.lang === "it-IT") ||
      voices.find(v => v.lang.startsWith("it")) ||
      voices.find(v => /italian/i.test(v.name)) ||
      null;
    if(italianVoice) console.log("Narrator voice:", italianVoice.name, italianVoice.lang);
  }

  if(typeof speechSynthesis !== "undefined"){
    findItalianVoice();
    speechSynthesis.addEventListener("voiceschanged", findItalianVoice);
  }

  /* Chrome fix: long utterances cut off after ~15s */
  function keepAlive(){
    if(speechSynthesis.speaking && !speechSynthesis.paused){
      speechSynthesis.pause();
      speechSynthesis.resume();
    }
    resumeTimer = setTimeout(keepAlive, 8000);
  }

  function stopKeepAlive(){
    clearTimeout(resumeTimer);
  }

  function startNarration(){
    if(typeof speechSynthesis === "undefined") return;

    speechSynthesis.cancel();

    function speak(){
      const utter = new SpeechSynthesisUtterance(STORY);
      utter.lang   = "it-IT";
      utter.rate   = 0.78;     /* slow old-man pace    */
      utter.pitch  = 0.7;      /* deep, warm voice     */
      utter.volume = 0.85;

      if(italianVoice) utter.voice = italianVoice;

      utter.onend = function(){
        stopKeepAlive();
        /* 4s pause between readings, like catching breath */
        setTimeout(()=>{
          if(fireOn) speak();
        }, 4000);
      };

      utter.onerror = function(e){
        console.warn("Speech error:", e.error);
        stopKeepAlive();
        setTimeout(()=>{ if(fireOn) speak(); }, 2000);
      };

      speechSynthesis.speak(utter);

      stopKeepAlive();
      keepAlive();
    }

    speak();
  }

})();
