/**
 * Pixel Art Studio – app.js
 * Panel-System + Pixel-Editor-Logik
 */

// ── Palette ────────────────────────────────────────────────────────────────
const PALETTE = [
  '#0b0b0b','#2C2C2A','#444441','#888780','#B4B2A9','#D3D1C7','#F1EFE8','#ffffff',
  '#501313','#A32D2D','#E24B4A','#D85A30','#EF9F27','#FAC775','#FFD700','#FAEEDA',
  '#173404','#3B6D11','#639922','#97C459','#C0DD97','#E1F5EE','#9FE1CB','#5DCAA5',
  '#04342C','#0F6E56','#1D9E75','#185FA5','#378ADD','#85B7EB','#B5D4F4','#E6F1FB',
  '#26215C','#534AB7','#7F77DD','#AFA9EC','#993556','#D4537E','#ED93B1','#F4C0D1',
];

// ── Default Panel Layout ───────────────────────────────────────────────────
const DEFAULT_LAYOUT = {
  left:   ['tools', 'palette'],
  center: ['canvas'],
  right:  ['frames', 'animation'],
  bottom: [],
  dock:   ['projects'],
};

// ── Editor State ──────────────────────────────────────────────────────────
let project      = null;
let currentFrame = 0;
let tool         = 'draw';
let color        = '#5DCAA5';
let painting     = false;
let cellSize     = 0;
let previewInterval = null;
let previewFrame    = 0;
let autoSaveTimer   = null;
let draggedModuleId = null;

// ── DOM refs ───────────────────────────────────────────────────────────────
const canvas       = document.getElementById('main-canvas');
const ctx          = canvas.getContext('2d');
const colorSwatch  = document.getElementById('color-swatch');
const customColor  = document.getElementById('custom-color');
const colorHex     = document.getElementById('color-hex');
const framesList   = document.getElementById('frames-list');
const projectNameEl = document.getElementById('project-name');
const gridSizeEl   = document.getElementById('grid-size');
const fpsInput     = document.getElementById('fps-input');
const previewCanvas = document.getElementById('preview-canvas');
const pCtx         = previewCanvas.getContext('2d');

// ════════════════════════════════════════════════════════════════════════════
//  PANEL SYSTEM
// ════════════════════════════════════════════════════════════════════════════

function loadLayout() {
  try {
    const saved = localStorage.getItem('px-layout');
    return saved ? JSON.parse(saved) : structuredClone(DEFAULT_LAYOUT);
  } catch { return structuredClone(DEFAULT_LAYOUT); }
}

function saveLayout() {
  const layout = { left: [], center: [], right: [], bottom: [], dock: [] };
  ['left','center','right','bottom'].forEach(zoneId => {
    document.getElementById(`zone-${zoneId}`)
      .querySelectorAll('.module')
      .forEach(m => layout[zoneId].push(m.dataset.moduleId));
  });
  document.querySelectorAll('.dock-chip.in-use')
    .forEach(c => {}); // dock = what's NOT in any zone
  layout.dock = PALETTE.length ? [] : []; // placeholder; computed below
  // dock = modules NOT placed anywhere
  const placed = [...layout.left,...layout.center,...layout.right,...layout.bottom];
  Object.keys(DEFAULT_LAYOUT).filter(k => k !== 'dock').forEach(k => {});
  ['canvas','tools','palette','frames','animation','projects'].forEach(id => {
    if (!placed.includes(id)) layout.dock.push(id);
  });
  localStorage.setItem('px-layout', JSON.stringify(layout));
}

function applyLayout(layout) {
  const pool = document.getElementById('module-pool');
  // Move every module back to pool first
  document.querySelectorAll('.module').forEach(m => pool.appendChild(m));
  // Place modules into zones
  ['left','center','right','bottom'].forEach(zoneId => {
    const zone = document.getElementById(`zone-${zoneId}`);
    (layout[zoneId] || []).forEach(modId => {
      const mod = document.getElementById(`mod-${modId}`);
      if (mod) zone.appendChild(mod);
    });
  });
  // Update dock chips
  updateDockChips();
  // Trigger canvas resize
  setTimeout(() => { if (project) renderCanvas(); }, 50);
}

function updateDockChips() {
  document.querySelectorAll('.dock-chip').forEach(chip => {
    const id  = chip.dataset.moduleId;
    const mod = document.getElementById(`mod-${id}`);
    const inZone = mod && mod.closest('.zone');
    chip.classList.toggle('in-use', !!inZone);
  });
}

