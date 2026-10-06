/* ============ CAVE RIBBON — retro calculator arcade ============ */
"use strict";
const $ = id => document.getElementById(id);

/* ---------- tiny store ---------- */
const store = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch(e){ return fb; } },
  set(k, v)  { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} },
};
const LS = { settings:"caveribbon.settings", best:"caveribbon.best" };

/* ---------- settings ---------- */
const THEMES = [
  { id:"",        name:"MINT"    },
  { id:"ocean",   name:"OCEAN"   },
  { id:"sunset",  name:"SUNSET"  },
  { id:"gameboy", name:"GAMEBOY" },
  { id:"sakura",  name:"SAKURA"  },
];
let settings = Object.assign({ theme:"", muted:false, brand:"" }, store.get(LS.settings, {}));
let bests = Object.assign({ cave:0, flappy:0, heli:0, ship:0 }, store.get(LS.best, {}));

let INK = "#2b3a2e";
let PAPER = "#cfe5d4";
function refreshInk(){
  const cs = getComputedStyle(document.body);
  const v = cs.getPropertyValue("--ink").trim();
  if (v) INK = v;
  const p = cs.getPropertyValue("--paper").trim();
  if (p) PAPER = p;
}
function applyTheme(id){
  settings.theme = id; store.set(LS.settings, settings);
  if (id) document.body.dataset.theme = id; else delete document.body.dataset.theme;
  refreshInk();
  document.querySelectorAll("#theme-swatches .swatch").forEach(s =>
    s.classList.toggle("sel", s.dataset.id === id));
}

/* ---------- screens ---------- */
function show(id){
  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
  $(id).classList.remove("hidden");
  fit();
}
let toastTimer = 0;
function toast(msg, ms){
  const t = $("toast");
  t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.add("hidden"), ms || 900);
}

/* ---------- canvas ---------- */
const cv = $("game-canvas");
const ctx = cv.getContext("2d");

const G = {
  modeKey:null, mode:null, running:false, paused:false,
  W:0, H:0, dpr:1,
  t:0, worldX:0, score:0, lastScore:-1,
  px:0, py:0, vy:0, pressing:false,
  dead:false, deathT:0, overShown:false,
  phase:"countdown", countT:0, lastCount:4,   // countdown → play
  parts:[], floats:[], streaks:[],
  keys:{}, s:null,
};
function sizeCanvas(){
  const wrap = $("canvas-wrap");
  const w = wrap.clientWidth, h = wrap.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  G.W = w; G.H = h; G.dpr = dpr;
}
/* fixed-aspect responsive: 430px calculator design, uniformly scaled by fit() */
function fit(){
  const calc = $("calc"), stage = $("stage");
  if (document.body.classList.contains("immersive")){
    calc.style.transform = "none";
    stage.style.width = window.innerWidth + "px";
    stage.style.height = window.innerHeight + "px";
    sizeCanvas();
    return;
  }
  const w = calc.offsetWidth, h = calc.offsetHeight;
  if (w && h){
    const s = Math.min((window.innerWidth - 24) / w, (window.innerHeight - 24) / h);
    const sc = Math.max(0.35, Math.min(2.5, s));
    calc.style.transform = `scale(${sc})`;
    stage.style.width = (w * sc) + "px";
    stage.style.height = (h * sc) + "px";
  }
  sizeCanvas();
}

