/* ── Meter Reading Training — app.js ── */
'use strict';

(function () {

  // ══════════════════════════════════════════════════════════
  //  Constants
  // ══════════════════════════════════════════════════════════

  const VERSION = 'v1.8.0';

  const DIAL_CLOCKWISE = [false, true, false, true];
  const DIAL_LABELS = ['×1000', '×100', '×10', '×1'];
  const DIAL_GAP = 4;       // must match .dials-row gap in styles.css
  const DIAL_MIN = 56;
  const DIAL_MAX = 120;

  const LS_GAME_SCORES = 'mrt-game-scores';
  const LS_LAST_NAME = 'mrt-last-name';
  const LS_VOICE = 'mrt-voice';

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
  const G_BASE_SPD = 0.4;          // px per 60fps frame, on the reference screen
  // Movement is scaled to the play area so aliens take the same time to reach
  // the ground on a phone as on a computer. These are the reference play-area
  // sizes that speeds and G_STEP_DOWN were tuned for (a typical laptop window).
  const G_REF_TRAVEL = 900;         // side-to-side room the grid has to move
  const G_REF_DESCENT = 450;        // room between the grid and the ground
  const G_FRAME_MS = 1000 / 60;
  const G_MARCH_MS = 500;           // sprite animation frame swap
  const G_STREAK_FOR_DOUBLE = 3;    // correct answers in a row for a double kill
  const G_MISS_REVIEW_MS = 2000;    // how long a miss stays on screen before a new meter

  // ══════════════════════════════════════════════════════════
  //  Audio
  // ══════════════════════════════════════════════════════════

  let _audioCtx = null;
  function getAudioCtx() {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_audioCtx.state === 'suspended') _audioCtx.resume().catch(() => { });
    return _audioCtx;
  }

  // Browsers (Safari especially) only let audio start inside a tap or key press.
  // With voice input the first sound comes from a speech result instead, and the
  // audio engine would stay muted — so unlock it on START and on any interaction.
  function unlockAudio() {
    if (_audioCtx && _audioCtx.state === 'running') return;
    try {
      const ctx = getAudioCtx();
      // iPhone also needs a sound started inside the gesture
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
    } catch (_) { }
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

  function playBonusAnnouncement() {
    // Dramatic impact sting (Web Audio — plays immediately)
    try {
      const ctx = getAudioCtx();
      const t = ctx.currentTime;

      // Sub-bass boom — the signature UT "thud"
      const boom = ctx.createOscillator();
      const boomG = ctx.createGain();
      boom.connect(boomG); boomG.connect(ctx.destination);
      boom.type = 'sine';
      boom.frequency.setValueAtTime(110, t);
      boom.frequency.exponentialRampToValueAtTime(28, t + 0.55);
      boomG.gain.setValueAtTime(1.0, t);
      boomG.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      boom.start(t); boom.stop(t + 0.55);

      // Gritty harmonic layer for "weight"
      const grit = ctx.createOscillator();
      const gritG = ctx.createGain();
      grit.connect(gritG); gritG.connect(ctx.destination);
      grit.type = 'sawtooth';
      grit.frequency.setValueAtTime(220, t);
      grit.frequency.exponentialRampToValueAtTime(55, t + 0.35);
      gritG.gain.setValueAtTime(0.28, t);
      gritG.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      grit.start(t); grit.stop(t + 0.35);

      // Short "echo" repeat of the boom (simulates reverb tail)
      const echo = ctx.createOscillator();
      const echoG = ctx.createGain();
      echo.connect(echoG); echoG.connect(ctx.destination);
      echo.type = 'sine';
      echo.frequency.setValueAtTime(80, t + 0.18);
      echo.frequency.exponentialRampToValueAtTime(22, t + 0.6);
      echoG.gain.setValueAtTime(0.4, t + 0.18);
      echoG.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      echo.start(t + 0.18); echo.stop(t + 0.6);
    } catch (_) {}

    // "Bonus Round" announcer voice
    loadSound(BONUS_VOICE_URL).then(playAnnouncer).catch(() => { });
  }

  // Recorded with the macOS "Daniel" voice, then roughened at play time into an
  // arena-style announcer (settings picked by ear on a test page)
  const BONUS_VOICE_URL = './bonus-round.wav';
  const ANNOUNCER = { pitch: 0.90, grit: 0.10, echo: 0.05 };

  function playAnnouncer(buf) {
    const ctx = getAudioCtx();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = ANNOUNCER.pitch;   // lower and slower

    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
    const pre = ctx.createGain(); pre.gain.value = 1 + ANNOUNCER.grit * 2;
    const shaper = ctx.createWaveShaper();     // soft saturation for grit
    const k = ANNOUNCER.grit * 40, n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1) * 2 - 1;
      curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
    }
    shaper.curve = curve;
    const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 180; low.gain.value = 7;
    const presence = ctx.createBiquadFilter(); presence.type = 'peaking';
    presence.frequency.value = 2500; presence.Q.value = 1; presence.gain.value = 4;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -26; comp.ratio.value = 8; comp.attack.value = 0.003; comp.release.value = 0.25;
    const master = ctx.createGain(); master.gain.value = 0.9;

    src.connect(hp); hp.connect(pre); pre.connect(shaper); shaper.connect(low);
    low.connect(presence); presence.connect(comp); comp.connect(master);

    // Slap-back echo off the arena walls
    const delay = ctx.createDelay(1); delay.delayTime.value = 0.13;
    const fb = ctx.createGain(); fb.gain.value = ANNOUNCER.echo;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2200;
    comp.connect(delay); delay.connect(tone); tone.connect(fb); fb.connect(delay); tone.connect(master);

    master.connect(ctx.destination);
    src.start(ctx.currentTime + 0.05);
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

  // Played through Web Audio rather than an <audio> element: on iPhone, <audio>
  // playback can leave speech recognition listening but deaf afterwards.
  const WRONG_SOUND_URL = './wrong-answer-sound-effect.mp3';
  let _wrongAudio = null;   // fallback when fetch isn't available (page opened as a file)

  function playWrongSound() {
    try {
      if (navigator.vibrate) navigator.vibrate(200);
      loadSound(WRONG_SOUND_URL)
        .then(playBuffer)
        .catch(() => {
          if (!_wrongAudio) _wrongAudio = new Audio(WRONG_SOUND_URL);
          _wrongAudio.currentTime = 0;
          _wrongAudio.play().catch(() => { });
        });
    } catch (_) { }
  }

  // Sound files are downloaded up front and decoded once on first use
  const _soundBytes = {};
  const _soundBuffers = {};

  function prefetchSound(url) {
    if (!_soundBytes[url]) _soundBytes[url] = fetch(url).then(r => r.arrayBuffer()).catch(() => null);
  }

  function loadSound(url) {
    if (_soundBuffers[url]) return Promise.resolve(_soundBuffers[url]);
    prefetchSound(url);
    return _soundBytes[url]
      .then(bytes => {
        if (!bytes) throw new Error('no sound data');
        return getAudioCtx().decodeAudioData(bytes.slice(0));
      })
      .then(buf => (_soundBuffers[url] = buf));
  }

  function playBuffer(buf) {
    const ctx = getAudioCtx();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
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
    // Draw in CSS pixels; the canvas backing store may be larger for sharp phone screens
    const dpr = canvas._dpr || 1;
    const size = canvas.width / dpr;
    const cx = size / 2, cy = size / 2, r = size / 2 - 2;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      ctx.lineTo(cx + Math.cos(angle) * (r - 2 - size * 0.07), cy + Math.sin(angle) * (r - 2 - size * 0.07));
      ctx.stroke();

      for (let sub = 1; sub < 5; sub++) {
        let sf = (digit + sub * 0.2) / 10;
        if (!clockwise) sf = 1 - sf;
        const sa = sf * Math.PI * 2 - Math.PI / 2;
        ctx.strokeStyle = '#bbb'; ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(sa) * (r - 2), cy + Math.sin(sa) * (r - 2));
        ctx.lineTo(cx + Math.cos(sa) * (r - 2 - size * 0.04), cy + Math.sin(sa) * (r - 2 - size * 0.04));
        ctx.stroke();
      }

      if (!proMode) {
        // Numbers sit just inside the ticks so neighbours (e.g. "1 0 9") don't crowd
        const textR = r - size * 0.17;
        ctx.fillStyle = '#111';
        ctx.font = `bold ${Math.round(size * 0.14)}px -apple-system, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(digit),
          cx + Math.cos(angle) * textR,
          cy + Math.sin(angle) * textR);
      }
    }

    // Needle — bold, dark-edged and drop-shadowed so it stands out over the numbers
    const frac = (value % 10) / 10;
    const needleFrac = clockwise ? frac : 1 - frac;
    const needleAngle = needleFrac * Math.PI * 2 - Math.PI / 2;
    const needleLen = r * 0.56;   // tip stops just short of the numbers so they stay readable
    const tailLen = r * 0.2;
    const perpAngle = needleAngle + Math.PI / 2;
    const baseW = size * 0.06;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = size * 0.04;
    ctx.shadowOffsetY = size * 0.015;
    ctx.fillStyle = '#d4142f';
    ctx.strokeStyle = '#5c0010';
    ctx.lineWidth = Math.max(1, size * 0.012);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(needleAngle) * needleLen, cy + Math.sin(needleAngle) * needleLen);
    ctx.lineTo(cx + Math.cos(perpAngle) * baseW, cy + Math.sin(perpAngle) * baseW);
    ctx.lineTo(cx - Math.cos(needleAngle) * tailLen, cy - Math.sin(needleAngle) * tailLen);
    ctx.lineTo(cx - Math.cos(perpAngle) * baseW, cy - Math.sin(perpAngle) * baseW);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#888';
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.025, 0, Math.PI * 2); ctx.fill();
  }

  // Size a canvas in CSS pixels, with a high-resolution backing store
  function sizeCanvas(canvas, size) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = canvas.height = Math.round(size * dpr);
    canvas.style.width = canvas.style.height = size + 'px';
    canvas._dpr = dpr;
  }

  // Four dials fill the row's width, within sensible limits
  function dialSizeFor(container) {
    const avail = container.clientWidth || Math.min(window.innerWidth, 600) - 32;
    return Math.max(DIAL_MIN, Math.min(Math.floor((avail - 3 * DIAL_GAP) / 4), DIAL_MAX));
  }

  function renderDials(containerId, values, proMode) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const dialSize = dialSizeFor(container);
    values.forEach((val, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'dial-wrap';

      const canvas = document.createElement('canvas');
      sizeCanvas(canvas, dialSize);
      drawDial(canvas, val, DIAL_CLOCKWISE[i], proMode);

      const lbl = document.createElement('div');
      lbl.className = 'dial-label';
      lbl.textContent = DIAL_LABELS[i];

      const badge = document.createElement('div');
      badge.className = 'dial-dir-badge';
      badge.textContent = DIAL_CLOCKWISE[i] ? 'CW' : 'CCW';
      // Real meters aren't labelled — Pro Mode drops this crutch too
      if (proMode) badge.style.visibility = 'hidden';

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
    if (id !== 'view-game') pauseGame();
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('nav-active', btn.dataset.view === id);
    });
    syncVoice();
  }

  // ══════════════════════════════════════════════════════════
  //  Digit input helper
  // ══════════════════════════════════════════════════════════

  // getDirFn: optional function returning 'ltr' or 'rtl'
  function makeDigitCtrl(prefix, onComplete, getDirFn, skipAutoFocus) {
    const inputs = [0, 1, 2, 3].map(i => document.getElementById(`${prefix}-d${i}`));
    const autoFocus = () => {
      if (skipAutoFocus && skipAutoFocus()) return;
      setTimeout(() => orderedInputs()[0].focus(), 80);
    };

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
      focus: autoFocus,
      getAnswer: () => inputs.map(inp => inp.value).join(''), // always LTR (d0–d3)
      reset: () => {
        inputs.forEach(inp => {
          inp.value = '';
          inp.classList.remove('correct', 'wrong');
          inp.readOnly = false;
        });
        autoFocus();
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
    sizeCanvas(canvas, size);
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
    streak: 0, bestStreak: 0,
    dialMisses: [0, 0, 0, 0],
    values: null, answer: null,
    submitted: false,
    ctrl: null,
    dir: 'ltr',
  };

  let gameDir = 'ltr';

  function initPractice() {
    pracState.correct = 0;
    pracState.total = 0;
    pracState.streak = 0;
    pracState.bestStreak = 0;
    pracState.dialMisses = [0, 0, 0, 0];
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
    voiceClearPending();
    renderVoiceStatus();
  }

  function submitPrac() {
    if (pracState.submitted) return;
    const answer = pracState.ctrl.getAnswer();
    if (answer.length < 4) return;
    pracState.submitted = true;

    const correct = answer === pracState.answer;
    pracState.total++;
    pracState.ctrl.markResult(pracState.answer);

    const fb = document.getElementById('prac-feedback');
    const msg = document.getElementById('prac-fb-msg');
    if (correct) {
      pracState.correct++;
      pracState.streak++;
      pracState.bestStreak = Math.max(pracState.bestStreak, pracState.streak);
      playCorrectSound();
      fb.className = 'feedback-bar correct-fb';
      msg.textContent = `Correct! Reading: ${pracState.answer}`;
    } else {
      pracState.streak = 0;
      const missed = [0, 1, 2, 3].filter(i => answer[i] !== pracState.answer[i]);
      missed.forEach(i => pracState.dialMisses[i]++);
      document.querySelectorAll('#practice-dials .dial-wrap').forEach((wrap, i) => {
        wrap.classList.toggle('dial-miss', missed.includes(i));
      });
      playWrongSound();
      fb.className = 'feedback-bar wrong-fb';
      msg.textContent = `Wrong. Correct reading: ${pracState.answer} — ${missedDialsHint(missed)}`;
    }
    updatePracStats();
    // Leave a miss on screen longer so the ringed dials can be studied
    setTimeout(nextPracQuestion, correct ? 1200 : 2500);
  }

  function updatePracStats() {
    const s = pracState;
    document.getElementById('prac-accuracy').textContent =
      s.total ? Math.round(100 * s.correct / s.total) + '%' : '—';
    document.getElementById('prac-accuracy-detail').textContent =
      s.total ? `${s.correct}/${s.total} correct` : 'Accuracy';
    document.getElementById('prac-streak').textContent = s.streak ? '🔥 ' + s.streak : '0';
    document.getElementById('prac-best').textContent = s.bestStreak;
    const maxMiss = Math.max(...s.dialMisses);
    document.getElementById('prac-missed').textContent = maxMiss
      ? s.dialMisses.map((n, i) => (n === maxMiss ? DIAL_LABELS[i] : null)).filter(Boolean).join(' ')
      : '—';
  }

  // "check the ×100 dial" / "check the ×100, ×10 dials"
  function missedDialsHint(missed) {
    const names = missed.map(i => DIAL_LABELS[i]);
    return names.length === 1 ? `check the ${names[0]} dial` : `check the ${names.join(', ')} dials`;
  }

  // ══════════════════════════════════════════════════════════
  //  Voice input  (Web Speech API — Chrome, Edge, Safari)
  // ══════════════════════════════════════════════════════════

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  // Installed to the iPhone/iPad Home Screen, where speech recognition is unreliable
  const IOS_HOME_SCREEN_APP = window.navigator.standalone === true;

  // Spoken words → digits, including common mis-hearings ("for" → 4, "ate" → 8)
  const VOICE_WORD_DIGITS = {
    zero: '0', oh: '0', o: '0', owe: '0',
    one: '1', won: '1',
    two: '2', to: '2', too: '2',
    three: '3', tree: '3', free: '3',
    four: '4', for: '4', fore: '4',
    five: '5',
    six: '6', sicks: '6',
    seven: '7',
    eight: '8', ate: '8',
    nine: '9', nein: '9',
    ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14',
    fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19',
  };
  const VOICE_TENS = {
    twenty: '2', thirty: '3', forty: '4', fourty: '4', fifty: '5',
    sixty: '6', seventy: '7', eighty: '8', ninety: '9',
  };

  // "four two seven one", "4271", "42 71" and "forty two seventy one" all → "4271".
  // In an unfinished (interim) phrase a trailing "seventy" is left open, because
  // the speaker is probably about to say "…one".
  function spokenToDigits(text, isFinal) {
    const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    let out = '';
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (/^\d+$/.test(t)) { out += t; continue; }
      if (VOICE_TENS[t]) {
        const unit = VOICE_WORD_DIGITS[tokens[i + 1]];
        if (unit && unit.length === 1 && unit !== '0') {
          out += VOICE_TENS[t] + unit;
          i++;
        } else if (i === tokens.length - 1 && !isFinal) {
          out += VOICE_TENS[t];
        } else {
          out += VOICE_TENS[t] + '0';
        }
        continue;
      }
      if (VOICE_WORD_DIGITS[t]) out += VOICE_WORD_DIGITS[t];
    }
    return out;
  }

  function detectVoiceCommand(text) {
    const t = text.toLowerCase();
    if (/\b(clear|cancel|reset|erase|start over)\b/.test(t)) return 'clear';
    if (/\b(pause|stop)\b/.test(t)) return 'pause';
    if (/\b(resume|continue|unpause)\b/.test(t)) return 'resume';
    return null;
  }

  const voice = {
    supported: !!SpeechRec,
    enabled: false,
    rec: null,
    running: false,
    wanted: false,
    retryDelay: 300,
    probing: false,
    committed: '',                     // digits from finished phrases, not yet used
    consumed: { index: -1, count: 0 }, // digits of a result already used for an answer
    lastIndex: -1,
    lastCount: 0,
    cmdIndex: -1,
  };

  // Set by the game: onDigits(str) → true if it submitted, onCommand(cmd),
  // onHeard(text, digits), onState(state, msg)
  const voiceHooks = {
    onDigits: () => false, onCommand: () => { }, onHeard: () => { }, onState: () => { },
  };

  function voiceCreate() {
    const rec = new SpeechRec();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;

    rec.onstart = () => {
      voice.running = true;
      voice.retryDelay = 300;
      voice.committed = '';
      voice.consumed = { index: -1, count: 0 };
      voice.lastIndex = -1;
      voice.lastCount = 0;
      voice.cmdIndex = -1;
      voiceHooks.onState('listening');
    };
    rec.onend = () => {
      voice.running = false;
      if (voice.wanted) {
        // Browsers end recognition after silence — quietly start it again
        setTimeout(() => { if (voice.wanted && !voice.running) voiceStart(); }, voice.retryDelay);
      } else {
        voiceHooks.onState('off');
      }
    };
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        voice.wanted = false;
        voiceSetEnabled(false);
        voiceHooks.onState('error', 'Microphone access was blocked. Allow the mic for this page in your browser settings, then turn voice back on.');
      } else if (e.error === 'network') {
        voice.retryDelay = 3000;
        voiceHooks.onState('error', 'Voice recognition needs an internet connection — retrying…');
      } else if (e.error === 'audio-capture') {
        voice.retryDelay = 3000;
        voiceHooks.onState('error', 'No microphone found.');
      }
      // 'no-speech' and 'aborted' are normal; onend restarts if needed
    };
    rec.onresult = voiceHandleResult;
    return rec;
  }

  function voiceHandleResult(e) {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];

      // Prefer the first alternative that contains digits or a command
      let text = res[0].transcript;
      for (let a = 0; a < res.length; a++) {
        const alt = res[a].transcript;
        if (spokenToDigits(alt, res.isFinal) || detectVoiceCommand(alt)) { text = alt; break; }
      }

      const full = spokenToDigits(text, res.isFinal);
      voice.lastIndex = i;
      voice.lastCount = full.length;
      if (i < voice.consumed.index) continue;

      const cmd = detectVoiceCommand(text);
      if (cmd) {
        if (voice.cmdIndex !== i) {
          voice.cmdIndex = i;
          voice.committed = '';
          voice.consumed = { index: i, count: full.length };
          voiceHooks.onCommand(cmd);
        }
        continue;
      }

      const fresh = i === voice.consumed.index ? full.slice(voice.consumed.count) : full;
      const total = voice.committed + fresh;
      voiceHooks.onHeard(text, total);

      if (voiceHooks.onDigits(total)) {
        // Answer submitted — anything else in this phrase belongs to the old meter
        voice.committed = '';
        voice.consumed = { index: i, count: full.length };
      } else if (res.isFinal) {
        // Speaker paused mid-reading ("four two … seven one"): keep what we have
        voice.committed = total;
        voice.consumed = { index: i + 1, count: 0 };
      }
    }
  }

  function voiceStart() {
    if (!voice.supported || voice.running) return;
    if (!voice.rec) voice.rec = voiceCreate();
    try { voice.rec.start(); voice.running = true; } catch (_) { /* already started */ }
  }

  // Start listening afresh right now. iPhone Safari only passes audio to speech
  // recognition started directly inside a tap, so call this from click handlers.
  function voiceRestartNow() {
    if (!voice.supported) return;
    const old = voice.rec;
    if (old) {
      old.onstart = old.onend = old.onerror = old.onresult = null;
      try { old.abort(); } catch (_) { }
    }
    voice.rec = voiceCreate();
    voice.running = false;
    voiceStart();
  }

  function voiceSetWanted(wanted) {
    voice.wanted = wanted;
    if (wanted) voiceStart();
    else if (voice.running && voice.rec) {
      try { voice.rec.abort(); } catch (_) { }
    }
  }

  // Forget partial digits, e.g. when a new meter appears
  function voiceClearPending() {
    voice.committed = '';
    voice.consumed = { index: voice.lastIndex, count: voice.lastCount };
  }

  function voiceSetEnabled(on) {
    voice.enabled = on && voice.supported;
    try { localStorage.setItem(LS_VOICE, voice.enabled ? '1' : '0'); } catch (_) { }
  }

  function voiceLoadEnabled() {
    try { return localStorage.getItem(LS_VOICE) === '1'; } catch (_) { return false; }
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

  // Pixel-art alien sprites — two frames each for the classic "march"
  const ALIEN_SPRITES = [
    {
      color: '#c77dff',
      frames: [
        ['...##...', '..####..', '.######.', '##.##.##', '########', '..#..#..', '.#.##.#.', '#.#..#.#'],
        ['...##...', '..####..', '.######.', '##.##.##', '########', '.#.##.#.', '#......#', '.#....#.'],
      ],
    },
    {
      color: '#4dd9ff',
      frames: [
        ['..#.....#..', '...#...#...', '..#######..', '.##.###.##.', '###########', '#.#######.#', '#.#.....#.#', '...##.##...'],
        ['..#.....#..', '#..#...#..#', '#.#######.#', '###.###.###', '###########', '.#########.', '..#.....#..', '.#.......#.'],
      ],
    },
  ];

  function spriteSvg(rows, cls) {
    const w = rows[0].length, h = rows.length;
    let rects = '';
    rows.forEach((line, y) => {
      for (let x = 0; x < w; x++) {
        if (line[x] === '#') rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
      }
    });
    return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" fill="currentColor">${rects}</svg>`;
  }

  function alienSpriteHtml(type) {
    const s = ALIEN_SPRITES[type];
    return spriteSvg(s.frames[0], 'fa') + spriteSvg(s.frames[1], 'fb');
  }

  function showGameStart() {
    if (gState) {
      gState.ended = true;
      cancelAnimationFrame(gState.animId);
      gState = null;
    }
    const banner = document.getElementById('level-banner');
    if (banner) banner.remove();
    document.getElementById('game-start-screen').classList.remove('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('game-pause-screen').classList.add('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('game-victory-screen').classList.add('hidden');
    renderLeaderboard();
    syncVoice();
  }

  // Entering the game view resumes a paused game instead of wiping it
  function enterGameView() {
    showView('view-game');
    if (!gState || gState.ended) showGameStart();
  }

  function startGame() {
    if (gState) { gState.ended = true; cancelAnimationFrame(gState.animId); }
    unlockAudio();
    if (voice.enabled) {
      // Start the mic inside the START tap (required on iPhone)
      voice.wanted = true;
      voiceRestartNow();
    }
    document.getElementById('game-start-screen').classList.add('hidden');
    document.getElementById('game-pause-screen').classList.add('hidden');
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

    gState = {
      aliens: [],
      groupX: 0,
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
      endReason: null,
      animId: null,
      lastTs: null,
      marchTimer: 0,
      aStartTime: Date.now(),
      areaW,
      groundY,
      ...paceScale(areaW, groundY),
      submitting: false,
      inTransition: false,
      paused: false,
      pausedAt: 0,
      fbTimer: null,
      proMode: false,
      bonusRound: false,
      bonusUsed: false,
      streak: 0,
      bestStreak: 0,
      stats: { attempts: 0, correct: 0, correctTime: 0, dialMisses: [0, 0, 0, 0] },
    };

    startWave();
    syncVoice();
  }

  function measureGameArea() {
    if (!gState) return;
    const area = document.getElementById('game-area');
    const areaW = area.clientWidth;
    const areaH = area.clientHeight;
    if (!areaW || !areaH) return;
    gState.areaW = areaW;
    gState.groundY = Math.max(areaH, 160) - 4;
    Object.assign(gState, paceScale(gState.areaW, gState.groundY));
    const laserCanvas = document.getElementById('laser-canvas');
    if (laserCanvas) { laserCanvas.width = areaW; laserCanvas.height = areaH; }
  }

  // How this screen's play area compares to the reference one
  function paceScale(areaW, groundY) {
    const gridW = G_COLS * G_CELL_W - G_GAP_X;
    const gridH = (G_ROWS - 1) * G_CELL_H + G_ALIEN_H;
    const travel = Math.max(areaW - 16 - gridW, 40);
    const descent = Math.max(groundY - 16 - gridH, 60);
    return { scaleX: travel / G_REF_TRAVEL, scaleY: descent / G_REF_DESCENT };
  }

  // Set up a fresh grid of aliens for the current level
  function startWave() {
    const gridW = G_COLS * G_CELL_W - G_GAP_X;
    gState.groupX = Math.round((gState.areaW - gridW) / 2);
    gState.groupY = 16;
    gState.dir = 1;
    gState.speed = gState.levelBaseSpeed;
    gState.targetId = null;
    gState.submitting = false;
    gState.inTransition = false;
    gState.lastTs = null;
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
    measureGameArea();   // the meter's height is only known once it is drawn
    resetGameInputs();
    updateHUD();
    if (!gState.paused) gState.animId = requestAnimationFrame(gameLoop);
  }

  function buildAlienGrid() {
    const grid = document.getElementById('alien-grid');
    grid.innerHTML = '';
    grid.classList.remove('frame-b');
    grid.style.transform = `translate(${gState.groupX}px, ${gState.groupY}px)`;
    gState.aliens.forEach(alien => {
      const type = alien.row === 0 ? 0 : 1;
      const el = document.createElement('div');
      el.className = 'alien';
      el.innerHTML = alienSpriteHtml(type);
      el.style.color = ALIEN_SPRITES[type].color;
      el.style.left = (alien.col * G_CELL_W) + 'px';
      el.style.top = (alien.row * G_CELL_H) + 'px';
      grid.appendChild(el);
      alien.el = el;
    });
  }

  function gameLoop(ts) {
    if (!gState || gState.ended || gState.paused || gState.inTransition) return;

    // Scale movement by elapsed time so speed is the same on 60Hz and 120Hz screens
    const dt = gState.lastTs == null ? 1 : Math.min(ts - gState.lastTs, 50) / G_FRAME_MS;
    gState.lastTs = ts;

    gState.groupX += gState.dir * gState.speed * gState.scaleX * dt;

    const grid = document.getElementById('alien-grid');
    gState.marchTimer += dt * G_FRAME_MS;
    if (gState.marchTimer >= G_MARCH_MS) {
      gState.marchTimer = 0;
      grid.classList.toggle('frame-b');
    }

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
      gState.groupY += G_STEP_DOWN * gState.scaleY;
    } else if (gState.dir < 0 && leftEdge <= 8) {
      gState.dir = 1;
      gState.groupY += G_STEP_DOWN * gState.scaleY;
    }

    // Ground check
    const rows = alive.map(a => a.row);
    const maxRow = Math.max(...rows);
    const botEdge = gState.groupY + maxRow * G_CELL_H + G_ALIEN_H;
    if (botEdge >= gState.groundY) {
      if (gState.bonusRound) {
        // Landing during the bonus round just ends the bonus
        showGameFeedback(false, 'The aliens got through — bonus over!');
        endBonusRound();
      } else {
        if (!gState.endReason) gState.endReason = 'landed';
        endGameOver();
      }
      return;
    }

    // Update DOM
    grid.style.transform =
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

  // After a miss, the same alien gets a brand-new meter so the answer can't be copied
  function newReadingForTarget() {
    const alien = gState.aliens.find(a => a.id === gState.targetId);
    if (alien) {
      alien.reading = generateReading();
      alien.answer = getCorrectAnswer(alien.reading);
      gState.reading = alien.reading;
      gState.answer = alien.answer;
    }
    gState.aStartTime = Date.now();
    renderGameMeter();
    resetGameInputs();
  }

  function renderGameMeter() {
    if (!gState || !gState.reading) return;
    renderDials('game-dials', gState.reading, gState.proMode);
  }

  // On phones with voice on, don't pop up the keyboard (and its own dictation mic)
  function voiceOnPhone() {
    return voice.enabled && window.matchMedia('(pointer: coarse)').matches;
  }

  function focusFirstGameInput() {
    if (voiceOnPhone()) return;
    setTimeout(() => {
      const firstId = gameDir === 'rtl' ? 'game-d3' : 'game-d0';
      const d = document.getElementById(firstId);
      if (d) d.focus();
    }, 80);
  }

  function resetGameInputs() {
    [0, 1, 2, 3].forEach(i => {
      const inp = document.getElementById(`game-d${i}`);
      if (!inp) return;
      inp.value = '';
      inp.classList.remove('correct', 'wrong');
      inp.readOnly = false;
    });
    voiceClearPending();
    renderVoiceStatus();
    focusFirstGameInput();
  }

  // Show which digits / dials were misread
  function markGameMiss(correctAnswer, missed) {
    [0, 1, 2, 3].forEach(i => {
      const inp = document.getElementById(`game-d${i}`);
      inp.classList.remove('correct', 'wrong');
      inp.classList.add(missed.includes(i) ? 'wrong' : 'correct');
      inp.readOnly = true;
    });
    document.querySelectorAll('#game-dials .dial-wrap').forEach((wrap, i) => {
      wrap.classList.toggle('dial-miss', missed.includes(i));
    });
  }

  function getGameAnswer() {
    return [0, 1, 2, 3].map(i => {
      const inp = document.getElementById(`game-d${i}`);
      return inp ? inp.value : '';
    }).join('');
  }

  function submitGameAnswer() {
    if (!gState || gState.ended || gState.paused || gState.submitting || gState.inTransition) return;
    const answer = getGameAnswer();
    if (answer.length < 4) return;

    const g = gState;
    g.submitting = true;
    g.stats.attempts++;
    const correct = answer === g.answer;

    if (correct) {
      const elapsed = (Date.now() - g.aStartTime) / 1000;
      const speedBonus = Math.max(0, Math.floor((8 - elapsed) * 10));
      g.stats.correct++;
      g.stats.correctTime += elapsed;
      g.streak++;
      g.bestStreak = Math.max(g.bestStreak, g.streak);

      // Double kill: every Nth correct answer in a row also destroys the next alien
      const isDoubleKill = g.streak % G_STREAK_FOR_DOUBLE === 0;

      // Find primary target
      const alien = g.aliens.find(a => a.id === g.targetId);

      // Find secondary target (next frontmost, excluding primary)
      let alien2 = null;
      if (isDoubleKill) {
        const nextAlive = g.aliens.filter(a => a.alive && a.id !== g.targetId);
        if (nextAlive.length > 0) {
          const maxRow = Math.max(...nextAlive.map(a => a.row));
          const front = nextAlive.filter(a => a.row === maxRow);
          front.sort((a, b) => g.dir >= 0 ? b.col - a.col : a.col - b.col);
          alien2 = front[0];
        }
      }

      const killCount = alien2 ? 2 : 1;
      const pointMultiplier = g.bonusRound ? 10 : 1;
      const points = (100 * killCount + speedBonus) * pointMultiplier;
      g.score += points;

      playLaserSound();
      if (alien) fireLaser(alien);
      if (alien2) {
        setTimeout(() => { if (gState === g) { playLaserSound(); fireLaser(alien2); } }, 160);
        showGameFeedback(true, `🔥 ${g.streak} IN A ROW — DOUBLE KILL! +${points} pts`);
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
          if (gState !== g) return;
          if (alien2.el) { alien2.el.classList.add('exploding'); alien2.exploding = true; }
          setTimeout(playExplosionSound, 60);
        }, 160);
      }
      updateHUD();

      setTimeout(() => {
        if (gState !== g || g.ended) return;
        if (alien) {
          alien.alive = false; alien.exploding = false;
          if (alien.el) alien.el.style.display = 'none';
        }
        if (alien2) {
          alien2.alive = false; alien2.exploding = false;
          if (alien2.el) alien2.el.style.display = 'none';
        }

        const remaining = g.aliens.filter(a => a.alive);
        if (remaining.length === 0) {
          startNextLevel();
          return;
        }

        // Speed ramps up as aliens are destroyed
        g.speed = g.levelBaseSpeed + (10 - remaining.length) * 0.1;

        pickTarget();
        renderGameMeter();
        resetGameInputs();
        updateHUD();
        g.submitting = false;
      }, 480);

    } else {
      g.streak = 0;
      const missed = [0, 1, 2, 3].filter(i => answer[i] !== g.answer[i]);
      missed.forEach(i => g.stats.dialMisses[i]++);
      markGameMiss(g.answer, missed);
      playWrongSound();

      const hint = missedDialsHint(missed);

      if (g.bonusRound) {
        showGameFeedback(false, `BONUS OVER! Correct: ${g.answer} — ${hint}`, G_MISS_REVIEW_MS);
        updateHUD();
        setTimeout(() => { if (gState === g) endBonusRound(); }, G_MISS_REVIEW_MS);
      } else {
        g.lives--;
        g.speed += 0.2;
        showGameFeedback(false, `Wrong! Correct: ${g.answer} — ${hint}`, G_MISS_REVIEW_MS);
        updateHUD();
        if (g.lives <= 0) {
          if (!g.endReason) g.endReason = 'lives';
          setTimeout(() => { if (gState === g) endGameOver(); }, G_MISS_REVIEW_MS);
        } else {
          setTimeout(() => {
            if (gState !== g || g.ended || g.inTransition) return;
            newReadingForTarget();
            g.submitting = false;
          }, G_MISS_REVIEW_MS);
        }
      }
    }
  }

  function showGameFeedback(ok, msg, duration = 1400) {
    const fb = document.getElementById('game-feedback');
    fb.textContent = msg;
    fb.className = 'feedback-bar ' + (ok ? 'correct-fb' : 'wrong-fb');
    clearTimeout(gState.fbTimer);
    gState.fbTimer = setTimeout(() => {
      if (fb) fb.className = 'feedback-bar hidden';
    }, duration);
  }

  function updateHUD() {
    if (!gState) return;
    document.getElementById('game-score-display').textContent = gState.score;
    const remaining = gState.aliens.filter(a => a.alive).length;
    document.getElementById('game-remaining').textContent = '👾 ' + remaining;
    document.getElementById('game-level').textContent =
      gState.bonusRound ? 'BONUS' : 'LV ' + gState.level;
    document.getElementById('game-streak').textContent =
      gState.streak > 0 ? `🔥 ${gState.streak} in a row` : '';
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

  function startNextLevel() {
    if (!gState || gState.ended || gState.inTransition) return;
    const g = gState;
    cancelAnimationFrame(g.animId);
    g.inTransition = true;
    g.submitting = true;

    const wasBonus = g.bonusRound;
    if (wasBonus) { g.bonusRound = false; g.proMode = false; }

    g.level++;
    g.levelBaseSpeed *= 1.2;

    // Victory after clearing level 5
    if (!wasBonus && g.level > 5) {
      endVictory();
      return;
    }

    const triggerBonus = !wasBonus && g.level === 3 && !g.bonusUsed;
    if (triggerBonus) {
      g.bonusRound = true;
      g.bonusUsed = true;
      g.proMode = true;
      g.level = 2;
    }

    const bannerText = triggerBonus ? '⭐ BONUS ROUND ⭐' : `LEVEL ${g.level}`;
    if (triggerBonus) playBonusAnnouncement();
    showLevelBanner(bannerText, () => {
      if (gState !== g || g.ended) return;
      startWave();
    });
  }

  function endBonusRound() {
    if (!gState || gState.ended || gState.inTransition) return;
    const g = gState;
    cancelAnimationFrame(g.animId);
    g.inTransition = true;
    g.bonusRound = false;
    g.proMode = false;
    g.submitting = true;
    g.level++;
    g.levelBaseSpeed *= 1.2;
    showLevelBanner(`LEVEL ${g.level}`, () => {
      if (gState !== g || g.ended) return;
      startWave();
    });
  }

  // ── Pause ──────────────────────────────────────────────────

  function pauseGame() {
    if (!gState || gState.ended || gState.paused) return;
    gState.paused = true;
    gState.pausedAt = Date.now();
    cancelAnimationFrame(gState.animId);
    document.getElementById('game-pause-screen').classList.remove('hidden');
  }

  function resumeGame() {
    if (!gState || gState.ended || !gState.paused) return;
    const now = Date.now();
    gState.paused = false;
    // Don't count paused time against the speed bonus
    gState.aStartTime = Math.min(now, gState.aStartTime + (now - gState.pausedAt));
    gState.lastTs = null;
    document.getElementById('game-pause-screen').classList.add('hidden');
    cancelAnimationFrame(gState.animId);
    if (!gState.inTransition) gState.animId = requestAnimationFrame(gameLoop);
    voiceClearPending();
    focusFirstGameInput();
  }

  function isGameRunning() {
    return !!gState && !gState.ended;
  }

  // ── Voice input ────────────────────────────────────────────

  let voiceState = 'off';
  let voiceMsg = '';

  function gameViewActive() {
    return document.getElementById('view-game').classList.contains('active');
  }

  function practiceViewActive() {
    return document.getElementById('view-practice').classList.contains('active');
  }

  // Where spoken digits go: the Practice screen or a running game
  function voiceTarget() {
    if (practiceViewActive()) return 'practice';
    if (gameViewActive() && isGameRunning()) return 'game';
    return null;
  }

  // Listen only while Practice or a game is on screen
  function syncVoice() {
    voiceSetWanted(voice.enabled && !!voiceTarget() && !document.hidden);
    updateVoiceControls();
  }

  // Start the mic inside a tap that opens Practice (required on iPhone)
  function voiceStartForPractice() {
    if (!voice.enabled) return;
    voice.wanted = true;
    voiceRestartNow();
  }

  function updateVoiceControls() {
    ['game-voice-toggle', 'prac-voice-toggle'].forEach(id => {
      document.getElementById(id).checked = voice.enabled;
    });
    ['btn-game-mic', 'btn-prac-mic'].forEach(id => {
      const mic = document.getElementById(id);
      mic.classList.toggle('mic-on', voice.enabled);
      mic.classList.toggle('listening', voice.enabled && voiceState === 'listening');
      mic.title = voice.enabled ? 'Voice input on — click to turn off' : 'Voice input off — click to turn on';
    });
    renderVoiceStatus();
  }

  function renderVoiceStatus(heard) {
    ['game-voice-status', 'prac-voice-status'].forEach(id => {
      const el = document.getElementById(id);
      el.classList.toggle('hidden', !voice.enabled && voiceState !== 'error');
      el.classList.toggle('vs-error', voiceState === 'error');
      if (voiceState === 'error') el.textContent = '⚠ ' + voiceMsg;
      else if (heard) el.textContent = `🎤 Heard: “${heard}”`;
      else if (voiceState === 'listening') el.textContent = '🎤 Listening… (tap here if it stops hearing you)';
      else el.textContent = '🎤 Starting microphone…';
    });
    const note = document.getElementById('game-voice-note');
    if (!voice.supported) note.textContent = 'Voice input needs Chrome, Edge or Safari.';
    else if (voiceState === 'error') note.textContent = voiceMsg;
    else if (IOS_HOME_SCREEN_APP) note.textContent = 'On iPhone, voice input may not work in the Home Screen app. If it doesn’t hear you, open the game in Safari instead.';
    else note.textContent = 'Say each digit, e.g. “four two seven one”. Say “clear” to start over, “pause” to pause.';
    note.classList.toggle('vs-error', voiceState === 'error');
  }

  function setVoiceEnabledFromUser(on) {
    voiceSetEnabled(on);
    voiceState = 'off';
    if (voice.enabled && voiceTarget()) {
      voice.wanted = true;
      voiceRestartNow();
    } else if (voice.enabled) {
      // Ask for microphone permission now rather than mid-game
      voice.probing = true;
      voiceRestartNow();
    }
    syncVoice();
    if (voiceTarget() === 'game' && !gState.paused) focusFirstGameInput();
  }

  voiceHooks.onState = (state, msg) => {
    if (state === 'listening' && voice.probing && !voice.wanted) {
      voice.probing = false;
      try { voice.rec.abort(); } catch (_) { }
      return;
    }
    voice.probing = false;
    // Keep an error visible after recognition shuts down
    if (state === 'off' && voiceState === 'error') return;
    voiceState = state;
    voiceMsg = msg || '';
    updateVoiceControls();
  };

  voiceHooks.onHeard = text => {
    if (!voiceTarget()) return;
    if (voiceState === 'error') voiceState = 'listening';
    renderVoiceStatus(text.trim());
  };

  voiceHooks.onDigits = digits => {
    if (voiceTarget() === 'practice') return practiceVoiceDigits(digits);
    if (!digits || !gState || gState.ended || gState.paused || gState.submitting || gState.inTransition) return false;
    // Spoken order follows the chosen entry direction, just like typing
    const order = gameDir === 'rtl' ? [3, 2, 1, 0] : [0, 1, 2, 3];
    order.forEach((idx, pos) => {
      document.getElementById(`game-d${idx}`).value = digits[pos] || '';
    });
    if (digits.length >= 4) {
      submitGameAnswer();
      return true;
    }
    return false;
  };

  function practiceVoiceDigits(digits) {
    if (!digits || pracState.submitted) return false;
    const order = pracState.dir === 'rtl' ? [3, 2, 1, 0] : [0, 1, 2, 3];
    order.forEach((idx, pos) => {
      document.getElementById(`prac-d${idx}`).value = digits[pos] || '';
    });
    if (digits.length >= 4) {
      submitPrac();
      return true;
    }
    return false;
  }

  voiceHooks.onCommand = cmd => {
    if (voiceTarget() === 'practice') {
      if (cmd === 'clear' && !pracState.submitted) {
        [0, 1, 2, 3].forEach(i => { document.getElementById(`prac-d${i}`).value = ''; });
        renderVoiceStatus();
      }
      return;
    }
    if (!isGameRunning()) return;
    if (cmd === 'pause') pauseGame();
    else if (cmd === 'resume' && gameViewActive()) resumeGame();
    else if (cmd === 'clear' && !gState.paused && !gState.submitting) {
      [0, 1, 2, 3].forEach(i => { document.getElementById(`game-d${i}`).value = ''; });
      renderVoiceStatus();
      focusFirstGameInput();
    }
  };

  // ── End screens ────────────────────────────────────────────

  function endGameOver() {
    if (!gState || gState.ended) return;
    gState.ended = true;
    gState.paused = false;
    cancelAnimationFrame(gState.animId);
    playGameOverSound();
    document.getElementById('game-over-score').textContent = gState.score;
    document.getElementById('game-over-reason').textContent =
      gState.endReason === 'lives'
        ? 'Out of lives — three misread meters.'
        : 'The aliens reached the ground!';
    renderSummary('game-over-summary');
    prepareSave('over');
    syncVoice();
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('game-pause-screen').classList.add('hidden');
    document.getElementById('game-over-screen').classList.remove('hidden');
  }

  function endVictory() {
    if (!gState || gState.ended) return;
    gState.ended = true;
    gState.paused = false;
    cancelAnimationFrame(gState.animId);
    playVictorySound();
    document.getElementById('game-victory-score').textContent = gState.score;
    renderSummary('game-victory-summary');
    prepareSave('victory');
    syncVoice();
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('game-pause-screen').classList.add('hidden');
    document.getElementById('game-victory-screen').classList.remove('hidden');
  }

  function gameAccuracy(stats) {
    return stats.attempts ? Math.round(100 * stats.correct / stats.attempts) : 0;
  }

  function renderSummary(elId) {
    const s = gState.stats;
    const avg = s.correct ? (s.correctTime / s.correct).toFixed(1) + 's' : '—';
    const maxMiss = Math.max(...s.dialMisses);
    let missText = 'None — clean reads!';
    if (maxMiss > 0) {
      const worst = s.dialMisses
        .map((n, i) => (n === maxMiss ? DIAL_LABELS[i] : null))
        .filter(Boolean);
      missText = `${worst.join(', ')} dial${worst.length > 1 ? 's' : ''} (${maxMiss}×)`;
    }
    const rows = [
      ['Accuracy', `${gameAccuracy(s)}% (${s.correct}/${s.attempts})`],
      ['Avg time per meter', avg],
      ['Best streak', String(gState.bestStreak)],
      ['Most missed', missText],
    ];
    const el = document.getElementById(elId);
    el.innerHTML = '';
    rows.forEach(([label, value]) => {
      const row = document.createElement('div');
      row.className = 'summary-row';
      const l = document.createElement('span');
      l.className = 'summary-label';
      l.textContent = label;
      const v = document.createElement('span');
      v.className = 'summary-value';
      v.textContent = value;
      row.appendChild(l);
      row.appendChild(v);
      el.appendChild(row);
    });
  }

  function prepareSave(prefix) {
    const input = document.getElementById(`${prefix}-name-input`);
    input.value = loadLastName();
    const btn = document.getElementById(`btn-save-${prefix}`);
    btn.disabled = false;
    btn.textContent = '💾 Save Score';
    document.getElementById(`${prefix}-save-status`).textContent = '';
  }

  function saveResult(prefix) {
    if (!gState) return;
    const btn = document.getElementById(`btn-save-${prefix}`);
    if (btn.disabled) return;
    const name = document.getElementById(`${prefix}-name-input`).value.trim() || 'Anonymous';
    saveLastName(name);
    const rank = addGameScore({
      name,
      score: gState.score,
      result: prefix === 'victory' ? 'Victory' : `Level ${gState.level}`,
      accuracy: gameAccuracy(gState.stats),
    });
    btn.disabled = true;
    btn.textContent = '✓ Saved!';
    document.getElementById(`${prefix}-save-status`).textContent = rank
      ? `You're #${rank} on the leaderboard!`
      : 'Saved — not in the top 10 this time.';
  }

  function renderLeaderboard() {
    const list = document.getElementById('game-leaderboard');
    const scores = loadScores(LS_GAME_SCORES);
    list.innerHTML = '';
    if (scores.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'lb-empty';
      empty.textContent = 'No scores yet — be the first!';
      list.appendChild(empty);
      return;
    }
    scores.forEach((s, i) => {
      const li = document.createElement('li');
      li.className = 'lb-row';
      const cells = [
        ['lb-rank', `${i + 1}.`],
        ['lb-name', s.name],
        ['lb-result', s.result || ''],
        ['lb-score', String(s.score)],
      ];
      cells.forEach(([cls, text]) => {
        const span = document.createElement('span');
        span.className = cls;
        span.textContent = text;
        li.appendChild(span);
      });
      list.appendChild(li);
    });
  }

  // ══════════════════════════════════════════════════════════
  //  Scores (localStorage)
  // ══════════════════════════════════════════════════════════

  function loadScores(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch (_) { return []; }
  }
  function saveScores(key, scores) {
    try { localStorage.setItem(key, JSON.stringify(scores)); } catch (_) { }
  }
  function loadLastName() {
    try { return localStorage.getItem(LS_LAST_NAME) || ''; } catch (_) { return ''; }
  }
  function saveLastName(name) {
    try { localStorage.setItem(LS_LAST_NAME, name); } catch (_) { }
  }
  // Returns the entry's rank (1–10), or null if it didn't make the top 10
  function addGameScore(entry) {
    const scores = loadScores(LS_GAME_SCORES);
    const record = { ...entry, date: new Date().toLocaleDateString() };
    scores.push(record);
    scores.sort((a, b) => b.score - a.score);
    const rank = scores.indexOf(record) + 1;
    scores.splice(10);
    saveScores(LS_GAME_SCORES, scores);
    return rank <= 10 ? rank : null;
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
          voiceStartForPractice();
          initPractice();
          return;
        }
        if (view === 'view-game') {
          enterGameView();
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
      voiceStartForPractice();
      initPractice();
    });
    document.getElementById('btn-home-game').addEventListener('click', enterGameView);

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
    pracState.ctrl = makeDigitCtrl('prac', submitPrac, () => pracState.dir, voiceOnPhone);
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
        if (!gState || gState.ended || gState.paused) return;
        const ordered = gOrdered();
        const pos = ordered.indexOf(inp);
        if (e.key === 'Backspace' && inp.value === '' && pos > 0) {
          ordered[pos - 1].focus();
        }
        if (e.key === 'Enter') submitGameAnswer();
      });
      inp.addEventListener('focus', () => inp.select());
      inp.addEventListener('input', () => {
        if (!gState || gState.ended || gState.paused) return;
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
    document.getElementById('btn-game-pause').addEventListener('click', pauseGame);
    document.getElementById('btn-game-resume').addEventListener('click', () => {
      resumeGame();
      if (voice.enabled && isGameRunning()) voiceRestartNow();
    });
    document.getElementById('btn-game-quit').addEventListener('click', showGameStart);
    ['over', 'victory'].forEach(prefix => {
      document.getElementById(`btn-save-${prefix}`).addEventListener('click', () => saveResult(prefix));
      document.getElementById(`${prefix}-name-input`).addEventListener('keydown', e => {
        if (e.key === 'Enter') saveResult(prefix);
      });
    });

    // Esc toggles pause; switching tabs or windows pauses automatically
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !isGameRunning()) return;
      if (!document.getElementById('view-game').classList.contains('active')) return;
      if (gState.paused) {
        resumeGame();
        if (voice.enabled) voiceRestartNow();
      } else {
        pauseGame();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pauseGame();
      syncVoice();
    });

    // ── Screen size changes (window resize, phone rotation) ───
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (isGameRunning()) renderGameMeter();
        if (pracState.values && document.getElementById('view-practice').classList.contains('active')) {
          renderDials('practice-dials', pracState.values, document.getElementById('prac-pro').checked);
        }
      }, 150);
    });
    if (window.ResizeObserver) {
      new ResizeObserver(measureGameArea).observe(document.getElementById('game-area'));
    }

    // ── Voice input ───────────────────────────────────────────
    voice.enabled = voice.supported && voiceLoadEnabled();
    const voiceToggle = document.getElementById('game-voice-toggle');
    voiceToggle.disabled = !voice.supported;
    voiceToggle.addEventListener('change', () => setVoiceEnabledFromUser(voiceToggle.checked));
    const micBtn = document.getElementById('btn-game-mic');
    micBtn.classList.toggle('hidden', !voice.supported);
    micBtn.addEventListener('click', () => setVoiceEnabledFromUser(!voice.enabled));
    // Tapping the status line restarts the mic if it has stopped hearing
    ['game-voice-status', 'prac-voice-status'].forEach(id => {
      document.getElementById(id).addEventListener('click', () => {
        if (!voice.enabled || !voiceTarget()) return;
        voiceState = 'off';
        renderVoiceStatus();
        voice.wanted = true;
        voiceRestartNow();
        if (voiceTarget() === 'game') focusFirstGameInput();
      });
    });
    const pracVoiceToggle = document.getElementById('prac-voice-toggle');
    pracVoiceToggle.disabled = !voice.supported;
    pracVoiceToggle.addEventListener('change', () => setVoiceEnabledFromUser(pracVoiceToggle.checked));
    const pracMic = document.getElementById('btn-prac-mic');
    pracMic.classList.toggle('hidden', !voice.supported);
    pracMic.addEventListener('click', () => setVoiceEnabledFromUser(!voice.enabled));
    updateVoiceControls();
    window.addEventListener('blur', pauseGame);

    document.querySelectorAll('.game-logo-sprite').forEach(el => {
      el.innerHTML = alienSpriteHtml(1);
      el.style.color = ALIEN_SPRITES[1].color;
    });

    // ── Sounds ────────────────────────────────────────────────
    ['pointerdown', 'keydown', 'touchend'].forEach(type => {
      document.addEventListener(type, unlockAudio, { capture: true, passive: true });
    });
    prefetchSound(WRONG_SOUND_URL);
    prefetchSound(BONUS_VOICE_URL);

    // ── Version ───────────────────────────────────────────────
    const vEl = document.querySelector('.app-version');
    if (vEl) vEl.textContent = VERSION;

    // ── Initial view ──────────────────────────────────────────
    showView('view-home');
  }

  document.addEventListener('DOMContentLoaded', init);

})();
