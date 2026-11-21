// ---------- Carnet de saison: editable, printable season summary ----------
// Relies on globals from script.js: path, fullGraph, nodesById,
// currentProfileId, normalize, COLORS.

const SEASON = "2026";
const JUMP_TYPES = [
  { key: "pac", file: "jumpers_PAC", label: "PAC", color: "#ff6b35", ink: "#fff" },
  { key: "tandem", file: "jumpers_BI-PLACES", label: "Tandem", color: "#0d2b4e", ink: "#fff" },
  { key: "init", file: "jumpers_INITIATION", label: "Initiation", color: "#5ec8d8", ink: "#0d2b4e" },
  { key: "student", file: "jumpers_STUDENT", label: "Élève", color: "#f2b134", ink: "#0d2b4e" },
  { key: "saut", file: "jumpers_SAUT", label: "Entre copaings", color: "#3f7cac", ink: "#fff" },
  { key: "boogie", file: "jumpers_BOOGIE", label: "Boogie", color: "#c2417a", ink: "#fff" },
];
const OTHER_TYPE = { key: "autres", label: "Autres", color: "#d5dde5", ink: "#0d2b4e" };
const BUDDIES_ON_SHEET = 10;
const NETWORK_ON_SHEET = 12;

// In the data, a link's width is 0.5 + √(number of jumps done together).
const sharedFromWidth = w => Math.max(1, Math.round((w - 0.5) ** 2));

let carnet = null;        // { id, original, state }
let carnetToken = 0;      // invalidates a pending open when the user navigates away
let typeCountsPromise = null;
let linkIndex = null, linkIndexGraph = null, namesListGraph = null;
let renderQueued = false;

const $ = id => document.getElementById(id);
const fmt = n => n.toLocaleString("fr-FR");
const pct = x => (x * 100).toLocaleString("fr-FR", { maximumFractionDigits: x < 0.1 ? 1 : 0 }) + " %";
const plural = (n, word) => word + (n > 1 ? "s" : "");
const toCount = v => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const truncate = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;

// ---------- Data ----------
function pairKey(a, b) { return a < b ? a + "\u0000" + b : b + "\u0000" + a; }

function getLinkIndex() {
  if (linkIndexGraph !== fullGraph) {
    linkIndex = new Map(fullGraph.links.map(l => [pairKey(l.source, l.target), l.width]));
    linkIndexGraph = fullGraph;
  }
  return linkIndex;
}

// One Map(id -> jumps) per jump type, fetched once. A failed file counts as empty.
function loadTypeCounts() {
  if (!typeCountsPromise) {
    typeCountsPromise = Promise.all(JUMP_TYPES.map(t =>
      d3.json(path + t.file + ".json")
        .then(g => {
          const m = new Map();
          g.nodes.forEach(n => m.set(n.id, (m.get(n.id) || 0) + (n.number_jumps || 0)));
          return m;
        })
        .catch(err => { console.error("Failed to load", t.file, err); return new Map(); })
    ));
  }
  return typeCountsPromise;
}

function buildOriginal(id, typeMaps) {
  const node = nodesById.get(id);
  const links = getLinkIndex();
  const types = {};
  JUMP_TYPES.forEach((t, i) => { types[t.key] = typeMaps[i].get(id) || 0; });
  const companions = (node.friends || [])
    .map(f => {
      const w = links.get(pairKey(id, f));
      return { name: f, shared: w ? sharedFromWidth(w) : 1 };
    })
    .sort(byShared);
  return { name: id, total: node.number_jumps || 0, types, companions, note: "" };
}

function byShared(a, b) { return b.shared - a.shared || a.name.localeCompare(b.name, "fr"); }

// ---------- Persistence (this browser only) ----------
const storageKey = id => `carnet:${SEASON}:${id}`;

function loadSaved(id) {
  try {
    const raw = localStorage.getItem(storageKey(id));
    const parsed = raw && JSON.parse(raw);
    return parsed && parsed.v === 1 ? parsed.data : null;
  } catch { return null; }
}

function saveState() {
  if (!carnet) return;
  try { localStorage.setItem(storageKey(carnet.id), JSON.stringify({ v: 1, data: carnet.state })); } catch { }
}

function clearSaved(id) {
  try { localStorage.removeItem(storageKey(id)); } catch { }
}