/* ---------- particles / floaters ---------- */
function burst(x, y, n){
  for (let i = 0; i < n; i++){
    const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 220;
    G.parts.push({ x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life:0.5 + Math.random()*0.4, t:0, s:2 + Math.random()*3 });
  }
}
function updateParts(dt){
  for (let i = G.parts.length - 1; i >= 0; i--){
    const p = G.parts[i]; p.t += dt;
    if (p.t >= p.life){ G.parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; p.vy *= 0.98;
  }
  for (let i = G.floats.length - 1; i >= 0; i--){
    const f = G.floats[i]; f.t += dt;
    if (f.t >= 0.9) G.floats.splice(i, 1);
  }
  for (let i = G.streaks.length - 1; i >= 0; i--){
    const s = G.streaks[i]; s.t += dt;
    if (s.t >= 0.7) G.streaks.splice(i, 1);
  }
}
function drawParts(){
  ctx.fillStyle = INK;
  for (const p of G.parts){
    ctx.globalAlpha = 1 - p.t / p.life;
    ctx.fillRect(p.x - p.s/2, p.y - p.s/2, p.s, p.s);
  }
  ctx.globalAlpha = 1;
  ctx.font = "15px DotGothic16, monospace"; ctx.textAlign = "center";
  for (const f of G.floats){
    ctx.globalAlpha = 1 - f.t / 0.9;
    ctx.fillText(f.txt, f.x, f.y - f.t * 34);
  }
  ctx.globalAlpha = 1;
  /* death starburst: radiating ink/white streaks from the impact point */
  for (const s of G.streaks){
    const k = s.t / 0.7;
    const len = s.spd * s.t;
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = s.white ? "#ffffff" : INK;
    ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + Math.cos(s.ang) * len, s.y + Math.sin(s.ang) * len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function floater(x, y, txt){ G.floats.push({ x, y, txt, t:0 }); }

/* ==================================================================
   MODES
   ================================================================== */
const COLW = 8;

const Modes = {
/* ---------------- CAVE : the classic ribbon ---------------- */
cave: {
  label:"CAVE", sub:"HOLD TO RISE",
  reset(){
    const s = G.s = { segs:[], trail:[], genX:-120, gap:240, speed:150,
      p1:Math.random()*6.28, p2:Math.random()*6.28, p3:Math.random()*6.28,
      a1:60 + Math.random()*30, a2:35 + Math.random()*30, a3:14 + Math.random()*14 };
    // recenter: the cave always opens exactly at mid-screen where the ribbon starts
    s.c0 = s.a1 * Math.sin(s.p1) + s.a2 * Math.sin(s.p2) + s.a3 * Math.sin(s.p3);
    while (s.genX < G.W + 240) this.genCol(s);
  },
  /* smooth cave: three sines with per-run random phase/amplitude —
     bounded slope so it stays fair at top speed */
  centerAt(s, wx){
    return G.H/2 - s.c0
      + s.a1 * Math.sin(wx * 0.0035 + s.p1)
      + s.a2 * Math.sin(wx * 0.0011 + s.p2)
      + s.a3 * Math.sin(wx * 0.0080 + s.p3);
  },
  genCol(s){
    s.genX += COLW;
    const c = this.centerAt(s, s.genX);
    const m = 46 + s.gap / 2;
    const cc = Math.max(m, Math.min(G.H - m, c));
    s.segs.push({ x:s.genX, top:cc - s.gap/2, bot:cc + s.gap/2 });
  },
  update(dt){
    const s = G.s;
    s.speed = Math.min(300, 150 + G.t * 4.5);
    s.gap = Math.max(130, 240 - G.t * 2.0);   // visibly tighter within half a minute
    G.worldX += s.speed * dt;
    while (s.segs.length && s.segs[0].x < G.worldX - 80) s.segs.shift();
    while (s.genX < G.worldX + G.W + 240) this.genCol(s);
    // silky symmetric physics (after the reference SFCave): same accel both ways,
    // gentle enough to feather — no more rocketing into the ceiling on a tap
    G.vy += (G.pressing ? -1 : 1) * 1100 * dt;
    G.vy = Math.max(-480, Math.min(480, G.vy));
    G.py += G.vy * dt;
    // trail
    s.trail.push({ x:G.worldX + G.px, y:G.py });
    if (s.trail.length > 46) s.trail.shift();
    // collision
    const pxw = G.worldX + G.px, r = 9;
    for (const sg of s.segs){
      if (sg.x <= pxw && pxw < sg.x + COLW){
        if (G.py - r < sg.top || G.py + r > sg.bot){ die(); return; }
        break;
      }
    }
    if (G.py < -20 || G.py > G.H + 20) die();
    G.score = Math.floor(G.worldX / 12);
  },
  draw(){
    const s = G.s;
    for (const sg of s.segs){
      const x = sg.x - G.worldX;
      if (x > G.W || x < -COLW - 2) continue;
      wallTop(x, 0, COLW + 1, sg.top);
      wallBottom(x, sg.bot, COLW + 1, G.H - sg.bot);
    }
    // ribbon trail
    const tr = s.trail;
    for (let i = 1; i < tr.length; i++){
      const a = i / tr.length;
      ctx.strokeStyle = INK; ctx.globalAlpha = a * 0.5;
      ctx.lineWidth = 1 + 7 * a; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(tr[i-1].x - G.worldX, tr[i-1].y);
      ctx.lineTo(tr[i].x - G.worldX, tr[i].y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    drawRibbonHead(G.px, G.py, s.speed, G.vy);
  },
  press(){ G.pressing = true; },
  release(){ G.pressing = false; },
},

/* ---------------- FLAPPY : tap to flap ---------------- */
flappy: {
  label:"FLAPPY", sub:"TAP TO FLAP",
  reset(){
    const s = G.s = { pipes:[], nextX:G.W + 120, gap:170, speed:165, wing:0 };
    G.py = G.H / 2; G.vy = 0;
  },
  update(dt){
    const s = G.s;
    s.speed = Math.min(230, 165 + G.t * 2.2);
    s.gap = Math.max(138, 170 - G.t * 0.5);
    s.wing += dt * 10;
    G.worldX += s.speed * dt;
    G.vy = Math.min(640, G.vy + 1650 * dt);
    G.py += G.vy * dt;
    const PW = 64, SP = 252;
    while (s.nextX < G.worldX + G.W + SP){
      const gy = 110 + Math.random() * (G.H - 220);
      s.pipes.push({ x:s.nextX, gy, counted:false });
      s.nextX += SP;
    }
    while (s.pipes.length && s.pipes[0].x < G.worldX - PW - 40) s.pipes.shift();
    const pxw = G.worldX + G.px, r = 11;
    for (const p of s.pipes){
      if (!p.counted && p.x + PW < pxw){ p.counted = true; G.score++; floater(G.px + 30, G.py - 24, "+1"); Sfx.bonus(); }
      if (pxw + r > p.x && pxw - r < p.x + PW){
        const gt = p.gy - s.gap/2, gb = p.gy + s.gap/2;
        if (G.py - r < gt || G.py + r > gb){ die(); return; }
      }
    }
    if (G.py < -20 || G.py > G.H + 10) die();
  },
  draw(){
    const s = G.s, PW = 64;
    ctx.fillStyle = INK;   // flappy pipes stay solid — ghost fill made them unreadable
    for (const p of s.pipes){
      const x = p.x - G.worldX;
      if (x > G.W || x < -PW - 4) continue;
      const gt = p.gy - s.gap/2, gb = p.gy + s.gap/2;
      ctx.fillRect(x, 0, PW, gt);
      ctx.fillRect(x, gb, PW, G.H - gb);
      ctx.fillRect(x - 5, gt - 16, PW + 10, 16);   // caps
      ctx.fillRect(x - 5, gb, PW + 10, 16);
    }
    drawBird(G.px, G.py, G.vy, s.wing);
  },
  press(){ if (!G.dead){ G.vy = -470; Sfx.click(); } },
  release(){},
},

/* ---------------- HELI : hold for thrust ---------------- */
heli: {
  label:"HELI", sub:"HOLD = THRUST",
  reset(){
    const s = G.s = { blocks:[], nextX:G.W + 100, speed:170, rotor:0, birds:[], birdT:3.5 };
    G.py = G.H / 2; G.vy = 0;
  },
  update(dt){
    const s = G.s;
    s.speed = Math.min(265, 170 + G.t * 3.6);
    s.rotor += dt * 28;
    G.worldX += s.speed * dt;
    // silky symmetric physics, same as the cave ribbon
    G.vy += (G.pressing ? -1 : 1) * 1100 * dt;
    G.vy = Math.max(-480, Math.min(480, G.vy));
    G.py += G.vy * dt;
    while (s.nextX < G.worldX + G.W + 320){
      const w = 44, h = 60 + Math.random() * 110;
      const y = 56 + Math.random() * (G.H - 112 - h);
      s.blocks.push({ x:s.nextX, y, w, h });
      s.nextX += 250 + Math.random() * 90;
    }
    while (s.blocks.length && s.blocks[0].x < G.worldX - 80) s.blocks.shift();
    // birds: the flappy cousins come visiting — they drift in from the right,
    // bobbing as they fly, hanging in the air slower than the walls, and they are solid
    s.birdT -= dt;
    if (G.t > 8 && s.birdT <= 0 && s.birds.length < 4){
      s.birdT = 2.2 + Math.random() * 1.8;
      const n = 1 + (Math.random() < 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++){
        s.birds.push({
          wx:G.worldX + G.W + 40 + i * 90,
          y0:70 + Math.random() * (G.H - 140),
          ph:Math.random() * 6.28, flap:Math.random() * 6.28,
          drift:20 + Math.random() * 40,
        });
      }
    }
    const pxw = G.worldX + G.px, r = 10;
    for (let i = s.birds.length - 1; i >= 0; i--){
      const b = s.birds[i];
      b.wx += (s.speed * 0.72 - b.drift) * dt;   // world moves on: on screen they drift left gently
      b.flap += dt * 11;
      const bx = b.wx - G.worldX;
      const by = b.y0 + Math.sin(G.t * 3 + b.ph) * 24;
      if (bx < -60){ s.birds.splice(i, 1); continue; }
      if (Math.hypot(G.px - bx, G.py - by) < r + 9){ die(); return; }
      b._bx = bx; b._by = by;
    }
    const ceil = 26 + Math.sin(G.worldX * 0.004) * 8;
    const floor = G.H - 26 - Math.sin(G.worldX * 0.003 + 2) * 8;
    if (G.py - r < ceil || G.py + r > floor){ die(); return; }
    for (const b of s.blocks){
      if (pxw + r > b.x && pxw - r < b.x + b.w && G.py + r > b.y && G.py - r < b.y + b.h){ die(); return; }
    }
    G.score = Math.floor(G.worldX / 12);
    s.ceil = ceil; s.floor = floor;
  },
  draw(){
    const s = G.s;
    wallTop(0, 0, G.W, s.ceil || 26);
    wallBottom(0, s.floor || (G.H - 26), G.W, G.H);
    for (const b of s.blocks){
      const x = b.x - G.worldX;
      if (x > G.W || x < -b.w - 2) continue;
      wallBlock(x, b.y, b.w, b.h);
    }
    for (const b of s.birds){
      if (b._bx === undefined || b._bx < -30 || b._bx > G.W + 30) continue;
      drawBird(b._bx, b._by, Math.cos(G.t * 3 + b.ph) * 120, b.flap, 0.8);
    }
    drawHeli(G.px, G.py, s.rotor);
  },
  press(){ G.pressing = true; },
  release(){ G.pressing = false; },
},

/* ---------------- SHIP : drag to steer, auto-fire ---------------- */
ship: {
  label:"SHIP", sub:"DRAG TO STEER",
  reset(){
    const s = G.s = {
      tx:G.W/2, ty:G.H*0.68, dragging:false,
      rocks:[], bullets:[], fireT:0, spawnT:0.6, stars:[],
      kills:0, gun:1, drones:[], ebullets:[], droneT:5,
      miss:0, gauge:0, boss:null, diff:0,
      cores:0, bspd:1, loot:[],
    };
    G.px = G.W/2; G.py = G.H*0.68;
    for (let i = 0; i < 42; i++)
      s.stars.push({ x:Math.random()*G.W, y:Math.random()*G.H, d:0.3 + Math.random()*0.7 });
  },
  spawnBoss(s){
    // the more you score — and the more bosses you've sunk — the meaner it gets
    const hp = Math.min(160, 40 + Math.floor(G.score / 10) + s.diff * 12);
    s.boss = { x:G.W/2, y:-70, hp, maxhp:hp, t:0, fireA:0.6, fireB:2.2, ang:0 };
    floater(G.W/2, G.H/2 - 40, "!! BOSS !!");
    Sfx.alarm();
    Sfx.bossMusicStart();   // the void starts to sing
  },
  spawnRock(s){
    const r = 12 + Math.random() * 15;
    const n = 7 + Math.floor(Math.random() * 3);
    const vs = [];
    for (let i = 0; i < n; i++) vs.push(0.72 + Math.random() * 0.5);
    s.rocks.push({
      x:Math.random() * G.W, y:-30, r, vs, rot:Math.random()*6.28, vr:(Math.random()-0.5)*2,
      vx:(Math.random()-0.5)*40, vy:Math.min(300 + s.diff * 25, 135 + G.t * 1.3 + s.diff * 22),
      power: G.t > 5 && Math.random() < 0.10,   // energy rock: crack it for a weapon core
    });
  },
  fire(s){
    const bx = G.px, by = G.py - 18, sp = 560 * s.bspd;
    const mk = (x, vx) => ({ x, y:by, vx, spd:sp });
    if (s.gun === 1) s.bullets.push(mk(bx, 0));
    else if (s.gun === 2){ s.bullets.push(mk(bx-7, 0)); s.bullets.push(mk(bx+7, 0)); }
    else { s.bullets.push(mk(bx, 0)); s.bullets.push(mk(bx-8, -70)); s.bullets.push(mk(bx+8, 70)); }
  },
  addKill(s, x, y, pts){
    s.kills++;
    G.score += pts;
    floater(x, y, "+" + pts);
  },
  /* weapon core: every core speeds bullets +8% (cap 1.6x);
     3 cores -> GUN LV2, 6 cores -> GUN LV3 */
  addCore(s, x, y){
    s.cores++;
    s.bspd = Math.min(1.6, s.bspd + 0.08);
    Sfx.bonus();
    if (s.cores >= 6 && s.gun < 3){ s.gun = 3; floater(G.px, G.py - 40, "GUN LV3!"); }
    else if (s.cores >= 3 && s.gun < 2){ s.gun = 2; floater(G.px, G.py - 40, "GUN LV2!"); }
    else floater(x, y, "+CORE");
  },
  update(dt){
    const s = G.s, self = this;
    // steering: finger drag, or arrow keys
    const k = G.keys;
    let kvx = 0, kvy = 0;
    if (k.ArrowLeft || k.KeyA) kvx -= 1;
    if (k.ArrowRight || k.KeyD) kvx += 1;
    if (k.ArrowUp || k.KeyW) kvy -= 1;
    if (k.ArrowDown || k.KeyS) kvy += 1;
    if (kvx || kvy){
      s.tx = Math.max(16, Math.min(G.W-16, G.px + kvx * 340 * dt));
      s.ty = Math.max(16, Math.min(G.H-16, G.py + kvy * 340 * dt));
    }
    const f = Math.min(1, 15 * dt);
    G.px += (s.tx - G.px) * f;
    G.py += (s.ty - G.py) * f;
    // stars
    for (const st of s.stars){
      st.y += (50 + st.d * 90) * dt;
      if (st.y > G.H){ st.y = -2; st.x = Math.random() * G.W; }
    }
    // auto fire
    s.fireT -= dt;
    if (s.fireT <= 0){ s.fireT = 0.24; self.fire(s); Sfx.move(); }
    for (let i = s.bullets.length - 1; i >= 0; i--){
      const b = s.bullets[i]; b.y -= (b.spd || 560) * dt; b.x += b.vx * dt;
      if (b.y < -12 || b.x < -12 || b.x > G.W + 12) s.bullets.splice(i, 1);
    }
    // rocks
    s.spawnT -= dt;
    if (s.spawnT <= 0){
      // every boss kill turns up the heat: rocks come faster and more often
      const iv = Math.max(0.42, 0.95 - G.t * 0.008) * Math.pow(0.88, s.diff);
      s.spawnT = Math.max(0.28, s.boss ? iv * 4 : iv);
      this.spawnRock(s);
    }
    for (let i = s.rocks.length - 1; i >= 0; i--){
      const r = s.rocks[i];
      r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.vr * dt;
      if (r.y > G.H + 40){
        s.rocks.splice(i, 1);
        s.miss++; s.gauge++;                          // every rock you let through feeds the boss gauge
        if (!s.boss && s.gauge >= 20) this.spawnBoss(s);
        continue;
      }
      if (r.x < -50 || r.x > G.W + 50){ s.rocks.splice(i, 1); continue; }
      let dead = false;
      for (let j = s.bullets.length - 1; j >= 0; j--){
        const b = s.bullets[j];
        if (Math.hypot(b.x - r.x, b.y - r.y) < r.r + 4){
          s.bullets.splice(j, 1); s.rocks.splice(i, 1);
          burst(r.x, r.y, r.power ? 26 : 14);
          if (r.power) self.addCore(s, r.x, r.y);   // energy rock: weapon core
          else self.addKill(s, r.x, r.y, 10);
          Sfx.pop(1);
          dead = true; break;
        }
      }
      if (dead || i >= s.rocks.length) continue;
      if (Math.hypot(G.px - s.rocks[i].x, G.py - s.rocks[i].y) < s.rocks[i].r + 9){ die(); return; }
    }
    // --- enemy drones: they hunt back ---
    s.droneT -= dt;
    const maxDrones = s.diff >= 3 ? 3 : 2;
    if (!s.boss && G.t > 15 && s.droneT <= 0 && s.drones.length < maxDrones){
      s.droneT = (3.5 + Math.random() * 2.5) / (1 + 0.4 * s.diff);
      const dhp = Math.min(5, 2 + Math.floor(s.diff / 2));
      s.drones.push({ x:Math.random()*G.W, y:-30, hp:dhp, t:0, fireT:1.4, ph:Math.random()*6.28, leaving:0 });
    }
    for (let i = s.drones.length - 1; i >= 0; i--){
      const d = s.drones[i];
      d.t += dt;
      if (d.leaving){ d.y -= 200 * dt; if (d.y < -50) s.drones.splice(i, 1); continue; }
      if (d.t > 14) d.leaving = 1;
      // hover into formation, swaying side to side
      const hx = G.W/2 + Math.sin(d.t * 0.9 + d.ph) * G.W * 0.32;
      d.x += (hx - d.x) * Math.min(1, 3 * dt);
      d.y += (110 - d.y) * Math.min(1, 2 * dt);
      // aimed fire at the player — faster and angrier as difficulty rises
      d.fireT -= dt;
      if (d.fireT <= 0 && d.y > 40){
        d.fireT = Math.max(0.7, (1.5 + Math.random() * 0.8) - s.diff * 0.12);
        const a = Math.atan2(G.py - d.y, G.px - d.x);
        const bs = Math.min(380, 260 + s.diff * 18);
        s.ebullets.push({ x:d.x, y:d.y + 10, vx:Math.cos(a) * bs, vy:Math.sin(a) * bs });
        Sfx.deny();
      }
      // player bullets vs drone
      let dead = false;
      for (let j = s.bullets.length - 1; j >= 0; j--){
        const b = s.bullets[j];
        if (Math.hypot(b.x - d.x, b.y - d.y) < 16){
          s.bullets.splice(j, 1);
          d.hp--;
          burst(d.x, d.y, 6);
          if (d.hp <= 0){
            s.drones.splice(i, 1);
            burst(d.x, d.y, 18);
            self.addKill(s, d.x, d.y, 30); Sfx.pop(2);
            dead = true;
          }
          break;
        }
      }
      if (dead) continue;
      if (i < s.drones.length && Math.hypot(G.px - d.x, G.py - d.y) < 20){ die(); return; }
    }
    // enemy bullets
    for (let i = s.ebullets.length - 1; i >= 0; i--){
      const b = s.ebullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < -12 || b.x > G.W + 12 || b.y < -12 || b.y > G.H + 12){ s.ebullets.splice(i, 1); continue; }
      if (Math.hypot(G.px - b.x, G.py - b.y) < 11){ die(); return; }
    }
    // boss loot: drifting weapon cores — fly into them to catch
    for (let i = s.loot.length - 1; i >= 0; i--){
      const l = s.loot[i];
      l.y += l.vy * dt;
      l.x += Math.sin(G.t * 3 + l.ph) * 36 * dt;
      if (l.y > G.H + 20){ s.loot.splice(i, 1); continue; }
      if (Math.hypot(G.px - l.x, G.py - l.y) < 24){
        s.loot.splice(i, 1);
        self.addCore(s, l.x, l.y);
      }
    }
    // --- the BOSS: hovering fortress, bullet-hell patterns ---
    const B = s.boss;
    if (B){
      B.t += dt;
      B.y += (96 - B.y) * Math.min(1, 1.6 * dt);
      B.x = G.W/2 + Math.sin(B.t * 0.7) * G.W * 0.3;
      // spiral barrage
      B.fireA -= dt;
      if (B.fireA <= 0 && B.y > 50){
        B.fireA = 0.16; B.ang += 0.45;
        for (let k = 0; k < 2; k++){
          const a = B.ang + k * Math.PI;
          s.ebullets.push({ x:B.x, y:B.y + 20, vx:Math.cos(a) * 190, vy:Math.sin(a) * 190 });
        }
      }
      // aimed fan at the player
      B.fireB -= dt;
      if (B.fireB <= 0 && B.y > 50){
        B.fireB = 2.4;
        const base = Math.atan2(G.py - B.y, G.px - B.x);
        for (let k = -2; k <= 2; k++){
          const a = base + k * 0.18;
          s.ebullets.push({ x:B.x, y:B.y + 20, vx:Math.cos(a) * 250, vy:Math.sin(a) * 250 });
        }
        Sfx.deny();
      }
      while (s.ebullets.length > 70) s.ebullets.shift();
      // player bullets vs boss
      for (let j = s.bullets.length - 1; j >= 0; j--){
        const b = s.bullets[j];
        if (Math.hypot(b.x - B.x, b.y - B.y) < 34){
          s.bullets.splice(j, 1);
          B.hp--;
          burst(b.x, b.y, 5);
          if (B.hp <= 0){
            s.boss = null;
            s.gauge = 0;                                  // gauge resets, counting starts over
            s.diff++;                                     // every boss kill turns up the heat
            Sfx.bossMusicStop();                          // the void falls silent again
            burst(B.x, B.y, 46);
            G.shake = 0.4;
            Sfx.fanfare();
            G.score += 500;
            floater(B.x, B.y, "BOSS DOWN +500");
            floater(G.px, G.py - 56, "DIFFICULTY UP");
            // boss loot: 3 weapon cores drift down — catch them!
            for (let k = -1; k <= 1; k++)
              s.loot.push({ x:B.x + k * 34, y:B.y, vy:95, ph:Math.random() * 6.28 });
            break;
          }
        }
      }
      if (s.boss && Math.hypot(G.px - B.x, G.py - B.y) < 40){ die(); return; }
    }
  },
  draw(){
    const s = G.s;
    ctx.fillStyle = INK;
    for (const st of s.stars){
      ctx.globalAlpha = 0.25 + st.d * 0.45;
      ctx.fillRect(st.x, st.y, 2, 2);
    }
    ctx.globalAlpha = 1;
    for (const r of s.rocks){
      ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.rot);
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
      ctx.beginPath();
      const n = r.vs.length;
      for (let i = 0; i <= n; i++){
        const a = (i % n) / n * Math.PI * 2;
        const rr = r.r * r.vs[i % n];
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke(); ctx.restore();
      // energy rock: pulsing white core, ringed
      if (r.power){
        const pr = 4 + Math.sin(G.t * 6 + r.rot * 3) * 1.5;
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(r.x, r.y, pr, 0, 6.29); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(r.x, r.y, pr + 3.5, 0, 6.29); ctx.stroke();
      }
    }
    // drones: little saucers with a blinking eye
    for (const d of s.drones){
      ctx.save(); ctx.translate(d.x, d.y);
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.ellipse(0, 0, 14, 7, 0, 0, 6.29); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -5, 5, Math.PI, 0); ctx.fill();
      const blink = (G.t * 6 + d.ph) % 2 < 1;
      ctx.fillStyle = blink ? "#fff" : INK;
      ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, 6.29); ctx.fill();
      ctx.restore();
    }
    // boss: a heavy fortress hull with a pulsing core
    if (s.boss){
      const B = s.boss;
      ctx.save(); ctx.translate(B.x, B.y);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.moveTo(-46, 10); ctx.lineTo(-30, -18); ctx.lineTo(-12, -8);
      ctx.lineTo(0, -24); ctx.lineTo(12, -8); ctx.lineTo(30, -18); ctx.lineTo(46, 10);
      ctx.lineTo(24, 18); ctx.lineTo(-24, 18);
      ctx.closePath(); ctx.fill();
      for (const sx of [-38, -20, 20, 38]){
        ctx.beginPath(); ctx.moveTo(sx, -6); ctx.lineTo(sx, -22); ctx.lineTo(sx + 6, -6); ctx.fill();
      }
      const pulse = 6 + Math.sin(G.t * 8) * 2;
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(0, 2, pulse, 0, 6.29); ctx.fill();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(0, 2, pulse * 0.45, 0, 6.29); ctx.fill();
      ctx.restore();
      // HP bar
      const bw = G.W * 0.6, bx = (G.W - bw) / 2, by = 30;
      ctx.textAlign = "center";
      ctx.font = "13px 'DotGothic16', monospace";
      ctx.fillStyle = INK;
      ctx.fillText("BOSS", G.W/2, by - 5);
      ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, 9);
      ctx.fillRect(bx + 2, by + 2, (bw - 4) * Math.max(0, B.hp / B.maxhp), 5);
    }
    // loot cores: pulsing white diamonds with an ink ring — catch them!
    for (const l of s.loot){
      const p = 5 + Math.sin(G.t * 8 + l.ph) * 2;
      ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = "#fff";
      ctx.fillRect(-p * 0.7, -p * 0.7, p * 1.4, p * 1.4);
      ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.strokeRect(-p * 0.7, -p * 0.7, p * 1.4, p * 1.4);
      ctx.restore();
    }
    ctx.fillStyle = INK;
    for (const b of s.bullets) ctx.fillRect(b.x - 2, b.y - 8, 4, 12);
    // enemy bullets: diamonds
    for (const b of s.ebullets){
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.PI / 4);
      ctx.fillRect(-3.5, -3.5, 7, 7);
      ctx.restore();
    }
    drawShip(G.px, G.py);
  },
  press(x, y){ const s = G.s; s.dragging = true; s.tx = x; s.ty = y - 56; },
  move(x, y){ const s = G.s; if (s.dragging){ s.tx = x; s.ty = y - 56; } },
  release(){ G.s.dragging = false; },
},
};