// ── Drag & Drop ────────────────────────────────────────────────────────────

function initDragDrop() {
  // Dock chips → zones
  document.querySelectorAll('.dock-chip').forEach(chip => {
    chip.addEventListener('dragstart', e => {
      draggedModuleId = chip.dataset.moduleId;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedModuleId);
      chip.classList.add('dragging-active');
    });
    chip.addEventListener('dragend', () => {
      chip.classList.remove('dragging-active');
      draggedModuleId = null;
    });
  });

  // Module headers → move between zones
  document.querySelectorAll('.module').forEach(mod => {
    mod.addEventListener('mousedown', e => {
      mod.draggable = !!e.target.closest('.drag-handle');
    });
    mod.addEventListener('dragstart', e => {
      if (!mod.draggable) { e.preventDefault(); return; }
      draggedModuleId = mod.dataset.moduleId;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedModuleId);
      setTimeout(() => mod.classList.add('ghost'), 0);
    });
    mod.addEventListener('dragend', () => {
      mod.classList.remove('ghost');
      mod.draggable = false;
      draggedModuleId = null;
    });
  });

  // Zone drop targets
  document.querySelectorAll('.zone').forEach(zone => {
    zone.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', e => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const id  = e.dataTransfer.getData('text/plain') || draggedModuleId;
      if (!id) return;
      const mod = document.getElementById(`mod-${id}`);
      if (!mod) return;

      // Insert before nearest sibling or append at end
      const sibling = getNearestSibling(zone, e.clientY);
      if (sibling) zone.insertBefore(mod, sibling);
      else          zone.appendChild(mod);

      mod.classList.remove('ghost');
      mod.draggable = false;
      updateDockChips();
      saveLayout();
      if (id === 'canvas') setTimeout(() => { if (project) renderCanvas(); }, 60);
    });
  });

  // X-button: remove module → back to pool
  document.querySelectorAll('.module-close').forEach(btn => {
    btn.addEventListener('click', e => {
      const mod = btn.closest('.module');
      document.getElementById('module-pool').appendChild(mod);
      updateDockChips();
      saveLayout();
    });
  });
}

