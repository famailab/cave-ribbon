/* ============ DROP 7 MAGIC — retro SFX (Web Audio, no assets) ============ */
const Sfx = (() => {
  let ctx = null, master = null;
  let muted = false;

  function ac() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function env(g, t0, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  // generic blip: square/triangle osc with pitch envelope
  function blip({ f0 = 440, f1 = null, type = "square", dur = 0.08, vol = 0.25, delay = 0 }) {
    if (muted) return;
    try {
      const c = ac(), t0 = c.currentTime + delay;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t0);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      env(g, t0, 0.005, vol, dur);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + dur + 0.05);
    } catch (e) { /* audio unavailable */ }
  }
  // tiny noise burst for cracks/shatters
  function noise({ dur = 0.06, vol = 0.2, delay = 0, hp = 1200 }) {
    if (muted) return;
    try {
      const c = ac(), t0 = c.currentTime + delay;
      const len = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
      const g = c.createGain(); g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t0);
    } catch (e) { /* audio unavailable */ }
  }

  return {
    setMuted(m) { muted = !!m; if (muted) this.bossMusicStop(); },
    isMuted() { return muted; },
    unlock() { try { ac(); } catch (e) {} },           // call on first user gesture
    click()  { blip({ f0: 660, f1: 520, type: "square", dur: 0.05, vol: 0.15 }); },
    move()   { blip({ f0: 880, type: "square", dur: 0.03, vol: 0.08 }); },
    drop()   { blip({ f0: 300, f1: 140, type: "triangle", dur: 0.1, vol: 0.3 }); },
    deny()   { blip({ f0: 160, f1: 110, type: "sawtooth", dur: 0.12, vol: 0.2 }); },
    pop(chain) {
      const base = 420 * Math.pow(1.25, Math.min(chain, 8));
      blip({ f0: base, f1: base * 1.6, type: "square", dur: 0.09, vol: 0.28 });
      blip({ f0: base * 2, type: "triangle", dur: 0.06, vol: 0.12, delay: 0.03 });
    },
    crack()  { noise({ dur: 0.07, vol: 0.25, hp: 900 }); blip({ f0: 220, f1: 140, type: "square", dur: 0.06, vol: 0.15 }); },
    shatter(){ noise({ dur: 0.14, vol: 0.3, hp: 600 }); },
    reveal() { blip({ f0: 520, f1: 1040, type: "triangle", dur: 0.12, vol: 0.25 }); blip({ f0: 1040, f1: 1560, type: "square", dur: 0.09, vol: 0.12, delay: 0.09 }); },
    levelup(){ [523, 659, 784, 1047].forEach((f, i) => blip({ f0: f, type: "square", dur: 0.1, vol: 0.22, delay: i * 0.09 })); },
    gameover(){ [392, 330, 262, 196].forEach((f, i) => blip({ f0: f, type: "triangle", dur: 0.18, vol: 0.28, delay: i * 0.16 })); },
    fanfare(){ [523, 659, 784].forEach((f, i) => blip({ f0: f, type: "square", dur: 0.09, vol: 0.2, delay: i * 0.08 })); },
    bonus()  { [1047, 1319].forEach((f, i) => blip({ f0: f, type: "triangle", dur: 0.08, vol: 0.22, delay: i * 0.06 })); },
    /* countdown: low beeps for 3·2·1, then a pea-whistle to start */
    countBeep(){ blip({ f0: 660, type: "square", dur: 0.09, vol: 0.22 }); },
    whistle(){
      blip({ f0: 1700, f1: 2500, type: "square", dur: 0.13, vol: 0.24 });
      blip({ f0: 2100, f1: 2950, type: "square", dur: 0.24, vol: 0.24, delay: 0.12 });
    },
    /* helicopter crash: tumbling engine + impact noise, distinct from the generic shatter */
    crash(){
      blip({ f0: 320, f1: 55, type: "sawtooth", dur: 0.55, vol: 0.32 });
      blip({ f0: 160, f1: 40, type: "square", dur: 0.5, vol: 0.2, delay: 0.08 });
      noise({ dur: 0.35, vol: 0.34, hp: 300 });
      noise({ dur: 0.2, vol: 0.2, delay: 0.3, hp: 900 });
    },
    /* boss warning alarm */
    alarm(){ [880, 660, 880].forEach((f, i) => blip({ f0: f, type: "square", dur: 0.12, vol: 0.24, delay: i * 0.14 })); },
    /* longer original combo-celebration jingle for chain x7 (~2.2s): bouncy major-key
       call & response over a driving drum track (synthesized kick/snare/hats) */
    combo(){
      const lead = [ // [freq, start, dur]
        [659,0.00,.11],[784,0.11,.11],[1047,0.22,.11],[1319,0.33,.13],
        [1568,0.48,.11],[1319,0.59,.11],[1568,0.70,.11],[1319,0.81,.13],
        [1047,0.96,.11],[784,1.07,.11],[880,1.18,.11],[1047,1.29,.13],
        [1175,1.44,.11],[1319,1.55,.11],[1568,1.66,.11],[2093,1.77,.30]
      ];
      lead.forEach(([f,t,d])=>blip({ f0:f, type:"square", dur:d, vol:0.20, delay:t }));
      const bass = [ // bouncing bassline underneath
        [262,0.00],[262,0.22],[294,0.44],[330,0.66],[349,0.88],[392,1.10],[440,1.32],[523,1.54]
      ];
      bass.forEach(([f,t])=>blip({ f0:f, type:"triangle", dur:0.16, vol:0.14, delay:t }));
      [2093,2637].forEach((f,i)=>blip({ f0:f, type:"triangle", dur:0.22, vol:0.10, delay:1.80+i*0.13 }));
      // --- drums: four-on-the-floor kicks, backbeat snare, driving hats ---
      const kick  = (t)=>blip({ f0:150, f1:44, type:"sine", dur:0.14, vol:0.55, delay:t });
      const snare = (t)=>{ noise({ dur:0.09, vol:0.32, delay:t, hp:1800 });
                           blip({ f0:190, type:"triangle", dur:0.06, vol:0.20, delay:t }); };
      const hat   = (t)=>noise({ dur:0.03, vol:0.10, delay:t, hp:6500 });
      const beats = [0,0.27,0.54,0.81,1.08,1.35,1.62,1.89];
      beats.forEach(kick);
      [0.54,1.08,1.62].forEach(snare);
      beats.forEach((t,i)=>{ hat(t); if(i<beats.length-1) hat(t+0.135); });
    },
    magic()  { [880, 1175, 1568, 2093].forEach((f, i) => blip({ f0: f, type: "triangle", dur: 0.09, vol: 0.16, delay: i * 0.06 })); },
    shiftSfx(d){ if(d===0){ blip({ f0: 440, type: "square", dur: 0.07, vol: 0.18 }); return; }
      blip({ f0: d>0?300:900, f1: d>0?900:300, type: "square", dur: 0.16, vol: 0.22 }); },
    peekSfx(){ [1047, 1319, 1568].forEach((f, i) => blip({ f0: f, type: "sine", dur: 0.12, vol: 0.18, delay: i * 0.07 })); },
    cycleSfx(){ [660, 660, 880].forEach((f, i) => blip({ f0: f, type: "square", dur: 0.05, vol: 0.16, delay: i * 0.07 })); },
    unifySfx(){ [196, 247, 294].forEach((f) => blip({ f0: f, type: "square", dur: 0.22, vol: 0.16 })); },
    /* ---- helicopter engine rumble: persistent detuned low oscillators ---- */
    _eng:null,
    engineStart(){
      if (muted || this._eng) return;
      try {
        const c = ac();
        const g = c.createGain();
        g.gain.value = 0.0001;
        g.gain.setTargetAtTime(0.05, c.currentTime, 0.5);
        const o1 = c.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = 52;
        const o2 = c.createOscillator(); o2.type = "square";   o2.frequency.value = 104;
        const g2 = c.createGain(); g2.gain.value = 0.35;
        const lfo = c.createOscillator(); lfo.frequency.value = 7;   // rotor wobble
        const lg = c.createGain(); lg.gain.value = 7;
        lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
        o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(master);
        o1.start(); o2.start(); lfo.start();
        this._eng = { g, o1, o2, lfo };
      } catch(e){}
    },
    engineStop(){
      const e = this._eng;
      if (!e) return;
      this._eng = null;
      try {
        const c = ac();
        e.g.gain.setTargetAtTime(0.0001, c.currentTime, 0.12);
        setTimeout(()=>{ try { e.o1.stop(); e.o2.stop(); e.lfo.stop(); } catch(_){} }, 500);
      } catch(_){}
    },
    /* ---- boss battle music: vast mysterious cosmos + heart-pounding tension ----
       Generative A-minor sequencer at 104 BPM: deep space drone, heartbeat kick,
       driving bass, sparse eerie lead with vibrato, distant sonar ticks. */
    _boss:null,
    bossMusicStart(){
      if (muted || this._boss) return;
      try {
        const c = ac(), t0 = c.currentTime + 0.06;
        // deep space drone: detuned triangles + sub sine, slow cosmic swell
        const dg = c.createGain(); dg.gain.value = 0.0001;
        dg.gain.setTargetAtTime(0.055, t0, 1.2);
        const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 200;
        const mk = (type, f) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.connect(lp); o.start(t0); return o; };
        const d1 = mk("triangle", 55), d2 = mk("triangle", 55 * 1.008), d3 = mk("sine", 110.4);
        lp.connect(dg); dg.connect(master);
        const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
        const lg = c.createGain(); lg.gain.value = 0.028;
        lfo.connect(lg); lg.connect(dg.gain); lfo.start(t0);
        const B = this._boss = { step:0, nextT:t0, drone:{ d1, d2, d3, lfo, dg }, timer:0 };
        B.timer = setInterval(() => this._bossTick(), 120);
      } catch(e){}
    },
    bossMusicStop(){
      const B = this._boss;
      if (!B) return;
      this._boss = null;
      try {
        clearInterval(B.timer);
        const c = ac(), ds = B.drone;
        ds.dg.gain.setTargetAtTime(0.0001, c.currentTime, 0.25);
        setTimeout(() => { try { ds.d1.stop(); ds.d2.stop(); ds.d3.stop(); ds.lfo.stop(); } catch(_){} }, 900);
      } catch(_){}
    },
    _bossTick(){
      const B = this._boss;
      if (!B || muted){ this.bossMusicStop(); return; }
      try {
        const c = ac(), SPB = 60 / 104 / 2;   // 8th note at 104 BPM
        while (B.nextT < c.currentTime + 0.35){
          this._bossStep(B.step, B.nextT);
          B.nextT += SPB; B.step++;
        }
      } catch(e){}
    },
    _bossStep(s, t){
      const c = ac();
      const bar = Math.floor(s / 8) % 4, sub = s % 8;
      const roots = [55, 43.65, 65.41, 82.41];   // A1 F1 C2 E2 — dark 4-bar loop
      const tone = (type, f0, f1, dur, vol, dest) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.setValueAtTime(f0, t);
        if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        env(g, t, 0.008, vol, dur);
        o.connect(g); g.connect(dest || master);
        o.start(t); o.stop(t + dur + 0.05);
      };
      // heartbeat kick on quarters — lub-dub, step by careful step
      if (sub % 2 === 0) tone("sine", 72, 38, 0.14, sub % 4 === 0 ? 0.5 : 0.32);
      // driving bass, octave hop at the end of each bar
      const blp = c.createBiquadFilter(); blp.type = "lowpass"; blp.frequency.value = 320;
      blp.connect(master);
      tone("sawtooth", roots[bar] * (sub === 6 ? 2 : 1), null, 0.2, 0.15, blp);
      // offbeat tick: distant sonar in the void
      if (sub % 2 === 1){
        const len = Math.floor(c.sampleRate * 0.03);
        const buf = c.createBuffer(1, len, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = c.createBufferSource(); src.buffer = buf;
        const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7000;
        const g = c.createGain(); g.gain.value = 0.035;
        src.connect(hp); hp.connect(g); g.connect(master);
        src.start(t);
      }
      // eerie lead: sparse high notes wandering the A-minor sky
      if (sub === 0 || sub === 5){
        const scale = [440, 523.25, 587.33, 659.26, 880];
        const n = scale[(bar * 2 + sub) % scale.length] * (sub === 5 ? 1.5 : 1);
        const o = c.createOscillator(), g = c.createGain();
        o.type = "sine"; o.frequency.value = n;
        const vib = c.createOscillator(); vib.frequency.value = 5.5;
        const vg = c.createGain(); vg.gain.value = n * 0.012;
        vib.connect(vg); vg.connect(o.frequency);
        env(g, t, 0.05, 0.07, 0.9);
        o.connect(g); g.connect(master);
        o.start(t); vib.start(t); o.stop(t + 1.1); vib.stop(t + 1.1);
      }
    },
  };
})();
