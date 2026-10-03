function boot() {
// Till for Home, Vouchers, Analytics, and Failed Uploads.
    const NAV = [
      ["Overview", ["Home", "Analytics"]],
      ["Operations", ["Vouchers", "Failed Uploads"]],
      ["Users & safety", ["Users", "Banned", "Feedback"]],
      ["System", ["Health Check", "Evals", "Checks", "Settings"]],
    ];
    const WEEKS = [
      ["Sep 28", 287, 2, 1],
      ["Sep 21", 395, 9, 2],
      ["Sep 14", 355, 8, 2],
      ["Sep 7", 373, 8, 2],
      ["Aug 31", 379, 10, 3],
      ["Aug 24", 370, 1, 0],
      ["Aug 17", 343, 5, 1],
      ["Aug 10", 362, 5, 1],
      ["Aug 3", 386, 7, 2],
      ["Jul 27", 374, 17, 5],
      ["Jul 20", 356, 6, 2],
      ["Jul 13", 379, 5, 1],
    ];
    const GROWTH_30 = [46, 51, 54, 58, 60, 62, 64, 86, 90, 91, 93, 95, 98, 101, 104, 107, 110, 114, 118];
    const GROWTH_ALL = [12, 18, 22, 28, 35, 40, 48, 55, 60, 64, 70, 88, 96, 104, 118];
    const VOUCHERS = [
      { id: "js799t51edfj6cfmjjsv8g9pkn8fjntg", type: 10, who: "cindy", status: "available", exp: "5 Oct 2026", up: "3 Oct, 18:01", kind: "photo", offer: "SAVE €10", fine: "When you spend €50 or more on Groceries.", code: "270734 134504" },
      { id: "js7d84d8d6vs5p84b9ayhnbpqn8fkcyj", type: 5, who: "aoife", status: "available", exp: "Today", up: "3 Oct, 17:31", kind: "clean", offer: "€5 OFF €25", fine: "Valid 27 Sep – 3 Oct", code: "2707349 7527 72", soon: true },
      { id: "js7c9hec3ddnyspnj7vck88586822bz", type: 5, who: "aoife", status: "claimed", exp: "3 Oct 2026", up: "3 Oct, 17:31", kind: "clean", offer: "€5 OFF €25", fine: "Valid 27 Sep – 3 Oct", code: "2707235 3923 58" },
      { id: "js8aa21c0thursday0000000000001", type: 5, who: "liam", status: "available", exp: "Thursday", up: "2 Oct, 11:04", kind: "clean", offer: "€5 OFF €25", fine: "Valid 2 Oct – 8 Oct", code: "2707011 2201 19", soon: true },
      { id: "js1photo0save1euro000000000002", type: 5, who: "mae", status: "available", exp: "4 Oct 2026", up: "1 Oct, 09:12", kind: "photo", offer: "SAVE €1", fine: "On Groceries. Voucher valid for 7 days.", code: "2706881 1044 02" },
      { id: "js10photo0grid000000000000003", type: 10, who: "cian", status: "available", exp: "6 Oct 2026", up: "3 Oct, 16:44", kind: "photo", offer: "SAVE €10", fine: "When you spend €50 or more on Groceries.", code: "2707341 34504" },
      { id: "js20claimed000000000000000004", type: 20, who: "nora", status: "claimed", exp: "1 Oct 2026", up: "28 Sep, 13:20", kind: "clean", offer: "€20 OFF €80", fine: "Valid 24 Sep – 1 Oct", code: "2706900 1188 40" },
      { id: "js5flat0000000000000000000005", type: 10, who: "ruth", status: "available", exp: "9 Oct 2026", up: "3 Oct, 08:02", kind: "clean", offer: "€10 OFF €40", fine: "Valid 3 Oct – 9 Oct", code: "2707550 4410 11" },
    ];
    const PAGE_BY_NAV = { Home: "home", Analytics: "analytics", Vouchers: "vouchers", "Failed Uploads": "failed" };
    const NAV_BY_PAGE = { home: "Home", analytics: "Analytics", vouchers: "Vouchers", failed: "Failed Uploads" };
    const TX_30 = [
      ["Admin expiry deduction", 1], ["Admin reports deduction", 1], ["Admin claim returned", 22], ["Claim spend", 1559],
      ["Refund", 15], ["Replacement received", 77], ["Self invalidated", 4], ["Signup bonus", 112],
      ["Upload reward", 1563], ["Uploader denied", 53], ["Uploader refund", 19],
    ];
    const TX_ALL = TX_30.map(([label, n]) => [label, n < 20 ? n : Math.round(n * 3.4)]);
    const CMD_30 = [
      ["App", 0], ["Balance", 27], ["Claim €10", 965], ["Claim €20", 76],
      ["Claim €5", 708], ["Donate", 0], ["FAQ", 1], ["Feedback", 0],
      ["Feedback with text", 0], ["Help", 5], ["Image upload", 1684], ["Share", 0], ["Start", 115],
    ];
    const CMD_ALL = CMD_30.map(([label, n]) => [label, n === 0 ? 0 : Math.round(n * 3.1)]);
    const EVENTS_30 = [
      ["App home views", 2404], ["Menu: My Uploads", 812], ["Menu: My Claims", 640], ["Menu: Share", 190],
      ["Share: WhatsApp", 96], ["Share: Copy text", 41],
    ];
    const UNKNOWN = [
      { who: "mairead", when: "2 Oct, 19:14", tag: "Return voucher", text: "the till said this was already used, can i have the credit back" },
      { who: "paul", when: "1 Oct, 08:40", tag: "How does it work", text: "do i send the photo before or after i pay" },
      { who: "aoife", when: "28 Sep, 21:02", tag: "Unknown", text: "thanks so much this is class" },
    ];
    const FAILS = [
      { id: "jn7am232q2zt8gx6dse29hfqjd7zgzxr", type: 5, who: "kdarkhan", reason: "COULD_NOT_READ_EXPIRY_DATE", at: "30 Sep, 11:29", kind: "history" },
      { id: "jn7f8pswdy1rnxz8x6yb58a6a8daj9j03", type: 5, who: "donghwan", reason: "EXPIRED", at: "29 Sep, 10:05", kind: "phone" },
      { id: "jn78fandvzpxt6xeysaavxzn98813eer", type: 5, who: "e_ocampo", reason: "COULD_NOT_READ_EXPIRY_DATE", at: "28 Sep, 12:44", kind: "paper" },
      { id: "jnwallet0niamh000000000000001", type: 10, who: "niamh", reason: "EXPIRED", at: "27 Sep, 16:18", kind: "wallet" },
      { id: "jnmail0sean000000000000000002", type: 5, who: "sean", reason: "COULD_NOT_READ_EXPIRY_DATE", at: "26 Sep, 09:41", kind: "mail" },
      { id: "jnpaper0orla00000000000000003", type: 5, who: "orla", reason: "EXPIRED", at: "25 Sep, 14:02", kind: "paper" },
      { id: "jntoolate0cian000000000000004", type: 5, who: "cian", reason: "TOO_LATE_TODAY", at: "3 Oct, 18:55", kind: "phone" },
      { id: "jndupe0ruth000000000000000005", type: 10, who: "ruth", reason: "DUPLICATE_BARCODE", at: "3 Oct, 12:11", kind: "paper" },
    ];

    const params = new URLSearchParams(location.search);
    const state = {
      page: ["vouchers", "analytics", "failed"].includes(params.get("page")) ? params.get("page") : "home",
      filter: "all",
      failFilter: "open",
      range: "30",
      env: "Production",
      selected: VOUCHERS[0].id,
      checked: {},
      openNav: false,
      collapsed: {},
    };

    function writeUrl() {
      const next = new URLSearchParams();
      next.set("page", state.page);
      history.replaceState(null, "", "?" + next.toString());
    }

    function barcode(seed) {
      let n = 7;
      for (const c of seed) n = (n * 33 + c.charCodeAt(0)) >>> 0;
      let html = "";
      for (let i = 0; i < 42; i++) {
        n = (n * 1664525 + 1013904223) >>> 0;
        const w = (n % 3) + 1;
        const on = n % 4 !== 0;
        html += `<i class="${on ? "on" : ""}" style="width:${w}px"></i>`;
      }
      return html;
    }

    function receipt(v, compact) {
      const photo = v.kind === "photo";
      return `<div class="receipt ${photo ? "photo" : "clean"}" ${compact ? "" : ""}>
        <div class="slip">
          <div class="store">DUNNES<small>STORES</small></div>
          ${photo ? `<div class="script">Always better value</div><div class="offer">${v.offer}</div>` : `<div class="deal">${v.offer}</div>${v.soon ? `<div class="exp">Expires ${v.exp}</div>` : ""}`}
          <div class="fine">${v.fine}</div>
          <div class="bars">${barcode(v.id)}</div>
          <div class="code">${v.code}</div>
          <div class="terms">Terms and conditions apply</div>
        </div>
      </div>`;
    }

    function statusPill(status) {
      return `<span class="status ${status}">${status}</span>`;
    }

    function sidebar() {
      const current = NAV_BY_PAGE[state.page];
      const groups = NAV.map(([label, items]) => {
        const shut = state.collapsed[label];
        const buttons = shut ? "" : items.map((item) => {
          const on = item === current ? ` aria-current="page"` : "";
          return `<button class="nav-btn" data-act="nav" data-item="${item}"${on}>${item}</button>`;
        }).join("");
        return `<div class="group">
          <button class="group-h" data-act="group" data-item="${label}">${label} <span>${shut ? "+" : "–"}</span></button>
          ${buttons}
        </div>`;
      }).join("");
      return `<aside class="sidebar${state.openNav ? " open" : ""}">
        <div class="brand"><span class="mark">V</span><span><strong>Voucher Admin</strong><em>${state.env}</em></span></div>
        ${groups}
        <div class="side-foot">
          <select data-act="env" aria-label="Environment">
            <option ${state.env === "Production" ? "selected" : ""}>Production</option>
            <option ${state.env === "Dev" ? "selected" : ""}>Dev</option>
          </select>
          <button class="ghost" type="button">Logout</button>
        </div>
      </aside>
      <div class="scrim${state.openNav ? " show" : ""}" data-act="scrim"></div>`;
    }

    function top(section, title) {
      return `<header class="top">
        <button class="menu" type="button" data-act="menu" aria-label="Open menu">☰</button>
        <div style="flex:1">
          <div class="eyebrow">${section}</div>
          <h1>${title}</h1>
        </div>
        <div class="env">${state.env}</div>
      </header>`;
    }

    function chart(values) {
      const w = 640, h = 180;
      const lo = Math.min(...values) - 6;
      const hi = Math.max(...values) + 6;
      const sx = (i) => (i * w) / (values.length - 1);
      const sy = (v) => ((hi - v) / (hi - lo)) * h;
      const pts = values.map((v, i) => [sx(i), sy(v)]);
      const line = pts.map((p) => p.join(",")).join(" ");
      const area = `0,${h} ${line} ${w},${h}`;
      const ticks = [Math.round(hi - 4), Math.round((hi + lo) / 2), Math.round(lo + 4)];
      const grid = [16, h / 2, h - 16].map((y) =>
        `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="rgba(243,236,220,0.08)" stroke-dasharray="3 4"/>`
      ).join("");
      return `<div class="chart-wrap">
        <div class="ylabs"><span>${ticks[0]}</span><span>${ticks[1]}</span><span>${ticks[2]}</span></div>
        <svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="User growth">
          ${grid}
          <polygon points="${area}" fill="rgba(226,177,90,0.16)"/>
          <polyline points="${line}" fill="none" stroke="#e2b15a" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
        </svg>
      </div>`;
    }

    function weekRows() {
      const head = `<div class="week-h"><span>Week</span><span></span><span class="right hide-sm">Total</span><span class="right hide-sm">Failed</span><span class="right">Rate</span></div>`;
      const rows = WEEKS.map(([label, total, failed, rate]) => {
        const tone = rate >= 5 ? "hot" : rate === 0 ? "zero" : "";
        return `<div class="week">
          <span>${label}</span>
          <div class="bar ${tone}"><span style="width:${(rate / 5) * 100}%"></span></div>
          <span class="right hide-sm">${total}</span>
          <span class="right hide-sm">${failed}</span>
          <span class="pill ${tone}">${rate}%</span>
        </div>`;
      }).join("");
      return head + `<div class="weeks">${rows}</div>`;
    }

    function rangeControl() {
      return `<div class="seg" role="group" aria-label="Range">
        <button type="button" data-act="range" data-item="30" aria-pressed="${state.range === "30"}">Last 30 days</button>
        <button type="button" data-act="range" data-item="all" aria-pressed="${state.range === "all"}">All</button>
      </div>`;
    }

    function homeA() {
      return `${top("Overview", "Home")}
        <p class="lead"><b>84</b> on the shelf. Nothing at €20.</p>
        <div class="stats">
          <div class="stat stock"><div class="k">€5 available</div><div class="n">50</div></div>
          <div class="stat stock"><div class="k">€10 available</div><div class="n">34</div></div>
          <div class="stat zero"><div class="k">€20 available</div><div class="n">0</div></div>
        </div>
        <div class="stats">
          <div class="stat"><div class="k">Total uploaded</div><div class="n">9,962</div></div>
          <div class="stat"><div class="k">Vouchers claimed</div><div class="n">7,821</div></div>
          <div class="stat"><div class="k">Users</div><div class="n">1,455</div></div>
        </div>
        <section class="section">
          <h2>Weekly upload failure rate</h2>
          ${weekRows()}
        </section>
        <section class="chart-card">
          <div class="chart-h"><h2 style="margin:0">User growth</h2>${rangeControl()}</div>
          ${chart(state.range === "30" ? GROWTH_30 : GROWTH_ALL)}
        </section>`;
    }

    function filtered() {
      return VOUCHERS.filter((v) => {
        if (state.filter === "available") return v.status === "available";
        if (state.filter === "claimed") return v.status === "claimed";
        if (state.filter === "soon") return v.soon;
        return true;
      });
    }

    function filters() {
      const items = [["all", "All"], ["available", "Available"], ["claimed", "Claimed"], ["soon", "Expiring"]];
      return `<div class="filters">${items.map(([id, label]) =>
        `<button type="button" data-act="filter" data-item="${id}" aria-pressed="${state.filter === id}">${label}</button>`
      ).join("")}</div>`;
    }

    function meta(v) {
      const exp = v.soon ? `<span class="soon">Expires ${v.exp}</span>` : `Expires ${v.exp}`;
      const result = state.checked[v.id] ? `<div class="result">${state.checked[v.id]}</div>` : "";
      return `<div class="vrow"><span class="amount">€${v.type}</span>${statusPill(v.status)}</div>
        <div class="who">${v.who}</div>
        <div class="dates">${exp}</div>
        <div class="dates">Uploaded ${v.up}</div>
        <div class="id">${v.id}</div>
        <div class="id-row">
          <button class="check" type="button" data-act="check" data-item="${v.id}">Check</button>
        </div>
        ${result}`;
    }

    function vouchersA() {
      const list = filtered();
      const cards = list.map((v) => `<article class="vcard">
        <div class="well">${receipt(v)}</div>
        <div class="vmeta">${meta(v)}</div>
      </article>`).join("");
      return `${top("Operations", "Vouchers")}
        <div class="toolbar">
          <div>
            <p class="lead" style="margin:0">Showing <b>${list.length}</b></p>
          </div>
          ${filters()}
        </div>
        <div class="cards">${cards || `<p class="lead">Nothing in this filter.</p>`}</div>`;
    }

    function statTiles(rows) {
      return `<div class="stats four">${rows.map(([label, n]) => {
        const tone = n === 0 ? "zero" : n >= 500 ? "stock" : "";
        return `<div class="stat ${tone}"><div class="k">${label}</div><div class="n">${n.toLocaleString("en-IE")}</div></div>`;
      }).join("")}</div>`;
    }

    function analyticsPage() {
      const tx = state.range === "30" ? TX_30 : TX_ALL;
      const cmds = state.range === "30" ? CMD_30 : CMD_ALL;
      const events = state.range === "30" ? EVENTS_30 : EVENTS_30.map(([label, n]) => [label, Math.round(n * 3.1)]);
      const total = tx.reduce((sum, [, n]) => sum + n, 0);
      const inbound = state.range === "30" ? "3,789" : "12,410";
      const notWorking = state.range === "30" ? 86 : 240;
      const unknown = state.range === "30" ? UNKNOWN : UNKNOWN.slice(0, 1);
      return `${top("Overview", "Analytics")}
        <div class="toolbar">
          <p class="lead" style="margin:0"><b>${inbound}</b> inbound messages${state.range === "30" ? ", last 30 days" : ", all time"}.</p>
          ${rangeControl()}
        </div>
        <section class="section" style="margin-top:8px">
          <h2>Transaction totals by type</h2>
          ${statTiles(tx)}
          <p class="note">${total.toLocaleString("en-IE")} total transactions</p>
          <div class="alert">
            <div class="k">Vouchers reported as not working</div>
            <div class="n">${notWorking}</div>
          </div>
        </section>
        <section class="section">
          <h2>Known commands</h2>
          ${statTiles(cmds)}
        </section>
        <section class="section">
          <h2>App events</h2>
          ${statTiles(events)}
        </section>
        <section class="section">
          <h2>Unknown messages</h2>
          <div class="msgs">${unknown.map((item) => `<article class="msg">
            <div class="vrow"><span class="who" style="color:var(--text)">${item.who}</span><span class="dates">${item.when}</span></div>
            <span class="tag">${item.tag}</span>
            <p>${item.text}</p>
          </article>`).join("")}</div>
        </section>`;
    }

    function shot(item) {
      if (item.kind === "paper") {
        return receipt({
          id: item.id,
          kind: "clean",
          offer: `€${item.type} OFF €${item.type * 5}`,
          soon: item.reason === "EXPIRED",
          exp: "Sunday",
          fine: "When you spend €25 or more on Groceries.",
          code: "2707235 3923 58",
        });
      }
      if (item.kind === "wallet") {
        return `<div class="shot wallet"><div class="pass"><div class="store">DUNNES<small>STORES</small></div><div class="deal">€${item.type} OFF €${item.type * 5}</div><div class="bars">${barcode(item.id)}</div></div></div>`;
      }
      if (item.kind === "mail") {
        return `<div class="shot mail"><div class="mail-sheet"><strong>Reply to Dunnes</strong><div class="ln"></div><div class="ln" style="width:80%"></div><div class="ln" style="width:66%"></div><div class="keys"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div></div>`;
      }
      if (item.kind === "history") {
        return `<div class="shot history"><div class="bezel"><div class="screen"><div class="shot-h">Voucher history</div><div class="hist"><span>€5 off €20</span><em>Redeemed</em></div><div class="hist"><span>€5 off €25</span><em>Redeemed</em></div><div class="hist"><span>€10 off €50</span><em>Redeemed</em></div><div class="hist"><span>€10 off €50</span><em>Redeemed</em></div></div></div></div>`;
      }
      return `<div class="shot phone"><div class="bezel"><div class="screen" style="display:grid;place-items:center;text-align:center"><div class="store">DUNNES<small>STORES</small></div><div class="deal" style="font-size:16px">€${item.type} OFF €${item.type * 5}</div><div class="fine">Expires Sunday</div><div class="bars">${barcode(item.id)}</div></div></div></div>`;
    }

    function failedList() {
      if (state.failFilter === "open") {
        return FAILS.filter((item) => item.reason !== "TOO_LATE_TODAY" && item.reason !== "DUPLICATE_BARCODE");
      }
      return FAILS.filter((item) => item.reason === state.failFilter);
    }

    function failedPage() {
      const list = failedList();
      const chips = [
        ["open", "Open"],
        ["COULD_NOT_READ_EXPIRY_DATE", "Unreadable expiry"],
        ["EXPIRED", "Expired"],
        ["TOO_LATE_TODAY", "Too late"],
        ["DUPLICATE_BARCODE", "Duplicate"],
      ];
      const filters = `<div class="filters">${chips.map(([id, label]) =>
        `<button type="button" data-act="fail" data-item="${id}" aria-pressed="${state.failFilter === id}">${label}</button>`
      ).join("")}</div>`;
      const cards = list.map((item) => `<article class="vcard">
        <div class="well">${shot(item)}</div>
        <div class="vmeta">
          <div class="vrow"><span class="amount">€${item.type}</span><span class="status claimed">failed</span></div>
          <div class="who">${item.who}</div>
          <div class="reason"><span>${item.reason}</span></div>
          <div class="id">${item.id}</div>
          <div class="dates">Failed ${item.at}</div>
        </div>
      </article>`).join("");
      return `${top("Operations", "Failed uploads")}
        <div class="toolbar">
          <p class="lead" style="margin:0">Showing <b>${list.length}</b>${state.failFilter === "open" ? ". Too late and duplicates sit in their own filters." : ""}</p>
          ${filters}
        </div>
        <div class="cards">${cards || `<p class="lead">Nothing in this filter.</p>`}</div>`;
    }

    function render() {
      try {
      const page = {
        vouchers: vouchersA,
        analytics: analyticsPage,
        failed: failedPage,
      }[state.page] || homeA;
      document.getElementById("app").innerHTML = `<div class="shell">${sidebar()}<main class="main">${page()}</main></div>`;
      document.title = "Admin prototype";
      writeUrl();
      } catch (err) {
        const app = document.getElementById("app");
        if (app) app.textContent = err.stack || err.message;
      }
    }

    document.getElementById("app").addEventListener("click", (event) => {
      const el = event.target.closest("[data-act]");
      if (!el) return;
      const act = el.dataset.act;
      const item = el.dataset.item;
      if (act === "nav") {
        if (!PAGE_BY_NAV[item]) return;
        state.page = PAGE_BY_NAV[item];
        state.openNav = false;
      } else if (act === "group") {
        state.collapsed[item] = !state.collapsed[item];
      } else if (act === "menu") {
        state.openNav = true;
      } else if (act === "scrim") {
        state.openNav = false;
      } else if (act === "filter") {
        state.filter = item;
      } else if (act === "range") {
        state.range = item;
      } else if (act === "select") {
        state.selected = item;
      } else if (act === "fail") {
        state.failFilter = item;
      } else if (act === "check") {
        const v = VOUCHERS.find((row) => row.id === item);
        state.checked[item] = v.status === "claimed" ? "Dunnes: already redeemed" : `Dunnes: valid · €${v.type} balance`;
      }
      render();
    });

    document.getElementById("app").addEventListener("change", (event) => {
      const el = event.target.closest("[data-act='env']");
      if (!el) return;
      state.env = el.value;
      render();
    });

    render();

}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
