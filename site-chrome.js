(() => {
  if (window.__sreLabChrome) return;
  window.__sreLabChrome = true;

  const THEME_KEY = "sre-lab-theme";
  const FEEDBACK_URL = "https://resume.sallyroth.dev/api/feedback";
  const LOADED_AT = Date.now();
  const root = document.documentElement;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function getEffectiveTheme() {
    const saved = (() => { try { return localStorage.getItem(THEME_KEY); } catch { return null; } })();
    if (saved === "dark" || saved === "light") return saved;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme, persist) {
    root.dataset.theme = theme;
    if (persist) {
      try { localStorage.setItem(THEME_KEY, theme); } catch {}
    }
    const btn = document.getElementById("lab-theme-toggle");
    if (btn) {
      const next = theme === "dark" ? "light" : "dark";
      btn.textContent = theme === "dark" ? "☀ light" : "☾ night";
      btn.setAttribute("aria-label", `Switch to ${next} theme`);
      btn.setAttribute("aria-pressed", String(theme === "dark"));
    }
  }

  const savedTheme = (() => { try { return localStorage.getItem(THEME_KEY); } catch { return null; } })();
  if (savedTheme === "dark" || savedTheme === "light") root.dataset.theme = savedTheme;

  let indexPromise = null;
  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch("/search-index.json").then((r) => (r.ok ? r.json() : [])).catch(() => []);
    }
    return indexPromise;
  }

  function scoreItem(item, terms) {
    const title = item.title.toLowerCase();
    const section = (item.section || "").toLowerCase();
    const text = (item.text || "").toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (title.includes(t)) score += title.startsWith(t) ? 12 : 8;
      else if (section.includes(t)) score += 5;
      else if (text.includes(t)) score += 2;
      else return 0;
    }
    if (item.type === "tool") score += 4;
    else if (item.type === "chapter") score += 3;
    else if (item.type === "film") score += 2;
    return score;
  }

  let modal = null;
  let activeIdx = 0;
  let shownItems = [];

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "lab-search-backdrop";
    modal.hidden = true;
    modal.innerHTML = `<div class="lab-search-dialog" role="dialog" aria-modal="true" aria-label="Search SRE Lab">
      <div class="lab-search-top">
        <input type="search" id="lab-search-input" placeholder="Search chapters, films, tools, 318 incidents..." autocomplete="off" spellcheck="false">
        <button type="button" class="lab-search-close" aria-label="Close search">Esc</button>
      </div>
      <div class="lab-search-meta" id="lab-search-meta">Type to search across SRE Lab</div>
      <ul class="lab-search-list" id="lab-search-list" role="listbox"></ul>
    </div>`;
    document.body.appendChild(modal);

    const input = modal.querySelector("#lab-search-input");
    const list = modal.querySelector("#lab-search-list");
    const meta = modal.querySelector("#lab-search-meta");
    const closeBtn = modal.querySelector(".lab-search-close");

    function renderList(items, query) {
      shownItems = items;
      activeIdx = 0;
      if (!items.length) {
        meta.textContent = query ? `No matches for "${query}"` : "Type to search across SRE Lab";
        list.innerHTML = "";
        return;
      }
      meta.textContent = query
        ? `${items.length} top match${items.length === 1 ? "" : "es"}`
        : "Jump to a tool, explainer, film, or incident";
      list.innerHTML = items.map((it, idx) => `<li role="option" aria-selected="${idx === 0}">
        <a href="${esc(it.url)}" data-idx="${idx}">
          <span class="ls-head"><strong>${esc(it.title)}</strong><em class="ls-tag ls-${esc(it.type)}">${esc(it.section || it.type)}</em></span>
          ${it.text ? `<span class="ls-sub">${esc(it.text.slice(0, 125))}</span>` : ""}
        </a>
      </li>`).join("");
    }

    function updateActive(nextIdx) {
      if (!shownItems.length) return;
      activeIdx = (nextIdx + shownItems.length) % shownItems.length;
      const rows = list.querySelectorAll("li");
      rows.forEach((li, i) => {
        li.setAttribute("aria-selected", String(i === activeIdx));
        if (i === activeIdx) li.scrollIntoView({ block: "nearest" });
      });
    }

    async function runQuery() {
      const all = await loadIndex();
      const q = input.value.trim();
      if (!q) {
        renderList(all.filter((x) => x.type === "tool").slice(0, 8), "");
        return;
      }
      const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      const scored = [];
      for (const item of all) {
        const sc = scoreItem(item, terms);
        if (sc > 0) scored.push([sc, item]);
      }
      scored.sort((a, b) => b[0] - a[0]);
      renderList(scored.slice(0, 18).map((x) => x[1]), q);
    }

    input.addEventListener("input", runQuery);
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); updateActive(activeIdx + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); updateActive(activeIdx - 1); }
      else if (e.key === "Enter" && shownItems[activeIdx]) {
        e.preventDefault();
        location.href = shownItems[activeIdx].url;
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeSearch();
      }
    });
    closeBtn.addEventListener("click", closeSearch);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeSearch(); });
    modal._runQuery = runQuery;
    return modal;
  }

  function openSearch() {
    const m = ensureModal();
    m.hidden = false;
    const input = m.querySelector("#lab-search-input");
    input.value = "";
    input.focus();
    m._runQuery();
  }

  function closeSearch() {
    if (modal) modal.hidden = true;
  }

  function mountFeedbackWidgets() {
    for (const host of document.querySelectorAll("[data-lab-feedback]")) {
      if (host.dataset.mounted) continue;
      host.dataset.mounted = "1";
      const label = host.dataset.labFeedback || "Feedback on SRE Lab";
      const title = host.dataset.labTitle || document.title || "SRE Lab";
      const page = location.pathname + location.hash;
      const issueHref = `https://github.com/rothsa/sre-lab/issues/new?title=${encodeURIComponent(`Feedback: ${title}`)}&body=${encodeURIComponent(`Page: https://lab.sallyroth.dev${page}\n\n`)}`;
      host.innerHTML = `<details class="lab-fb-box">
        <summary>${esc(label)}</summary>
        <form class="lab-fb-form">
          <div class="lab-fb-tags" role="radiogroup" aria-label="Feedback type">
            <label><input type="radio" name="kind" value="helpful"><span>Helpful</span></label>
            <label><input type="radio" name="kind" value="issue"><span>Error or gap</span></label>
            <label><input type="radio" name="kind" value="suggestion"><span>Suggestion</span></label>
          </div>
          <textarea name="message" rows="3" maxlength="1000" required placeholder="What helped, what was unclear, or what looks wrong?"></textarea>
          <div class="lab-fb-row">
            <input type="text" name="contact" maxlength="160" placeholder="Email or handle (optional, if you want a reply)">
            <button type="submit">Send</button>
          </div>
          <input type="text" name="website" class="lab-fb-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
          <div class="lab-fb-foot">
            <span class="lab-fb-status" aria-live="polite"></span>
            <a href="${esc(issueHref)}" target="_blank" rel="noopener">or open a GitHub issue</a>
          </div>
        </form>
      </details>`;
      const form = host.querySelector("form");
      const status = host.querySelector(".lab-fb-status");
      const btn = host.querySelector("button[type=submit]");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const f = new FormData(form);
        const message = String(f.get("message") || "").trim();
        if (message.length < 3) {
          status.className = "lab-fb-status err";
          status.textContent = "Please write a short note first.";
          return;
        }
        btn.disabled = true;
        status.className = "lab-fb-status";
        status.textContent = "Sending...";
        try {
          const res = await fetch(FEEDBACK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              page: location.pathname + location.hash,
              title,
              kind: String(f.get("kind") || "note"),
              message,
              contact: String(f.get("contact") || "").trim() || undefined,
              website: String(f.get("website") || ""),
              loadedAt: LOADED_AT,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Could not send feedback.");
          status.className = "lab-fb-status ok";
          status.textContent = "Sent. Thank you for the note.";
          form.reset();
        } catch (err) {
          status.className = "lab-fb-status err";
          status.textContent = err.message || "Could not send feedback.";
        } finally {
          btn.disabled = false;
        }
      });
    }
  }

  function mountNav() {
    const nav = document.querySelector("nav.site-nav");
    if (!nav || nav.querySelector(".nav-tools")) return;
    const tools = document.createElement("span");
    tools.className = "nav-tools";

    const filmsLink = document.createElement("a");
    filmsLink.href = "/films/";
    filmsLink.textContent = "~/films";
    if (location.pathname === "/films/" || location.pathname === "/films/index.html") {
      filmsLink.setAttribute("aria-current", "page");
    }

    const searchBtn = document.createElement("button");
    searchBtn.type = "button";
    searchBtn.className = "nav-btn";
    searchBtn.id = "lab-search-open";
    searchBtn.textContent = "search /";
    searchBtn.setAttribute("aria-label", "Search SRE Lab");
    searchBtn.addEventListener("click", openSearch);

    const themeBtn = document.createElement("button");
    themeBtn.type = "button";
    themeBtn.className = "nav-btn";
    themeBtn.id = "lab-theme-toggle";
    themeBtn.addEventListener("click", () => {
      const next = getEffectiveTheme() === "dark" ? "light" : "dark";
      applyTheme(next, true);
    });

    tools.append(filmsLink, searchBtn, themeBtn);
    nav.appendChild(tools);
    applyTheme(getEffectiveTheme(), false);
  }

  function init() {
    mountNav();
    mountFeedbackWidgets();
  }

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (modal && !modal.hidden) closeSearch(); else openSearch();
      return;
    }
    if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.target.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      openSearch();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