function getNearestSibling(zone, mouseY) {
  const modules = [...zone.querySelectorAll('.module')];
  for (const m of modules) {
    const rect = m.getBoundingClientRect();
    if (mouseY < rect.top + rect.height / 2) return m;
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
//  THEME SYSTEM
// ════════════════════════════════════════════════════════════════════════════

function initThemes() {
  const savedTheme  = localStorage.getItem('px-theme')  || 'dark';
  const savedAccent = localStorage.getItem('px-accent') || '#5DCAA5';
  setTheme(savedTheme);
  setAccent(savedAccent);

  document.querySelectorAll('.theme-dot').forEach(btn => {
    btn.addEventListener('click', () => setTheme(btn.dataset.theme));
  });
  document.getElementById('accent-color').addEventListener('input', e => setAccent(e.target.value));
}

function setTheme(theme) {
  document.body.dataset.theme = theme;
  document.querySelectorAll('.theme-dot').forEach(b =>
    b.classList.toggle('active', b.dataset.theme === theme)
  );
  document.getElementById('accent-color').value = localStorage.getItem('px-accent') || '#5DCAA5';
  localStorage.setItem('px-theme', theme);
}

function setAccent(hex) {
  document.documentElement.style.setProperty('--accent', hex);
  // Darken for hover
  document.documentElement.style.setProperty('--accent-h', shadeColor(hex, -15));
  document.documentElement.style.setProperty('--accent-dim', hex + '26');
  document.getElementById('accent-color').value = hex;
  localStorage.setItem('px-accent', hex);
}

function shadeColor(hex, pct) {
  const n = parseInt(hex.replace('#',''),16);
  const f = pct/100, r = Math.min(255,Math.max(0,((n>>16)&255)+(255*f)|0));
  const g = Math.min(255,Math.max(0,((n>>8)&255)+(255*f)|0));
  const b = Math.min(255,Math.max(0,(n&255)+(255*f)|0));
  return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
}

// ════════════════════════════════════════════════════════════════════════════
//  PALETTE
// ════════════════════════════════════════════════════════════════════════════

function buildPalette() {
  const container = document.getElementById('palette');
  container.innerHTML = '';
  PALETTE.forEach(hex => {
    const s = document.createElement('div');
    s.className = 'swatch';
    s.style.background = hex;
    s.title = hex;
    s.addEventListener('click', () => setColor(hex));
    container.appendChild(s);
  });
}

function setColor(hex) {
  color = hex;
  colorSwatch.style.background = hex;
  customColor.value = hex;
  if (colorHex) colorHex.textContent = hex.toUpperCase();
  document.querySelectorAll('.swatch').forEach(s =>
    s.classList.toggle('active', s.title === hex)
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  CANVAS / EDITOR
// ════════════════════════════════════════════════════════════════════════════

function calcCellSize() {
  const body = document.querySelector('.mod-canvas-body');
  if (!body) return;
  const maxW = (body.clientWidth  || 500) - 16;
  const maxH = (body.clientHeight || 500) - 16;
  const max  = Math.min(maxW, maxH, 800);
  cellSize = Math.max(4, Math.floor(max / project.cols));
}

function renderCanvas() {
  calcCellSize();
  const sz = cellSize * project.cols;
  canvas.width  = sz;
  canvas.height = sz;
  canvas.style.width  = sz + 'px';
  canvas.style.height = sz + 'px';
  drawCanvas();
}

function drawCanvas() {
  const pixels = project.frames[currentFrame];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let r = 0; r < project.cols; r++) {
    for (let c = 0; c < project.cols; c++) {
      if (pixels[r][c]) { ctx.fillStyle = pixels[r][c]; ctx.fillRect(c*cellSize, r*cellSize, cellSize, cellSize); }
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth   = 0.5;
      ctx.strokeRect(c*cellSize+.25, r*cellSize+.25, cellSize-.5, cellSize-.5);
    }
  }
}

function getCell(e) {
  const rect   = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  return [
    Math.floor(((e.clientY - rect.top)  * scaleY) / cellSize),
    Math.floor(((e.clientX - rect.left) * scaleX) / cellSize),
  ];
}

function paintCell(e) {
  const [r,c] = getCell(e);
  if (r < 0 || r >= project.cols || c < 0 || c >= project.cols) return;
  const pixels = project.frames[currentFrame];
  if      (tool === 'erase') pixels[r][c] = null;
  else if (tool === 'draw')  pixels[r][c] = color;
  else if (tool === 'fill')  floodFill(pixels, r, c, pixels[r][c], color);
  else if (tool === 'pick')  { if (pixels[r][c]) setColor(pixels[r][c]); return; }
  drawCanvas();
  updateThumb(currentFrame);
  scheduleAutoSave();
}

function floodFill(pixels, r, c, target, fill) {
  if (fill === target) return;
  const stack = [[r,c]];
  while (stack.length) {
    const [rr,cc] = stack.pop();
    if (rr<0||rr>=project.cols||cc<0||cc>=project.cols) continue;
    if (pixels[rr][cc] !== target) continue;
    pixels[rr][cc] = fill;
    stack.push([rr+1,cc],[rr-1,cc],[rr,cc+1],[rr,cc-1]);
  }
}

canvas.addEventListener('mousedown',  e => { painting = true; paintCell(e); });
canvas.addEventListener('mousemove',  e => { if (painting && tool!=='fill' && tool!=='pick') paintCell(e); });
canvas.addEventListener('mouseup',    () => painting = false);
canvas.addEventListener('mouseleave', () => painting = false);
canvas.addEventListener('touchstart', e => { e.preventDefault(); painting=true; paintCell(e.touches[0]); }, {passive:false});
canvas.addEventListener('touchmove',  e => { e.preventDefault(); if(painting&&tool!=='fill'&&tool!=='pick') paintCell(e.touches[0]); }, {passive:false});
canvas.addEventListener('touchend',   () => painting = false);

// ResizeObserver: canvas neu rendern wenn Panel-Größe sich ändert
const canvasResizeObs = new ResizeObserver(() => { if (project) renderCanvas(); });
canvasResizeObs.observe(document.querySelector('.mod-canvas-body') || document.body);

// ── Tools ──────────────────────────────────────────────────────────────────
['draw','fill','erase','pick'].forEach(t => {
  const btn = document.getElementById(`tool-${t}`);
  if (!btn) return;
  btn.addEventListener('click', () => {
    tool = t;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

customColor.addEventListener('input', e => setColor(e.target.value));
colorSwatch.addEventListener('click', () => customColor.click());

gridSizeEl.addEventListener('change', e => {
  const n = parseInt(e.target.value);
  if (confirm(`Grid auf ${n}×${n} ändern?\nAktueller Inhalt wird gelöscht.`)) {
    project.cols = n; project.frames = [emptyFrame()]; currentFrame = 0;
    renderFrames(); renderCanvas();
  } else { e.target.value = project.cols; }
});

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if ((e.ctrlKey||e.metaKey) && e.key==='s') { e.preventDefault(); saveProject(); return; }
  const map = { b:'draw', f:'fill', e:'erase', i:'pick' };
  if (map[e.key]) { activateTool(map[e.key]); return; }
  if (e.key==='ArrowLeft'  && currentFrame>0)                     selectFrame(currentFrame-1);
  if (e.key==='ArrowRight' && currentFrame<project.frames.length-1) selectFrame(currentFrame+1);
});

function activateTool(t) {
  tool = t;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tool-${t}`)?.classList.add('active');
}

// ── Frames ─────────────────────────────────────────────────────────────────
function emptyFrame() {
  return Array.from({length: project.cols}, () => Array(project.cols).fill(null));
}
function renderFrames() {
  framesList.innerHTML = '';
  project.frames.forEach((frame, i) => {
    const item  = document.createElement('div');
    item.className = 'frame-item';
    const tc    = document.createElement('canvas');
    tc.className = 'frame-thumb' + (i===currentFrame?' active':'');
    tc.width = tc.height = project.cols;
    drawThumb(tc, frame);
    tc.addEventListener('click', () => selectFrame(i));
    const label = document.createElement('div');
    label.className = 'frame-label';
    label.textContent = `Frame ${i+1}`;
    item.append(tc, label);
    framesList.appendChild(item);
  });
}
function selectFrame(i) { currentFrame = i; drawCanvas(); renderFrames(); }
function drawThumb(tc, frame) {
  const tctx = tc.getContext('2d');
  tctx.clearRect(0,0,tc.width,tc.height);
  for (let r=0;r<project.cols;r++)
    for (let c=0;c<project.cols;c++)
      if (frame[r][c]) { tctx.fillStyle=frame[r][c]; tctx.fillRect(c,r,1,1); }
}
function updateThumb(i) {
  const thumbs = framesList.querySelectorAll('canvas.frame-thumb');
  if (thumbs[i]) drawThumb(thumbs[i], project.frames[i]);
}

document.getElementById('btn-frame-add').addEventListener('click', () => {
  project.frames.push(emptyFrame()); currentFrame=project.frames.length-1;
  renderFrames(); drawCanvas();
});
document.getElementById('btn-frame-dupe').addEventListener('click', () => {
  const copy = project.frames[currentFrame].map(r=>[...r]);
  project.frames.splice(currentFrame+1,0,copy); currentFrame++;
  renderFrames(); drawCanvas();
});
document.getElementById('btn-frame-del').addEventListener('click', () => {
  if (project.frames.length<=1) return;
  project.frames.splice(currentFrame,1);
  currentFrame = Math.min(currentFrame, project.frames.length-1);
  renderFrames(); drawCanvas();
});

// ── Animation Preview ──────────────────────────────────────────────────────
document.getElementById('btn-preview').addEventListener('click', () => {
  openModal('modal-preview');
  const maxSz = Math.min(480, window.innerWidth*.72, window.innerHeight*.62);
  previewCanvas.width = previewCanvas.height = project.cols;
  previewCanvas.style.width = previewCanvas.style.height = maxSz+'px';
  previewFrame = 0;
  startPreview();
});
document.getElementById('modal-preview-close').addEventListener('click', () => {
  closeModal('modal-preview'); stopPreview();
});
function startPreview() {
  stopPreview();
  const fps = Math.max(1, parseInt(fpsInput.value)||4);
  const info = document.getElementById('preview-info');
  function showFrame() {
    const f = project.frames[previewFrame];
    pCtx.clearRect(0,0,previewCanvas.width,previewCanvas.height);
    for (let r=0;r<project.cols;r++)
      for (let c=0;c<project.cols;c++)
        if(f[r][c]){pCtx.fillStyle=f[r][c];pCtx.fillRect(c,r,1,1);}
    if(info) info.textContent = `Frame ${previewFrame+1}/${project.frames.length} · ${fps} FPS`;
    previewFrame = (previewFrame+1) % project.frames.length;
  }
  showFrame();
  previewInterval = setInterval(showFrame, 1000/fps);
}
function stopPreview() {
  if (previewInterval) { clearInterval(previewInterval); previewInterval=null; }
}

// ── Save / Load ────────────────────────────────────────────────────────────
function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(saveProject, 2500);
}

async function saveProject() {
  if (!project) return;
  project.name = projectNameEl.value.trim() || 'Unbenannt';
  project.fps  = parseInt(fpsInput.value)||4;
  const res = await fetch(`/api/projects/${project.id}`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(project),
  });
  if (res.ok) showToast('Gespeichert ✓');
  else        showToast('Fehler beim Speichern', true);
}
document.getElementById('btn-save').addEventListener('click', saveProject);

async function loadProject(pid) {
  const res  = await fetch(`/api/projects/${pid}`);
  applyProject(await res.json());
  closeModal('modal-projects');
}
function applyProject(data) {
  project = data; currentFrame = 0;
  projectNameEl.value = project.name;
  gridSizeEl.value    = project.cols;
  fpsInput.value      = project.fps||4;
  renderFrames(); renderCanvas();
}
document.getElementById('btn-new').addEventListener('click', async () => {
  const name = prompt('Projektname:', 'Neues Projekt');
  if (name===null) return;
  const res = await fetch('/api/projects',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:name.trim()||'Neues Projekt', cols:parseInt(gridSizeEl.value)}),
  });
  applyProject(await res.json());
});

// ── Projects Modal ─────────────────────────────────────────────────────────
async function openProjectsModal() {
  openModal('modal-projects');
  const projects = await (await fetch('/api/projects')).json();
  const list = document.getElementById('projects-list');
  list.innerHTML = '';
  if (!projects.length) {
    list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">Noch keine Projekte.</div>';
    return;
  }
  projects.forEach(p => {
    const item = document.createElement('div');
    item.className = 'project-item';
    item.innerHTML = `
      <div>
        <div class="project-item-name">${esc(p.name)}</div>
        <div class="project-item-meta">${p.cols}×${p.cols} · ${p.frames} Frame${p.frames!==1?'s':''}</div>
      </div>
      <button class="project-item-del" title="Löschen">✕</button>`;
    item.querySelector('div').addEventListener('click', () => loadProject(p.id));
    item.querySelector('.project-item-del').addEventListener('click', async e => {
      e.stopPropagation();
      if (confirm(`"${p.name}" löschen?`)) {
        await fetch(`/api/projects/${p.id}`,{method:'DELETE'});
        openProjectsModal();
      }
    });
    list.appendChild(item);
  });
}
document.getElementById('btn-projects').addEventListener('click', openProjectsModal);
document.getElementById('modal-projects-close').addEventListener('click', ()=>closeModal('modal-projects'));

// ── Export ─────────────────────────────────────────────────────────────────
document.getElementById('btn-export-png').addEventListener('click', () => {
  if (!project) return;
  const s = Math.max(cellSize,16);
  const exp = document.createElement('canvas');
  exp.width = exp.height = project.cols*s;
  const ec = exp.getContext('2d');
  ec.fillStyle='#fff'; ec.fillRect(0,0,exp.width,exp.height);
  const px = project.frames[currentFrame];
  for(let r=0;r<project.cols;r++)
    for(let c=0;c<project.cols;c++)
      if(px[r][c]){ec.fillStyle=px[r][c];ec.fillRect(c*s,r*s,s,s);}
  const a = document.createElement('a');
  a.download = `${project.name}-f${currentFrame+1}.png`;
  a.href = exp.toDataURL(); a.click();
});
document.getElementById('btn-export-gif').addEventListener('click', () => {
  if (!project) return;
  window.location.href = `/api/projects/${project.id}/export/gif`;
});

// ── Modals util ────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
document.querySelectorAll('.modal').forEach(m =>
  m.addEventListener('click', e => { if(e.target===m){closeModal(m.id);stopPreview();} })
);

// ── Toast ──────────────────────────────────────────────────────────────────
let toastTimer=null;
function showToast(msg,isErr=false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = isErr ? '#e24b4a' : 'var(--accent)';
  t.style.color      = isErr ? '#fff'    : '#000';
  t.classList.remove('hidden');
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.add('hidden'), 2200);
}

// ── Helpers ────────────────────────────────────────────────────────────────
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// ════════════════════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════════════════════

async function init() {
  initThemes();
  buildPalette();
  setColor(color);
  initDragDrop();

  // Apply saved panel layout
  applyLayout(loadLayout());

  // Load first project or create one
  const projects = await (await fetch('/api/projects')).json();
  if (projects.length) {
    await loadProject(projects[0].id);
  } else {
    const res = await fetch('/api/projects',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:'Erstes Projekt',cols:16}),
    });
    applyProject(await res.json());
  }
}

window.addEventListener('resize', ()=>{ if(project) renderCanvas(); });
init();