function sanitizeState(s, fallback) {
  const types = {};
  JUMP_TYPES.forEach(t => { types[t.key] = toCount(s?.types?.[t.key] ?? fallback.types[t.key]); });
  return {
    name: typeof s?.name === "string" ? s.name : fallback.name,
    total: toCount(s?.total ?? fallback.total),
    types,
    companions: (Array.isArray(s?.companions) ? s.companions : fallback.companions)
      .map(c => ({ name: String(c?.name ?? ""), shared: toCount(c?.shared) })),
    note: typeof s?.note === "string" ? s.note : "",
  };
}

// ---------- Derived figures ----------
function mergedCompanions(list) {
  const merged = new Map();
  list.forEach(c => {
    const name = c.name.trim();
    if (name && c.shared > 0) merged.set(name, (merged.get(name) || 0) + c.shared);
  });
  return [...merged].map(([name, shared]) => ({ name, shared })).sort(byShared);
}

function deriveSummary() {
  const { id, original, state } = carnet;
  const total = state.total;
  const companions = mergedCompanions(state.companions);

  const types = JUMP_TYPES.map(t => ({ ...t, count: state.types[t.key] }));
  const typedSum = d3.sum(types, t => t.count);
  const others = Math.max(0, total - typedSum);

  let rank = 1, clubTotal = total;
  fullGraph.nodes.forEach(n => {
    if (n.id === id) return;
    const j = n.number_jumps || 0;
    clubTotal += j;
    if (j > total) rank++;
  });

  const facts = [];
  const top = companions[0];
  if (top && total > 0) {
    facts.push(`<b>${esc(top.name)}</b> était là sur ${pct(Math.min(1, top.shared / total))} de tes sauts.`);
    const topNode = nodesById.get(top.name);
    if (topNode) facts.push(`Ton binôme n°1 cumule ${fmt(topNode.number_jumps || 0)} sauts cette saison.`);
  }
  const regulars = companions.filter(c => c.shared >= 10).length;
  if (regulars) facts.push(`${fmt(regulars)} ${plural(regulars, "habitué")} avec qui tu as sauté au moins 10 fois.`);
  const once = companions.filter(c => c.shared === 1).length;
  if (once) facts.push(`${fmt(once)} ${plural(once, "compagnon")} ${plural(once, "croisé")} une seule fois en l'air.`);

  const origCompanions = new Map(original.companions.map(c => [c.name, c.shared]));
  const edited = total !== original.total
    || JUMP_TYPES.some(t => state.types[t.key] !== original.types[t.key])
    || companions.length !== origCompanions.size
    || companions.some(c => origCompanions.get(c.name) !== c.shared);

  return {
    name: state.name.trim() || id, note: state.note.trim(), total, companions,
    types, typedSum, others, rank, members: fullGraph.nodes.length,
    share: clubTotal ? total / clubTotal : 0, facts, edited,
  };
}

// ---------- Editor ----------
function fillNamesList() {
  if (namesListGraph === fullGraph) return;
  const list = $("carnet-names");
  list.innerHTML = "";
  fullGraph.nodes.map(n => n.id).sort((a, b) => a.localeCompare(b, "fr")).forEach(id => {
    const o = document.createElement("option");
    o.value = id;
    list.appendChild(o);
  });
  namesListGraph = fullGraph;
}

function fillForm() {
  const { state } = carnet;
  $("f-season").textContent = SEASON;
  $("f-name").value = state.name;
  $("f-total").value = state.total;
  $("f-note").value = state.note;
  $("f-comp-filter").value = "";

  const typesBox = $("f-types");
  typesBox.innerHTML = "";
  JUMP_TYPES.forEach(t => {
    const label = document.createElement("label");
    label.className = "field";
    label.innerHTML = `<span><i class="swatch" style="background:${t.color}"></i>${esc(t.label)}</span>`;
    const input = document.createElement("input");
    Object.assign(input, { type: "number", min: 0, step: 1, inputMode: "numeric", value: state.types[t.key] });
    input.dataset.type = t.key;
    input.addEventListener("input", () => { carnet.state.types[t.key] = toCount(input.value); changed(); });
    label.appendChild(input);
    typesBox.appendChild(label);
  });

  const list = $("f-comps");
  list.innerHTML = "";
  state.companions.forEach(c => list.appendChild(makeCompanionRow(c)));
  refreshEditorMarks();
}

