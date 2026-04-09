
const canvas = document.getElementById('graphCanvas');
const ctx = canvas.getContext('2d');

// --- State ---
let nodes = {};   // id -> {id, label, x, y}
let edges = [];   // {from, to, weight}
let nodeIdCounter = 0;
let mode = 'move';
let dragging = null, dragOffX = 0, dragOffY = 0;
let edgeStart = null;
let vizState = null; // current animation state

// --- Resize ---
function resize() {
  const wrap = canvas.parentElement;
  canvas.width = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
  draw();
}
window.addEventListener('resize', resize);

// --- Helpers ---
function getNodeAt(x, y) {
  for (const n of Object.values(nodes)) {
    const dx = n.x - x, dy = n.y - y;
    if (Math.sqrt(dx*dx+dy*dy) < 22) return n;
  }
  return null;
}
function getEdgeAt(x, y) {
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const a = nodes[e.from], b = nodes[e.to];
    if (!a || !b) continue;
    const dx = b.x-a.x, dy = b.y-a.y, len = Math.sqrt(dx*dx+dy*dy);
    if (len === 0) continue;
    const t = Math.max(0, Math.min(1, ((x-a.x)*dx+(y-a.y)*dy)/(len*len)));
    const px = a.x+t*dx-x, py = a.y+t*dy-y;
    if (Math.sqrt(px*px+py*py) < 10) return i;
  }
  return -1;
}
function nextLabel() {
  const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const used = new Set(Object.values(nodes).map(n=>n.label));
  for (const l of labels) if (!used.has(l)) return l;
  return 'N'+(nodeIdCounter);
}
function setMode(m) {
  mode = m;
  edgeStart = null;
  ['move','add','edge','delete'].forEach(x => {
    document.getElementById('mode'+x.charAt(0).toUpperCase()+x.slice(1))?.classList.remove('active');
  });
  document.getElementById('mode'+m.charAt(0).toUpperCase()+m.slice(1))?.classList.add('active');
  canvas.style.cursor = m==='add' ? 'cell' : m==='delete' ? 'not-allowed' : 'crosshair';
  draw();
}
function updateSelects() {
  const ns = Object.values(nodes).sort((a,b)=>a.label.localeCompare(b.label));
  const start = document.getElementById('startSelect');
  const end = document.getElementById('endSelect');
  const sv = start.value, ev = end.value;
  start.innerHTML = ns.map(n=>`<option value="${n.id}">${n.label}</option>`).join('');
  end.innerHTML   = ns.map(n=>`<option value="${n.id}">${n.label}</option>`).join('');
  if (sv && nodes[sv]) start.value = sv;
  if (ev && nodes[ev]) end.value = ev;
  // default different
  if (ns.length >= 2 && start.value === end.value) {
    const idx = ns.findIndex(n=>n.id===start.value);
    end.value = ns[idx===0?1:0].id;
  }
  document.getElementById('statNodes').textContent = ns.length;
}

