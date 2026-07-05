// Runs on the local catalog HTML file (file:///*).
//
// Two responsibilities:
// 1. Floating "now watching" widget, driven by chrome.storage.local's
//    "nowWatching" (live, transient — disappears when the YouTube tab closes).
// 2. Persistent per-card progress bar, driven by chrome.storage.local's
//    "watchProgress" map (never cleared). This is written directly into
//    the catalog's own localStorage under the "videos" key, so the
//    percentage survives page reloads even without the extension running.

(function () {
  const STALE_WIDGET_MS = 8000; // hide the floating widget if no update in 8s
  const CATALOG_KEY = 'videos';
  let widget = null;
  const lastWrittenPct = {}; // avoid redundant localStorage writes

  function fmtTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- Floating "now watching" widget ----------

  function ensureWidget() {
    if (widget) return widget;
    widget = document.createElement('div');
    widget.id = '__yt_vault_now_watching';
    widget.style.cssText = `
      position: fixed;
      bottom: 22px;
      right: 22px;
      z-index: 999999;
      background: #1d1e24;
      border: 1px solid #33343c;
      border-radius: 12px;
      padding: 14px 16px;
      width: 280px;
      font-family: 'IBM Plex Mono', monospace;
      color: #ece9e2;
      box-shadow: 0 12px 32px rgba(0,0,0,0.45);
    `;
    document.body.appendChild(widget);
    return widget;
  }

  function removeWidget() {
    if (widget) {
      widget.remove();
      widget = null;
    }
  }

  function renderWidget(state) {
    if (!state || (Date.now() - state.updatedAt) > STALE_WIDGET_MS) {
      removeWidget();
      return;
    }
    const pct = Math.min(100, Math.max(0, (state.currentTime / state.duration) * 100));
    const w = ensureWidget();
    w.innerHTML = `
      <div style="font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:#e3a24c; margin-bottom:7px;">
        ${state.paused ? '⏸ на паузе' : '▶ сейчас смотрится'}
      </div>
      <div style="font-family:'Inter',sans-serif; font-size:13px; font-weight:600; margin-bottom:9px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(state.title)}">
        ${escapeHtml(state.title)}
      </div>
      <div style="background:#33343c; border-radius:5px; height:6px; overflow:hidden; margin-bottom:7px;">
        <div style="background:#e3a24c; height:100%; width:${pct}%;"></div>
      </div>
      <div style="font-size:11px; color:#a7a49c;">${fmtTime(state.currentTime)} / ${fmtTime(state.duration)}</div>
    `;
  }

  // ---------- Persistent per-card progress ----------

  function updateCardDom(id, pct) {
    const el = document.querySelector(`.watch-progress[data-video-id="${id}"]`);
    if (!el) return; // video isn't in this catalog
    el.style.display = 'flex';
    const fill = el.querySelector('.watch-progress-fill');
    const label = el.querySelector('.watch-progress-pct');
    if (fill) fill.style.width = pct + '%';
    if (label) label.textContent = Math.round(pct) + '%';
  }

  function persistToCatalog(id, pct) {
    try {
      const raw = localStorage.getItem(CATALOG_KEY);
      if (!raw) return false;
      const list = JSON.parse(raw);
      const v = list.find(x => x.id === id);
      if (!v) return false; // video isn't saved in this catalog
      v.watchedPct = pct;
      v.watchedAt = Date.now();
      localStorage.setItem(CATALOG_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }

  function applyProgressMap(map) {
    if (!map) return;
    Object.keys(map).forEach((id) => {
      const entry = map[id];
      if (!entry) return;
      const pct = Math.round(entry.pct * 10) / 10;
      // Skip redundant DOM/localStorage writes for tiny fluctuations.
      if (lastWrittenPct[id] === Math.round(pct)) return;
      lastWrittenPct[id] = Math.round(pct);

      const found = persistToCatalog(id, pct);
      if (found) updateCardDom(id, pct);
    });
  }

  // ---------- Poll loop ----------

  function poll() {
    try {
      chrome.storage.local.get(['nowWatching', 'watchProgress'], (data) => {
        renderWidget(data && data.nowWatching);
        applyProgressMap(data && data.watchProgress);
      });
    } catch (e) {
      // extension context can be briefly unavailable during reloads; ignore
    }
  }

  setInterval(poll, 2000);
  poll();
})();