/* ---------- player drawings (LCD-ink style) ---------- */
/* OLED walls in immersive: fully transparent, only the bright boundary line —
   edges stay readable with zero glare (the old ghost fill showed banding) */
function wallTop(x, y, w, h){          // wall hanging from above: bright edge at its bottom
  ctx.fillStyle = INK;
  if (document.body.classList.contains("immersive")) ctx.fillRect(x, y + h - 2.5, w, 2.5);
  else ctx.fillRect(x, y, w, h);
}
function wallBottom(x, y, w, h){       // wall rising from below: bright edge at its top
  ctx.fillStyle = INK;
  if (document.body.classList.contains("immersive")) ctx.fillRect(x, y, w, 2.5);
  else ctx.fillRect(x, y, w, h);
}
function wallBlock(x, y, w, h){        // floating obstacle: bright outline only
  if (!document.body.classList.contains("immersive")){ ctx.fillStyle = INK; ctx.fillRect(x, y, w, h); return; }
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}
/* kite: a diamond that tilts with velocity, streaming two long tails
   drawn from the position history — the classic ribbon, with a face */
function drawRibbonHead(x, y, vx, vy){
  const s = G.s, tr = s.trail;
  // two long tails
  for (let k = 0; k < 2; k++){
    const side = k === 0 ? 1 : -1;
    for (let i = 1; i < tr.length; i++){
      const a = i / tr.length;                            // 0 = old, 1 = new
      const sway = Math.sin(G.t * 7 + i * 0.4 + k * 2.6) * 7 * (1 - a);
      const off = side * (5 + (1 - a) * 5);
      const x0 = tr[i-1].x - G.worldX, y0 = tr[i-1].y + off + sway * 0.5;
      const x1 = tr[i].x - G.worldX,   y1 = tr[i].y + off + sway * 0.5;
      ctx.strokeStyle = INK;
      ctx.globalAlpha = 0.12 + a * 0.5;
      ctx.lineWidth = 1 + 3.5 * a;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  // kite body
  const ang = Math.atan2(vy, Math.max(140, vx));
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(15, 0); ctx.lineTo(0, -10); ctx.lineTo(-12, 0); ctx.lineTo(0, 10);
  ctx.closePath(); ctx.fill();
  // spars
  ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(13, 0); ctx.lineTo(-10, 0);
  ctx.moveTo(0, -8.5); ctx.lineTo(0, 8.5);
  ctx.stroke();
  // knot
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(1, 0, 2.6, 0, 6.29); ctx.fill();
  ctx.restore();
}
function drawBird(x, y, vy, wing, sc){
  const tilt = Math.max(-0.5, Math.min(0.6, vy / 900));
  ctx.save(); ctx.translate(x, y); ctx.scale(sc || 1, sc || 1); ctx.rotate(tilt * 0.7);
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, 6.29); ctx.fill();
  // wing
  const wa = Math.sin(wing) * 0.9;
  ctx.save(); ctx.rotate(-0.5 + wa);
  ctx.beginPath(); ctx.ellipse(-3, -2, 8, 4.5, 0, 0, 6.29); ctx.fill();
  ctx.restore();
  // eye + beak
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(4, -3.5, 3.4, 0, 6.29); ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(4.8, -3.5, 1.6, 0, 6.29); ctx.fill();
  ctx.beginPath(); ctx.moveTo(10, 1); ctx.lineTo(15.5, 3.5); ctx.lineTo(10, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawHeli(x, y, rotor){
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = INK;
  // tail
  ctx.fillRect(-24, -3, 16, 5);
  ctx.fillRect(-27, -11, 5, 10);
  // body
  ctx.beginPath(); ctx.ellipse(0, 0, 17, 9, 0, 0, 6.29); ctx.fill();
  // cockpit
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.beginPath(); ctx.ellipse(6, -2, 6, 4.5, 0, 0, 6.29); ctx.fill();
  // skid
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-12, 14); ctx.lineTo(12, 14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-8, 8); ctx.lineTo(-8, 14); ctx.moveTo(8, 8); ctx.lineTo(8, 14); ctx.stroke();
  // rotor
  const rl = 24 + Math.sin(rotor * 3) * 2;
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(-rl, -13); ctx.lineTo(rl, -13); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(0, -7); ctx.stroke();
  ctx.restore();
}
function drawShip(x, y){
  ctx.save(); ctx.translate(x, y);
  // engine flame
  const fl = 10 + Math.random() * 9;
  ctx.fillStyle = INK; ctx.globalAlpha = 0.75;
  ctx.beginPath(); ctx.moveTo(-5, 12); ctx.lineTo(5, 12); ctx.lineTo(0, 12 + fl); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  // wings
  ctx.beginPath(); ctx.moveTo(-4, 2); ctx.lineTo(-15, 13); ctx.lineTo(-4, 11); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(4, 2); ctx.lineTo(15, 13); ctx.lineTo(4, 11); ctx.closePath(); ctx.fill();
  // hull
  ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(9, 10); ctx.lineTo(-9, 10); ctx.closePath(); ctx.fill();
  // cockpit
  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.beginPath(); ctx.arc(0, -2, 3.6, 0, 6.29); ctx.fill();
  ctx.restore();
}

/* ---------- flow ---------- */
function start(modeKey){
  const mode = Modes[modeKey];
  if (!mode) return;
  G.modeKey = modeKey; G.mode = mode;
  G.running = true; G.paused = false;
  G.t = 0; G.worldX = 0; G.score = 0; G.lastScore = -1;
  G.vy = 0; G.pressing = false; G.keys = {};
  G.dead = false; G.deathT = 0; G.overShown = false;
  G.parts = []; G.floats = []; G.streaks = [];
  G.phase = "countdown"; G.countT = 2.4; G.lastCount = 4;
  Sfx.engineStop(); Sfx.bossMusicStop();
  $("pauseveil").classList.add("hidden");
  show("screen-game");              // first: the canvas measures its real size…
  G.px = G.W * 0.3; G.py = G.H / 2;
  mode.reset();                     // …then the level is built for that size
  $("hud-mode").textContent = mode.label;
  $("hud-best").textContent = "BEST " + (bests[modeKey] || 0);
  updateScoreHud(true);
  Sfx.magic();
}
function die(){
  if (G.dead) return;
  G.dead = true; G.deathT = 0;
  G.pressing = false;
  Sfx.engineStop(); Sfx.bossMusicStop();
  burst(G.px, G.py, 22);
  // starburst streaks radiating from the impact point
  for (let i = 0; i < 26; i++){
    G.streaks.push({
      x:G.px, y:G.py, ang:Math.random() * 6.283,
      spd:120 + Math.random() * 280, t:0, white:Math.random() < 0.3,
    });
  }
  if (G.modeKey === "heli") Sfx.crash();   // the chopper gets its own fiery end
  else Sfx.shatter();
  setTimeout(()=>Sfx.gameover(), 120);
}
function gameOver(){
  G.running = false;
  const sc = Math.floor(G.score);
  const nb = sc > (bests[G.modeKey] || 0);
  if (nb){ bests[G.modeKey] = sc; store.set(LS.best, bests); }
  $("over-mode").textContent = G.mode.label;
  $("over-score").textContent = sc;
  $("over-best").textContent = bests[G.modeKey] || 0;
  $("over-time").textContent = fmtTime(G.t);
  $("newbest").classList.toggle("hidden", !nb);
  refreshTitleBest();
  show("screen-over");
}
function fmtTime(t){
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return m + ":" + String(s).padStart(2, "0");
}
function togglePause(){
  if (!G.running || !$("screen-game") || $("screen-game").classList.contains("hidden")) return;
  G.paused = !G.paused;
  $("pauseveil").classList.toggle("hidden", !G.paused);
  if (G.paused){ Sfx.engineStop(); Sfx.bossMusicStop(); }
  else {
    if (G.modeKey === "heli" && !G.dead && G.phase === "play") Sfx.engineStart();
    if (G.modeKey === "ship" && G.s && G.s.boss && !G.dead) Sfx.bossMusicStart();
  }
  Sfx.click();
}
function quitToMenu(){
  G.running = false; G.paused = false;
  Sfx.engineStop(); Sfx.bossMusicStop();
  $("pauseveil").classList.add("hidden");
  refreshTitleBest();
  show("screen-title");
}
function updateScoreHud(force){
  const sc = Math.floor(G.score);
  if (force || sc !== G.lastScore){
    G.lastScore = sc;
    $("hud-score").textContent = sc;
  }
}
function refreshTitleBest(){
  const ol = $("title-best");
  ol.innerHTML = "";
  for (const k of ["cave","flappy","heli","ship"]){
    const li = document.createElement("li");
    li.textContent = Modes[k].label + " — " + (bests[k] || 0);
    ol.appendChild(li);
  }
}

/* ---------- main loop ---------- */
let lastT = 0;
function frame(t){
  requestAnimationFrame(frame);
  if (!G.running) return;
  const dt = Math.min(0.033, ((t - lastT) / 1000) || 0.016);
  lastT = t;
  if (G.paused) return;
  if (!G.dead){
    if (G.phase === "countdown"){
      // 3·2·1 — world is frozen, pre-held input carries into the start
      G.countT -= dt;
      const n = Math.ceil(G.countT / 0.8);
      if (n !== G.lastCount && n >= 1 && n <= 3){ G.lastCount = n; Sfx.countBeep(); }
      if (G.countT <= 0){
        G.phase = "play";
        Sfx.whistle();
        if (G.modeKey === "heli") Sfx.engineStart();
      }
      updateParts(dt);
    } else {
      autopilot();
      G.t += dt;
      G.mode.update(dt);
      updateParts(dt);
      updateScoreHud(false);
    }
  } else {
    G.deathT += dt;
    updateParts(dt);
    if (G.deathT > 0.9 && !G.overShown){ G.overShown = true; gameOver(); }
  }
  draw();
}
function draw(){
  ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
  ctx.clearRect(0, 0, G.W, G.H);
  ctx.save();
  // impact shake on death
  if (G.dead && G.deathT < 0.45){
    const m = 7 * (1 - G.deathT / 0.45);
    ctx.translate((Math.random() - 0.5) * 2 * m, (Math.random() - 0.5) * 2 * m);
  }
  if (G.s) G.mode.draw();
  drawParts();
  ctx.restore();
  if (G.phase === "countdown" && !G.dead) drawCountdown();
}
/* big 3·2·1 over the frozen opening frame — paper halo keeps it
   readable even when a wall sits right behind the digit */
function drawCountdown(){
  const n = Math.max(1, Math.ceil(G.countT / 0.8));
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "84px 'DSEG7-Classic', monospace";
  ctx.lineWidth = 10; ctx.strokeStyle = PAPER;
  ctx.globalAlpha = 0.94;
  ctx.strokeText(String(n), G.W / 2, G.H / 2 - 6);
  ctx.fillStyle = INK;
  ctx.fillText(String(n), G.W / 2, G.H / 2 - 6);
  ctx.font = "17px 'DotGothic16', monospace";
  ctx.globalAlpha = 0.8;
  const sub = (G.mode && G.mode.sub) || "";
  ctx.lineWidth = 5; ctx.strokeStyle = PAPER;
  ctx.strokeText("GET READY", G.W / 2, G.H / 2 + 36);
  ctx.fillText("GET READY", G.W / 2, G.H / 2 + 36);
  if (sub){
    ctx.font = "15px 'DotGothic16', monospace";
    ctx.strokeText(sub, G.W / 2, G.H / 2 + 60);
    ctx.fillText(sub, G.W / 2, G.H / 2 + 60);
  }
  ctx.restore();
}

/* ---------- autopilot (demo hook: ?mode=cave&auto=1) ---------- */
const QS = new URLSearchParams(location.search);
const AUTO = QS.get("auto") === "1";
function autopilot(){
  if (!AUTO) return;
  const s = G.s, pxw = G.worldX + G.px;
  if (G.modeKey === "cave" || G.modeKey === "heli"){
    let gc = G.H / 2;
    if (G.modeKey === "cave"){
      const ahead = pxw + 80; // look ahead: the wall you steer toward, not the one you're in
      for (const sg of s.segs) if (sg.x <= ahead && ahead < sg.x + COLW){ gc = (sg.top + sg.bot) / 2; break; }
    } else {
      // heli: dodge the nearest block ahead
      for (const b of s.blocks){
        if (b.x + b.w > pxw && b.x < pxw + 150){
          const bc = b.y + b.h / 2;
          gc = (G.py < bc) ? Math.max(70, b.y - 80) : Math.min(G.H - 70, b.y + b.h + 80);
          break;
        }
      }
    }
    // PD-style feathering: press early when falling fast, release early when rising fast
    const err = G.py - gc;
    if (err > 12 || (err > -8 && G.vy > 170)) G.pressing = true;
    else if (err < -12 || (err < 8 && G.vy < -170)) G.pressing = false;
  } else if (G.modeKey === "flappy"){
    for (const p of s.pipes){
      if (p.x + 64 > pxw){ if (G.py > p.gy + 6 && G.vy > -80) G.mode.press(); break; }
    }
  } else if (G.modeKey === "ship"){
    s.tx = G.W/2 + Math.sin(G.t * 1.6) * G.W * 0.32;
    s.ty = G.H * 0.62 + Math.cos(G.t * 1.1) * 40;
  }
}

/* ---------- immersive mode ---------- */
function enterImmersive(){
  document.body.classList.add("immersive");
  try {
    const el = document.documentElement;
    if (el.requestFullscreen) { const p = el.requestFullscreen(); if (p && p.catch) p.catch(()=>{}); }
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch(e){}
  refreshInk(); fit();
  Sfx.click();
}
function exitImmersive(){
  document.body.classList.remove("immersive");
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
  } catch(e){}
  refreshInk(); fit();
  Sfx.click();
}
function toggleImmersive(){
  document.body.classList.contains("immersive") ? exitImmersive() : enterImmersive();
}
function syncImmersiveClass(){
  if (!document.fullscreenElement && !document.webkitFullscreenElement)
    document.body.classList.remove("immersive");
  refreshInk(); fit();
}
document.addEventListener("fullscreenchange", syncImmersiveClass);
document.addEventListener("webkitfullscreenchange", syncImmersiveClass);

/* ---------- input ---------- */
function canvasPos(e){
  const r = cv.getBoundingClientRect();
  return { x:(e.clientX - r.left) / r.width * G.W, y:(e.clientY - r.top) / r.height * G.H };
}
function bindInput(){
  const wrap = $("canvas-wrap");

  cv.addEventListener("pointerdown", e => {
    e.preventDefault();
    Sfx.unlock();
    if (!G.running || G.paused || G.dead) return;
    try { cv.setPointerCapture(e.pointerId); } catch(err){}
    const p = canvasPos(e);
    if (G.modeKey === "ship") G.mode.press(p.x, p.y);
    else if (G.modeKey === "flappy") G.mode.press();
    else G.mode.press();
  });
  cv.addEventListener("pointermove", e => {
    if (!G.running || G.paused || G.dead) return;
    if (G.modeKey === "ship" && G.s.dragging){
      const p = canvasPos(e);
      G.mode.move(p.x, p.y);
    }
  });
  const up = () => { if (G.mode && G.mode.release) G.mode.release(); };
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);

  /* touch hardening: nothing on the canvas may scroll, zoom, or call out the OS */
  const noTouch = e => { e.preventDefault(); };
  ["touchstart","touchmove","touchend","touchcancel"].forEach(ev =>
    wrap.addEventListener(ev, noTouch, { passive:false }));

  window.addEventListener("keydown", e => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW"){
      e.preventDefault();
      Sfx.unlock();
      if (G.running && !G.paused && !G.dead && !e.repeat){
        if (G.modeKey === "ship"){ /* ship steers by drag/arrows only */ }
        else if (G.modeKey === "flappy") G.mode.press();
        else G.mode.press();
      }
    }
    if (["ArrowLeft","ArrowRight","ArrowDown","KeyA","KeyS","KeyD"].includes(e.code)){
      G.keys[e.code] = true; e.preventDefault();
    }
    if (e.code === "KeyP") togglePause();
    if (e.code === "KeyM") toggleMute();
    if (e.code === "Escape"){
      if (document.body.classList.contains("immersive")) exitImmersive();
      else if (G.running && !G.paused) togglePause();
    }
  });
  window.addEventListener("keyup", e => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW"){
      if (G.mode && G.mode.release) G.mode.release();
    }
    delete G.keys[e.code];
  });

  /* page-level: kill pull-to-refresh, pinch-zoom, double-tap zoom, context menu */
  document.addEventListener("touchmove", e => e.preventDefault(), { passive:false });
  document.addEventListener("gesturestart", e => e.preventDefault());
  document.addEventListener("dblclick", e => e.preventDefault());
  document.addEventListener("contextmenu", e => {
    if (e.target.closest("#lcd")) e.preventDefault();
  });
  document.addEventListener("visibilitychange", ()=>{
    if (document.hidden && G.running && !G.paused) togglePause();
  });
  window.addEventListener("pointerdown", ()=>Sfx.unlock(), { once:true });
}