function makeCompanionRow(c) {
  const row = document.createElement("div");
  row.className = "comp-row";
  row._comp = c;

  const name = document.createElement("input");
  Object.assign(name, { type: "text", value: c.name, maxLength: 40, placeholder: "Nom" });
  name.setAttribute("list", "carnet-names");
  name.setAttribute("aria-label", "Nom du compagnon");
  name.addEventListener("input", () => { c.name = name.value; changed(); });

  const shared = document.createElement("input");
  Object.assign(shared, { type: "number", min: 0, step: 1, inputMode: "numeric", value: c.shared });
  shared.setAttribute("aria-label", "Sauts ensemble");
  shared.addEventListener("input", () => { c.shared = toCount(shared.value); changed(); });

  const remove = document.createElement("button");
  Object.assign(remove, { type: "button", className: "comp-remove", textContent: "×", title: "Retirer" });
  remove.setAttribute("aria-label", "Retirer ce compagnon");
  remove.addEventListener("click", () => {
    const i = carnet.state.companions.indexOf(c);
    if (i >= 0) carnet.state.companions.splice(i, 1);
    row.remove();
    changed();
  });

  row.append(name, shared, remove);
  return row;
}

// Highlight values that differ from the system's, and keep counters in sync.
function refreshEditorMarks() {
  const { original, state } = carnet;
  $("f-total").classList.toggle("edited", state.total !== original.total);
  $("f-types").querySelectorAll("input").forEach(input => {
    const k = input.dataset.type;
    input.classList.toggle("edited", state.types[k] !== original.types[k]);
  });

  const orig = new Map(original.companions.map(c => [c.name, c.shared]));
  const seen = d3.rollup(state.companions, v => v.length, c => c.name.trim());
  $("f-comps").querySelectorAll(".comp-row").forEach(row => {
    const c = row._comp;
    const name = c.name.trim();
    const dup = !!name && seen.get(name) > 1;
    row.children[0].classList.toggle("edited", !orig.has(name));
    row.children[0].classList.toggle("dup", dup);
    row.children[0].title = dup ? "Ce nom apparaît plusieurs fois : ses sauts sont additionnés." : "";
    row.children[1].classList.toggle("edited", orig.get(name) !== c.shared);
  });
  $("f-comp-count").textContent = `(${mergedCompanions(state.companions).length})`;

  const typed = d3.sum(JUMP_TYPES, t => state.types[t.key]);
  const note = $("f-others");
  if (typed > state.total) {
    note.textContent = `⚠ La somme des types (${fmt(typed)}) dépasse le total (${fmt(state.total)}).`;
    note.classList.add("warn");
  } else {
    note.textContent = `Autres (sans type) : ${fmt(state.total - typed)}`;
    note.classList.remove("warn");
  }
}

function setStatus(saved) {
  $("carnet-status").textContent = saved
    ? "Tes corrections sont enregistrées sur cet appareil. Les champs en orange diffèrent des chiffres du système."
    : "Corrige les chiffres si besoin : l'aperçu se met à jour, puis imprime.";
}

function changed() {
  refreshEditorMarks();
  saveState();
  setStatus(true);
  if (!renderQueued) {
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; renderSheet(); });
  }
}

function filterCompanionRows() {
  const q = normalize($("f-comp-filter").value.trim());
  $("f-comps").querySelectorAll(".comp-row").forEach(row => {
    row.hidden = !!q && !normalize(row._comp.name).includes(q);
  });
}

