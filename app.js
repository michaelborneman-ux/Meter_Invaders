/* ── Meter Reading Training — app.js ── */
'use strict';

(function () {

  // ══════════════════════════════════════════════════════════
  //  Constants
  // ══════════════════════════════════════════════════════════

  const VERSION = 'v1.4.0';

  const DIAL_CLOCKWISE = [true, false, true, true];
  const DIAL_LABELS = ['×1000', '×100', '×10', '×1'];
  const DIAL_SIZE = Math.min(Math.floor((Math.min(window.innerWidth, 420) - 56) / 4), 82);

  const LS_GAME_SCORES = 'mrt-game-scores';

  // Game physics
  const G_ROWS = 2;
  const G_COLS = 5;
  const G_ALIEN_W = 36;
  const G_ALIEN_H = 36;
  const G_GAP_X = 14;
  const G_GAP_Y = 18;
  const G_CELL_W = G_ALIEN_W + G_GAP_X;   // 50
  const G_CELL_H = G_ALIEN_H + G_GAP_Y;   // 54
  const G_STEP_DOWN = 30;
  const G_BASE_SPD = 0.4;

  // ══════════════════════════════════════════════════════════
  //  Audio
  // ══════════════════════════════════════════════════════════

  let _audioCtx = null;
  function getAudioCtx() {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return _audioCtx;
  }

  function playCorrectSound() {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (_) { }
  }

  function playLaserSound() {
    try {
      const ctx = getAudioCtx();
      const t = ctx.currentTime;

      // High-pitched zip at attack
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1); gain1.connect(ctx.destination);
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(3200, t);
      osc1.frequency.exponentialRampToValueAtTime(900, t + 0.09);
      gain1.gain.setValueAtTime(0.5, t);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc1.start(t); osc1.stop(t + 0.1);

      // Deep square-wave zap sweep
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2); gain2.connect(ctx.destination);
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(1400, t);
      osc2.frequency.exponentialRampToValueAtTime(55, t + 0.3);
      gain2.gain.setValueAtTime(0.55, t);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc2.start(t); osc2.stop(t + 0.3);
    } catch (_) { }
  }

  function playExplosionSound() {
    try {
      const ctx = getAudioCtx();
      const t = ctx.currentTime;
      // Low thump
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1); gain1.connect(ctx.destination);
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(200, t);
      osc1.frequency.exponentialRampToValueAtTime(28, t + 0.28);
      gain1.gain.setValueAtTime(0.75, t);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc1.start(t); osc1.stop(t + 0.28);
      // Crunchy mid
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2); gain2.connect(ctx.destination);
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(380, t);
      osc2.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      gain2.gain.setValueAtTime(0.45, t);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc2.start(t); osc2.stop(t + 0.18);
    } catch (_) { }
  }

  function playGameOverSound() {
    try {
      const ctx = getAudioCtx();
      [0, 0.18, 0.36].forEach((t, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(280 - i * 50, ctx.currentTime + t);
        g.gain.setValueAtTime(0.18, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.15);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + 0.15);
      });
    } catch (_) { }
  }

  function playVictorySound() {
    try {
      const ctx = getAudioCtx();
      [523, 659, 784, 1047].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.14);
        g.gain.setValueAtTime(0.28, ctx.currentTime + i * 0.14);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.14 + 0.28);
        osc.start(ctx.currentTime + i * 0.14);
        osc.stop(ctx.currentTime + i * 0.14 + 0.28);
      });
    } catch (_) { }
  }

  const _wrongAudio = new Audio('./wrong-answer-sound-effect.mp3');
  function playWrongSound() {
    try {
      _wrongAudio.currentTime = 0;
      _wrongAudio.play().catch(() => { });
      if (navigator.vibrate) navigator.vibrate(200);
    } catch (_) { }
  }

  // ══════════════════════════════════════════════════════════
  //  Meter logic  (reused from gas-meter-trainer)
  // ══════════════════════════════════════════════════════════

  function generateReading() {
    const v = new Array(4);
    // Rightmost dial: always mid-sector so its digit is unambiguous (0.5 past a number)
    v[3] = Math.floor(Math.random() * 10) + 0.5;
    // Each dial to the left: integer part random, fractional part = right dial's digit ÷ 10.
    // This models the mechanical linkage exactly: right dial shows 3 → left needle is 0.3 past lower number.
    for (let i = 2; i >= 0; i--) {
      const rightDigit = Math.floor(v[i + 1]) % 10;
      v[i] = Math.floor(Math.random() * 10) + rightDigit / 10;
    }
    return v;
  }

  // With exact fractions the rule is simply: read the floor of each dial value.
  // Right dial = 0 → fraction = 0.0 → needle exactly ON the number → Math.floor gives it.
  // Right dial = 1–9 → fraction = 0.1–0.9 → needle between two numbers → Math.floor gives lower.
  function getCorrectAnswer(v) {
    return v.map(val => Math.floor(val) % 10).join('');
  }

  // ══════════════════════════════════════════════════════════
  //  Dial rendering  (reused from gas-meter-trainer)
  // ══════════════════════════════════════════════════════════

  function drawDial(canvas, value, clockwise, proMode) {
    const size = canvas.width;
    const cx = size / 2, cy = size / 2, r = size / 2 - 2;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = '#cccccc'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

    for (let digit = 0; digit < 10; digit++) {
      let fraction = digit / 10;
      if (!clockwise) fraction = 1 - fraction;
      const angle = fraction * Math.PI * 2 - Math.PI / 2;

      ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * (r - 2), cy + Math.sin(angle) * (r - 2));
      ctx.lineTo(cx + Math.cos(angle) * (r - 10), cy + Math.sin(angle) * (r - 10));
      ctx.stroke();

      for (let sub = 1; sub < 5; sub++) {
        let sf = (digit + sub * 0.2) / 10;
        if (!clockwise) sf = 1 - sf;
        const sa = sf * Math.PI * 2 - Math.PI / 2;
        ctx.strokeStyle = '#bbb'; ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(sa) * (r - 2), cy + Math.sin(sa) * (r - 2));
        ctx.lineTo(cx + Math.cos(sa) * (r - 7), cy + Math.sin(sa) * (r - 7));
        ctx.stroke();
      }

      if (!proMode) {
        const textR = r - 18;
        ctx.fillStyle = '#111';
        ctx.font = `bold ${Math.round(size * 0.14)}px -apple-system, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(digit),
          cx + Math.cos(angle) * textR,
          cy + Math.sin(angle) * textR);
      }
    }

    // Needle
    const frac = (value % 10) / 10;
    const needleFrac = clockwise ? frac : 1 - frac;
    const needleAngle = needleFrac * Math.PI * 2 - Math.PI / 2;
    const needleLen = r - 14;
    const tailLen = r * 0.18;
    const perpAngle = needleAngle + Math.PI / 2;
    const baseW = size * 0.045;

    ctx.fillStyle = '#e94560';
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(needleAngle) * needleLen, cy + Math.sin(needleAngle) * needleLen);
    ctx.lineTo(cx + Math.cos(perpAngle) * baseW, cy + Math.sin(perpAngle) * baseW);
    ctx.lineTo(cx - Math.cos(needleAngle) * tailLen, cy - Math.sin(needleAngle) * tailLen);
    ctx.lineTo(cx - Math.cos(perpAngle) * baseW, cy - Math.sin(perpAngle) * baseW);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.055, 0, Math.PI * 2); ctx.fill();
  }

  function renderDials(containerId, values, proMode) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    values.forEach((val, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'dial-wrap';

      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = DIAL_SIZE;
      drawDial(canvas, val, DIAL_CLOCKWISE[i], proMode);

      const lbl = document.createElement('div');
      lbl.className = 'dial-label';
      lbl.textContent = DIAL_LABELS[i];

      const badge = document.createElement('div');
      badge.className = 'dial-dir-badge';
      badge.textContent = DIAL_CLOCKWISE[i] ? 'CW' : 'CCW';

      wrap.appendChild(canvas);
      wrap.appendChild(lbl);
      wrap.appendChild(badge);
      container.appendChild(wrap);
    });
  }

  // ══════════════════════════════════════════════════════════
  //  View routing
  // ══════════════════════════════════════════════════════════

  function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('nav-active', btn.dataset.view === id);
    });
  }

  // ══════════════════════════════════════════════════════════
  //  Digit input helper
  // ══════════════════════════════════════════════════════════

  // getDirFn: optional function returning 'ltr' or 'rtl'
  function makeDigitCtrl(prefix, onComplete, getDirFn) {
    const inputs = [0, 1, 2, 3].map(i => document.getElementById(`${prefix}-d${i}`));

    function orderedInputs() {
      return getDirFn && getDirFn() === 'rtl' ? [...inputs].reverse() : inputs;
    }

    inputs.forEach(inp => {
      inp.addEventListener('keydown', e => {
        const ordered = orderedInputs();
        const pos = ordered.indexOf(inp);
        if (e.key === 'Backspace' && inp.value === '' && pos > 0) {
          ordered[pos - 1].focus();
        }
        if (e.key === 'Enter') { onComplete && onComplete(); }
      });
      inp.addEventListener('focus', () => inp.select());
      inp.addEventListener('input', () => {
        const ordered = orderedInputs();
        const pos = ordered.indexOf(inp);
        const val = inp.value.replace(/[^0-9]/g, '');
        if (val.length >= 1) {
          inp.value = val.slice(-1);
          if (pos < ordered.length - 1) {
            ordered[pos + 1].focus();
          } else {
            onComplete && onComplete();
          }
        } else {
          inp.value = '';
        }
      });
    });

    return {
      focus: () => setTimeout(() => orderedInputs()[0].focus(), 80),
      getAnswer: () => inputs.map(inp => inp.value).join(''), // always LTR (d0–d3)
      reset: () => {
        inputs.forEach(inp => {
          inp.value = '';
          inp.classList.remove('correct', 'wrong');
          inp.readOnly = false;
        });
        setTimeout(() => orderedInputs()[0].focus(), 80);
      },
      markResult: answer => {
        inputs.forEach((inp, i) => {
          inp.classList.remove('correct', 'wrong');
          inp.classList.add(inp.value === String(answer[i]) ? 'correct' : 'wrong');
          inp.readOnly = true;
        });
      },
    };
  }

  // ══════════════════════════════════════════════════════════
  //  Learn module
  // ══════════════════════════════════════════════════════════

  const LEARN_STEPS = 5;
  let learnStep = 0;
  let learnAnswer = null;
  let learnValues = null;
  let learnDone = false;
  let learnInited = false;

  function initLearn() {
    if (learnInited) return;
    learnInited = true;

    // Step 1 — two demo dials
    _appendDemoCanvas('learn-demo-cw', 3.5, true, false, 70);
    _appendDemoCanvas('learn-demo-ccw', 7.3, false, false, 70);

    // Step 2 — two-dial demo: left CW dial at 4.3 (right digit=3 → 0.3 past 4), right CCW dial at 3.5 (shows digit 3)
    _appendDemoCanvas('learn-demo-needle-left', 4.3, true, false, 80);
    _appendDemoCanvas('learn-demo-needle-right', 3.5, false, false, 80);

    // Step 3 — full 4-dial demo
    const demoVals = [2 + 0.57, 5 + 0.2, 7 + 0.5, 3.5];
    renderDials('learn-demo-full', demoVals, false);
    document.getElementById('learn-step4-answer').textContent = getCorrectAnswer(demoVals);

    // Step 4 — interactive question + inputs
    const learnCtrl = makeDigitCtrl('learn', submitLearnTry);
    document.getElementById('btn-learn-try-submit').addEventListener('click', submitLearnTry);
    document.getElementById('btn-learn-try-new').addEventListener('click', () => newLearnQuestion(learnCtrl));
    newLearnQuestion(learnCtrl);
  }

  function _appendDemoCanvas(containerId, value, clockwise, proMode, size) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    wrap.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    drawDial(canvas, value, clockwise, proMode);
    wrap.appendChild(canvas);
  }

  function newLearnQuestion(ctrl) {
    learnDone = false;
    learnValues = generateReading();
    learnAnswer = getCorrectAnswer(learnValues);
    renderDials('learn-try-dials', learnValues, false);
    ctrl.reset();
    document.getElementById('learn-try-feedback').className = 'feedback-bar hidden';
  }

  function submitLearnTry() {
    if (learnDone) return;
    const inputs = [0, 1, 2, 3].map(i => document.getElementById(`learn-d${i}`));
    const answer = inputs.map(inp => inp.value).join('');
    if (answer.length < 4) return;
    learnDone = true;
    const correct = answer === learnAnswer;
    const fb = document.getElementById('learn-try-feedback');
    if (correct) {
      playCorrectSound();
      fb.className = 'feedback-bar correct-fb';
      fb.textContent = `Correct! The reading is ${learnAnswer}.`;
    } else {
      playWrongSound();
      fb.className = 'feedback-bar wrong-fb';
      fb.textContent = `Not quite — the correct reading is ${learnAnswer}. Try another!`;
    }
  }

  function goLearnStep(step) {
    learnStep = step;
    for (let i = 0; i < LEARN_STEPS; i++) {
      document.getElementById(`learn-step-${i}`).classList.toggle('active', i === step);
    }
    document.querySelectorAll('.step-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === step);
    });
    document.getElementById('btn-learn-prev').disabled = (step === 0);
    document.getElementById('btn-learn-next').textContent =
      step === LEARN_STEPS - 1 ? 'Done ✓' : 'Next →';
  }

  // ══════════════════════════════════════════════════════════
  //  Practice module
  // ══════════════════════════════════════════════════════════

  let pracState = {
    correct: 0, total: 0,
    values: null, answer: null,
    submitted: false,
    ctrl: null,
    dir: 'ltr',
  };

  let gameDir = 'ltr';

  function initPractice() {
    pracState.correct = 0;
    pracState.total = 0;
    pracState.submitted = false;
    updatePracStats();
    nextPracQuestion();
  }

  function nextPracQuestion() {
    pracState.submitted = false;
    pracState.values = generateReading();
    pracState.answer = getCorrectAnswer(pracState.values);
    const proMode = document.getElementById('prac-pro').checked;
    renderDials('practice-dials', pracState.values, proMode);
    document.getElementById('prac-feedback').className = 'feedback-bar hidden';
    pracState.ctrl.reset();
  }

  function submitPrac() {
    if (pracState.submitted) return;
    const answer = pracState.ctrl.getAnswer();
    if (answer.length < 4) return;
    pracState.submitted = true;

    const correct = answer === pracState.answer;
    pracState.total++;
    if (correct) pracState.correct++;
    updatePracStats();
    pracState.ctrl.markResult(pracState.answer);

    const fb = document.getElementById('prac-feedback');
    const msg = document.getElementById('prac-fb-msg');
    if (correct) {
      playCorrectSound();
      fb.className = 'feedback-bar correct-fb';
      msg.textContent = `Correct! Reading: ${pracState.answer}`;
    } else {
      playWrongSound();
      fb.className = 'feedback-bar wrong-fb';
      msg.textContent = `Wrong. Correct reading: ${pracState.answer}`;
    }
    setTimeout(nextPracQuestion, 1500);
  }

  function updatePracStats() {
    document.getElementById('prac-correct').textContent = pracState.correct;
    document.getElementById('prac-total').textContent = pracState.total;
  }

  // ══════════════════════════════════════════════════════════
  //  Game module — Meter Invaders
  // ══════════════════════════════════════════════════════════

  let gState = null;

  // Laser beam visual
  const _activeLasers = [];
  let _laserRafId = null;

  function fireLaser(alien) {
    if (!gState) return;
    const canvas = document.getElementById('laser-canvas');
    if (!canvas) return;
    _activeLasers.push({
      x0: gState.areaW / 2,
      y0: gState.groundY,
      x1: gState.groupX + alien.col * G_CELL_W + G_ALIEN_W / 2,
      y1: gState.groupY + alien.row * G_CELL_H + G_ALIEN_H / 2,
      start: performance.now(),
    });
    if (!_laserRafId) _laserRafId = requestAnimationFrame(_drawLasers);
  }

  function _drawLasers(now) {
    const canvas = document.getElementById('laser-canvas');
    if (!canvas) { _laserRafId = null; return; }
    const ctx = canvas.getContext('2d');
    const DURATION = 260;

    for (let i = _activeLasers.length - 1; i >= 0; i--) {
      if (now - _activeLasers[i].start >= DURATION) _activeLasers.splice(i, 1);
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    _activeLasers.forEach(laser => {
      const alpha = 1 - (now - laser.start) / DURATION;
      ctx.save();
      ctx.lineCap = 'round';
      // Glow halo
      ctx.globalAlpha = alpha * 0.45;
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 10;
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 28;
      ctx.beginPath();
      ctx.moveTo(laser.x0, laser.y0);
      ctx.lineTo(laser.x1, laser.y1);
      ctx.stroke();
      // Bright core
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(laser.x0, laser.y0);
      ctx.lineTo(laser.x1, laser.y1);
      ctx.stroke();
      ctx.restore();
    });

    if (_activeLasers.length > 0) {
      _laserRafId = requestAnimationFrame(_drawLasers);
    } else {
      _laserRafId = null;
    }
  }

  function showGameStart() {
    document.getElementById('game-start-screen').classList.remove('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('game-victory-screen').classList.add('hidden');
    if (gState && gState.animId) { cancelAnimationFrame(gState.animId); gState = null; }
  }

  function startGame() {
    document.getElementById('game-start-screen').classList.add('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('game-victory-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    // Double-RAF ensures the browser has painted at least one frame and
    // layout is fully resolved before we read clientHeight/clientWidth.
    requestAnimationFrame(() => requestAnimationFrame(initGame));
  }

  function initGame() {
    if (gState && gState.animId) cancelAnimationFrame(gState.animId);

    const area = document.getElementById('game-area');
    const areaW = area.clientWidth || 375;
    const areaH = Math.max(area.clientHeight || 0, 160);
    const groundY = areaH - 4;

    // Laser canvas overlay (recreate dimensions each game)
    let laserCanvas = document.getElementById('laser-canvas');
    if (!laserCanvas) {
      laserCanvas = document.createElement('canvas');
      laserCanvas.id = 'laser-canvas';
      laserCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:10;';
      area.appendChild(laserCanvas);
    }
    laserCanvas.width = areaW;
    laserCanvas.height = areaH;
    _activeLasers.length = 0;
    if (_laserRafId) { cancelAnimationFrame(_laserRafId); _laserRafId = null; }

    // Centre alien grid
    const gridW = G_COLS * G_CELL_W - G_GAP_X;  // 236
    const startX = Math.round((areaW - gridW) / 2);

    gState = {
      aliens: [],
      groupX: startX,
      groupY: 16,
      dir: 1,
      speed: G_BASE_SPD,
      levelBaseSpeed: G_BASE_SPD,
      level: 1,
      lives: 3,
      score: 0,
      targetId: null,
      reading: null,
      answer: null,
      ended: false,
      animId: null,
      startTime: Date.now(),
      aStartTime: Date.now(),
      areaW,
      groundY,
      submitting: false,
      fbTimer: null,
      proMode: false,
      bonusRound: false,
      bonusUsed: false,
    };

    // Create alien data
    for (let row = 0; row < G_ROWS; row++) {
      for (let col = 0; col < G_COLS; col++) {
        const reading = generateReading();
        gState.aliens.push({
          id: row * G_COLS + col,
          row, col,
          alive: true,
          exploding: false,
          reading,
          answer: getCorrectAnswer(reading),
          el: null,
        });
      }
    }

    buildAlienGrid();
    pickTarget();
    renderGameMeter();
    updateHUD();
    resetGameInputs();
    gState.animId = requestAnimationFrame(gameLoop);
  }

  function buildAlienGrid() {
    const grid = document.getElementById('alien-grid');
    grid.innerHTML = '';
    grid.style.transform = `translate(${gState.groupX}px, ${gState.groupY}px)`;
    gState.aliens.forEach(alien => {
      const el = document.createElement('div');
      el.className = 'alien';
      el.textContent = alien.row === 0 ? '👾' : '👽';
      el.style.left = (alien.col * G_CELL_W) + 'px';
      el.style.top = (alien.row * G_CELL_H) + 'px';
      grid.appendChild(el);
      alien.el = el;
    });
  }

  function gameLoop() {
    if (gState.ended) return;

    gState.groupX += gState.dir * gState.speed;

    const alive = gState.aliens.filter(a => a.alive);
    if (alive.length === 0) {
      startNextLevel();
      return;
    }

    // Check wall collisions using extents of alive aliens
    const cols = alive.map(a => a.col);
    const minCol = Math.min(...cols);
    const maxCol = Math.max(...cols);
    const leftEdge = gState.groupX + minCol * G_CELL_W;
    const rightEdge = gState.groupX + maxCol * G_CELL_W + G_ALIEN_W;

    if (gState.dir > 0 && rightEdge >= gState.areaW - 8) {
      gState.dir = -1;
      gState.groupY += G_STEP_DOWN;
    } else if (gState.dir < 0 && leftEdge <= 8) {
      gState.dir = 1;
      gState.groupY += G_STEP_DOWN;
    }

    // Ground check
    const rows = alive.map(a => a.row);
    const maxRow = Math.max(...rows);
    const botEdge = gState.groupY + maxRow * G_CELL_H + G_ALIEN_H;
    if (botEdge >= gState.groundY) {
      endGameOver();
      return;
    }

    // Update DOM
    document.getElementById('alien-grid').style.transform =
      `translate(${Math.round(gState.groupX)}px, ${Math.round(gState.groupY)}px)`;

    // Highlight current target
    gState.aliens.forEach(a => {
      if (!a.el) return;
      a.el.classList.toggle('target', a.id === gState.targetId && !a.exploding);
    });

    gState.animId = requestAnimationFrame(gameLoop);
  }

  function pickTarget() {
    const alive = gState.aliens.filter(a => a.alive && !a.exploding);
    if (alive.length === 0) { gState.targetId = null; return; }

    const maxRow = Math.max(...alive.map(a => a.row));
    const front = alive.filter(a => a.row === maxRow);
    // Alien furthest in movement direction is the easiest target to visualise
    front.sort((a, b) => gState.dir >= 0 ? b.col - a.col : a.col - b.col);

    const t = front[0];
    if (gState.targetId !== t.id) {
      gState.targetId = t.id;
      gState.reading = t.reading;
      gState.answer = t.answer;
      gState.aStartTime = Date.now();
    }
  }

  function renderGameMeter() {
    if (!gState || !gState.reading) return;
    renderDials('game-dials', gState.reading, gState.proMode);
  }

  function resetGameInputs() {
    [0, 1, 2, 3].forEach(i => {
      const inp = document.getElementById(`game-d${i}`);
      if (!inp) return;
      inp.value = '';
      inp.classList.remove('correct', 'wrong');
      inp.readOnly = false;
    });
    setTimeout(() => {
      const firstId = gameDir === 'rtl' ? 'game-d3' : 'game-d0';
      const d = document.getElementById(firstId);
      if (d) d.focus();
    }, 80);
  }

  function getGameAnswer() {
    return [0, 1, 2, 3].map(i => {
      const inp = document.getElementById(`game-d${i}`);
      return inp ? inp.value : '';
    }).join('');
  }

  function submitGameAnswer() {
    if (!gState || gState.ended || gState.submitting) return;
    const answer = getGameAnswer();
    if (answer.length < 4) return;

    gState.submitting = true;
    const correct = answer === gState.answer;

    if (correct) {
      const elapsed = (Date.now() - gState.aStartTime) / 1000;
      const speedBonus = Math.max(0, Math.floor((8 - elapsed) * 10));

      // Double kill: answer contains 0 or 9 → destroy the next alien automatically too
      const isDoubleKill = gState.answer.includes('0') || gState.answer.includes('9');

      // Find primary target
      const alien = gState.aliens.find(a => a.id === gState.targetId);

      // Find secondary target (next frontmost, excluding primary)
      let alien2 = null;
      if (isDoubleKill) {
        const nextAlive = gState.aliens.filter(a => a.alive && a.id !== gState.targetId);
        if (nextAlive.length > 0) {
          const maxRow = Math.max(...nextAlive.map(a => a.row));
          const front = nextAlive.filter(a => a.row === maxRow);
          front.sort((a, b) => gState.dir >= 0 ? b.col - a.col : a.col - b.col);
          alien2 = front[0];
        }
      }

      const killCount = alien2 ? 2 : 1;
      const pointMultiplier = gState.bonusRound ? 10 : 1;
      const points = (100 * killCount + speedBonus) * pointMultiplier;
      gState.score += points;

      playLaserSound();
      if (alien) fireLaser(alien);
      if (alien2) {
        setTimeout(() => { playLaserSound(); fireLaser(alien2); }, 160);
        showGameFeedback(true, `DOUBLE KILL! +${points} pts`);
      } else {
        showGameFeedback(true, `+${points} pts`);
      }

      // Explode primary alien
      if (alien && alien.el) {
        alien.el.classList.add('exploding');
        alien.exploding = true;
        setTimeout(playExplosionSound, 60);
      }
      // Explode secondary alien slightly after
      if (alien2 && alien2.el) {
        setTimeout(() => {
          if (alien2.el) { alien2.el.classList.add('exploding'); alien2.exploding = true; }
          setTimeout(playExplosionSound, 60);
        }, 160);
      }
      updateHUD();

      setTimeout(() => {
        if (alien) {
          alien.alive = false; alien.exploding = false;
          if (alien.el) alien.el.style.display = 'none';
        }
        if (alien2) {
          alien2.alive = false; alien2.exploding = false;
          if (alien2.el) alien2.el.style.display = 'none';
        }

        const remaining = gState.aliens.filter(a => a.alive);
        if (remaining.length === 0) {
          startNextLevel();
          return;
        }

        // Speed ramps up as aliens are destroyed
        gState.speed = gState.levelBaseSpeed + (10 - remaining.length) * 0.1;

        pickTarget();
        renderGameMeter();
        resetGameInputs();
        updateHUD();
        gState.submitting = false;
      }, 480);

    } else {
      playWrongSound();
      if (gState.bonusRound) {
        showGameFeedback(false, `BONUS OVER! Correct: ${gState.answer}`);
        updateHUD();
        resetGameInputs();
        setTimeout(endBonusRound, 900);
      } else {
        gState.lives--;
        gState.speed += 0.2;
        showGameFeedback(false, `Wrong! Correct: ${gState.answer}`);
        updateHUD();
        resetGameInputs();
        if (gState.lives <= 0) {
          setTimeout(endGameOver, 900);
        } else {
          gState.submitting = false;
        }
      }
    }
  }

  function showGameFeedback(ok, msg) {
    const fb = document.getElementById('game-feedback');
    fb.textContent = msg;
    fb.className = 'feedback-bar ' + (ok ? 'correct-fb' : 'wrong-fb');
    clearTimeout(gState.fbTimer);
    gState.fbTimer = setTimeout(() => {
      if (fb) fb.className = 'feedback-bar hidden';
    }, 1400);
  }

  function updateHUD() {
    if (!gState) return;
    document.getElementById('game-score-display').textContent = gState.score;
    const remaining = gState.aliens.filter(a => a.alive).length;
    document.getElementById('game-remaining').textContent = '👾 ' + remaining;
    document.getElementById('game-level').textContent =
      gState.bonusRound ? 'BONUS' : 'LV ' + gState.level;
    document.getElementById('game-lives').innerHTML = gState.bonusRound
      ? '<span class="heart alive" style="color:#f5a623;font-size:1.3em">⭐</span>'
      : [0, 1, 2].map(i =>
        `<span class="heart ${i < gState.lives ? 'alive' : 'dead'}">♥</span>`
      ).join('');
  }

  function showLevelBanner(text, onDone) {
    const existing = document.getElementById('level-banner');
    if (existing) existing.remove();
    const banner = document.createElement('div');
    banner.id = 'level-banner';
    banner.className = 'level-banner';
    banner.textContent = text;
    document.getElementById('game-area').appendChild(banner);
    setTimeout(() => { banner.remove(); onDone(); }, 1600);
  }

  function _rebuildGrid() {
    const gridW = G_COLS * G_CELL_W - G_GAP_X;
    gState.groupX = Math.round((gState.areaW - gridW) / 2);
    gState.groupY = 16;
    gState.dir = 1;
    gState.speed = gState.levelBaseSpeed;
    gState.targetId = null;
    gState.submitting = false;
    gState.aliens = [];
    for (let row = 0; row < G_ROWS; row++) {
      for (let col = 0; col < G_COLS; col++) {
        const reading = generateReading();
        gState.aliens.push({
          id: row * G_COLS + col,
          row, col,
          alive: true, exploding: false,
          reading, answer: getCorrectAnswer(reading), el: null,
        });
      }
    }
    buildAlienGrid();
    pickTarget();
    renderGameMeter();
    resetGameInputs();
    updateHUD();
    gState.animId = requestAnimationFrame(gameLoop);
  }

  function startNextLevel() {
    if (!gState || gState.ended) return;
    cancelAnimationFrame(gState.animId);
    gState.submitting = true;

    const wasBonus = gState.bonusRound;
    if (wasBonus) { gState.bonusRound = false; gState.proMode = false; }

    gState.level++;
    gState.levelBaseSpeed *= 1.2;

    const triggerBonus = !wasBonus && gState.level === 3 && !gState.bonusUsed;
    if (triggerBonus) {
      gState.bonusRound = true;
      gState.bonusUsed = true;
      gState.proMode = true;
      gState.level = 2;
    }

    const bannerText = triggerBonus ? '⭐ BONUS ROUND ⭐' : `LEVEL ${gState.level}`;
    showLevelBanner(bannerText, () => {
      if (gState.ended) return;
      _rebuildGrid();
    });
  }

  function endBonusRound() {
    if (!gState || gState.ended) return;
    cancelAnimationFrame(gState.animId);
    gState.bonusRound = false;
    gState.proMode = false;
    gState.submitting = true;
    gState.level++;
    gState.levelBaseSpeed *= 1.2;
    showLevelBanner(`LEVEL ${gState.level}`, () => {
      if (gState.ended) return;
      _rebuildGrid();
    });
  }

  function endGameOver() {
    if (!gState || gState.ended) return;
    gState.ended = true;
    cancelAnimationFrame(gState.animId);
    playGameOverSound();
    document.getElementById('game-over-score').textContent = gState.score;
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('game-over-screen').classList.remove('hidden');
  }

  function endVictory() {
    if (!gState || gState.ended) return;
    gState.ended = true;
    cancelAnimationFrame(gState.animId);
    playVictorySound();
    document.getElementById('game-victory-score').textContent = gState.score;
    document.getElementById('game-name-input').value = '';
    const saveBtn = document.getElementById('btn-save-game-score');
    saveBtn.disabled = false;
    saveBtn.textContent = '💾 Save Score';
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('game-victory-screen').classList.remove('hidden');
  }

  // ══════════════════════════════════════════════════════════
  //  Scores (localStorage)
  // ══════════════════════════════════════════════════════════

  function loadScores(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch (_) { return []; }
  }
  function saveScores(key, scores) {
    localStorage.setItem(key, JSON.stringify(scores));
  }
  function addGameScore(name, score) {
    const scores = loadScores(LS_GAME_SCORES);
    scores.push({ name, score, date: new Date().toLocaleDateString() });
    scores.sort((a, b) => b.score - a.score);
    scores.splice(10);
    saveScores(LS_GAME_SCORES, scores);
  }

  // ══════════════════════════════════════════════════════════
  //  Init
  // ══════════════════════════════════════════════════════════

  function init() {

    // ── Bottom nav ────────────────────────────────────────────
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view === 'view-learn') {
          showView(view);
          initLearn();
          goLearnStep(0);
          return;
        }
        if (view === 'view-practice') {
          showView(view);
          initPractice();
          return;
        }
        if (view === 'view-game') {
          showView(view);
          showGameStart();
          return;
        }
        showView(view);
      });
    });

    // ── Home cards ────────────────────────────────────────────
    document.getElementById('btn-home-learn').addEventListener('click', () => {
      showView('view-learn');
      initLearn();
      goLearnStep(0);
    });
    document.getElementById('btn-home-practice').addEventListener('click', () => {
      showView('view-practice');
      initPractice();
    });
    document.getElementById('btn-home-game').addEventListener('click', () => {
      showView('view-game');
      showGameStart();
    });

    // ── Learn nav ─────────────────────────────────────────────
    document.getElementById('btn-learn-prev').addEventListener('click', () => {
      if (learnStep > 0) goLearnStep(learnStep - 1);
    });
    document.getElementById('btn-learn-next').addEventListener('click', () => {
      if (learnStep < LEARN_STEPS - 1) {
        goLearnStep(learnStep + 1);
      } else {
        showView('view-home');
      }
    });

    // ── Practice ──────────────────────────────────────────────
    pracState.ctrl = makeDigitCtrl('prac', submitPrac, () => pracState.dir);
    document.getElementById('btn-prac-submit').addEventListener('click', submitPrac);
    document.getElementById('prac-pro').addEventListener('change', () => {
      if (pracState.values) {
        const pro = document.getElementById('prac-pro').checked;
        renderDials('practice-dials', pracState.values, pro);
      }
    });
    document.getElementById('prac-dir-ltr').addEventListener('click', () => {
      pracState.dir = 'ltr';
      document.getElementById('prac-dir-ltr').classList.add('active');
      document.getElementById('prac-dir-rtl').classList.remove('active');
    });
    document.getElementById('prac-dir-rtl').addEventListener('click', () => {
      pracState.dir = 'rtl';
      document.getElementById('prac-dir-rtl').classList.add('active');
      document.getElementById('prac-dir-ltr').classList.remove('active');
    });

    // ── Game direction toggle ─────────────────────────────────
    document.getElementById('game-dir-ltr').addEventListener('click', () => {
      gameDir = 'ltr';
      document.getElementById('game-dir-ltr').classList.add('active');
      document.getElementById('game-dir-rtl').classList.remove('active');
    });
    document.getElementById('game-dir-rtl').addEventListener('click', () => {
      gameDir = 'rtl';
      document.getElementById('game-dir-rtl').classList.add('active');
      document.getElementById('game-dir-ltr').classList.remove('active');
    });

    // ── Game input boxes (set up once, direction read dynamically) ──
    const gInputs = [0, 1, 2, 3].map(i => document.getElementById(`game-d${i}`));
    function gOrdered() {
      return gameDir === 'rtl' ? [...gInputs].reverse() : gInputs;
    }
    gInputs.forEach(inp => {
      inp.addEventListener('keydown', e => {
        if (!gState || gState.ended) return;
        const ordered = gOrdered();
        const pos = ordered.indexOf(inp);
        if (e.key === 'Backspace' && inp.value === '' && pos > 0) {
          ordered[pos - 1].focus();
        }
        if (e.key === 'Enter') submitGameAnswer();
      });
      inp.addEventListener('focus', () => inp.select());
      inp.addEventListener('input', () => {
        if (!gState || gState.ended) return;
        const ordered = gOrdered();
        const pos = ordered.indexOf(inp);
        const val = inp.value.replace(/[^0-9]/g, '');
        if (val.length >= 1) {
          inp.value = val.slice(-1);
          if (pos < ordered.length - 1) {
            ordered[pos + 1].focus();
          } else {
            submitGameAnswer();
          }
        } else {
          inp.value = '';
        }
      });
    });

    // ── Game buttons ──────────────────────────────────────────
    document.getElementById('btn-game-start').addEventListener('click', startGame);
    document.getElementById('btn-game-fire').addEventListener('click', submitGameAnswer);
    document.getElementById('btn-game-retry').addEventListener('click', startGame);
    document.getElementById('btn-game-retry2').addEventListener('click', startGame);
    document.getElementById('btn-game-home').addEventListener('click', () => {
      showView('view-home');
    });
    document.getElementById('btn-save-game-score').addEventListener('click', function () {
      const name = document.getElementById('game-name-input').value.trim() || 'Anonymous';
      addGameScore(name, gState ? gState.score : 0);
      this.disabled = true;
      this.textContent = '✓ Saved!';
    });

    // ── Version ───────────────────────────────────────────────
    const vEl = document.querySelector('.app-version');
    if (vEl) vEl.textContent = VERSION;

    // ── Initial view ──────────────────────────────────────────
    showView('view-home');
  }

  document.addEventListener('DOMContentLoaded', init);

})();