/* ---------- mute ---------- */
function toggleMute(){
  settings.muted = !settings.muted;
  store.set(LS.settings, settings);
  Sfx.setMuted(settings.muted);
  if (settings.muted){ Sfx.engineStop(); Sfx.bossMusicStop(); }
  else {
    if (G.running && !G.paused && G.modeKey === "heli" && !G.dead && G.phase === "play") Sfx.engineStart();
    if (G.running && !G.paused && G.modeKey === "ship" && G.s && G.s.boss && !G.dead) Sfx.bossMusicStart();
  }
  applyMuteUI();
}
function applyMuteUI(){
  $("ico-snd-on").classList.toggle("hidden", settings.muted);
  $("ico-snd-off").classList.toggle("hidden", !settings.muted);
  $("key-sound").classList.toggle("off", settings.muted);
  $("btn-sound-toggle").textContent = "SOUND: " + (settings.muted ? "OFF" : "ON");
}

/* ---------- bindings ---------- */
function bindUI(){
  document.querySelectorAll(".mode-btn").forEach(b =>
    b.addEventListener("click", ()=>{ Sfx.unlock(); start(b.dataset.mode); }));

  $("btn-immersive").addEventListener("click", toggleImmersive);
  $("btn-gfull").addEventListener("click", toggleImmersive);
  $("btn-gpause").addEventListener("click", togglePause);
  $("btn-how").addEventListener("click", ()=>{ Sfx.click(); show("screen-help"); });
  $("btn-help-back").addEventListener("click", ()=>{ Sfx.click(); quitToMenu(); });
  $("btn-settings").addEventListener("click", ()=>{ Sfx.click(); show("screen-settings"); });
  $("btn-set-back").addEventListener("click", ()=>{ Sfx.click(); quitToMenu(); });

  $("btn-again").addEventListener("click", ()=>start(G.modeKey));
  $("btn-modes").addEventListener("click", ()=>{ Sfx.click(); quitToMenu(); });
  $("btn-menu2").addEventListener("click", ()=>{ Sfx.click(); quitToMenu(); });

  $("btn-resume").addEventListener("click", togglePause);
  $("btn-restart").addEventListener("click", ()=>start(G.modeKey));
  $("btn-quit").addEventListener("click", quitToMenu);

  $("key-home").addEventListener("click", ()=>{ Sfx.click(); quitToMenu(); });
  $("key-pause").addEventListener("click", togglePause);
  $("key-sound").addEventListener("click", toggleMute);
  $("key-help").addEventListener("click", ()=>{ Sfx.click(); show("screen-help"); });

  $("btn-sound-toggle").addEventListener("click", toggleMute);

  // theme swatches
  const sw = $("theme-swatches");
  const lcdCols = { "":"#d3ead9,#bcd9c2", ocean:"#d2e9ec,#b2d6da", sunset:"#f4e8cb,#e6d3a8",
                    gameboy:"#a8bd6e,#8b9f59", sakura:"#f6e2e9,#e9c7d4" };
  THEMES.forEach(t => {
    const b = document.createElement("button");
    b.className = "swatch"; b.dataset.id = t.id;
    b.style.background = `linear-gradient(135deg, ${lcdCols[t.id]})`;
    b.innerHTML = `<span class="sw-name">${t.name}</span>`;
    b.addEventListener("click", ()=>{ Sfx.click(); applyTheme(t.id); });
    sw.appendChild(b);
  });

  // brand name
  const bi = $("brand-input");
  bi.value = settings.brand || "";
  const applyBrand = ()=>{
    const v = (bi.value || "").trim().toUpperCase() || "CaLBoY";
    $("brand-name").textContent = v;
    settings.brand = bi.value; store.set(LS.settings, settings);
  };
  bi.addEventListener("input", applyBrand);
  $("brand-reset").addEventListener("click", ()=>{ bi.value = ""; applyBrand(); Sfx.click(); });
  if (settings.brand) $("brand-name").textContent = settings.brand.trim().toUpperCase();
}

/* ---------- boot ---------- */
function boot(){
  Sfx.setMuted(!!settings.muted);
  applyTheme(settings.theme || "");
  applyMuteUI();
  bindInput();
  bindUI();
  refreshTitleBest();
  show("screen-title");
  fit();
  window.addEventListener("resize", fit);
  window.addEventListener("orientationchange", ()=>setTimeout(fit, 120));
  if (window.visualViewport) visualViewport.addEventListener("resize", fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  requestAnimationFrame(frame);

  // demo hook for QA screenshots: ?mode=cave&auto=1
  const m = QS.get("mode");
  if (m && Modes[m]){
    // wait a tick so the canvas has real dimensions
    setTimeout(()=>{ if (AUTO) start(m); }, 350);
  }
}
document.addEventListener("DOMContentLoaded", boot);
