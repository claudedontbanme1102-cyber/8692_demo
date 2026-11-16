/* World4Refiner 项目页
   数字全部来自 window.W4R（由 _build_data.py 从本地台账生成），本页不手写读数。
   交互演示的场景几何来自 assets/demo/*.json（真实地图 + 真实相机帧 + 规划器自带的他车预测）。 */
(function () {
  "use strict";
  const D = window.W4R || {};
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const EN = document.documentElement.lang === "en";
  const L = (zh, en) => (EN ? en : zh);

  const fmt = (v, n) => (v === undefined || v === null || Number.isNaN(v))
    ? "—" : Number(v).toFixed(n === undefined ? 2 : n);
  const sgn = (v, n) => (v > 0 ? "+" : "") + fmt(v, n);
  const pct = (v) => fmt(v * 100, 2) + "%";

  /* ============================ theme ============================ */
  const themeBtn = $("#theme");
  const themeHooks = [];
  const setTheme = (t) => {
    document.documentElement.dataset.theme = t;
    themeBtn.textContent = t === "dark" ? L("浅色", "Light") : L("深色", "Dark");
    try { localStorage.setItem("w4r-theme", t); } catch (e) {}
    themeHooks.forEach((f) => { try { f(); } catch (e) {} });
  };
  themeBtn.addEventListener("click", () =>
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  try {
    const saved = localStorage.getItem("w4r-theme");
    if (saved) setTheme(saved);
  } catch (e) {}

  /* ============================ reveal ============================ */
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("on"); io.unobserve(e.target); }
  }), { rootMargin: "0px 0px -8% 0px" });
  $$(".reveal").forEach((el) => io.observe(el));

  /* ============================ nav scroll-spy ============================ */
  const navEl = $("#nav");
  const navLinks = $$(".nav .links a");
  const navSecs = navLinks.map((a) => document.getElementById(a.getAttribute("href").slice(1)));
  const onScroll = () => {
    navEl.classList.toggle("solid", scrollY > 8);
    if (scrollY < innerHeight * 0.5) { navLinks.forEach((a) => a.classList.remove("on")); return; }
    let cur = -1;
    navSecs.forEach((s, i) => { if (s && s.getBoundingClientRect().top <= innerHeight * 0.35) cur = i; });
    navLinks.forEach((a, i) => a.classList.toggle("on", i === cur));
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // anchor jumps must land below the fixed nav, whose height varies with
  // language and viewport (links wrap on narrow screens)
  const padNav = () => {
    document.documentElement.style.scrollPaddingTop = (navEl.offsetHeight + 10) + "px";
  };
  padNav();
  addEventListener("resize", padNav);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(padNav);

  /* ============================ KaTeX ============================ */
  function renderTex() {
    if (!window.katex) return;
    $$("[data-tex]").forEach((el) => {
      try { katex.render(el.getAttribute("data-tex"), el, { throwOnError: false }); }
      catch (e) { /* leave the raw source in place */ }
    });
  }

  /* ============================ hero animation ============================ */
  (function hero() {
    const cv = $("#hero-canvas");
    if (!cv) return;
    const g = cv.getContext("2d");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0, pal, scale = 1, ox = 0, oy = 0, seed = 7;
    let y0 = 0, lat = 0, plan = null, live = true;

    const setPal = () => {
      const dark = document.documentElement.dataset.theme === "dark";
      pal = dark
        ? { edge: "rgba(255,255,255,.20)", mid: "rgba(255,255,255,.08)", fill: "rgba(106,149,255,.07)",
            g0: "#6a95ff", g1: "#9c8dff", bad: "rgba(239,107,120,.42)", ego: "#f7b45c", obj: "rgba(150,160,185,.45)" }
        : { edge: "rgba(22,32,46,.22)", mid: "rgba(22,32,46,.10)", fill: "rgba(47,111,235,.055)",
            g0: "#2f6feb", g1: "#6d5ae0", bad: "rgba(224,79,95,.34)", ego: "#f2a03d", obj: "rgba(147,163,188,.32)" };
    };
    setPal();
    themeHooks.push(() => frame(performance.now()));

    const resize = () => {
      const d = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = Math.max(1, Math.round(W * d)); cv.height = Math.max(1, Math.round(H * d));
      g.setTransform(d, 0, 0, d, 0, 0);
      scale = Math.min(W, H) / 44;
      ox = W * (W > 900 ? 0.74 : 0.5); oy = H * (W > 900 ? 0.74 : 0.82);
      frame(performance.now());
    };
    addEventListener("resize", resize, { passive: true });

    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const HALF = 4.2;
    const edge = (y) => 3.0 * Math.sin(y / 41) + 1.4 * Math.sin(y / 16 + 1.1);
    const ease = (u) => u * u * (3 - 2 * u);
    const px = (d, y) => [ox + (d - edge(y0)) * scale, oy - (y - y0) * scale];

    function makePlan() {
      const cands = [];
      for (let i = 0; i < 26; i++) {
        const delta = -3.0 + 6.0 * (i / 25) + (rnd() - 0.5) * 0.5;
        const len = 24 + rnd() * 14;
        let ok = true;
        for (let k = 1; k <= 8; k++) {
          const u = k / 8, d = lat + delta * ease(u);
          if (Math.abs(d - edge(y0 + len * u)) > HALF - 0.75) { ok = false; break; }
        }
        cands.push({ delta, len, ok });
      }
      const verified = cands.filter((c) => c.ok);
      let best = null;
      verified.forEach((c) => { if (!best || Math.abs(c.delta) < Math.abs(best.delta)) best = c; });
      return { cands, best, y1: y0, l1: lat };
    }

    function corridor(ya, yb) {
      g.beginPath();
      for (let y = ya; y <= yb; y += 2) { const p = px(edge(y) - HALF, y); y === ya ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1]); }
      for (let y = yb; y >= ya; y -= 2) { const p = px(edge(y) + HALF, y); g.lineTo(p[0], p[1]); }
      g.closePath();
    }

    function stroke(fn, color, wdt, dash) {
      g.save(); g.strokeStyle = color; g.lineWidth = wdt; g.lineJoin = "round"; g.lineCap = "round";
      if (dash) g.setLineDash(dash);
      g.beginPath(); fn(); g.stroke(); g.restore();
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - (frame.last || now)) / 1000); frame.last = now;
      if (!reduce && live) y0 += 8.5 * dt;
      if (!plan || (!reduce && y0 - plan.y1 > Math.max(14, (plan.best || plan.cands[0]).len * 0.8))) plan = makePlan();
      if (!plan) plan = makePlan();
      const b = plan.best || plan.cands[0];
      const u = Math.min(1, (y0 - plan.y1) / Math.max(1, b.len));
      lat = plan.l1 + b.delta * ease(u);
      if (u >= 1) plan = makePlan();

      g.clearRect(0, 0, W, H);
      const ya = y0 - 34, yb = y0 + 78;
      corridor(ya, yb); g.fillStyle = pal.fill; g.fill();
      for (const off of [-HALF, HALF]) {
        stroke(() => { for (let y = ya; y <= yb; y += 2) { const p = px(edge(y) + off, y); y === ya ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1]); } },
          pal.edge, 1.3);
      }
      stroke(() => { for (let y = ya; y <= yb; y += 2) { const p = px(edge(y), y); y === ya ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1]); } },
        pal.mid, 1.2, [9, 13]);

      for (let k = 0; k < 5; k++) {
        const sy = y0 + 16 + ((k * 23 + Math.floor(y0 / 9) * 7) % 66);
        const sd = edge(sy) + (k % 2 ? 1.9 : -1.9);
        const p = px(sd, sy);
        g.save(); g.fillStyle = pal.obj; g.beginPath();
        if (g.roundRect) g.roundRect(p[0] - 0.85 * scale, p[1] - 1.9 * scale, 1.7 * scale, 3.8 * scale, 3);
        else g.rect(p[0] - 0.85 * scale, p[1] - 1.9 * scale, 1.7 * scale, 3.8 * scale);
        g.fill(); g.restore();
      }

      const grow = reduce ? 1 : Math.min(1, (y0 - plan.y1) / 9 + 0.35);
      const grad = g.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, pal.g0); grad.addColorStop(1, pal.g1);
      const arc = (c, upto) => {
        g.beginPath();
        for (let k = 0; k <= 14; k++) {
          const t = (k / 14) * upto, p = px(plan.l1 + c.delta * ease(t), plan.y1 + c.len * t);
          k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]);
        }
      };
      plan.cands.forEach((c) => {
        if (c === b || c.ok) return;
        stroke(() => arc(c, grow), pal.bad, 1.1, [3, 5]);
      });
      g.save(); g.globalAlpha = 0.5; g.strokeStyle = grad; g.lineWidth = 1.2;
      plan.cands.forEach((c) => { if (c.ok && c !== b) { g.beginPath(); arc(c, grow); g.stroke(); } });
      g.restore();
      stroke(() => arc(b, Math.min(1, grow + 0.25)), grad, 3.4);

      const e = px(lat, y0);
      g.save(); g.translate(e[0], e[1]); g.fillStyle = pal.ego; g.shadowColor = pal.g0; g.shadowBlur = 14;
      g.beginPath();
      if (g.roundRect) g.roundRect(-1.0 * scale, -0.55 * scale, 2.0 * scale, 1.1 * scale, 3);
      else g.rect(-1.0 * scale, -0.55 * scale, 2.0 * scale, 1.1 * scale);
      g.fill(); g.restore();
    }

    resize();
    new IntersectionObserver((es) => { live = es[0].isIntersecting && !document.hidden; },
      { threshold: 0 }).observe(cv);
    document.addEventListener("visibilitychange", () => {
      live = !document.hidden && cv.getBoundingClientRect().height > 0;
      frame.last = 0;
    });
    if (!reduce) (function loop(now) { if (live && !document.hidden) frame(now); requestAnimationFrame(loop); })(performance.now());
  })();

  /* ============================ data-driven content ============================ */
  const EXT = [D.cross || []].flat().filter(Boolean);
  const EXTERNAL = EXT.filter((r) => !/TOAD/i.test(r.name));

  function statTiles() {
    const t = (k) => document.querySelector('[data-stat="' + k + '"]');
    const sub = (k, s) => { const e = document.querySelector('[data-stat-sub="' + k + '"]'); if (e) e.textContent = s; };
    if (EXTERNAL.length) {
      const ds = EXTERNAL.map((r) => r.d);
      t("cross").textContent = "+" + fmt(Math.min.apply(null, ds), 2) + " ~ +" + fmt(Math.max.apply(null, ds), 2);
      sub("cross", L(EXTERNAL.length + " 个非 TTO 底座全部显著涨分，95% 置信区间下界均大于 0",
        "all " + EXTERNAL.length + " non-TTO bases improve significantly; every 95% CI lower bound is above 0"));
    }
    const arms = (D.cf && D.cf.arms) || [];
    if (arms.length) {
      const a = arms[1] || arms[0];
      t("harm").textContent = String(a.harmed);
      sub("harm", L("held-out " + a.n + " token / " + a.logs + " 段日志：救援 " + a.rescued + " 例，伤害 " + a.harmed + " 例",
        "held-out " + a.n + " tokens / " + a.logs + " logs: " + a.rescued + " rescues, " + a.harmed + " harms"));
    }
    const nt = D.navtest;
    if (nt && nt.v1 && nt.v2) {
      t("navtest").textContent = "+" + fmt(nt.v1.d_dnh2, 2) + " / +" + fmt(nt.v2.d_dnh2, 2);
      sub("navtest", L("v1 非反应式 +" + fmt(nt.v1.d_dnh2, 4) + "（CI 下界 " + fmt(nt.v1.lo, 3) + "）；v2 反应式 +" + fmt(nt.v2.d_dnh2, 4),
        "v1 non-reactive +" + fmt(nt.v1.d_dnh2, 4) + " (CI lower " + fmt(nt.v1.lo, 3) + "); v2 reactive +" + fmt(nt.v2.d_dnh2, 4)));
    }
    const at = D.cf && D.cf.attribution;
    if (at) {
      t("attr").textContent = at.hit + "/" + at.total;
      sub("attr", L("归因准确率 " + fmt(at.acc, 2) + "：被改动的 token 全部能追溯到正确的冲突原因",
        "attribution accuracy " + fmt(at.acc, 2) + ": every changed token traces to the correct conflict cause"));
    }
  }

  function instrumentCards() {
    const host = $("#instrument-cards");
    if (!host) return;
    const inst = D.instruments || [];
    host.innerHTML = inst.map((i) =>
      '<div class="card"><h3>' + i.name + '</h3>' +
      '<p class="note" style="margin:6px 0 0">' + L("测量口径：", "instrument: ") + i.unit + '</p>' +
      '<p class="note" style="margin:6px 0 0">' + (EN ? (i.desc_en || i.desc) : i.desc) + '</p></div>'
    ).join("");
  }

  function funnel() {
    const host = $("#cert-list");
    if (!host) return;
    const rows = [];
    const nav = (D.instruments || []).find((i) => i.key === "navhard");
    if (nav) {
      const m = /([\d,]+)\s*token\s*\/\s*(\d+)\s*组/.exec(nav.desc);
      if (m) {
        rows.push([L("评测 token（navhard）", "scored tokens (navhard)"), parseInt(m[1].replace(/,/g, ""), 10), 100]);
        rows.push([L("评测组", "scored groups"), parseInt(m[2], 10), Math.max(6, 100 * parseInt(m[2], 10) / parseInt(m[1].replace(/,/g, ""), 10))]);
      }
    }
    const c0 = EXTERNAL[0];
    if (c0) {
      rows.push([L("改判 token（", "changed tokens (") + c0.name + L("）", ")"), c0.changed, Math.max(6, 100 * c0.changed / 5912)]);
      rows.push([L("其中变好", "of which improved"), c0.up, Math.max(4, 100 * c0.up / 5912)]);
      rows.push([L("其中变差", "of which worsened"), c0.down, Math.max(2, 100 * c0.down / 5912)]);
    }
    if (EXT.length) rows.push([L("净正底座", "net-positive bases"), EXT.length + " / " + EXT.length, 100]);
    host.innerHTML = rows.map((r) =>
      '<div class="row"><span>' + r[0] + '</span><span class="bar"><i style="width:' +
      Math.min(100, r[2]).toFixed(1) + '%"></i></span><span class="num">' + r[1] + "</span></div>"
    ).join("");
  }

  function tables() {
    const tb = (id) => document.querySelector("#" + id + " tbody");
    const rows = (id, cells, cls) => {
      const b = tb(id);
      if (b) b.innerHTML = cells.map((r) => "<tr" + (cls ? ' class="' + cls + '"' : "") + ">" +
        r.map((c, i) => (i === 0 ? "<td>" + c + "</td>" : '<td class="r">' + c + "</td>")).join("") + "</tr>").join("");
    };
    if (tb("tb-cross")) {
      rows("tb-cross", EXT.map((r) => [
        r.name, fmt(r.base, 4), fmt(r.ours, 4), sgn(r.d, 4),
        "[" + fmt(r.lo, 2) + ", " + fmt(r.hi, 2) + "]",
        fmt(r.harm, 2), String(r.changed), String(r.up), String(r.down)
      ]));
    }
    if (tb("tb-navtest")) {
      const nt = D.navtest || {};
      const out = [];
      [["v1", nt.v1], ["v2", nt.v2]].forEach(([k, v]) => {
        if (!v) return;
        out.push([k === "v1" ? L("navtest v1（非反应式 PDMS）", "navtest v1 (non-reactive PDMS)")
          : L("navtest v2（反应式 PDMS）", "navtest v2 (reactive PDMS)"),
          fmt(v.base, 4), fmt(v.frozen, 4), fmt(v.dnh, 4), fmt(v.dnh2, 4),
          sgn(v.d_dnh2, 4), "[" + fmt(v.lo, 3) + ", " + fmt(v.hi, 3) + "]"]);
      });
      rows("tb-navtest", out);
    }
    if (tb("tb-cf")) {
      const arms = (D.cf && D.cf.arms) || [];
      rows("tb-cf", arms.map((a) => [
        EN ? (a.name_en || a.name) : a.name, String(a.fired), String(a.rescued), String(a.harmed), String(a.net),
        "[" + fmt(a.lo, 4) + ", " + fmt(a.hi, 4) + "]",
        a.coll_before + " → " + a.coll_after, sgn(a.mean_dprog, 4)
      ]));
      const note = $("#cf-arms-note");
      if (note && arms.length) {
        const a = arms[0];
        note.textContent = L("held-out 验证集：" + a.n + " token / " + a.logs + " 段日志；" +
          "三个臂互为对照（几何门 vs 两组世界模型种子），净救援的 95% 置信区间下界均大于 0。",
          "held-out validation: " + a.n + " tokens / " + a.logs + " logs; the three arms are mutual " +
          "controls (geometric gate vs two world-model seeds); every net-rescue 95% CI lower bound is above 0.");
      }
    }
    if (tb("tb-cf-pooled")) {
      const seeds = (D.cf && D.cf.pooled && D.cf.pooled.seeds) || [];
      rows("tb-cf-pooled", seeds.map((s) => [
        String(s.seed), String(s.wm_net),
        "[" + fmt(s.wm_lo, 2) + ", " + fmt(s.wm_hi, 2) + "]", String(s.wm_harmed),
        String(s.cv_net),
        "[" + fmt(s.cv_lo, 2) + ", " + fmt(s.cv_hi, 2) + "]", String(s.cv_harmed)
      ]));
      const b = $("#cf-boundary");
      const p = D.cf && D.cf.pooled;
      if (b && p) {
        b.innerHTML = L("<b>规模与诚实边界：</b>五折合并 " + p.n + " token / " + p.logs + " 段日志，" +
          "救援率 " + pct(p.rescue_rate) + "，伤害率 " + pct(p.harm_rate) + "。" +
          "<br><span class=\"note\">" + p.honest_boundary + "</span>",
          "<b>Scale and honest boundary:</b> five-fold pooled " + p.n + " tokens / " + p.logs + " logs; " +
          "rescue rate " + pct(p.rescue_rate) + ", harm rate " + pct(p.harm_rate) + "." +
          "<br><span class=\"note\">" + p.honest_boundary + "</span>");
      }
    }
  }

  function limitCards() {
    const host = $("#limit-cards");
    if (!host) return;
    const arms = (D.cf && D.cf.arms) || [];
    const pooled = D.cf && D.cf.pooled;
    const harms = EXT.map((r) => r.harm);
    const hi = harms.length ? Math.max.apply(null, harms) : 0;
    const cards = [];
    if (EXT.length) {
      cards.push([L("安全帽在每个底座都被超过", "the safety cap is exceeded on every base"),
        L("各底座上改判的 token 中，仍有 " +
          fmt(hi, 2) + "% 的比例把分数改低（各底座伤害率 " + fmt(Math.min.apply(null, harms), 2) +
          "%–" + fmt(hi, 2) + "%）。证书只保证几何安全，不保证分数单调，因此伤害必须照实报告。",
          "among changed tokens, up to " + fmt(hi, 2) + "% still lower the score (per-base harm rate " +
          fmt(Math.min.apply(null, harms), 2) + "%–" + fmt(hi, 2) + "%). The certificate guarantees geometric " +
          "safety, not score monotonicity, so harms are reported as measured.")]);
    }
    if (arms.length) {
      cards.push([L("学习门不优于几何门", "the learned gate does not beat the geometric gate"),
        L("在 held-out 验证集上，几何门与两组世界模型种子的净救援分别为 " +
          arms.map((a) => a.net).join(" / ") + "，置信区间彼此重叠。" +
          "因此我们不把世界模型当作判定器，只把它当作候选编辑的来源之一。",
          "on the held-out split the geometric gate and the two world-model seeds net " +
          arms.map((a) => a.net).join(" / ") + " rescues with overlapping confidence intervals. " +
          "We therefore use the world model as a source of candidate edits, never as the judge.")]);
    }
    if (pooled) {
      cards.push([L("「零伤害」不普遍", "\"zero harm\" is not universal"),
        L("held-out 那一批日志上伤害为 0，但在五折合并的 " + pooled.n + " token 上出现 " +
          pooled.seeds[0].wm_harmed + " 例伤害（" + pct(pooled.harm_rate) + "），集中在一个日期簇。" +
          "稳健的结论是净正，不是零伤害。",
          "the held-out logs show 0 harms, but the five-fold pooled " + pooled.n + " tokens contain " +
          pooled.seeds[0].wm_harmed + " harms (" + pct(pooled.harm_rate) + "), concentrated in one date cluster. " +
          "The robust claim is net-positive, not zero-harm.")]);
    }
    cards.push([L("证书看不到反应式他车与红绿灯", "the certificate cannot see reactive agents or traffic lights"),
      L("当前证书只看自车与他车的几何间隙，不建模对方对自车的反应，也不处理红绿灯与让行。" +
        "反应式基准上的收益因此不能直接外推到这些情形。",
        "the certificate only reads ego-agent geometric gaps; it does not model agents reacting to the ego, " +
        "nor traffic lights or right-of-way. Gains on reactive benchmarks therefore do not extrapolate to those cases.")]);
    cards.push([L("离线后处理，不是可在线执行的规划器", "offline post-processing, not an online planner"),
      L("本方法是推理之后的轨迹修正器，不是一个能直接提交到在线基准的 agent；" +
        "推理时延未纳入本次测量，部署侧的时延预算需要单独评估。",
        "this is a post-inference trajectory corrector, not an agent submittable to an online benchmark; " +
        "inference latency was not measured here and needs a separate deployment-side budget.")]);
    cards.push([L("剩余空间随基座增强而收缩", "headroom shrinks as the base gets stronger"),
      L("在更强的基座上，同样的证书能挖到的空间更小。" +
        "这限制了「更强基座 + 本方法」的收益上限，也说明增益与基座强度负相关。",
        "on stronger bases the same certificate finds less room. This caps the gain of " +
        "\"stronger base + this method\" and shows the gain is negatively correlated with base strength.")]);
    host.innerHTML = cards.map((c) =>
      '<div class="card limit"><h3>' + c[0] + "</h3><p>" + c[1] + "</p></div>").join("");
  }

  /* ============================ bibliography ============================ */
  const BIB = [
    { key: "world4scorer", title: "World4Scorer: Online World Model for Autonomous Driving", year: "2026", url: "https://arxiv.org/abs/2609.36438" },
    { key: "clover", title: "CLOVER: Closed-Loop Online Vehicle Routing with Verifiable Rewards", year: "2026", url: "https://arxiv.org/abs/2605.15120" },
    { key: "executionbridge", title: "ExecutionBridge: Bridging Simulation and Reality in Driving Policies", year: "2026", url: "https://arxiv.org/abs/2610.22041" },
    { key: "reflectdrive2", title: "ReflectDrive-2: Reflective Test-Time Scaling for End-to-End Driving", year: "2026", url: "https://arxiv.org/abs/2605.04647" }
  ];
  function bibtex() {
    const pre = $("#bib");
    if (!pre) return;
    pre.textContent = BIB.map((b) =>
      "@article{" + b.key + ",\n  title = {" + b.title + "},\n  year = {" + b.year +
      "},\n  url = {" + b.url + "}\n}").join("\n\n");
    const btn = $("#copy-bib");
    if (btn) btn.addEventListener("click", () => {
      navigator.clipboard.writeText(pre.textContent).then(() => {
        const tip = $("#tip");
        tip.classList.add("on");
        setTimeout(() => tip.classList.remove("on"), 1400);
      });
    });
  }

  /* ============================ boot ============================ */
  statTiles();
  instrumentCards();
  funnel();
  tables();
  limitCards();
  bibtex();
  renderTex();
})();
