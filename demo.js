/* World4Refiner interactive player.
   t < 0 : real front-camera observations (2 Hz cache, crossfaded playback).
   t >= 0: geometry replay of the planner's own cached prediction — the base
           ghost and the certified edit are drawn from exported rollouts, never
           from future observations.  Labelled as such on screen. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const frontCv = $("#p-front"), bevCv = $("#p-bev"), gapCv = $("#gap-cv");
  if (!frontCv || !bevCv || !gapCv) return;

  const DT = 0.1, NF = 41, T_END = 4.0;
  const EGO_L = 4.6, EGO_W = 1.9, BOX_H = 1.45;
  const PITCH = 12 * Math.PI / 180, HFOV = 62 * Math.PI / 180;
  const EN = document.documentElement.lang === "en";
  const L = (zh, en) => (EN ? en : zh);
  const AB = (window.ASSET_BASE || "assets") + "/demo/";

  const S = {
    list: [], i: 0, d: null, t: 0, playing: false, speed: 0.5, loop: true, pillBottom: 64,
    hold: 0, last: 0, raf: 0, cams: [], camN: 0, agTracks: [], camTimes: [],
    tog: { fan: true, base: true, trails: true, map: true },
  };

  const dark = () => document.documentElement.dataset.theme === "dark";
  function pal() {
    return dark() ? {
      bg: "#0d1420", ground: "#161e2c", asphalt: "#222b3b", edge: "#3c4a61", lane: "#93a6c4",
      walk: "#2e394d", agent: "#7d90ad", agentTop: "#9db0cb",
      conflict: "#ff6b7a", conflictTop: "#ff98a2", base: "#ff6b7a", edit: "#6ea8ff", good: "#2fd39a",
      warn: "#ffb454", ink: "#eaf0fa", dim: "#94a4be",
      sky0: "#0a1120", sky1: "#20304a", hood: "#3b6fd4", trail: "#b39df9",
    } : {
      bg: "#eef1f7", ground: "#aeb9cd", asphalt: "#d2d8e4", edge: "#96a2b8", lane: "#ffffff",
      walk: "#c4cddc", agent: "#5b6b85", agentTop: "#7b8ba4",
      conflict: "#d8404f", conflictTop: "#e86a78", base: "#d8404f", edit: "#2f6feb", good: "#128f63",
      warn: "#c07a17", ink: "#17233b", dim: "#5a6a86",
      sky0: "#a9c8ea", sky1: "#e6f0fa", hood: "#2f6feb", trail: "#6d5ae0",
    };
  }

  /* ---------- canvas sizing ---------- */
  const SZ = new Map();
  function fit(cv) {
    const r = cv.parentElement.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(80, r.width), h = Math.max(80, r.height);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    SZ.set(cv, { w, h, dpr });
  }
  function fitAll() { [frontCv, bevCv, gapCv].forEach(fit); }
  const ctxOf = (cv) => {
    const s = SZ.get(cv), c = cv.getContext("2d");
    c.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    return [c, s.w, s.h];
  };

  /* ---------- small helpers ---------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, f) => a + (b - a) * f;
  const ease = (f) => f * f * (3 - 2 * f);
  /* Catmull-Rom through the cached 10 Hz samples: C1-continuous position and
     heading, so the replay glides instead of stepping between rollout frames. */
  function cr1(p0, p1, p2, p3, f) {
    const t2 = f * f, t3 = t2 * f;
    return 0.5 * (2 * p1 + (p2 - p0) * f +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
  }
  const TAU = Math.PI * 2;
  const nearAng = (a, ref) => a + Math.round((ref - a) / TAU) * TAU;
  function poseAt(arr, t) {
    const u = clamp(t / DT, 0, NF - 1);
    const k = clamp(Math.floor(u), 0, NF - 2), f = u - k;
    const p0 = arr[Math.max(k - 1, 0)], p1 = arr[k];
    const p2 = arr[k + 1], p3 = arr[Math.min(k + 2, NF - 1)];
    return [cr1(p0[0], p1[0], p2[0], p3[0], f),
      cr1(p0[1], p1[1], p2[1], p3[1], f),
      cr1(nearAng(p0[2], p1[2]), p1[2], nearAng(p2[2], p1[2]),
        nearAng(p3[2], p1[2]), f)];
  }
  /* same spline over the non-uniform 2 Hz observation timestamps */
  function trackAt(times, arr, t) {
    let j = 0;
    for (let k = 0; k < times.length; k++) if (times[k] <= t + 1e-6) j = k;
    const j2 = Math.min(j + 1, times.length - 1);
    const f = j2 === j ? 0 : clamp((t - times[j]) / (times[j2] - times[j]), 0, 1);
    const p0 = arr[Math.max(j - 1, 0)], p1 = arr[j];
    const p2 = arr[j2], p3 = arr[Math.min(j2 + 1, arr.length - 1)];
    return [cr1(p0[0], p1[0], p2[0], p3[0], f),
      cr1(p0[1], p1[1], p2[1], p3[1], f),
      cr1(nearAng(p0[2], p1[2]), p1[2], nearAng(p2[2], p1[2]),
        nearAng(p3[2], p1[2]), f)];
  }
  const valAt = (arr, t) => {
    const u = clamp(t / DT, 0, NF - 1), k = Math.floor(u);
    return lerp(arr[k], arr[Math.min(k + 1, NF - 1)], u - k);
  };
  const fmt = (v) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2);
  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function pill(c, x, y, text, fg, bg) {
    c.font = "600 12px Inter, sans-serif";
    const w = c.measureText(text).width + 16;
    rr(c, x - w / 2, y - 11, w, 22, 11);
    c.fillStyle = bg; c.fill();
    c.fillStyle = fg; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(text, x, y + 1);
    return w;
  }

  /* ---------- scene loading ---------- */
  function loadScene(i) {
    S.i = i;
    const e = S.list[i];
    fetch(AB + e.file).then((r) => r.json()).then((d) => {
      if (S.list[S.i] !== e) return;
      S.d = d; S.t = -d.t_past; S.hold = 0; S.cams = []; S.camN = 0;
      S.agTracks = d.ag_pose[0].map((_, m) => d.ag_pose.map((row) => row[m]));
      S.camTimes = d.cam.map((c) => c.t);
      d.cam.forEach((c) => {
        const im = new Image();
        im.onload = () => { S.camN++; };
        im.src = AB + c.f;
        S.cams.push(im);
      });
      const sc = $("#p-scrub");
      sc.min = String(-Math.round(d.t_past * 10)); sc.max = "40";
      sc.value = sc.min;
      $("#p-zero").style.left = (d.t_past / (d.t_past + T_END) * 100) + "%";
      buildStrip(d);
      document.querySelectorAll("#p-tabs button").forEach((b, j) =>
        b.classList.toggle("on", j === i));
      $("#pill-gap").textContent = fmt(d.gap_base) + " → " + fmt(d.gap_edit) + " m";
      $("#pill-coll").textContent = d.coll_base + " → " + d.coll_edit + L(" 帧", " frames");
      const dp = d.prog_edit - d.prog_base;
      $("#pill-prog").textContent = (dp >= 0 ? "+" : "−") + Math.abs(dp).toFixed(2) + " m";
      $("#pill-fam").textContent = EN ? (d.label_en || d.label) : d.label;
      $("#scene-title").textContent = L("场景 ", "Scene ") + (i + 1) + " · " +
        (EN ? (d.label_en || d.label) : d.label) +
        L(" · 基线间隙 ", " · base gap ") + fmt(d.gap_base) + " m";
      $("#scene-sub").textContent = d.map + " · token " + d.token.slice(0, 8) +
        L(" · 最紧帧 t=", " · tightest frame t=") + (d.tstar * DT).toFixed(1) + " s";
      render();
    });
  }
  function buildStrip(d) {
    const el = $("#p-strip");
    el.innerHTML = "";
    const cap = document.createElement("span");
    cap.className = "cap";
    cap.textContent = L("决策前的真实观测（2 Hz）：", "Real observations before the decision (2 Hz):");
    el.appendChild(cap);
    d.cam.forEach((c, j) => {
      const im = document.createElement("img");
      im.src = AB + c.f;
      im.alt = L("t=", "t=") + c.t.toFixed(1) + L(" s 的前视观测", " s front observation");
      im.title = "t = " + c.t.toFixed(1) + " s";
      im.addEventListener("click", () => { S.t = c.t; S.hold = 0; render(); });
      el.appendChild(im);
    });
  }

  /* ---------- left screen: camera / prediction replay ---------- */
  /* cover rect scaled about the vanishing point: zooming the outgoing frame in
     and the incoming frame out fakes continuous forward motion between the
     2 Hz observations instead of a static crossfade. */
  function coverRect(im, w, h, zoom) {
    const s = Math.max(w / im.naturalWidth, h / im.naturalHeight);
    const dw0 = im.naturalWidth * s, dh0 = im.naturalHeight * s;
    const dx0 = (w - dw0) / 2, dy0 = (h - dh0) / 2;
    const z = zoom || 1, ax = w / 2, ay = h * 0.44;
    return [ax - (ax - dx0) * z, ay - (ay - dy0) * z, dw0 * z, dh0 * z];
  }
  function cover(c, im, w, h, alpha, zoom) {
    if (!im.complete || !im.naturalWidth) return null;
    const r = coverRect(im, w, h, zoom);
    c.globalAlpha = alpha;
    c.drawImage(im, r[0], r[1], r[2], r[3]);
    c.globalAlpha = 1;
    return r;
  }
  /* projected rollout guidance drawn on the real pixels (DriveVer-style) */
  function overlay(c, rect, traj, col, dash, alpha) {
    if (!traj || !rect) return;
    const runs = [];
    let cur = null;
    traj.forEach((p) => {
      if (!p) { cur = null; return; }
      const x = rect[0] + p[0] * rect[2], y = rect[1] + p[1] * rect[3];
      if (!cur) { cur = []; runs.push(cur); }
      cur.push([x, y]);
    });
    c.lineJoin = "round"; c.lineCap = "round";
    [7, 2.4].forEach((lw, pass) => {
      c.globalAlpha = alpha * (pass ? 0.95 : 0.22);
      c.strokeStyle = pass ? col : "#ffffff";
      c.lineWidth = lw; c.setLineDash(pass ? dash : []);
      runs.forEach((run) => {
        if (run.length < 2) return;
        c.beginPath();
        run.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]));
        c.stroke();
      });
    });
    c.setLineDash([]); c.globalAlpha = 1;
    const last = runs.length ? runs[runs.length - 1] : null;
    if (last && last.length) {
      const q = last[last.length - 1];
      c.globalAlpha = alpha;
      c.beginPath(); c.arc(q[0], q[1], 3.6, 0, 7);
      c.fillStyle = col; c.fill();
      c.lineWidth = 1.4; c.strokeStyle = "#fff"; c.stroke();
      c.globalAlpha = 1;
    }
  }
  function trajLegend(c, w, h, P) {
    c.font = "600 11px Inter, sans-serif";
    const a = L("基线", "base"), b = L("认证编辑", "certified edit");
    const wa = c.measureText(a).width, wb = c.measureText(b).width;
    const W = 22 + 12 + 5 + wa + 14 + 12 + 5 + wb + 12;
    rr(c, 10, h - 34, W, 24, 12);
    c.fillStyle = "rgba(10,14,22,0.62)"; c.fill();
    c.textAlign = "left"; c.textBaseline = "middle";
    let x = 21;
    c.strokeStyle = P.base; c.lineWidth = 2.4; c.setLineDash([5, 3]);
    c.beginPath(); c.moveTo(x, h - 22); c.lineTo(x + 12, h - 22); c.stroke();
    c.setLineDash([]);
    x += 17; c.fillStyle = "#f4f7fc"; c.fillText(a, x, h - 21); x += wa + 14;
    c.strokeStyle = P.edit; c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(x, h - 22); c.lineTo(x + 12, h - 22); c.stroke();
    x += 17; c.fillStyle = "#f4f7fc"; c.fillText(b, x, h - 21);
  }
  function camIndexAt(t) {
    const cs = S.d.cam;
    let j = 0;
    for (let k = 0; k < cs.length; k++) if (cs[k].t <= t + 1e-6) j = k;
    return j;
  }
  function renderFront() {
    const [c, w, h] = ctxOf(frontCv);
    const P = pal(), d = S.d;
    c.clearRect(0, 0, w, h);
    if (!d) return;
    if (S.t < 0) {
      const j = camIndexAt(S.t);
      const ep = d.ego_past;
      const jn = Math.min(j + 1, d.cam.length - 1);
      const step = Math.hypot(ep[jn][0] - ep[j][0], ep[jn][1] - ep[j][1]);
      const kz = clamp(step / 45, 0.02, 0.12);
      const hasNx = j + 1 < d.cam.length;
      const f = hasNx ? ease(clamp((S.t - d.cam[j].t) / (d.cam[j + 1].t - d.cam[j].t), 0, 1)) : 0;
      const r0 = cover(c, S.cams[j], w, h, 1, 1 + kz * f);
      overlay(c, r0, (d.cam[j].traj || {}).base, P.base, [7, 5], 0.9);
      overlay(c, r0, (d.cam[j].traj || {}).edit, P.edit, [], 0.95);
      const nx = S.cams[j + 1];
      if (nx && hasNx) {
        const r1 = cover(c, nx, w, h, f, 1 - kz * (1 - f));
        overlay(c, r1, (d.cam[j + 1].traj || {}).base, P.base, [7, 5], 0.9 * f);
        overlay(c, r1, (d.cam[j + 1].traj || {}).edit, P.edit, [], 0.95 * f);
      }
      const g = c.createLinearGradient(0, h * 0.7, 0, h);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.35)");
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      trajLegend(c, w, h, P);
      return;
    }
    /* synthetic chase-camera replay of the cached prediction */
    const pose = poseAt(d.ego_pose.edit, S.t);
    const ch = Math.cos(pose[2]), sh = Math.sin(pose[2]);
    const DIST = 9.0, CAMZ = 3.6;
    const camX = pose[0] - ch * DIST, camY = pose[1] - sh * DIST;
    const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    const f = (w / 2) / Math.tan(HFOV / 2), cx = w / 2, cy = h * 0.55;
    const NEAR = 1.0;
    const cs = (x, y, z) => {
      const dx = x - camX, dy = y - camY;
      const fw = dx * ch + dy * sh, lf = -dx * sh + dy * ch, up = z - CAMZ;
      return [lf, up * cp + fw * sp, fw * cp - up * sp];
    };
    const clip = (pts, open) => {
      const out = [];
      const n = pts.length, m = open ? n - 1 : n;
      for (let i = 0; i < m; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        const ai = a[2] >= NEAR, bi = b[2] >= NEAR;
        if (ai) out.push(a);
        if (ai !== bi) {
          const t = (NEAR - a[2]) / (b[2] - a[2]);
          out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), NEAR]);
        }
      }
      if (open && n && pts[n - 1][2] >= NEAR) out.push(pts[n - 1]);
      return out;
    };
    const pr = (q) => [cx - f * q[0] / q[2], cy - f * q[1] / q[2]];
    const horizon = cy - f * Math.tan(PITCH);
    const sky = c.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, P.sky0); sky.addColorStop(1, P.sky1);
    c.fillStyle = sky; c.fillRect(0, 0, w, Math.max(0, horizon) + 1);
    c.fillStyle = P.ground; c.fillRect(0, horizon, w, h - horizon);
    const haze = c.createLinearGradient(0, horizon, 0, horizon + 80);
    haze.addColorStop(0, hexA(P.sky1, 0.85)); haze.addColorStop(1, hexA(P.sky1, 0));
    c.fillStyle = haze; c.fillRect(0, horizon, w, 80);

    const poly = (ring, z, fill, stroke, lw, open) => {
      const pts = clip(ring.map((p) => cs(p[0], p[1], z)), open);
      if (pts.length < (open ? 2 : 3)) return;
      c.beginPath();
      pts.forEach((q, i) => { const v = pr(q); i ? c.lineTo(v[0], v[1]) : c.moveTo(v[0], v[1]); });
      if (!open) c.closePath();
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
    };
    if (S.tog.map) {
      (d.walk || []).forEach((r) => poly(r, 0, P.walk, null));
      (d.road || []).forEach((r) => poly(r, 0.01, P.asphalt, P.edge, 1.4));
      (d.crosswalk || []).forEach((r) => poly(r, 0.02, P.walk, null));
      (d.lane || []).forEach((r) => poly(r, 0.03, null, P.lane, 1.1, true));
    }
    /* rollout guidance on the replay ground plane */
    if (S.tog.base) {
      c.setLineDash([7, 5]);
      poly(d.ego_base, 0.06, null, P.base, 2.2, true);
      c.setLineDash([]);
    }
    poly(d.ego_edit, 0.08, null, P.edit, 2.6, true);

    /* boxes: agents + base ghost + own ego, painter-sorted */
    const boxes = [];
    d.ag_pose[0].forEach((a, m) => {
      const p = poseAt(S.agTracks[m], S.t);
      boxes.push({ p, L: a[3], W: a[4], col: m === d.mstar ? P.conflict : P.agent,
        top: m === d.mstar ? P.conflictTop : P.agentTop,
        alpha: 1, ghost: false, m });
    });
    boxes.push({ p: poseAt(d.ego_pose.base, S.t), L: EGO_L, W: EGO_W,
      col: P.base, top: P.base, alpha: 0.45, ghost: true, m: -1 });
    boxes.push({ p: pose, L: EGO_L, W: EGO_W, col: "#e08c1f", top: "#f2a03d",
      alpha: 1, ghost: false, m: -2 });
    const depthOf = (b) => cs(b.p[0], b.p[1], 0)[2];
    boxes.sort((a, b) => depthOf(b) - depthOf(a));
    const light = [-0.5, 0.8];
    boxes.forEach((b) => {
      const bc = Math.cos(b.p[2]), bs = Math.sin(b.p[2]);
      const hl = b.L / 2, hw = b.W / 2;
      const loc = [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]];
      const B = loc.map((q) => [b.p[0] + q[0] * bc - q[1] * bs,
        b.p[1] + q[0] * bs + q[1] * bc]);
      const cb3 = B.map((q) => cs(q[0], q[1], 0));
      const ct3 = B.map((q) => cs(q[0], q[1], BOX_H));
      const faces = [];
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        const ex = B[j][0] - B[i][0], ey = B[j][1] - B[i][1];
        const nx = -ey, ny = ex;
        const mx = (B[i][0] + B[j][0]) / 2 - camX;
        const my = (B[i][1] + B[j][1]) / 2 - camY;
        if (nx * mx + ny * my >= 0) continue;
        const nl = Math.hypot(nx, ny) || 1;
        const shd = 0.62 + 0.38 * Math.max(0, (nx / nl) * light[0] + (ny / nl) * light[1]);
        const q = clip([cb3[i], cb3[j], ct3[j], ct3[i]]);
        if (q.length >= 3) faces.push({ q, dep: q.reduce((s, v) => s + v[2], 0) / q.length, shd });
      }
      const qt = clip(ct3);
      if (qt.length >= 3) faces.push({ q: qt, dep: qt.reduce((s, v) => s + v[2], 0) / qt.length, shd: 1.12, top: true });
      faces.sort((a, b) => b.dep - a.dep);
      c.globalAlpha = b.alpha;
      faces.forEach((fc) => {
        c.beginPath();
        fc.q.forEach((q, i) => { const v = pr(q); i ? c.lineTo(v[0], v[1]) : c.moveTo(v[0], v[1]); });
        c.closePath();
        c.fillStyle = shade(fc.top ? b.top : b.col, fc.shd);
        c.fill();
        c.strokeStyle = b.ghost ? P.base : "rgba(0,0,0,0.30)";
        c.lineWidth = b.ghost ? 1.6 : 0.8;
        if (b.ghost) c.setLineDash([5, 4]);
        c.stroke();
        c.setLineDash([]);
      });
      c.globalAlpha = 1;
      if (!b.ghost) {
        const cl = b.L * 0.42, cw = b.W * 0.78, off = b.L * 0.06;
        const cab3 = [[off + cl / 2, cw / 2], [off + cl / 2, -cw / 2],
          [off - cl / 2, -cw / 2], [off - cl / 2, cw / 2]]
          .map((q) => cs(b.p[0] + q[0] * bc - q[1] * bs,
            b.p[1] + q[0] * bs + q[1] * bc, BOX_H + 0.02));
        const cab = clip(cab3);
        if (cab.length >= 3) {
          c.beginPath();
          cab.forEach((q, i) => { const v = pr(q); i ? c.lineTo(v[0], v[1]) : c.moveTo(v[0], v[1]); });
          c.closePath();
          c.fillStyle = "rgba(22,30,46,0.55)"; c.fill();
        }
      }
      b.scr = pr(cs(b.p[0], b.p[1], BOX_H + 0.4));
      b.dep = depthOf(b);
    });

    /* tags: small name tags on boxes (clearances live in the DOM HUD pill) */
    const cb = valAt(d.clearance_base, S.t), ce = valAt(d.clearance_edit, S.t);
    const ghost = boxes.find((b) => b.ghost), own = boxes.find((b) => b.m === -2);
    const conf = boxes.find((b) => b.m === d.mstar);
    const placed = [];
    const tag = (x, y, text, fg, bg) => {
      c.font = "600 12px Inter, sans-serif";
      const tw = c.measureText(text).width + 16;
      x = Math.max(tw / 2 + 4, Math.min(w - tw / 2 - 4, x));
      let yy = Math.max(y, S.pillBottom + 10), guard = 0;
      const hit = (v) => placed.some((r) => Math.abs(r.x - x) < (r.w + tw) / 2 + 4 && Math.abs(r.y - v) < 24);
      while (guard++ < 8 && hit(yy)) {
        if (yy - 26 >= S.pillBottom + 10) yy -= 26;
        else if (yy + 26 <= h - 44) yy += 26;
        else break;
      }
      placed.push({ x, y: yy, w: tw });
      pill(c, x, yy, text, fg, bg);
    };
    if (own && own.dep > 3) tag(own.scr[0], own.scr[1] - 12, L("认证编辑 · 自车", "certified edit · ego"), "#fff", "rgba(224,140,31,0.92)");
    if (conf && conf.dep > 4) tag(conf.scr[0], conf.scr[1] - 12, L("冲突他车", "conflict agent"), "#fff", "rgba(216,64,79,0.85)");
    if (ghost && ghost.dep > 4) {
      const near = own && Math.hypot(ghost.scr[0] - own.scr[0], ghost.scr[1] - own.scr[1]) < 60;
      tag(ghost.scr[0], ghost.scr[1] - (near ? 36 : 12), L("基线幽灵", "base ghost"), "#fff", "rgba(216,64,79,0.85)");
    }
    if (cb < 0) {
      const pulse = 0.35 + 0.25 * Math.sin(performance.now() / 160);
      c.strokeStyle = "rgba(224,79,95," + pulse.toFixed(2) + ")";
      c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
    }
    const vg = c.createLinearGradient(0, h * 0.8, 0, h);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.22)");
    c.fillStyle = vg; c.fillRect(0, 0, w, h);
    trajLegend(c, w, h, P);
  }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
    const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
    const b = clamp(Math.round((n & 255) * f), 0, 255);
    return "rgb(" + r + "," + g + "," + b + ")";
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  /* ---------- right screen: heading-up BEV ---------- */
  function renderBev() {
    const [c, w, h] = ctxOf(bevCv);
    const P = pal(), d = S.d;
    c.clearRect(0, 0, w, h);
    c.fillStyle = P.bg; c.fillRect(0, 0, w, h);
    if (!d) return;
    const past = S.t < 0;
    let pose;
    if (past) pose = trackAt(S.camTimes, d.ego_past, S.t);
    else pose = poseAt(d.ego_pose.edit, S.t);
    const s = h / 46, cx = w / 2, cy = h * 0.74;
    /* heading-up: ego forward -> screen up, ego right -> screen right */
    const ch = Math.cos(pose[2]), sh = Math.sin(pose[2]);
    const tf = (x, y) => {
      const dx = x - pose[0], dy = y - pose[1];
      const fw = dx * ch + dy * sh, lf = -dx * sh + dy * ch;
      return [cx - lf * s, cy - fw * s];
    };
    const ring = (r, fill, stroke, lw, open) => {
      if (r.length < (open ? 2 : 3)) return;
      c.beginPath();
      r.forEach((p, i) => { const q = tf(p[0], p[1]); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); });
      if (!open) c.closePath();
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
    };
    if (S.tog.map) {
      (d.walk || []).forEach((r) => ring(r, P.walk, null));
      (d.road || []).forEach((r) => ring(r, P.asphalt, P.edge, 1.2));
      (d.crosswalk || []).forEach((r) => ring(r, P.walk, null));
      (d.lane || []).forEach((r) => ring(r, null, P.lane, 0.9, true));
    }
    const k = clamp(Math.floor(Math.max(S.t, 0) / DT), 0, NF - 1);
    const box = (p, L, W, fill, stroke, alpha, lw) => {
      const bc = Math.cos(p[2]), bs = Math.sin(p[2]);
      const q = [[L / 2, W / 2], [L / 2, -W / 2], [-L / 2, -W / 2], [-L / 2, W / 2]]
        .map((v) => tf(p[0] + v[0] * bc - v[1] * bs, p[1] + v[0] * bs + v[1] * bc));
      c.globalAlpha = alpha;
      c.beginPath();
      q.forEach((v, i) => i ? c.lineTo(v[0], v[1]) : c.moveTo(v[0], v[1]));
      c.closePath();
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
      c.globalAlpha = 1;
    };
    if (!past) {
      if (S.tog.fan) d.cands.forEach((cd) => {
        const col = cd.cls === "deployed" ? P.edit : cd.cls === "certified" ? P.good
          : cd.cls === "stalls" ? P.warn : P.base;
        const al = cd.cls === "deployed" ? 0.95 : cd.cls === "unsafe" ? 0.34 : 0.55;
        c.beginPath();
        cd.path.forEach((p, i) => { const q = tf(p[0], p[1]); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); });
        c.strokeStyle = col; c.globalAlpha = al;
        c.lineWidth = cd.cls === "deployed" ? 3.4 : 1.8;
        c.stroke(); c.globalAlpha = 1;
      });
      if (S.tog.base) {
        c.beginPath();
        d.ego_base.forEach((p, i) => { const q = tf(p[0], p[1]); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); });
        c.setLineDash([6, 5]); c.strokeStyle = P.base; c.lineWidth = 2; c.stroke();
        c.setLineDash([]);
      }
      if (S.tog.trails) d.ag_pose[0].forEach((a, m) => {
        [9, 6, 3].forEach((off, oi) => {
          const p = poseAt(S.agTracks[m], Math.min((k + off) * DT, T_END));
          box(p, a[3], a[4], null, m === d.mstar ? P.conflict : P.trail,
            [0.14, 0.22, 0.32][oi], 1);
        });
      });
    }
    d.ag_pose[0].forEach((a, m) => {
      const p = past ? d.ag_pose[0][m] : poseAt(S.agTracks[m], S.t);
      box(p, a[3], a[4], m === d.mstar ? P.conflict : P.agent, null, past ? 0.45 : 0.95);
    });
    /* travelled trail */
    c.beginPath();
    d.ego_past.forEach((p, i) => { const q = tf(p[0], p[1]); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); });
    if (!past) for (let i = 0; i <= k; i++) { const q = tf(d.ego_edit[i][0], d.ego_edit[i][1]); c.lineTo(q[0], q[1]); }
    c.strokeStyle = P.dim; c.globalAlpha = 0.55; c.lineWidth = 1.6; c.stroke(); c.globalAlpha = 1;
    if (!past && S.tog.base) box(poseAt(d.ego_pose.base, S.t), EGO_L, EGO_W, null, P.base, 0.8, 1.6);
    /* ego sprite, heading up */
    c.save();
    c.translate(cx, cy);
    rr(c, -EGO_W * s / 2, -EGO_L * s / 2, EGO_W * s, EGO_L * s, 3);
    c.fillStyle = "#f2a03d"; c.fill();
    c.strokeStyle = "rgba(0,0,0,0.35)"; c.lineWidth = 1; c.stroke();
    c.fillStyle = "rgba(255,255,255,0.85)";
    c.fillRect(-EGO_W * s / 2 + 2, -EGO_L * s / 2 + 3, EGO_W * s - 4, 3);
    c.restore();
    if (!past && Math.abs(k - d.tstar) <= 3) {
      const p = d.ag_pose[k][d.mstar];
      const q = tf(p[0], p[1]);
      c.strokeStyle = P.conflict; c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 4 : 9, a = -Math.PI / 2 + i * Math.PI / 5;
        const x = q[0] + r * Math.cos(a), y = q[1] + r * Math.sin(a);
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.closePath(); c.stroke();
    }
    c.fillStyle = P.dim; c.font = "500 11px Inter, sans-serif";
    c.textAlign = "left"; c.textBaseline = "alphabetic";
    c.fillText(past ? L("他车显示为决策时刻状态", "agents shown at decision-time state")
      : L("扇面＝8 条候选编辑 · 紫尾迹＝他车预测",
        "fan = 8 candidate edits · violet trails = agent predictions"), 10, h - 10);
  }

  /* ---------- gap chart ---------- */
  function renderGap() {
    const [c, w, h] = ctxOf(gapCv);
    const P = pal(), d = S.d;
    c.clearRect(0, 0, w, h);
    if (!d) return;
    const L = 44, R = 14, T = 14, B = 26;
    const all = d.clearance_base.concat(d.clearance_edit);
    const lo = Math.min(-0.5, Math.min.apply(null, all) - 0.4);
    const hi = Math.max(2.5, Math.max.apply(null, all) + 0.4);
    const X = (t) => L + (t / T_END) * (w - L - R);
    const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (h - T - B);
    c.fillStyle = "rgba(224,79,95,0.10)";
    for (let i = 0; i < NF - 1; i++) {
      if (d.clearance_base[i] < 0 && d.clearance_edit[i] >= 0)
        c.fillRect(X(i * DT), T, X((i + 1) * DT) - X(i * DT), h - T - B);
    }
    c.strokeStyle = P.dim; c.lineWidth = 1; c.globalAlpha = 0.5;
    c.beginPath(); c.moveTo(L, Y(0)); c.lineTo(w - R, Y(0)); c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = P.dim; c.font = "500 10.5px Inter, sans-serif";
    c.textAlign = "right"; c.fillText("0 m", L - 6, Y(0) + 3);
    c.fillText(lo.toFixed(1), L - 6, Y(lo) + 3);
    c.fillText(hi.toFixed(1), L - 6, Y(hi) + 3);
    c.textAlign = "center";
    for (let t = 0; t <= 4; t++) c.fillText(t + " s", X(t), h - 8);
    const curve = (arr, col, dash) => {
      c.beginPath();
      arr.forEach((v, i) => { const x = X(i * DT), y = Y(v); i ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.setLineDash(dash || []); c.strokeStyle = col; c.lineWidth = 2; c.stroke();
      c.setLineDash([]);
    };
    curve(d.clearance_base, P.base, [6, 4]);
    curve(d.clearance_edit, P.edit);
    const tx = X(clamp(S.t, 0, T_END));
    c.strokeStyle = P.warn; c.lineWidth = 1.6;
    c.globalAlpha = S.t < 0 ? 0.35 : 1;
    c.beginPath(); c.moveTo(tx, T); c.lineTo(tx, h - B); c.stroke();
    c.globalAlpha = 1;
    if (S.t >= 0) {
      [[valAt(d.clearance_base, S.t), P.base], [valAt(d.clearance_edit, S.t), P.edit]]
        .forEach((q) => {
          c.beginPath(); c.arc(tx, Y(q[0]), 3.4, 0, 7); c.fillStyle = q[1]; c.fill();
        });
    }
  }

  /* ---------- HUD / readout ---------- */
  function hud() {
    const d = S.d;
    if (!d) return;
    const lt = $("#p-ltag"), lh = $("#p-lhud"), bh = $("#p-bhud"), rd = $("#p-read");
    const rt = $("#p-rtag");
    if (S.t < 0) {
      const j = camIndexAt(S.t);
      lt.textContent = L("前视相机 · 真实观测 ", "front camera · real observation ") +
        (j + 1) + "/" + d.cam.length + L("（2 Hz 运动补偿插值）", " (2 Hz, motion-compensated)");
      lh.textContent = "t = " + S.t.toFixed(1) + L(" s · 观测积累中", " s · accumulating observations");
      if (rt) rt.textContent = L("航向朝上 BEV · 决策前观测状态", "heading-up BEV · pre-decision observed state");
      bh.textContent = L("决策前 · 自车沿真实观测轨迹行驶",
        "pre-decision · ego follows the observed track");
      rd.innerHTML = L(
        "<b>观测阶段。</b>相机以 2 Hz 回放决策前的真实画面；证书尚未触发。" +
        "t = 0 时冻结规划器输出基线轨迹与 8 条候选编辑，几何证书对每条候选逐帧判定。",
        "<b>Observation phase.</b> The camera replays real pre-decision frames at 2 Hz; " +
        "the certificate has not fired yet. At t = 0 the planner's base trajectory and eight " +
        "candidate edits are frozen, and the geometric certificate judges every candidate frame by frame.");
    } else {
      const k = clamp(Math.floor(S.t / DT), 0, NF - 1);
      const cb = valAt(d.clearance_base, S.t), ce = valAt(d.clearance_edit, S.t);
      lt.textContent = L("几何回放 · 规划器自带预测（非观测）",
        "geometry replay · planner's own prediction (not observation)");
      lh.innerHTML = "t = +" + S.t.toFixed(1) + L(" s · 帧 ", " s · frame ") + (k + 1) + "/41 · " +
        "<b style='color:" + (cb < 0 ? "#ff9aa2" : "#8ce0b6") + "'>" + L("基线 ", "base ") + fmt(cb) + " m</b> · " +
        "<b style='color:" + (ce < 0 ? "#ff9aa2" : "#8ce0b6") + "'>" + L("修复后 ", "refined ") + fmt(ce) + " m</b>";
      if (rt) rt.textContent = L("候选扇面 · 预测回放（航向朝上）", "candidate fan · prediction replay (heading up)");
      bh.textContent = L("基线间隙 ", "base gap ") + fmt(cb) + L(" m · 修复后 ", " m · refined ") + fmt(ce) + " m";
      rd.innerHTML = cb < 0
        ? L("<b class='bad'>t = +" + S.t.toFixed(1) + " s：基线在本帧穿透 " + fmt(cb) +
          " m</b>（全时域最差 " + fmt(d.gap_base) + " m，第 " + (d.tstar + 1) +
          " 帧）；认证编辑同帧间隙 <b class='good'>" + fmt(ce) +
          " m</b>，41 帧全程非负 ⇒ 证书通过，接受编辑。",
        "<b class='bad'>t = +" + S.t.toFixed(1) + " s: the base penetrates by " + fmt(cb) +
          " m here</b> (worst over the horizon " + fmt(d.gap_base) + " m at frame " + (d.tstar + 1) +
          "); the certified edit keeps <b class='good'>" + fmt(ce) +
          " m</b> at the same instant and stays non-negative for all 41 frames ⇒ certificate passes, edit committed.")
        : L("t = +" + S.t.toFixed(1) + " s：基线间隙 " + fmt(cb) + " m，编辑间隙 <b class='good'>" +
          fmt(ce) + " m</b>。证书要求每一帧、每个他车都非负，任何一帧不满足即整体退回基线。",
        "t = +" + S.t.toFixed(1) + " s: base gap " + fmt(cb) + " m, edit gap <b class='good'>" +
          fmt(ce) + " m</b>. The certificate demands non-negativity at every frame against every agent; " +
          "a single failing frame falls back to the base plan.");
    }
    document.querySelectorAll("#p-strip img").forEach((im, j) =>
      im.classList.toggle("on", S.t < 0 && j === camIndexAt(S.t)));
    $("#p-time").textContent = "t = " + (S.t < 0 ? "−" : "+") + Math.abs(S.t).toFixed(1) + " s";
    const sc = $("#p-scrub");
    if (document.activeElement !== sc) sc.value = String(Math.round(S.t * 10));
    const pp = lt.closest(".p-pills");
    if (pp) S.pillBottom = pp.offsetTop + pp.offsetHeight;
  }
  function render() { renderFront(); renderBev(); renderGap(); hud(); }

  /* ---------- loop ---------- */
  function frame(ts) {
    const dt = Math.min(0.05, (ts - S.last) / 1000 || 0);
    S.last = ts;
    if (S.playing && S.d) {
      if (S.hold > 0) {
        S.hold -= dt;
        if (S.hold <= 0 && S.loop) S.t = -S.d.t_past;
      } else {
        S.t += dt * S.speed;
        if (S.t >= T_END) {
          S.t = T_END;
          if (S.loop) S.hold = 1.2;
          else { S.playing = false; playBtn(); }
        }
      }
    }
    render();
    S.raf = requestAnimationFrame(frame);
  }
  function playBtn() {
    $("#p-play").textContent = S.playing ? "❚❚" : "▶";
    $("#p-play").setAttribute("aria-label", S.playing ? L("暂停", "Pause") : L("播放", "Play"));
  }

  /* ---------- wiring ---------- */
  function init() {
    fetch(AB + "index.json").then((r) => r.json()).then((list) => {
      S.list = list;
      const tabs = $("#p-tabs");
      list.forEach((e, i) => {
        const b = document.createElement("button");
        b.innerHTML = "<b>" + (EN ? (e.label_en || e.label) : e.label) + "</b><span>" +
          fmt(e.gap_base) + " → " + fmt(e.gap_edit) + " m</span>";
        b.addEventListener("click", () => loadScene(i));
        tabs.appendChild(b);
      });
      fitAll();
      loadScene(0);
      S.playing = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      playBtn();
      S.last = performance.now();
      S.raf = requestAnimationFrame(frame);
    });
    $("#p-play").addEventListener("click", () => {
      S.playing = !S.playing;
      if (S.playing && S.t >= T_END) S.t = -S.d.t_past;
      playBtn();
    });
    $("#p-scrub").addEventListener("input", (ev) => {
      S.t = Number(ev.target.value) / 10; S.hold = 0; render();
    });
    document.querySelectorAll("#p-speed button").forEach((b) =>
      b.addEventListener("click", () => {
        S.speed = Number(b.dataset.s);
        document.querySelectorAll("#p-speed button").forEach((x) =>
          x.classList.toggle("on", x === b));
      }));
    $("#p-loop").addEventListener("click", () => {
      S.loop = !S.loop;
      $("#p-loop").classList.toggle("on", S.loop);
    });
    document.querySelectorAll(".p-legend .tog").forEach((b) =>
      b.addEventListener("click", () => {
        const k = b.dataset.k;
        S.tog[k] = !S.tog[k];
        b.classList.toggle("on", S.tog[k]);
        render();
      }));
    const ro = new ResizeObserver(() => { fitAll(); render(); });
    ro.observe(frontCv.parentElement);
    ro.observe(bevCv.parentElement);
    ro.observe(gapCv.parentElement);
    new MutationObserver(() => render())
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    document.addEventListener("visibilitychange", () => {
      S.last = performance.now();
    });
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();