// --- Drawing ---
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // grid background
  ctx.save();
  ctx.strokeStyle = 'rgba(48,54,61,0.4)';
  ctx.lineWidth = 0.5;
  for (let x=0; x<canvas.width; x+=30) {
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke();
  }
  for (let y=0; y<canvas.height; y+=30) {
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke();
  }
  ctx.restore();

  const startId = document.getElementById('startSelect')?.value;
  const endId   = document.getElementById('endSelect')?.value;

  // Draw edges
  for (const e of edges) {
    const a = nodes[e.from], b = nodes[e.to];
    if (!a || !b) continue;
    const isPath = vizState?.path?.includes(e.from) && vizState?.path?.includes(e.to) &&
      Math.abs(vizState.path.indexOf(e.from) - vizState.path.indexOf(e.to)) === 1;

    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = isPath ? '#ffd700' : '#30363d';
    ctx.lineWidth = isPath ? 3.5 : 1.5;
    ctx.stroke();

    // Arrow head
    const angle = Math.atan2(b.y-a.y, b.x-a.x);
    const mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-10, -5); ctx.lineTo(-10, 5); ctx.closePath();
    ctx.fillStyle = isPath ? '#ffd700' : '#484f58';
    ctx.fill();
    ctx.restore();

    // Weight label
    const wx = mx + Math.cos(angle + Math.PI/2)*14;
    const wy = my + Math.sin(angle + Math.PI/2)*14;
    ctx.font = '10px Space Mono, monospace';
    ctx.fillStyle = isPath ? '#ffd700' : '#7d8590';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(e.weight.toFixed(1), wx, wy);
  }

  // Edge-in-progress
  if (edgeStart && vizState === null) {
    const a = nodes[edgeStart];
    if (a) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#4488ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(lastMouseX, lastMouseY); ctx.stroke();
      ctx.restore();
    }
  }

  // Draw nodes
  for (const n of Object.values(nodes)) {
    let color = '#21262d', stroke = '#484f58', textColor = '#e6edf3';
    const isStart = n.id === startId;
    const isEnd   = n.id === endId;
    const isOpen   = vizState?.open?.has(n.id);
    const isClosed = vizState?.closed?.has(n.id);
    const isPath   = vizState?.path?.includes(n.id);
    const isEdgeSrc = edgeStart === n.id;

    if (isStart)       { color = '#00ff88'; stroke = '#00ff88'; textColor = '#000'; }
    else if (isEnd)    { color = '#ff4466'; stroke = '#ff4466'; textColor = '#fff'; }
    else if (isPath)   { color = '#3a3000'; stroke = '#ffd700'; textColor = '#ffd700'; }
    else if (isOpen)   { color = '#1a3a2a'; stroke = '#00ff88'; textColor = '#00ff88'; }
    else if (isClosed) { color = '#1a2a3a'; stroke = '#4488ff'; textColor = '#4488ff'; }
    if (isEdgeSrc)     { stroke = '#4488ff'; }

    // Shadow glow for important nodes
    if (isStart || isEnd || isPath) {
      ctx.save();
      ctx.shadowColor = isStart ? '#00ff88' : isEnd ? '#ff4466' : '#ffd700';
      ctx.shadowBlur = 18;
    }

    ctx.beginPath();
    ctx.arc(n.x, n.y, 20, 0, Math.PI*2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = (isStart||isEnd||isPath) ? 2.5 : 1.5;
    ctx.stroke();

    if (isStart || isEnd || isPath) ctx.restore();

    ctx.font = 'bold 13px Syne, sans-serif';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(n.label, n.x, n.y);

    // g/h values if viz
    if (vizState?.gScore?.[n.id] !== undefined && (isOpen||isClosed||isPath)) {
      const g = vizState.gScore[n.id];
      const h = vizState.hScore?.[n.id] ?? 0;
      ctx.font = '8px Space Mono, monospace';
      ctx.fillStyle = '#7d8590';
      ctx.fillText(`g:${g.toFixed(1)}`, n.x, n.y-30);
      ctx.fillText(`h:${h.toFixed(1)}`, n.x, n.y-20);
    }
  }
}

// --- Mouse Events ---
let lastMouseX = 0, lastMouseY = 0;

canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  lastMouseX = e.clientX - r.left;
  lastMouseY = e.clientY - r.top;
  if (dragging) {
    dragging.x = lastMouseX + dragOffX;
    dragging.y = lastMouseY + dragOffY;
    draw();
  } else if (edgeStart) {
    draw();
  }
});

canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const r = canvas.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const hit = getNodeAt(mx, my);

  if (mode === 'move') {
    if (hit) { dragging = hit; dragOffX = hit.x-mx; dragOffY = hit.y-my; }
  } else if (mode === 'add') {
    if (!hit) addNode(mx, my);
  } else if (mode === 'edge') {
    if (hit) {
      if (!edgeStart) { edgeStart = hit.id; }
      else if (edgeStart !== hit.id) {
        const dist = Math.sqrt((hit.x-nodes[edgeStart].x)**2+(hit.y-nodes[edgeStart].y)**2);
        const w = +(dist/40).toFixed(1);
        edges.push({ from: edgeStart, to: hit.id, weight: w });
        edges.push({ from: hit.id, to: edgeStart, weight: w });
        edgeStart = null;
        draw();
      } else { edgeStart = null; }
    }
  } else if (mode === 'delete') {
    if (hit) {
      delete nodes[hit.id];
      edges = edges.filter(e=>e.from!==hit.id && e.to!==hit.id);
      updateSelects(); draw();
    } else {
      const ei = getEdgeAt(mx, my);
      if (ei >= 0) { edges.splice(ei, 2); draw(); }
    }
  }
});

