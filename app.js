(function () {
  "use strict";

  /* ── DOM refs ─────────────────────────────────── */
  const canvas      = document.getElementById("canvas");
  const ctx         = canvas.getContext("2d");
  const firebox     = document.getElementById("firebox");
  const bricksCont  = document.getElementById("bricks-container");
  const fireCont    = document.getElementById("fire-container");
  const orb         = document.getElementById("orb");
  const msgEl       = document.getElementById("message");
  const clearBtn    = document.getElementById("clear-btn");

  /* ── State ────────────────────────────────────── */
  let strokes       = [];   // array of arrays of {x,y}
  let currentStroke = null;
  let checkTimer    = null;
  let fireActive    = false;
  let audioStarted  = false;
  let fireSoundPlaying = false;

  /* ── Audio objects ────────────────────────────── */
  let audioCtx      = null;
  let fireGain      = null;
  const racconto    = new Audio("racconto.mp3");
  racconto.loop     = true;
  racconto.volume   = 0.8;

  /* ── Brick positions (% of firebox) ───────────── */
  const brickPositions = [
    // Left column
    {x:5, y:2},{x:5, y:14},{x:5, y:26},{x:5, y:38},
    {x:5, y:54},{x:5, y:66},{x:5, y:78},
    // Right column
    {x:75, y:2},{x:75, y:14},{x:75, y:26},{x:75, y:38},
    {x:75, y:54},{x:75, y:66},{x:75, y:78},
    // Crossbar
    {x:28, y:38},{x:52, y:38}
  ];

  function createBricks() {
    bricksCont.innerHTML = "";
    brickPositions.forEach(p => {
      const b = document.createElement("div");
      b.className = "brick";
      b.style.left = p.x + "%";
      b.style.top  = p.y + "%";
      bricksCont.appendChild(b);
    });
  }

  /* ── Canvas sizing ────────────────────────────── */
  function resizeCanvas() {
    const r = firebox.getBoundingClientRect();
    canvas.width  = r.width;
    canvas.height = r.height;
    redrawAll();
  }

  function redrawAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const lw = Math.max(12, canvas.width * 0.06);
    ctx.lineWidth   = lw;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.strokeStyle = "rgba(255,200,100,0.8)";

    strokes.forEach(s => {
      if (s.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y);
      ctx.stroke();
    });
  }

  /* ── Pointer helpers ──────────────────────────── */
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return {x: t.clientX - r.left, y: t.clientY - r.top};
  }

  function startStroke(e) {
    e.preventDefault();
    if (fireActive) return;
    const p = pos(e);
    currentStroke = [p];
    strokes.push(currentStroke);
  }

  function moveStroke(e) {
    e.preventDefault();
    if (!currentStroke || fireActive) return;
    const p = pos(e);
    currentStroke.push(p);

    const lw = Math.max(12, canvas.width * 0.06);
    ctx.lineWidth   = lw;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.strokeStyle = "rgba(255,200,100,0.8)";
    ctx.beginPath();
    const prev = currentStroke[currentStroke.length - 2];
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function endStroke(e) {
    e.preventDefault();
    if (!currentStroke) return;
    currentStroke = null;
    clearTimeout(checkTimer);
    checkTimer = setTimeout(checkH, 1500);
  }

  /* ── H recognition ───────────────────────────── */
  const H_TEMPLATE = [
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1]
  ];

  function checkH() {
    const allPts = strokes.flat();
    if (allPts.length < 20) return;

    const cols = 5, rows = 7;
    const cw = canvas.width  / cols;
    const ch = canvas.height / rows;

    // Count points per cell
    const grid = Array.from({length: rows}, () => new Array(cols).fill(0));
    allPts.forEach(p => {
      const c = Math.min(cols - 1, Math.max(0, Math.floor(p.x / cw)));
      const r = Math.min(rows - 1, Math.max(0, Math.floor(p.y / ch)));
      grid[r][c]++;
    });

    // Threshold: 30% of average density of non-empty cells
    const nonEmpty = grid.flat().filter(v => v > 0);
    if (nonEmpty.length === 0) return;
    const avgDensity = nonEmpty.reduce((a, b) => a + b, 0) / nonEmpty.length;
    const threshold  = avgDensity * 0.30;

    let hHit = 0, hTotal = 0;
    let emptyClean = 0, emptyTotal = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const drawn = grid[r][c] > threshold;
        if (H_TEMPLATE[r][c] === 1) {
          hTotal++;
          if (drawn) hHit++;
        } else {
          emptyTotal++;
          if (!drawn) emptyClean++;
        }
      }
    }

    const hRatio    = hHit / hTotal;
    const cleanRatio = emptyClean / emptyTotal;

    if (hRatio >= 0.55 && cleanRatio >= 0.65) {
      activateFire();
    } else {
      showMsg("Non è una H... Riprova!");
      setTimeout(() => showMsg(""), 2000);
    }
  }

  /* ── Fire activation ──────────────────────────── */
  function activateFire() {
    fireActive = true;

    // Show fire
    fireCont.classList.remove("hidden");

    // Hide canvas
    canvas.style.display = "none";

    // Fade bricks
    document.querySelectorAll(".brick").forEach(b => b.style.opacity = "0.3");

    // Hide clear button
    clearBtn.classList.add("hidden");

    // Warm glow in firebox
    firebox.style.background =
      "radial-gradient(ellipse at bottom, rgba(255,100,20,.25) 0%, #0d0d0d 70%)";

    // Try autoplay fire sound (works on desktop, fails silently on mobile)
    tryStartFireSound();

    // Show orb after 1.5 s
    setTimeout(() => {
      orb.classList.remove("hidden");
      showMsg("Tocca la sfera per il racconto");
    }, 1500);
  }

  /* ── Fire crackling (Web Audio API) ───────────── */
  function createFireBuffer(ctx) {
    const sr   = ctx.sampleRate;
    const len  = sr * 4;            // 4 seconds
    const buf  = ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);

    let brown = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      brown = (brown + white * 0.02) / 1.02;
      data[i] = brown * 3.5;

      // Random crackle pops
      if (Math.random() < 0.0005) {
        const popLen = 300 + Math.random() * 800;
        for (let j = 0; j < popLen && (i + j) < len; j++) {
          data[i + j] += (Math.random() * 2 - 1) * (1 - j / popLen) * 0.6;
        }
      }
    }
    return buf;
  }

  function tryStartFireSound() {
    if (fireSoundPlaying) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();

      const buf    = createFireBuffer(audioCtx);
      const src    = audioCtx.createBufferSource();
      src.buffer   = buf;
      src.loop     = true;

      const filter   = audioCtx.createBiquadFilter();
      filter.type    = "lowpass";
      filter.frequency.value = 900;

      fireGain       = audioCtx.createGain();
      fireGain.gain.value = 0.5;

      src.connect(filter).connect(fireGain).connect(audioCtx.destination);
      src.start(0);
      fireSoundPlaying = true;
    } catch (_) { /* silent fail on mobile */ }
  }

  /* ── Orb click ────────────────────────────────── */
  orb.addEventListener("click", function () {
    if (audioStarted) return;
    audioStarted = true;

    // Ensure fire sound is playing (mobile unlock)
    if (!fireSoundPlaying) tryStartFireSound();

    // Play narration
    racconto.play().catch(() => {});

    // Hide orb + message
    orb.classList.add("hidden");
    showMsg("");
  });

  /* ── Clear ────────────────────────────────────── */
  clearBtn.addEventListener("click", function () {
    strokes = [];
    currentStroke = null;
    clearTimeout(checkTimer);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    showMsg("");
  });

  /* ── Helpers ──────────────────────────────────── */
  function showMsg(txt) { msgEl.textContent = txt; }

  /* ── Events ───────────────────────────────────── */
  canvas.addEventListener("mousedown",  startStroke);
  canvas.addEventListener("mousemove",  moveStroke);
  canvas.addEventListener("mouseup",    endStroke);
  canvas.addEventListener("mouseleave", endStroke);
  canvas.addEventListener("touchstart", startStroke, {passive:false});
  canvas.addEventListener("touchmove",  moveStroke,  {passive:false});
  canvas.addEventListener("touchend",   endStroke,   {passive:false});
  canvas.addEventListener("touchcancel",endStroke,   {passive:false});

  window.addEventListener("resize", resizeCanvas);

  /* ── Init ─────────────────────────────────────── */
  document.addEventListener("DOMContentLoaded", function () {
    createBricks();
    resizeCanvas();
  });

})();
