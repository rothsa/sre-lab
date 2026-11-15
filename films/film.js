// Player for narrated chapter films. Scenes are plain HTML/CSS; a scene's animations run while it has the
// class "on". One audio clip per scene; the next scene starts when the clip ends.
(() => {
  const data = JSON.parse(document.getElementById("film-data").textContent);
  const stage = document.getElementById("stage"), viewport = document.getElementById("viewport");
  const scenes = [...stage.querySelectorAll(".scene")], bar = document.getElementById("bar");
  const poster = document.getElementById("poster"), caption = document.getElementById("caption");
  const btnPlay = document.getElementById("f-play"), count = document.getElementById("f-count");
  const N = scenes.length, LEAD = 600, TAIL = 1300;
  const audio = data.narration.map((_, i) => { const a = new Audio(); a.preload = i ? "none" : "auto"; a.src = `s${i}.mp3`; return a; });
  let i = 0, playing = false, phase = "idle", timer = 0, done = false;

  const fit = () => { stage.style.transform = `scale(${viewport.clientWidth / 1920})`; };
  new ResizeObserver(fit).observe(viewport); fit();

  const ANIMALS = {
frog:'<svg viewBox="0 0 120 120"><ellipse cx="60" cy="76" rx="40" ry="30" fill="#4caf50"/><ellipse cx="60" cy="84" rx="26" ry="17" fill="#c9eeb0"/><circle cx="40" cy="44" r="15" fill="#4caf50"/><circle cx="80" cy="44" r="15" fill="#4caf50"/><circle cx="40" cy="42" r="9" fill="#fff"/><circle cx="80" cy="42" r="9" fill="#fff"/><circle cx="43" cy="43" r="4.5" fill="#14261a"/><circle cx="83" cy="43" r="4.5" fill="#14261a"/><path d="M42 70 Q60 84 78 70" fill="none" stroke="#14261a" stroke-width="3" stroke-linecap="round"/><ellipse cx="22" cy="100" rx="16" ry="7" fill="#3f9a4f"/><ellipse cx="98" cy="100" rx="16" ry="7" fill="#3f9a4f"/><circle cx="34" cy="66" r="4" fill="#f7a8a0" opacity=".7"/><circle cx="86" cy="66" r="4" fill="#f7a8a0" opacity=".7"/></svg>',
toucan:'<svg viewBox="0 0 120 120"><ellipse cx="50" cy="70" rx="28" ry="34" fill="#1d2a22"/><ellipse cx="56" cy="62" rx="17" ry="20" fill="#fff8e6"/><path d="M68 44 Q112 36 114 58 Q98 70 68 62 Z" fill="#f59b23"/><path d="M68 53 Q100 50 113 57 Q98 70 68 62 Z" fill="#e2572b"/><circle cx="60" cy="46" r="7" fill="#fff"/><circle cx="62" cy="46" r="3.5" fill="#14261a"/><path d="M26 86 L6 108 L30 100 Z" fill="#1d2a22"/><path d="M44 102 v12 M56 102 v12" stroke="#f59b23" stroke-width="5" stroke-linecap="round"/></svg>',
monkey:'<svg viewBox="0 0 120 120"><path d="M88 92 Q116 92 110 66 Q106 54 96 60" fill="none" stroke="#8a5a3c" stroke-width="7" stroke-linecap="round"/><ellipse cx="60" cy="88" rx="24" ry="22" fill="#8a5a3c"/><ellipse cx="60" cy="92" rx="14" ry="14" fill="#e9c9a3"/><circle cx="30" cy="42" r="12" fill="#8a5a3c"/><circle cx="90" cy="42" r="12" fill="#8a5a3c"/><circle cx="30" cy="42" r="6" fill="#e9c9a3"/><circle cx="90" cy="42" r="6" fill="#e9c9a3"/><circle cx="60" cy="44" r="28" fill="#8a5a3c"/><ellipse cx="60" cy="50" rx="20" ry="18" fill="#e9c9a3"/><circle cx="52" cy="44" r="4" fill="#14261a"/><circle cx="68" cy="44" r="4" fill="#14261a"/><path d="M50 56 Q60 66 70 56" fill="none" stroke="#14261a" stroke-width="3" stroke-linecap="round"/></svg>',
jaguar:'<svg viewBox="0 0 120 120"><path d="M18 90 Q0 84 6 64" fill="none" stroke="#e8a93a" stroke-width="8" stroke-linecap="round"/><ellipse cx="56" cy="86" rx="34" ry="22" fill="#e8a93a"/><path d="M34 26 L42 44 L24 42 Z M94 26 L86 44 L104 42 Z" fill="#e8a93a"/><circle cx="64" cy="54" r="28" fill="#e8a93a"/><ellipse cx="64" cy="64" rx="14" ry="10" fill="#fff3d6"/><circle cx="54" cy="50" r="4" fill="#14261a"/><circle cx="74" cy="50" r="4" fill="#14261a"/><path d="M60 60 h8 l-4 5 Z" fill="#c2543a"/><path d="M58 68 Q64 73 70 68" fill="none" stroke="#14261a" stroke-width="2.5" stroke-linecap="round"/><g fill="#6b4416"><circle cx="34" cy="80" r="4"/><circle cx="48" cy="94" r="4"/><circle cx="62" cy="88" r="3.5"/><circle cx="76" cy="96" r="4"/><circle cx="44" cy="76" r="3"/><circle cx="64" cy="32" r="3"/><circle cx="52" cy="36" r="2.5"/><circle cx="76" cy="36" r="2.5"/></g><ellipse cx="36" cy="106" rx="9" ry="5" fill="#d2952c"/><ellipse cx="76" cy="106" rx="9" ry="5" fill="#d2952c"/></svg>'};
  const names = Object.keys(ANIMALS);
  const critter = document.getElementById("critter");
  const pickAnimal = () => { if (critter) critter.innerHTML = ANIMALS[names[Math.floor(Math.random() * names.length)]]; };

  // The narration is spelled for the voice ("A P I", "P stack"). Captions show it the way it is written.
  const FIXES = [[/\b(?:[A-Z] )+[A-Z]s?\b/g, (m) => m.replace(/ /g, "")], [/\bAB tests\b/g, "A/B tests"], [/\bOpen AI\b/g, "OpenAI"],
    [/\bCo-sign/g, "Cosign"], [/\bS-BOM/g, "SBOM"], [/\bP stack\b/g, "pstack"], [/\bkube control\b/g, "kubectl"],
    [/\b[Cc]laude dot MD\b/g, "CLAUDE.md"], [/\b[Aa]gents dot MD\b/g, "AGENTS.md"], [/ dot MD\b/g, ".md"], [/\bIncident dot IO\b/g, "incident.io"],
    [/\bLite LLM\b/g, "LiteLLM"], [/\bCyclone DX\b/g, "CycloneDX"], [/\bmicro VM/g, "microVM"], [/\bIT Bench\b/g, "ITBench"],
    [/\bSWE bench\b/g, "SWE-bench"], [/\bGPT four oh\b/g, "GPT-4o"], [/\bOpen Telemetry\b/g, "OpenTelemetry"]];
  const readable = (s) => FIXES.reduce((x, [re, to]) => x.replace(re, to), s);

  function show(n) {
    i = n; done = false;
    scenes.forEach((s) => s.classList.remove("on"));
    void stage.offsetWidth; // restart the scene's animations
    scenes[i].classList.add("on");
    bar.style.width = `${((i + 1) / N) * 100}%`;
    count.textContent = `Step ${i + 1} of ${N}`;
    caption.textContent = readable(data.narration[i]);
    if (i === N - 1) pickAnimal();
  }
  function stopAudio() { audio.forEach((a) => { a.pause(); a.onended = a.onerror = null; }); clearTimeout(timer); }
  function after() { phase = "post"; timer = setTimeout(() => { if (i < N - 1) start(i + 1); else finish(); }, TAIL); }
  function speak() {
    phase = "audio";
    const a = audio[i];
    a.onended = after;
    a.onerror = () => { phase = "post"; timer = setTimeout(after, data.seconds[i] * 1000); }; // no audio: keep the pace
    a.play().catch(() => a.onerror());
    if (audio[i + 1]) audio[i + 1].preload = "auto";
  }
  function start(n) {
    stopAudio(); show(n); playing = true; stage.classList.remove("paused"); poster.hidden = true; label();
    audio[i].currentTime = 0; phase = "pre"; timer = setTimeout(speak, LEAD);
  }
  function finish() { playing = false; done = true; phase = "idle"; label(); }
  function pause() { playing = false; clearTimeout(timer); audio[i].pause(); stage.classList.add("paused"); label(); }
  function resume() {
    if (done || phase === "idle") return start(done ? 0 : i);
    playing = true; stage.classList.remove("paused"); label();
    if (phase === "pre") timer = setTimeout(speak, LEAD);
    else if (phase === "post") after();
    else audio[i].play().catch(() => {});
  }
  function label() { btnPlay.textContent = playing ? "Pause" : done ? "Replay" : "Play"; }
  const toggle = () => (playing ? pause() : resume());

  poster.addEventListener("click", () => start(0));
  btnPlay.addEventListener("click", toggle);
  document.getElementById("f-prev").addEventListener("click", () => start(Math.max(0, i - 1)));
  document.getElementById("f-next").addEventListener("click", () => start(Math.min(N - 1, i + 1)));
  document.getElementById("f-cc").addEventListener("click", (e) => { caption.hidden = !caption.hidden; e.currentTarget.setAttribute("aria-pressed", String(!caption.hidden)); });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("button, a, input")) return;
    if (e.key === " ") { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowRight") start(Math.min(N - 1, i + 1));
    else if (e.key === "ArrowLeft") start(Math.max(0, i - 1));
  });
  show(0); stage.classList.add("paused"); label();
})();
