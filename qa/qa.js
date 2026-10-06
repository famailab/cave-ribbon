/* Minimal headless QA for cave-ribbon. Boot, run all 4 modes with the
   built-in autopilot (?auto=1), force boss spawn+kill to exercise the
   difficulty ramp, and render one immersive frame per wall mode. */
"use strict";
const fs = require("fs");
const vm = require("vm");

function makeEl(id, w = 386, h = 470) {
  const cls = new Set();
  return {
    id, style: {}, dataset: {}, _text: "", _html: "", value: "",
    classList: {
      add: (...a) => a.forEach(x => cls.add(x)),
      remove: (...a) => a.forEach(x => cls.delete(x)),
      toggle: (c, f) => { if (f === undefined) { cls.has(c) ? cls.delete(c) : cls.add(c); } else { f ? cls.add(c) : cls.delete(c); } },
      contains: c => cls.has(c),
    },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, setPointerCapture() {},
    get textContent() { return this._text; }, set textContent(v) { this._text = String(v); },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
    clientWidth: w, clientHeight: h, offsetWidth: w, offsetHeight: h,
    closest: () => null,
  };
}
const ctxStub = new Proxy({}, {
  get(t, p) { if (p === "canvas") return null; if (!(p in t)) t[p] = (...a) => {}; return t[p]; },
  set(t, p, v) { t[p] = v; return true; },
});
const els = {};
function getEl(id) {
  if (!els[id]) {
    const dims = id === "calc" ? [430, 860] : id === "stage" ? [430, 860]
      : id === "canvas-wrap" ? [386, 472] : [386, 470];
    els[id] = makeEl(id, dims[0], dims[1]);
  }
  return els[id];
}
getEl("game-canvas").getContext = () => ctxStub;

const listeners = {};
const fakeLS = {
  "caveribbon.settings": JSON.stringify({ muted: true, theme: "", brand: "" }),
  "caveribbon.best": JSON.stringify({ cave: 0, flappy: 0, heli: 0, ship: 0 }),
};
const rafBox = { cb: null };
const sandbox = {
  console, URLSearchParams, listeners, process, rafBox,
  setTimeout: (fn) => 0, clearTimeout: () => {},
  requestAnimationFrame: (cb) => { rafBox.cb = cb; return 1; },
  location: { search: "?mode=cave&auto=1" },
  localStorage: {
    getItem: k => (k in fakeLS ? fakeLS[k] : null),
    setItem: (k, v) => { fakeLS[k] = String(v); },
    removeItem: k => { delete fakeLS[k]; },
  },
  getComputedStyle: () => ({ getPropertyValue: (n) => n === "--ink" ? "#2b3a2e" : n === "--paper" ? "#cfe5d4" : "" }),
  devicePixelRatio: 2,
  addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
  removeEventListener() {},
  innerWidth: 480, innerHeight: 920,
};
sandbox.window = sandbox;
sandbox.document = {
  getElementById: getEl,
  querySelectorAll: () => [], querySelector: () => null,
  createElement: () => makeEl("x"), body: getEl("body"),
  addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
};

const dir = "/home/hatch/workspace/cave-ribbon/js/";
const src = fs.readFileSync(dir + "audio.js", "utf8") + "\n" + fs.readFileSync(dir + "game.js", "utf8");
const driver = `
;(function(){
  let failures = 0;
  const ok = (name, cond, extra) => {
    console.log((cond ? "PASS " : "FAIL ") + name + (extra ? " — " + extra : ""));
    if (!cond) failures++;
  };
  (listeners["DOMContentLoaded"] || []).forEach(fn => fn());
  let t = 0;
  const frames = (n) => { for (let i = 0; i < n; i++) { t += 16.7; rafBox.cb(t); } };
  ok("boot", typeof start === "function" && rafBox.cb);
  // all four modes with autopilot (death mid-run is fine — exceptions are not)
  for (const m of ["cave", "flappy", "heli", "ship"]) {
    try {
      start(m); frames(160); frames(600);
      ok(m + " runs", true, "score=" + Math.floor(G.score) + " dead=" + G.dead);
      quitToMenu();
    } catch (e) { ok(m + " runs", false, e.message); }
  }
  // immersive wall rendering for cave/flappy/heli (no throw, uses wallTop/wallBottom/wallBlock)
  document.getElementById("body").classList.add("immersive");
  refreshInk();
  for (const m of ["cave", "flappy", "heli"]) {
    try { start(m); frames(160); frames(120); ok(m + " immersive draw", true); quitToMenu(); }
    catch (e) { ok(m + " immersive draw", false, e.message); }
  }
  document.getElementById("body").classList.remove("immersive");
  refreshInk();
  // ship boss + difficulty ramp
  try {
    start("ship"); frames(160);
    const M = Modes.ship;
    M.spawnBoss(G.s);
    const hp0 = G.s.boss.hp;
    ok("boss spawns", hp0 === 40, "hp=" + hp0);
    // simulate player bullets chewing the boss down
    let guard = 0;
    while (G.s.boss && guard++ < 500) {
      G.s.bullets.push({ x: G.s.boss.x, y: G.s.boss.y, vx: 0 });
      frames(1);
    }
    ok("boss dies", !G.s.boss, "guard=" + guard);
    ok("diff ramped", G.s.diff === 1, "diff=" + G.s.diff);
    // verify ramped params on next spawns
    M.spawnRock(G.s);
    const rock = G.s.rocks[G.s.rocks.length - 1];
    ok("rock faster", rock.vy > 135, "vy=" + rock.vy.toFixed(0));
    G.t = 20; G.s.droneT = 0;
    frames(1);
    const d = G.s.drones[G.s.drones.length - 1];
    ok("drone spawned", !!d, d ? "hp=" + d.hp : "");
    // second boss is tougher
    M.spawnBoss(G.s);
    ok("boss scales with diff", G.s.boss.hp > hp0, "hp=" + G.s.boss.hp);
    quitToMenu();
  } catch (e) { ok("boss/diff", false, e.message + " | " + e.stack.split("\\n")[1]); }
  console.log(failures === 0 ? "ALL QA CHECKS PASSED" : failures + " FAILURES");
  process.exit(failures ? 1 : 0);
})();
`;
try {
  vm.runInContext(src + "\n" + driver, vm.createContext(sandbox), { filename: "qa.js" });
} catch (e) {
  console.log("FATAL", e.message);
  process.exit(1);
}