canvas.addEventListener('mouseup', () => { dragging = null; draw(); });

function addNode(x, y) {
  const id = 'n'+(nodeIdCounter++);
  nodes[id] = { id, label: nextLabel(), x, y };
  updateSelects(); draw();
}

// --- A* Algorithm (step-by-step) ---
function heuristic(a, b) {
  const type = document.getElementById('heuristicSelect').value;
  const dx = Math.abs(a.x-b.x), dy = Math.abs(a.y-b.y);
  if (type === 'manhattan') return (dx+dy)/40;
  if (type === 'dijkstra') return 0;
  return Math.sqrt(dx*dx+dy*dy)/40;
}

function buildAdj() {
  const adj = {};
  for (const id of Object.keys(nodes)) adj[id] = [];
  for (const e of edges) {
    if (nodes[e.from] && nodes[e.to])
      adj[e.from].push({ id: e.to, w: e.weight });
  }
  return adj;
}

async function runAstar() {
  const startId = document.getElementById('startSelect').value;
  const endId   = document.getElementById('endSelect').value;
  if (!startId || !endId || startId === endId) return;
  if (!nodes[startId] || !nodes[endId]) return;

  document.getElementById('runBtn').disabled = true;
  vizState = { open: new Set(), closed: new Set(), path: [], gScore: {}, hScore: {} };

  const adj = buildAdj();
  const gScore = {}, fScore = {}, cameFrom = {}, hScore = {};
  for (const id of Object.keys(nodes)) gScore[id] = Infinity;
  gScore[startId] = 0;
  for (const id of Object.keys(nodes)) {
    hScore[id] = heuristic(nodes[id], nodes[endId]);
    fScore[id] = hScore[id];
  }
  fScore[startId] = hScore[startId];
  vizState.gScore = gScore; vizState.hScore = hScore;

  const openSet = new Set([startId]);
  const closedSet = new Set();
  let explored = 0;

  setStatus('running');

  while (openSet.size > 0) {
    // Pick node with lowest f
    let current = null, bestF = Infinity;
    for (const id of openSet) if (fScore[id] < bestF) { bestF = fScore[id]; current = id; }

    if (current === endId) break;

    openSet.delete(current);
    closedSet.add(current);
    explored++;

    // Update UI
    vizState.open = new Set(openSet);
    vizState.closed = new Set(closedSet);
    updateAlgoDisplay(openSet, closedSet, current, fScore);
    document.getElementById('statExplored').textContent = explored;
    draw();
    await sleep(speedVal());

    for (const nb of (adj[current]||[])) {
      if (closedSet.has(nb.id)) continue;
      const tent = gScore[current] + nb.w;
      if (tent < gScore[nb.id]) {
        cameFrom[nb.id] = current;
        gScore[nb.id] = tent;
        fScore[nb.id] = tent + hScore[nb.id];
        openSet.add(nb.id);
      }
    }
  }

  // Reconstruct
  if (gScore[endId] < Infinity) {
    const path = [];
    let cur = endId;
    while (cur !== undefined) { path.unshift(cur); cur = cameFrom[cur]; }
    vizState.path = path;
    vizState.open = new Set(); vizState.closed = new Set(closedSet);
    const labels = path.map(id => nodes[id].label);
    document.getElementById('pathDetails').innerHTML =
      labels.map((l,i) => i<labels.length-1
        ? `<span class="path-step">${l}</span><span class="path-arrow"> → </span>`
        : `<span class="path-step">${l}</span>`).join('') +
      `<br><span style="color:var(--muted)">Total cost: ${gScore[endId].toFixed(2)}</span>`;
    document.getElementById('statPathLen').textContent = path.length;
    document.getElementById('statCost').textContent = gScore[endId].toFixed(2);
    setStatus('found');
  } else {
    vizState.path = [];
    document.getElementById('pathDetails').innerHTML = '<span style="color:var(--accent2)">No path found.</span>';
    setStatus('no-path');
  }

  updateAlgoDisplay(new Set(), vizState.closed, null, fScore);
  draw();
  document.getElementById('runBtn').disabled = false;
}