// ---------- Printable sheet ----------
function renderSheet() {
  if (!carnet) return;
  const d = deriveSummary();
  const sheet = $("sheet");

  const tile = (figure, label) => `<div class="sheet-tile"><b>${figure}</b><span>${label}</span></div>`;

  const segments = [...d.types, { ...OTHER_TYPE, count: d.others }].filter(s => s.count > 0);
  const barTotal = d3.sum(segments, s => s.count);
  const typeBar = barTotal
    ? `<div class="typebar">${segments.map(s =>
        `<span style="flex:${s.count} 1 0;background:${s.color};color:${s.ink}">${s.count / barTotal >= 0.06 ? fmt(s.count) : ""}</span>`).join("")}</div>
       <ul class="sheet-legend">${segments.map(s =>
        `<li><i class="swatch" style="background:${s.color}"></i>${esc(s.label)} <b>${fmt(s.count)}</b></li>`).join("")}</ul>`
    : `<p class="sheet-empty">Aucun saut enregistré.</p>`;

  const buddies = d.companions.slice(0, BUDDIES_ON_SHEET);
  const maxShared = buddies.length ? buddies[0].shared : 1;
  const buddyList = buddies.length
    ? `<ol class="sheet-buddies">${buddies.map((c, i) => `<li>
        <span class="b-rank">${i + 1}</span>
        <span class="b-name">${esc(c.name)}</span>
        <span class="b-bar"><span style="width:${(c.shared / maxShared) * 100}%"></span></span>
        <span class="b-count">${fmt(c.shared)}</span></li>`).join("")}</ol>`
    : `<p class="sheet-empty">Aucun binôme enregistré.</p>`;

  sheet.innerHTML = `
    <header class="sheet-head">
      <span class="sheet-brand"><span class="sheet-mark">✈</span> Piou Piou</span>
      <span class="sheet-kicker">Carnet de saison ${SEASON}</span>
    </header>
    <h1 class="sheet-name">${esc(d.name)}</h1>
    <div class="sheet-tiles">
      ${tile(fmt(d.total), plural(d.total, "saut"))}
      ${tile(fmt(d.companions.length), plural(d.companions.length, "compagnon") + " de chute")}
      ${tile("#" + fmt(d.rank), `sur ${fmt(d.members)} sautants`)}
      ${tile(pct(d.share), "des sauts du club")}
    </div>
    <section class="sheet-block">
      <h2>Répartition des sauts</h2>
      ${typeBar}
    </section>
    <div class="sheet-cols">
      <section class="sheet-block">
        <h2>Réseau · top ${Math.min(NETWORK_ON_SHEET, d.companions.length)}</h2>
        <svg class="sheet-network" viewBox="0 0 400 360" role="img" aria-label="Réseau de saut"></svg>
      </section>
      <section class="sheet-block">
        <h2>Binômes favoris <small>sauts ensemble</small></h2>
        ${buddyList}
      </section>
    </div>
    ${d.facts.length ? `<section class="sheet-block">
      <h2>Le savais-tu ?</h2>
      <ul class="sheet-facts">${d.facts.map(f => `<li>${f}</li>`).join("")}</ul>
    </section>` : ""}
    ${d.note ? `<section class="sheet-block sheet-note">
      <h2>Mot du sautant</h2>
      <p>${esc(d.note)}</p>
    </section>` : ""}
    <footer class="sheet-foot">
      <span>G sauté avec ki ? ™</span>
      <span>Données Piou Piou${d.edited ? " · corrigées par le sautant" : ""} · imprimé le ${new Date().toLocaleDateString("fr-FR")}</span>
    </footer>`;

  drawNetwork(sheet.querySelector(".sheet-network"), d);
  fitSheet();
}

const measureCtx = document.createElement("canvas").getContext("2d");
function textWidth(text, font) {
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

// Fixed radial layout (prints the same every time): closest buddies sit nearest
// the centre, line thickness follows the number of jumps together.
function drawNetwork(svgEl, d) {
  const svg = d3.select(svgEl);
  const cx = 200, cy = 180;
  const top = d.companions.slice(0, NETWORK_ON_SHEET);

  if (!top.length) {
    svg.append("text").attr("x", cx).attr("y", cy).attr("text-anchor", "middle")
      .attr("fill", COLORS.slate).style("font-size", "13px").text("Aucun binôme enregistré.");
    return;
  }

  const max = top[0].shared, min = top[top.length - 1].shared;
  const radius = s => max === min ? 115 : 130 - ((s - min) / (max - min)) * 60;
  const nodes = top.map((c, i) => {
    const a = (i / top.length) * 2 * Math.PI - Math.PI / 2;
    const r = radius(c.shared);
    return { ...c, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), label: truncate(c.name, 14) };
  });

  svg.append("g").selectAll("line").data(nodes).enter().append("line")
    .attr("x1", cx).attr("y1", cy).attr("x2", n => n.x).attr("y2", n => n.y)
    .attr("stroke", COLORS.canopy).attr("stroke-opacity", 0.7)
    .attr("stroke-width", n => 1 + 4 * (n.shared / max));

  const pill = (g, label, { font, fill, stroke, strokeWidth, ink, height }) => {
    const w = textWidth(label, font) + 18;
    g.append("rect").attr("x", -w / 2).attr("y", -height / 2).attr("width", w).attr("height", height)
      .attr("rx", height / 2).attr("fill", fill).attr("stroke", stroke).attr("stroke-width", strokeWidth);
    g.append("text").attr("text-anchor", "middle").attr("dominant-baseline", "central")
      .attr("fill", ink).style("font", font).text(label);
  };

  svg.append("g").selectAll("g").data(nodes).enter().append("g")
    .attr("transform", n => `translate(${n.x},${n.y})`)
    .each(function (n) {
      pill(d3.select(this), n.label, {
        font: "600 13px Inter, sans-serif", fill: "#fff", stroke: COLORS.canopy, strokeWidth: 1.5, ink: COLORS.skyDeep, height: 26,
      });
    });

  pill(svg.append("g").attr("transform", `translate(${cx},${cy})`), truncate(d.name, 16), {
    font: "700 15px Inter, sans-serif", fill: COLORS.skyDeep, stroke: COLORS.orange, strokeWidth: 2.5, ink: "#fff", height: 32,
  });
}

