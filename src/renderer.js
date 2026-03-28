'use strict';
const { ipcRenderer } = require('electron');

// ── State ──────────────────────────────────────────────────────────────────────
const state = {
  mode:      'slate',   // 'slate' | 'pattern'
  subMode:   'single',  // 'single' | 'batch'
  width:     1920,
  height:    1080,
  bgColor:   '#000000',
  textColor: '#ffffff',
  fontSizePct: 12,      // percentage of height

  slate: {
    title:    'CAMERA 1',
    subtitle: '',
  },

  batchItems: [],   // [{ name, bgColor }]

  pattern: {
    smpteBars:    false,
    boundaryLines: true,
    alignCircles:  true,
    gridOverlay:   true,
    gridLabels:    false,
    gridCols:      12,
    gridColor:     '#ffffff',
    textColor:     '#ffffff',
    textOverlay:   true,
    logoOverlay:   false,
    label:         '',
    logoPosition:  'tl',
    logoImage:     null,
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Canvas & Context ───────────────────────────────────────────────────────────
const canvas = document.getElementById('mainCanvas');
const ctx    = canvas.getContext('2d');

// ── Init ───────────────────────────────────────────────────────────────────────
function init() {
  setResolution(state.width, state.height);
  bindUI();
  render();
}

// ── Resolution ─────────────────────────────────────────────────────────────────
function setResolution(w, h) {
  state.width  = w;
  state.height = h;
  canvas.width  = w;
  canvas.height = h;
  document.getElementById('resLabel').textContent = `${w} × ${h}`;
  scalePreview();
  render();
}

function scalePreview() {
  const container = document.getElementById('canvasContainer');
  const pad = 48;
  const maxW = container.clientWidth  - pad;
  const maxH = container.clientHeight - pad;
  if (maxW <= 0 || maxH <= 0) return;
  const scale = Math.min(maxW / state.width, maxH / state.height, 1);
  canvas.style.width  = Math.round(state.width  * scale) + 'px';
  canvas.style.height = Math.round(state.height * scale) + 'px';
}

// ── Master Render ──────────────────────────────────────────────────────────────
function render() {
  ctx.clearRect(0, 0, state.width, state.height);
  if (state.mode === 'slate') {
    renderSlate(state.slate.title, state.slate.subtitle);
  } else {
    renderPattern();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SLATE RENDERER
// ══════════════════════════════════════════════════════════════════════════════
function renderSlate(title, subtitle) {
  const W = state.width, H = state.height;

  // Background
  ctx.fillStyle = state.bgColor;
  ctx.fillRect(0, 0, W, H);

  // Thin border inside edges
  const borderInset = Math.round(H * 0.015);
  ctx.strokeStyle = hexToRgba(state.textColor, 0.15);
  ctx.lineWidth = Math.max(1, Math.round(H * 0.002));
  ctx.strokeRect(borderInset, borderInset, W - borderInset * 2, H - borderInset * 2);

  // Corner tick marks
  drawCornerTicks(W, H, borderInset);

  // Main title
  const fontSize = Math.floor(H * (state.fontSizePct / 100));
  ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Arial', sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  // Shadow for readability on any bg
  ctx.shadowColor   = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur    = fontSize * 0.15;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.round(fontSize * 0.04);

  ctx.fillStyle = state.textColor;

  const centerY = subtitle ? H * 0.46 : H / 2;
  ctx.fillText(title, W / 2, centerY);

  // Subtitle
  if (subtitle && subtitle.trim()) {
    ctx.shadowBlur = fontSize * 0.1;
    const subSize = Math.floor(fontSize * 0.38);
    ctx.font = `400 ${subSize}px -apple-system, BlinkMacSystemFont, 'Arial', sans-serif`;
    ctx.fillStyle = hexToRgba(state.textColor, 0.6);
    ctx.fillText(subtitle, W / 2, centerY + fontSize * 0.72);
  }

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur  = 0;
}

function drawCornerTicks(W, H, inset) {
  const len = Math.round(Math.min(W, H) * 0.04);
  const lw  = Math.max(1, Math.round(H * 0.002));

  ctx.strokeStyle = hexToRgba(state.textColor, 0.3);
  ctx.lineWidth   = lw;
  ctx.lineCap     = 'square';

  const corners = [
    { x: inset,     y: inset,     dx: 1,  dy: 1  },
    { x: W - inset, y: inset,     dx: -1, dy: 1  },
    { x: inset,     y: H - inset, dx: 1,  dy: -1 },
    { x: W - inset, y: H - inset, dx: -1, dy: -1 },
  ];

  corners.forEach(({ x, y, dx, dy }) => {
    ctx.beginPath();
    ctx.moveTo(x + dx * len, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * len);
    ctx.stroke();
  });
  ctx.lineCap = 'butt';
}

// ══════════════════════════════════════════════════════════════════════════════
//  TEST PATTERN RENDERER  (projector-calibration style)
// ══════════════════════════════════════════════════════════════════════════════

/** Compute the standard grid dimensions for a given canvas size.
 *  Targets ~square cells. Rows fixed at 8; cols computed and forced even. */
function gridDims(W, H) {
  const rows = 10;
  let cols = Math.round(W / (H / rows));
  if (cols % 2 !== 0) cols += 1;
  return { cols, rows, cellW: W / cols, cellH: H / rows };
}

function renderPattern() {
  const W = state.width, H = state.height;
  const p = state.pattern;

  // Base background
  ctx.fillStyle = state.bgColor;
  ctx.fillRect(0, 0, W, H);

  // Layer order
  if (p.smpteBars)                  drawSMPTEBars(W, H);
  if (p.gridOverlay)                drawProjectorGrid(W, H);
  if (p.boundaryLines)              drawProjectorBorder(W, H);
  if (p.alignCircles)               drawInscribedCircle(W, H);
  if (p.logoOverlay && p.logoImage) drawLogo(W, H);
  if (p.textOverlay)                drawProjectorText(W, H);
}

// ── SMPTE 75% Color Bars (optional overlay) ───────────────────────────────────
function drawSMPTEBars(W, H) {
  const topH = Math.round(H * 0.67);
  const midH = Math.round(H * 0.08);
  const btmH = H - topH - midH;

  const bars75 = [
    { label: 'W',  color: '#BFBFBF' },
    { label: 'Y',  color: '#BFBF00' },
    { label: 'Cy', color: '#00BFBF' },
    { label: 'G',  color: '#00BF00' },
    { label: 'Mg', color: '#BF00BF' },
    { label: 'R',  color: '#BF0000' },
    { label: 'B',  color: '#0000BF' },
  ];
  const barW = W / bars75.length;
  bars75.forEach((bar, i) => {
    ctx.fillStyle = bar.color;
    ctx.fillRect(Math.round(i * barW), 0, Math.round(barW), topH);
  });

  const revBars = ['#0000BF','#000000','#BF00BF','#000000','#00BFBF','#000000','#BFBFBF'];
  revBars.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(i * barW), topH, Math.round(barW), midH);
  });

  const plW = Math.round(W / 3);
  const plugeSlots = [
    { c: '#0a0a0a', w: Math.round(plW * 0.4) },
    { c: '#BFBFBF', w: Math.round(plW * 0.2) },
    { c: '#0a0a0a', w: plW - Math.round(plW * 0.4) - Math.round(plW * 0.2) },
  ];
  let px = 0;
  plugeSlots.forEach(s => {
    ctx.fillStyle = s.c;
    ctx.fillRect(px, topH + midH, s.w, btmH);
    px += s.w;
  });
  [0, 0.02, 0.04].forEach((v, i) => {
    ctx.fillStyle = `rgb(${Math.round(v*255)},${Math.round(v*255)},${Math.round(v*255)})`;
    ctx.fillRect(plW + i * Math.round(plW / 3), topH + midH, Math.round(plW / 3), btmH);
  });
  ctx.fillStyle = '#000000';
  ctx.fillRect(plW * 2, topH + midH, W - plW * 2, btmH);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(plW * 2 + Math.round((W - plW*2) * 0.3), topH + midH, Math.round((W - plW*2) * 0.4), btmH);

  const lblSz = Math.max(10, Math.round(H * 0.016));
  ctx.font = `600 ${lblSz}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  bars75.forEach((bar, i) => {
    ctx.fillStyle = luminance(bar.color) > 0.3 ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)';
    ctx.fillText(bar.label, Math.round(i * barW + barW / 2), 8);
  });
}

// ── Projector numbered/lettered grid ─────────────────────────────────────────
function drawProjectorGrid(W, H) {
  const { cols, rows, cellW, cellH } = gridDims(W, H);
  const halfCols = cols / 2;
  const halfRows = rows / 2;

  // ── Internal grid lines ───────────────────────────────────────────────────
  const thinLW = Math.max(1, Math.round(H * 0.002));
  ctx.lineWidth   = thinLW;
  ctx.strokeStyle = hexToRgba(state.pattern.gridColor, 0.45);
  ctx.setLineDash([]);

  for (let c = 1; c < cols; c++) {
    const x = Math.round(c * cellW);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let r = 1; r < rows; r++) {
    const y = Math.round(r * cellH);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  if (!state.pattern.gridLabels) return;

  // ── Column labels (top & bottom edges) ───────────────────────────────────
  const colLabelSz = Math.round(Math.min(cellH, cellW) * 0.45);
  ctx.font      = `700 ${colLabelSz}px Arial, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  const vPad    = cellH * 0.12;

  for (let c = 0; c < cols; c++) {
    const cx  = (c + 0.5) * cellW;
    const num = c < halfCols ? (c - halfCols) : (c - halfCols + 1);
    const lbl = String(num);

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(lbl, cx, vPad);

    ctx.textBaseline = 'bottom';
    ctx.fillText(lbl, cx, H - vPad);
  }

  // ── Row labels (left & right edges) ──────────────────────────────────────
  const upperLetters = 'ABCDE'.slice(0, halfRows).split('').reverse(); // E,D,C,B,A
  const lowerLetters = 'abcde'.slice(0, halfRows).split('');           // a,b,c,d,e

  const rowLabelSz = Math.round(Math.min(cellH, cellW) * 0.45);
  ctx.font      = `700 ${rowLabelSz}px Arial, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  const hPad    = cellW * 0.15;

  for (let r = 0; r < rows; r++) {
    if (r === 0 || r === rows - 1) continue; // skip corners to avoid overlap
    const cy  = (r + 0.5) * cellH;
    const lbl = r < halfRows ? upperLetters[r] : lowerLetters[r - halfRows];

    ctx.textAlign = 'left';  ctx.textBaseline = 'middle';
    ctx.fillText(lbl, hPad, cy);

    ctx.textAlign = 'right';
    ctx.fillText(lbl, W - hPad, cy);
  }
}

// ── Green border ──────────────────────────────────────────────────────────────
function drawProjectorBorder(W, H) {
  const borderLW = Math.max(3, Math.round(H * 0.003));
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth   = borderLW;
  ctx.setLineDash([]);
  const half = borderLW / 2;
  ctx.strokeRect(half, half, W - borderLW, H - borderLW);
}

// ── Inscribed circle + corner diagonals + center crosshair ────────────────────
function drawInscribedCircle(W, H) {
  const cx = W / 2, cy = H / 2;
  const lw = Math.max(1, Math.round(H * 0.0015));

  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth   = lw;
  ctx.setLineDash([]);

  // Corner-to-corner diagonals
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W, 0); ctx.lineTo(0, H); ctx.stroke();

  // Center crosshair
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();

  // Inscribed circle
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(cx, cy, H / 2, 0, Math.PI * 2);
  ctx.stroke();
}

// ── Center info text block ────────────────────────────────────────────────────
function drawProjectorText(W, H) {
  const { cols, rows } = gridDims(W, H);

  // Aspect ratio as decimal (rounded to 2dp)
  const arDecimal = (W / H).toFixed(2);

  // Lines to display
  const label = state.pattern.label.trim() || 'Test Pattern';
  const lines = [
    { text: label,                                 scale: 1.0, bold: true },
    { text: `${W}px × ${H}px`,                    scale: 0.45 },
    { text: `${arDecimal}:1`,                      scale: 0.45 },
    { text: `${cols} × ${rows} full squares`,      scale: 0.45 },
  ];

  const baseFontSz = Math.round(H * 0.055);
  const lineGap    = baseFontSz * 0.25;
  const totalH     = lines.reduce((sum, l) => sum + baseFontSz * l.scale, 0)
                   + lineGap * (lines.length - 1);
  let y = H / 2 - totalH / 2 - H * 0.15;

  ctx.shadowColor   = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur    = baseFontSz * 0.3;
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.textAlign    = 'center';

  lines.forEach(line => {
    const sz = Math.round(baseFontSz * line.scale);
    ctx.font         = `${line.bold ? '700' : '400'} ${sz}px Arial, sans-serif`;
    ctx.fillStyle    = line.bold ? hexToRgba(state.pattern.textColor, 1) : hexToRgba(state.pattern.textColor, 0.82);
    ctx.textBaseline = 'top';
    ctx.fillText(line.text, W / 2, Math.round(y));
    y += sz + lineGap;
  });

  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
}

// ── Logo ──────────────────────────────────────────────────────────────────────
function drawLogo(W, H) {
  const img = state.pattern.logoImage;
  if (!img) return;

  const maxW = W * 0.16;
  const maxH = H * 0.1;
  const scale = Math.min(maxW / img.width, maxH / img.height);
  const lw = Math.round(img.width  * scale);
  const lh = Math.round(img.height * scale);
  const pad = Math.round(H * 0.025);

  const positions = {
    tl: { x: pad,          y: pad          },
    tr: { x: W - pad - lw, y: pad          },
    bl: { x: pad,          y: H - pad - lh },
    br: { x: W - pad - lw, y: H - pad - lh },
    c:  { x: (W - lw) / 2, y: (H - lh) / 2 },
  };

  const { x, y } = positions[state.pattern.logoPosition] || positions.tl;

  ctx.globalAlpha = 0.85;
  ctx.drawImage(img, x, y, lw, lh);
  ctx.globalAlpha = 1;
}

// ══════════════════════════════════════════════════════════════════════════════
//  UI BINDING
// ══════════════════════════════════════════════════════════════════════════════
function bindUI() {

  // ── Mode tabs ──────────────────────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;

      document.getElementById('slateSettings').style.display  = state.mode === 'slate'   ? '' : 'none';
      document.getElementById('patternSettings').style.display = state.mode === 'pattern' ? '' : 'none';

      const badge = document.getElementById('modeLabel');
      badge.textContent = state.mode === 'slate' ? 'SLATE' : 'TEST PATTERN';
      badge.className   = 'mode-badge ' + (state.mode === 'slate' ? 'slate-badge' : 'pattern-badge');

      // Show export btn always, hide batch btn when on pattern
      document.getElementById('exportBtn').style.display = '';
      render();
    });
  });

  // ── Sub-tabs (Single / Batch) ──────────────────────────────────────────────
  document.querySelectorAll('.subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.subMode = btn.dataset.subtab;
      document.getElementById('singleSlate').style.display = state.subMode === 'single' ? '' : 'none';
      document.getElementById('batchSlate').style.display  = state.subMode === 'batch'  ? '' : 'none';
      document.getElementById('exportBtn').style.display   = state.subMode === 'single' ? '' : 'none';
    });
  });

  // ── Background color ───────────────────────────────────────────────────────
  bindColorPair('bgColor', 'bgColorHex', v => { state.bgColor = v; render(); });

  // ── Text color ─────────────────────────────────────────────────────────────
  bindColorPair('textColor', 'textColorHex', v => { state.textColor = v; render(); });

  // ── Grid color ─────────────────────────────────────────────────────────────
  bindColorPair('gridColor', 'gridColorHex', v => { state.pattern.gridColor = v; render(); });

  // ── Pattern text color ─────────────────────────────────────────────────────
  bindColorPair('patternTextColor', 'patternTextColorHex', v => { state.pattern.textColor = v; render(); });

  // ── Font size slider ───────────────────────────────────────────────────────
  document.getElementById('fontSizeSlider').addEventListener('input', e => {
    state.fontSizePct = Number(e.target.value);
    document.getElementById('fontSizeVal').textContent = `${state.fontSizePct}%`;
    render();
  });

  // ── Resolution ─────────────────────────────────────────────────────────────
  document.getElementById('resolution').addEventListener('change', e => {
    const val = e.target.value;
    document.getElementById('customResField').style.display = val === 'custom' ? '' : 'none';
    if (val !== 'custom') {
      const [w, h] = val.split('x').map(Number);
      setResolution(w, h);
    }
  });

  document.getElementById('applyResBtn').addEventListener('click', () => {
    const w = parseInt(document.getElementById('customW').value, 10);
    const h = parseInt(document.getElementById('customH').value, 10);
    if (w > 0 && h > 0) setResolution(w, h);
  });

  // Allow Enter in custom res inputs
  ['customW', 'customH'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('applyResBtn').click();
    });
  });

  // ── Slate title ────────────────────────────────────────────────────────────
  document.getElementById('slateTitle').addEventListener('input', e => {
    state.slate.title = e.target.value;
    render();
  });

  document.getElementById('slateSubtitle').addEventListener('input', e => {
    state.slate.subtitle = e.target.value;
    render();
  });

  // ── Pattern checkboxes ─────────────────────────────────────────────────────
  const checkboxMap = {
    smpteBars:     'smpteBars',
    boundaryLines: 'boundaryLines',
    alignCircles:  'alignCircles',
    gridOverlay:   'gridOverlay',
    gridLabels:    'gridLabels',
    textOverlay:   'textOverlay',
    logoOverlay:   'logoOverlay',
  };

  Object.entries(checkboxMap).forEach(([id, key]) => {
    document.getElementById(id).addEventListener('change', e => {
      state.pattern[key] = e.target.checked;

      if (id === 'textOverlay') {
        document.getElementById('textOverlayFields').style.display = e.target.checked ? '' : 'none';
      }
      if (id === 'logoOverlay') {
        document.getElementById('logoField').style.display = e.target.checked ? '' : 'none';
      }
      render();
    });
  });

  // Pattern label
  document.getElementById('patternLabel').addEventListener('input', e => {
    state.pattern.label = e.target.value;
    render();
  });

  // Logo position
  document.getElementById('logoPosition').addEventListener('change', e => {
    state.pattern.logoPosition = e.target.value;
    render();
  });

  // Logo file
  document.getElementById('loadLogoBtn').addEventListener('click', () => {
    document.getElementById('logoFileInput').click();
  });

  document.getElementById('logoFileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        state.pattern.logoImage = img;
        document.getElementById('logoPreview').innerHTML =
          `<img src="${ev.target.result}" alt="Logo">`;
        render();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  // ── Export single ──────────────────────────────────────────────────────────
  document.getElementById('exportBtn').addEventListener('click', async () => {
    render();
    const filename = state.mode === 'slate'
      ? `${sanitize(state.slate.title) || 'slate'}.png`
      : `test_pattern_${state.width}x${state.height}.png`;

    const result = await ipcRenderer.invoke('save-image', {
      dataUrl: canvas.toDataURL('image/png'),
      filename,
    });

    if (result.success) {
      toast(`Saved → ${result.path}`, 'success');
    } else if (result.error) {
      toast(`Error: ${result.error}`, 'error');
    }
  });

  // ── Batch: add-row color picker ────────────────────────────────────────────
  bindColorPair('batchBgColor', 'batchBgColorHex', () => {});

  // ── Batch: add row(s) button ───────────────────────────────────────────────
  document.getElementById('addRowsBtn').addEventListener('click', () => {
    const baseName = document.getElementById('batchName').value.trim() || 'Slate';
    const color    = document.getElementById('batchBgColor').value;
    const amount   = Math.max(1, Math.min(500, parseInt(document.getElementById('batchAmount').value, 10) || 1));

    // Find highest existing number for this base name (case-insensitive)
    const baseLC  = baseName.toLowerCase();
    let nextIndex = 1;
    state.batchItems.forEach(item => {
      const m = item.name.toLowerCase().match(new RegExp('^' + escapeRx(baseLC) + '\\s+(\\d+)$'));
      if (m) nextIndex = Math.max(nextIndex, parseInt(m[1], 10) + 1);
    });

    for (let i = 0; i < amount; i++) {
      state.batchItems.push({ name: `${baseName} ${nextIndex + i}`, bgColor: color });
    }

    refreshBatchList();
  });

  // ── Batch: clear all ───────────────────────────────────────────────────────
  document.getElementById('clearBatchBtn').addEventListener('click', () => {
    state.batchItems = [];
    refreshBatchList();
    document.getElementById('batchStatus').textContent = '';
  });

  // ── Batch: export all ──────────────────────────────────────────────────────
  document.getElementById('batchGenBtn').addEventListener('click', async () => {
    if (!state.batchItems.length) {
      toast('No slates in list — add some rows first', 'error');
      return;
    }

    const prefix   = document.getElementById('batchPrefix').value.trim();
    const statusEl = document.getElementById('batchStatus');
    statusEl.textContent = `Generating ${state.batchItems.length} slates…`;

    // Snapshot current global bg so we can restore it
    const savedBg = state.bgColor;

    const images = state.batchItems.map(item => {
      state.bgColor = item.bgColor;
      renderSlate(item.name, state.slate.subtitle);
      return {
        filename: `${prefix}${sanitize(item.name) || 'slate'}.png`,
        dataUrl:  canvas.toDataURL('image/png'),
      };
    });

    state.bgColor = savedBg;
    render(); // restore preview

    const result = await ipcRenderer.invoke('save-batch', { images });

    if (result.success) {
      statusEl.textContent = `✓ ${result.count} files saved to ${result.dir}`;
      toast(`Saved ${result.count} slates`, 'success');
    } else if (result.error) {
      statusEl.textContent = `Error: ${result.error}`;
      toast(`Error: ${result.error}`, 'error');
    } else {
      statusEl.textContent = '';
    }
  });

  // ── Resize observer ────────────────────────────────────────────────────────
  const ro = new ResizeObserver(() => scalePreview());
  ro.observe(document.getElementById('canvasContainer'));
}

// ══════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/** Bind a color picker + hex text input pair */
function bindColorPair(pickerId, hexId, onChange) {
  const picker = document.getElementById(pickerId);
  const hexIn  = document.getElementById(hexId);

  picker.addEventListener('input', e => {
    hexIn.value = e.target.value;
    onChange(e.target.value);
  });

  hexIn.addEventListener('input', e => {
    const v = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      picker.value = v;
      onChange(v);
    }
  });
}

/** Convert hex color to rgba() string */
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Relative luminance of a hex color */
function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Greatest common divisor (for aspect ratio) */
function gcdCalc(a, b) {
  return b === 0 ? a : gcdCalc(b, a % b);
}

/** Escape a string for use in a RegExp */
function escapeRx(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Re-render the batch item list DOM and show/hide controls */
function refreshBatchList() {
  const items   = state.batchItems;
  const listEl  = document.getElementById('batchList');
  const wrapEl  = document.getElementById('batchListWrap');
  const exportEl = document.getElementById('batchExportWrap');
  const countEl  = document.getElementById('batchListCount');

  listEl.innerHTML = '';

  if (!items.length) {
    wrapEl.style.display   = 'none';
    exportEl.style.display = 'none';
    return;
  }

  wrapEl.style.display   = '';
  exportEl.style.display = '';
  countEl.textContent    = `${items.length} slate${items.length !== 1 ? 's' : ''}`;

  items.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'batch-list-item';

    const swatch = document.createElement('span');
    swatch.className = 'batch-swatch';
    swatch.style.background = item.bgColor;

    const label = document.createElement('span');
    label.className   = 'batch-item-name';
    label.textContent = item.name;

    const del = document.createElement('button');
    del.className   = 'batch-item-del';
    del.textContent = '×';
    del.title       = 'Remove';
    del.addEventListener('click', () => {
      state.batchItems.splice(idx, 1);
      refreshBatchList();
    });

    row.appendChild(swatch);
    row.appendChild(label);
    row.appendChild(del);
    listEl.appendChild(row);
  });

  // Scroll to bottom so newly added rows are visible
  listEl.scrollTop = listEl.scrollHeight;
}

/** Make a string safe for use in a filename */
function sanitize(str) {
  return str.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').substring(0, 60);
}

/** Show a toast notification */
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = 'toast' + (type ? ' ' + type : '') + ' show';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.classList.remove('show');
  }, 3500);
}

// ── Start ──────────────────────────────────────────────────────────────────────
init();
