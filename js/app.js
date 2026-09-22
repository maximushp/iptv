(function () {
  "use strict";

  const LS_KEY = "xstream_config_v1";
  const PAGE_SIZE = 60;

  const state = {
    config: {
      server: "",
      username: "",
      password: "",
      mode: "auto",
      proxyPrefix: "",
      remember: true,
    },
    proxyKind: "direct",
    info: null,
    tab: "live",
    categories: { live: [], vod: [], series: [] },
    loaded: { live: false, vod: false, series: false },
    items: [],
    visible: PAGE_SIZE,
    categoryId: "",
    search: "",
    currentSeries: null,
    hls: null,
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function toast(msg, isErr) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.toggle("err", !!isErr);
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add("hidden"), 3500);
  }

  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }

  function setLoading(on) {
    const el = $("#loading");
    if (on) show(el); else hide(el);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function saveConfig() {
    localStorage.setItem(LS_KEY, JSON.stringify(state.config));
  }

  function loadConfig() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const cfg = JSON.parse(raw);
      Object.assign(state.config, cfg);
    } catch (_) {}
  }

  function fillLoginForm() {
    const c = state.config;
    $("#inp-server").value = c.server || "";
    $("#inp-user").value = c.username || "";
    $("#inp-pass").value = c.password || "";
    $("#inp-remember").checked = c.remember !== false;
    $("#inp-mode").value = c.mode || "auto";
    $("#inp-proxy").value = c.proxyPrefix || "";
    syncProxyField();
    if (c.server && c.username && c.password) {
      show($("#adv-box"));
    }
  }

  function syncProxyField() {
    const mode = $("#inp-mode").value;
    const label = $("#custom-proxy-label");
    if (mode === "custom") show(label); else hide(label);
  }

  function normalizeServer(input) {
    let url = String(input || "").trim();
    if (!url) return "";
    if (!/^https?:\/\//i.test(url)) url = "http://" + url;
    url = url.replace(/\/+$/, "");
    url = url.replace(/\/player_api\.php.*$/i, "");
    url = url.replace(/\/panel_api\.php.*$/i, "");
    return url;
  }

  function wrapProxy(url) {
    const mode = state.config.mode || "auto";
    if (mode === "direct") return url;
    if (mode === "proxy") return "/api/proxy?url=" + encodeURIComponent(url);
    if (mode === "custom") {
      const prefix = (state.config.proxyPrefix || "").trim();
      if (prefix) return prefix + encodeURIComponent(url);
      return url;
    }
    if (state.proxyKind === "builtin") {
      return "/api/proxy?url=" + encodeURIComponent(url);
    }
    return url;
  }

  async function detectProxy() {
    const mode = state.config.mode || "auto";
    if (mode === "direct") { state.proxyKind = "direct"; return; }
    if (mode === "proxy") { state.proxyKind = "builtin"; return; }
    if (mode === "custom") { state.proxyKind = "custom"; return; }
    try {
      const res = await fetch("/api/proxy", { method: "GET" });
      const ct = res.headers.get("content-type") || "";
      if (res.status === 400 && ct.includes("json")) {
        state.proxyKind = "builtin";
        return;
      }
    } catch (_) {}
    state.proxyKind = "direct";
  }

  function apiUrl(params) {
    const base = state.config.server + "/player_api.php";
    const q = new URLSearchParams({
      username: state.config.username,
      password: state.config.password,
    });
    Object.keys(params || {}).forEach((k) => {
      if (params[k] !== undefined && params[k] !== null && params[k] !== "") {
        q.set(k, params[k]);
      }
    });
    return wrapProxy(base + "?" + q.toString());
  }

  async function api(params, opts) {
    const url = apiUrl(params);
    let res;
    try {
      res = await fetch(url, opts || {});
    } catch (e) {
      throw new Error("Falha de rede/CORS. Ajuste o modo de conexão (Vercel ou proxy).");
    }
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("json")) {
      if (res.status === 404) throw new Error("Proxy não encontrado (/api/proxy). Use o Vercel ou um proxy personalizado.");
      throw new Error("Resposta inválida do servidor (HTTP " + res.status + ").");
    }
    const data = await res.json();
    if (!res.ok) throw new Error((data && data.error) || "Erro HTTP " + res.status);
    return data;
  }

  function streamUrl(kind, id, ext) {
    const s = state.config.server;
    const u = encodeURIComponent(state.config.username);
    const p = encodeURIComponent(state.config.password);
    if (kind === "live") return wrapProxy(s + "/live/" + u + "/" + p + "/" + id + (ext || ".m3u8"));
    if (kind === "movie") return wrapProxy(s + "/movie/" + u + "/" + p + "/" + id + (ext || ".mp4"));
    return wrapProxy(s + "/series/" + u + "/" + p + "/" + id + (ext || ".mp4"));
  }

  function extOf(item) {
    const e =
      item.container_extension ||
      (item.info && item.info.container_extension) ||
      "";
    return e ? "." + String(e).replace(/^\./, "") : "";
  }

  function categoryName(cat) {
    return cat.category_name || cat.name || "";
  }

  function prettyTime(v) {
    if (!v || v === "0" || v === 0) return "—";
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const d = new Date(s.replace(" ", "T"));
      if (!isNaN(d)) return d.toLocaleDateString("pt-BR");
    }
    if (/^\d+$/.test(s)) {
      const d = new Date(Number(s) * 1000);
      if (!isNaN(d) && d.getFullYear() > 1971) return d.toLocaleDateString("pt-BR");
    }
    return s;
  }

  /* ---------- Login ---------- */

  async function handleLogin(e) {
    e.preventDefault();
    const errEl = $("#login-error");
    hide(errEl);

    const server = normalizeServer($("#inp-server").value);
    const username = $("#inp-user").value.trim();
    const password = $("#inp-pass").value;
    const remember = $("#inp-remember").checked;
    const mode = $("#inp-mode").value;
    const proxyPrefix = $("#inp-proxy").value.trim();

    if (!server || !username || !password) {
      errEl.textContent = "Preencha endereço, usuário e senha.";
      show(errEl);
      return;
    }

    state.config = { server, username, password, mode, proxyPrefix, remember };

    const btn = $("#btn-login");
    btn.disabled = true;
    btn.textContent = "Conectando...";

    try {
      await detectProxy();
      const data = await api({});
      const ui = data && data.user_info;
      if (!ui || String(ui.auth) !== "1") {
        throw new Error((ui && ui.message) || "Usuário ou senha inválidos.");
      }
      state.info = data;
      if (remember) saveConfig();
      else localStorage.removeItem(LS_KEY);
      enterApp();
    } catch (err) {
      errEl.textContent = err.message || String(err);
      show(errEl);
    } finally {
      btn.disabled = false;
      btn.textContent = "Entrar";
    }
  }

  function enterApp() {
    hide($("#login-screen"));
    show($("#app-screen"));
    renderAccount();
    switchTab("live");
  }

  function logout() {
    stopPlayback();
    state.info = null;
    state.items = [];
    state.loaded = { live: false, vod: false, series: false };
    state.categories = { live: [], vod: [], series: [] };
    hide($("#app-screen"));
    show($("#login-screen"));
    toast("Sessão encerrada.");
  }

  /* ---------- Tabs / lists ---------- */

  function switchTab(tab) {
    state.tab = tab;
    $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));

    const isAccount = tab === "account";
    const toolbar = $("#toolbar");
    if (isAccount) {
      hide(toolbar);
      hide($("#grid"));
      hide($("#btn-more"));
      hide($("#empty-state"));
      show($("#account-panel"));
      renderAccount();
      return;
    }
    hide($("#account-panel"));
    show(toolbar);
    show($("#grid"));
    state.search = "";
    $("#inp-search").value = "";
    state.categoryId = "";
    state.visible = PAGE_SIZE;
    ensureTabData();
  }

  async function ensureTabData() {
    const tab = state.tab;
    setLoading(true);
    try {
      if (!state.loaded[tab]) {
        const catAction = { live: "get_live_categories", vod: "get_vod_categories", series: "get_series_categories" }[tab];
        state.categories[tab] = (await api({ action: catAction })) || [];
        state.loaded[tab] = true;
        renderCategorySelect();
        await loadItems();
      } else {
        renderCategorySelect();
        renderGrid();
      }
    } catch (err) {
      toast(err.message, true);
    } finally {
      setLoading(false);
    }
  }

  function renderCategorySelect() {
    const sel = $("#inp-category");
    const cats = state.categories[state.tab] || [];
    const first = '<option value="">Todas as categorias</option>';
    sel.innerHTML = first + cats.map((c) =>
      '<option value="' + escapeHtml(c.category_id) + '">' + escapeHtml(categoryName(c)) + "</option>"
    ).join("");
    sel.value = state.categoryId;
  }

  async function loadItems() {
    setLoading(true);
    try {
      const tab = state.tab;
      const actions = { live: "get_live_streams", vod: "get_vod_streams", series: "get_series" };
      const params = { action: actions[tab] };
      if (state.categoryId) params.category_id = state.categoryId;
      let list = (await api(params)) || [];
      if (!Array.isArray(list)) list = [];
      state.items = list;
      state.visible = PAGE_SIZE;
      renderGrid();
    } catch (err) {
      toast(err.message, true);
      state.items = [];
      renderGrid();
    } finally {
      setLoading(false);
    }
  }

  function filteredItems() {
    const q = state.search.toLowerCase();
    if (!q) return state.items;
    return state.items.filter((it) => {
      const name = it.name || it.title || "";
      return String(name).toLowerCase().includes(q);
    });
  }

  function renderGrid() {
    const grid = $("#grid");
    const list = filteredItems();
    const slice = list.slice(0, state.visible);
    const tab = state.tab;

    if (!list.length) {
      grid.innerHTML = "";
      show($("#empty-state"));
      hide($("#btn-more"));
      return;
    }
    hide($("#empty-state"));

    grid.innerHTML = slice.map((it) => {
      const name = it.name || it.title || "Sem nome";
      const icon = it.stream_icon || it.cover || it.movie_image || "";
      const num = tab === "live" ? it.num || "" : "";
      const sub = tab === "live"
        ? (it.tv_genre || "")
        : tab === "vod"
          ? (it.year || (it.releaseDate ? String(it.releaseDate).slice(0, 4) : ""))
          : (it.genre || "");
      const liveClass = tab === "live" ? " is-live" : "";
      const thumb = icon
        ? '<img loading="lazy" src="' + escapeHtml(icon) + '" alt="" onerror="this.style.display=\'none\'">'
        : '<span class="ph">▶</span>';
      const badge = num ? '<span class="badge">' + escapeHtml(num) + "</span>" : "";
      return (
        '<article class="card' + liveClass + '" data-id="' + escapeHtml(it.stream_id || it.series_id || "") + '">' +
          '<div class="card-thumb">' + badge + thumb + "</div>" +
          '<div class="card-title" title="' + escapeHtml(name) + '">' + escapeHtml(name) + "</div>" +
          (sub ? '<div class="card-sub">' + escapeHtml(sub) + "</div>" : "") +
        "</article>"
      );
    }).join("");

    const more = $("#btn-more");
    if (list.length > state.visible) show(more); else hide(more);
  }

  function findItem(id) {
    return state.items.find((it) => String(it.stream_id || it.series_id) === String(id));
  }

  /* ---------- Account ---------- */

  function renderAccount() {
    const panel = $("#account-panel");
    const data = state.info || {};
    const ui = data.user_info || {};
    const si = data.server_info || {};
    const active = String(ui.status) === "Active" || String(ui.status) === "1" || String(ui.auth) === "1";
    const rows = [
      ["Usuário", ui.username || state.config.username],
      ["Status", '<span class="' + (active ? "status-ok" : "status-bad") + '">' + escapeHtml(ui.status || "—") + "</span>"],
      ["Expira em", prettyTime(ui.exp_date)],
      ["Conexões", (ui.active_cons || "0") + " / " + (ui.max_connections || "—")],
      ["Tipo de conta", ui.is_trial === "1" ? "Trial" : "Premium"],
      ["Servidor", escapeHtml(state.config.server)],
      ["Timezone", si.timezone || "—"],
      ["URL do portal", escapeHtml(si.url || "—")],
    ];
    panel.innerHTML =
      "<h2>Informações da conta</h2><dl>" +
      rows.map((r) => "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>").join("") +
      "</dl>";
  }

  /* ---------- Player ---------- */

  function stopPlayback() {
    const video = $("#video");
    video.removeAttribute("src");
    video.load();
    if (state.hls) {
      state.hls.destroy();
      state.hls = null;
    }
  }

  function playerError(msg) {
    const el = $("#player-msg");
    el.textContent = msg;
    show(el);
  }

  function playSrc(src, title) {
    $("#player-title").textContent = title || "Reproduzindo";
    hide($("#player-msg"));
    const video = $("#video");

    if (state.hls) { state.hls.destroy(); state.hls = null; }

    const isHls = /\.m3u8($|\?)/i.test(src) || src.includes("format=m3u8");
    if (isHls && window.Hls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      state.hls = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data && data.fatal) {
          playerError("Erro ao reproduzir o stream. Verifique as credenciais ou tente outro canal.");
        }
      });
    } else if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
    } else {
      video.src = src;
    }

    video.play().catch(() => {
      playerError("Clique no play para iniciar o vídeo.");
      hide($("#player-msg"));
    });
  }

  async function openItem(id) {
    const item = findItem(id);
    if (!item) return;

    hide($("#epg-box"));
    hide($("#series-box"));
    hide($("#plot-box"));
    state.currentSeries = null;

    if (state.tab === "live") {
      const name = item.name || "Ao vivo";
      const src = item.direct_source || streamUrl("live", item.stream_id, ".m3u8");
      show($("#player-modal"));
      playSrc(src, name);
      loadEpg(item);
      return;
    }

    if (state.tab === "vod") {
      const name = item.name || "Filme";
      show($("#player-modal"));
      $("#player-title").textContent = name;
      setLoading(true);
      try {
        let info = null;
        try {
          info = await api({ action: "get_vod_info", vod_id: item.stream_id });
        } catch (_) {}
        const movieData = (info && (info.movie_data || info.info)) || {};
        const ext = extOf(movieData) || extOf(item) || ".mp4";
        const src = item.direct_source || (info && info.direct_source) || streamUrl("movie", item.stream_id, ext);
        const meta = (info && info.info) || item.info || {};
        if (meta.plot || meta.description) {
          $("#plot-box").innerHTML = "<strong>Sinopse</strong><br>" + escapeHtml(meta.plot || meta.description);
          show($("#plot-box"));
        }
        playSrc(src, name);
      } catch (err) {
        playerError(err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (state.tab === "series") {
      show($("#player-modal"));
      $("#player-title").textContent = item.name || "Série";
      setLoading(true);
      try {
        const data = await api({ action: "get_series_info", series_id: item.series_id });
        state.currentSeries = data || {};
        buildSeriesControls(data);
        if (metaPlot(data)) {
          $("#plot-box").innerHTML = "<strong>Sinopse</strong><br>" + escapeHtml(metaPlot(data));
          show($("#plot-box"));
        }
      } catch (err) {
        playerError(err.message);
      } finally {
        setLoading(false);
      }
    }
  }

  function metaPlot(data) {
    const i = (data && (data.info || data)) || {};
    return i.plot || i.description || "";
  }

  function buildSeriesControls(data) {
    const box = $("#series-box");
    const episodes = (data && data.episodes) || {};
    const seasons = Object.keys(episodes).sort((a, b) => Number(a) - Number(b));
    if (!seasons.length) {
      hide(box);
      playerError("Nenhum episódio encontrado.");
      return;
    }
    const seasonSel = $("#inp-season");
    const epSel = $("#inp-episode");
    seasonSel.innerHTML = seasons.map((s) =>
      '<option value="' + escapeHtml(s) + '">Temporada ' + escapeHtml(s) + "</option>"
    ).join("");
    show(box);

    const fillEpisodes = () => {
      const season = seasonSel.value;
      const list = episodes[season] || [];
      epSel.innerHTML = list.map((ep) =>
        '<option value="' + escapeHtml(ep.id) + '">E' + escapeHtml(ep.episode_num || "?") +
        (ep.title ? " — " + escapeHtml(ep.title) : "") + "</option>"
      ).join("");
      if (list.length) playEpisode(list[0]);
    };

    seasonSel.onchange = fillEpisodes;
    epSel.onchange = () => {
      const season = seasonSel.value;
      const list = episodes[season] || [];
      const ep = list.find((e) => String(e.id) === String(epSel.value));
      if (ep) playEpisode(ep);
    };
    fillEpisodes();
  }

  function playEpisode(ep) {
    const ext = extOf(ep) || ".mp4";
    const src = ep.direct_source || streamUrl("series", ep.id, ext);
    $("#player-title").textContent =
      ($("#inp-season option:checked") ? $("#inp-season option:checked").textContent + " · " : "") +
      (ep.title || "Episódio " + (ep.episode_num || ""));
    playSrc(src, $("#player-title").textContent);
  }

  async function loadEpg(item) {
    try {
      const data = await api({
        action: "get_short_epg",
        stream_id: item.stream_id,
        limit: 3,
      });
      const epg = (data && data.epg_listings) || [];
      if (!epg.length) return;
      const decode = (s) => {
        try {
          return decodeURIComponent(String(s).replace(/\s+/g, "")).replace(/<[^>]+>/g, " ").trim();
        } catch (_) {
          return String(s);
        }
      };
      const html = epg.map((e) => {
        const t = decode(e.title || "");
        const time = String(e.start || "").replace("T", " ").slice(0, 16);
        return "<div>🕒 " + escapeHtml(time) + " — <strong>" + escapeHtml(t) + "</strong></div>";
      }).join("");
      $("#epg-box").innerHTML = "<strong>Programação (EPG)</strong><br>" + html;
      show($("#epg-box"));
    } catch (_) {}
  }

  function closePlayer() {
    hide($("#player-modal"));
    stopPlayback();
    hide($("#epg-box"));
    hide($("#series-box"));
    hide($("#plot-box"));
  }

  /* ---------- Events ---------- */

  $("#login-form").addEventListener("submit", handleLogin);
  $("#btn-adv").addEventListener("click", () => {
    const box = $("#adv-box");
    box.classList.toggle("hidden");
  });
  $("#inp-mode").addEventListener("change", syncProxyField);
  $("#btn-logout").addEventListener("click", logout);

  $$(".tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  $("#inp-category").addEventListener("change", (e) => {
    state.categoryId = e.target.value;
    state.visible = PAGE_SIZE;
    loadItems();
  });

  let searchTimer;
  $("#inp-search").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = e.target.value.trim();
      state.visible = PAGE_SIZE;
      renderGrid();
    }, 180);
  });

  $("#btn-refresh").addEventListener("click", async () => {
    if (state.tab === "account") return;
    state.loaded[state.tab] = false;
    state.categories[state.tab] = [];
    await ensureTabData();
    toast("Atualizado.");
  });

  $("#btn-more").addEventListener("click", () => {
    state.visible += PAGE_SIZE;
    renderGrid();
  });

  $("#grid").addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (card && card.dataset.id) openItem(card.dataset.id);
  });

  $$("#player-modal [data-close]").forEach((el) => {
    el.addEventListener("click", closePlayer);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#player-modal").classList.contains("hidden")) {
      closePlayer();
    }
  });

  /* ---------- Init ---------- */

  loadConfig();
  fillLoginForm();
  detectProxy();
})();