function updateAlgoDisplay(open, closed, current, fScore) {
  const ol = [...open].map(id=>nodes[id]?.label||id);
  const cl = [...closed].map(id=>nodes[id]?.label||id);
  document.getElementById('openSetDisplay').textContent = ol.length ? '['+ol.join(',')+']' : '∅';
  document.getElementById('closedSetDisplay').textContent = cl.length ? '['+cl.join(',')+']' : '∅';
  if (current) {
    document.getElementById('priorityDisplay').textContent = nodes[current]?.label + ':' + (fScore[current]||0).toFixed(1);
  }
}
function setStatus(s) {
  const el = document.getElementById('statusDisplay');
  if (s==='running')   { el.textContent='Running...'; el.style.color='var(--accent)'; }
  else if (s==='found'){ el.textContent='Path found!'; el.style.color='#ffd700'; }
  else if (s==='no-path'){ el.textContent='No path'; el.style.color='var(--accent2)'; }
  else                 { el.textContent='Idle'; el.style.color='var(--muted)'; }
}
function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }
function speedVal() { return 850 - +document.getElementById('speedSlider').value; }

function resetViz() {
  vizState = null;
  document.getElementById('pathDetails').innerHTML = '<span style="color:var(--muted);font-size:11px">Run algorithm to see path...</span>';
  document.getElementById('statExplored').textContent='0';
  document.getElementById('statPathLen').textContent='—';
  document.getElementById('statCost').textContent='—';
  document.getElementById('openSetDisplay').textContent='—';
  document.getElementById('closedSetDisplay').textContent='—';
  document.getElementById('priorityDisplay').textContent='—';
  setStatus('idle');
  draw();
}
function clearGraph() {
  nodes={}; edges=[]; nodeIdCounter=0; vizState=null;
  updateSelects(); resetViz(); draw();
}

function loadDefault() {
  clearGraph();
  const W = canvas.width, H = canvas.height;
  const cx = W/2, cy = H/2;
  const pts = [
    { label:'A', rx:-0.3, ry:-0.35 },
    { label:'B', rx: 0.0, ry:-0.38 },
    { label:'C', rx: 0.32, ry:-0.2 },
    { label:'D', rx:-0.35, ry: 0.0 },
    { label:'E', rx: 0.0,  ry: 0.05 },
    { label:'F', rx: 0.35, ry: 0.15 },
    { label:'G', rx:-0.1,  ry: 0.38 },
    { label:'H', rx: 0.3,  ry: 0.38 },
  ];
  const R = Math.min(W,H)*0.38;
  const ids = {};
  for (const p of pts) {
    const id = 'n'+(nodeIdCounter++);
    const x = cx + p.rx*R*2 + (Math.random()-.5)*20;
    const y = cy + p.ry*R*2 + (Math.random()-.5)*20;
    nodes[id] = { id, label: p.label, x, y };
    ids[p.label] = id;
  }
  const conn = [
    ['A','B'],['A','D'],['B','C'],['B','E'],['C','F'],['C','H'],
    ['D','E'],['D','G'],['E','F'],['E','G'],['F','H'],['G','H']
  ];
  for (const [la,lb] of conn) {
    const a=nodes[ids[la]], b=nodes[ids[lb]];
    const d = Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2);
    const w = +(d/40).toFixed(1);
    edges.push({from:ids[la],to:ids[lb],weight:w});
    edges.push({from:ids[lb],to:ids[la],weight:w});
  }
  updateSelects();
  document.getElementById('startSelect').value = ids['A'];
  document.getElementById('endSelect').value   = ids['H'];
  draw();
}

// --- Init ---
resize();
loadDefault();