// On screen, the A4 sheet is drawn at real size and scaled down to the column.
function fitSheet() {
  const wrap = $("sheet-wrap"), sheet = $("sheet");
  if (!wrap.offsetParent) return;
  sheet.style.transform = "";
  const scale = Math.min(1, wrap.clientWidth / sheet.offsetWidth);
  sheet.style.transform = `scale(${scale})`;
  wrap.style.height = sheet.offsetHeight * scale + "px";
}

// ---------- Screen flow ----------
async function openCarnet(id) {
  if (!nodesById.has(id)) return;
  const token = ++carnetToken;
  $("profile").classList.add("hidden");
  $("carnet").classList.remove("hidden");
  document.body.classList.add("carnet-open");
  window.scrollTo(0, 0);

  carnet = null;
  $("sheet").innerHTML = "";
  $("carnet-form").classList.add("loading");
  $("carnet-status").textContent = "Chargement…";

  const typeMaps = await loadTypeCounts();
  if (token !== carnetToken) return;

  const original = buildOriginal(id, typeMaps);
  const saved = loadSaved(id);
  carnet = { id, original, state: sanitizeState(saved ?? original, original) };

  fillNamesList();
  fillForm();
  setStatus(!!saved);
  $("carnet-form").classList.remove("loading");
  renderSheet();
}

function closeCarnet() {
  carnetToken++;
  $("carnet").classList.add("hidden");
  document.body.classList.remove("carnet-open");
  $("profile").classList.remove("hidden");
}

$("carnet-btn").addEventListener("click", () => { if (currentProfileId) openCarnet(currentProfileId); });
$("carnet-back").addEventListener("click", closeCarnet);
$("carnet-print").addEventListener("click", () => { if (carnet) window.print(); });
$("carnet-reset").addEventListener("click", () => {
  if (!carnet || !confirm("Effacer tes corrections et revenir aux chiffres du système ?")) return;
  clearSaved(carnet.id);
  carnet.state = sanitizeState(carnet.original, carnet.original);
  fillForm();
  setStatus(false);
  renderSheet();
});

$("carnet-form").addEventListener("submit", e => e.preventDefault());
$("f-name").addEventListener("input", e => { if (carnet) { carnet.state.name = e.target.value; changed(); } });
$("f-total").addEventListener("input", e => { if (carnet) { carnet.state.total = toCount(e.target.value); changed(); } });
$("f-note").addEventListener("input", e => { if (carnet) { carnet.state.note = e.target.value; changed(); } });
$("f-comp-filter").addEventListener("input", filterCompanionRows);
$("f-comp-add").addEventListener("click", () => {
  if (!carnet) return;
  const c = { name: "", shared: 1 };
  carnet.state.companions.unshift(c);
  $("f-comp-filter").value = "";
  filterCompanionRows();
  const row = makeCompanionRow(c);
  $("f-comps").prepend(row);
  $("f-comps").scrollTop = 0;
  row.children[0].focus();
  changed();
});

window.addEventListener("resize", fitSheet);
if (document.fonts) document.fonts.ready.then(() => { if (carnet) renderSheet(); });
