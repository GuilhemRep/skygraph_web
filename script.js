const path = "https://raw.githubusercontent.com/GuilhemRep/sauts/refs/heads/main/";
const files = ["jumpers", "jumpers_PAC", "jumpers_BI-PLACES", "jumpers_INITIATION", "jumpers_STUDENT", "jumpers_SAUT", "jumpers_BOOGIE"];

const COLORS = {
  canopy: "#5ec8d8",
  orange: "#ff6b35",
  cloud: "#f7f9fb",
  slate: "#8a9bab",
  skyDeep: "#0d2b4e",
};

let fullGraph = { nodes: [], links: [] };
let nodesById = new Map();

// ---------- Data loading ----------
async function loadGraphFile(fileName) {
  return await d3.json(fileName);
}

function indexGraph(g) {
  nodesById = new Map(g.nodes.map(n => [n.id, n]));
}

// ---------- Club overview ----------
function renderClubOverview(g) {
  const totalJumps = g.nodes.reduce((s, n) => s + (n.number_jumps || 0), 0);
  document.getElementById("stat-total-jumps").textContent = totalJumps;
  document.getElementById("stat-members").textContent = g.nodes.length;
  document.getElementById("stat-links").textContent = g.links.length;

  // Top jumpers
  const top = [...g.nodes].sort((a, b) => (b.number_jumps || 0) - (a.number_jumps || 0)).slice(0, 5);
  const list = document.getElementById("top-jumpers");
  list.innerHTML = "";
  top.forEach(n => {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = n.id;
    const jumps = document.createElement("span");
    jumps.className = "top-jumps";
    jumps.textContent = n.number_jumps;
    li.appendChild(name);
    li.appendChild(jumps);
    list.appendChild(li);
  });

  drawAltimeter(totalJumps, g);
}

// Draw a circular altimeter-style dial: ticks around a circle, with
// a sweep arc proportional to overall club activity (relative to a max scale).
function drawAltimeter(totalJumps, g) {
  const svg = d3.select("#altimeter");
  svg.selectAll("*").remove();

  const size = 480;
  const cx = size / 2, cy = size / 2;
  const rOuter = 220;
  const rInner = 195;

  const maxJumps = Math.max(1, ...g.nodes.map(n => n.number_jumps || 0)) * g.nodes.length * 0.4;
  const scaleMax = Math.max(totalJumps, maxJumps, 50);
  const sweep = Math.min(1, totalJumps / scaleMax);

  // background ring
  svg.append("circle")
    .attr("cx", cx).attr("cy", cy).attr("r", (rOuter + rInner) / 2)
    .attr("fill", "none")
    .attr("stroke", "rgba(255,255,255,0.08)")
    .attr("stroke-width", rOuter - rInner);

  // tick marks
  const tickCount = 60;
  for (let i = 0; i < tickCount; i++) {
    const a = (i / tickCount) * 2 * Math.PI - Math.PI / 2;
    const major = i % 5 === 0;
    const r1 = major ? rInner - 6 : rInner;
    const r2 = rOuter + (major ? 6 : 0);
    svg.append("line")
      .attr("x1", cx + r1 * Math.cos(a)).attr("y1", cy + r1 * Math.sin(a))
      .attr("x2", cx + r2 * Math.cos(a)).attr("y2", cy + r2 * Math.sin(a))
      .attr("stroke", major ? COLORS.cloud : COLORS.slate)
      .attr("stroke-width", major ? 2 : 1)
      .attr("opacity", major ? 0.5 : 0.25);
  }

  // progress arc
  const arc = d3.arc()
    .innerRadius(rInner).outerRadius(rOuter)
    .startAngle(-Math.PI / 2)
    .endAngle(-Math.PI / 2 + sweep * 2 * Math.PI)
    .cornerRadius(4);

  svg.append("path")
    .attr("d", arc())
    .attr("transform", `translate(${cx},${cy})`)
    .attr("fill", COLORS.orange)
    .style("filter", "drop-shadow(0 0 10px rgba(255,107,53,0.5))");

  // needle marker at end of sweep
  const needleAngle = -Math.PI / 2 + sweep * 2 * Math.PI;
  svg.append("circle")
    .attr("cx", cx + (rOuter + rInner) / 2 * Math.cos(needleAngle))
    .attr("cy", cy + (rOuter + rInner) / 2 * Math.sin(needleAngle))
    .attr("r", 6)
    .attr("fill", COLORS.cloud);
}

// ---------- Search ----------
function normalize(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, '');
}

function setupSearch() {
  const searchInput = document.getElementById("nodeSearch");
  const suggestions = document.getElementById("suggestions");

  searchInput.addEventListener("input", () => {
    const value = searchInput.value;
    suggestions.innerHTML = "";
    if (!value) return;

    const norm = normalize(value);
    const matches = fullGraph.nodes
      .filter(n => normalize(n.id).includes(norm))
      .slice(0, 8);

    matches.forEach(n => {
      const div = document.createElement("div");
      div.className = "suggestion";
      div.textContent = n.id;
      div.onclick = () => {
        searchInput.value = n.id;
        suggestions.innerHTML = "";
        showProfile(n.id);
      };
      suggestions.appendChild(div);
    });
  });

  searchInput.addEventListener("keypress", e => {
    if (e.key === "Enter") {
      const norm = normalize(searchInput.value);
      const match = fullGraph.nodes.find(n => normalize(n.id) === norm)
        || fullGraph.nodes.find(n => normalize(n.id).includes(norm));
      if (match) showProfile(match.id);
    }
  });

  document.addEventListener("click", e => {
    if (!e.target.closest(".search-box")) suggestions.innerHTML = "";
  });
}

// ---------- Profile / logbook view ----------
function showProfile(id) {
  const node = nodesById.get(id);
  if (!node) return;

  document.getElementById("landing").classList.add("hidden");
  document.getElementById("profile").classList.remove("hidden");
  document.getElementById("suggestions").innerHTML = "";
  document.getElementById("nodeSearch").value = "";

  document.getElementById("profile-name").textContent = node.id;
  const jumps = node.number_jumps || 0;
  document.getElementById("profile-sub").textContent =
    `${jumps} saut${jumps === 1 ? "" : "s"} cette saison · ${node.friends ? node.friends.length : 0} compagnon${(node.friends && node.friends.length === 1) ? "" : "s"} de chute`;

  renderFriendGraph(node);
  renderFriendsList(node);
  renderTimeline(node);

  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

function backToLanding() {
  document.getElementById("profile").classList.add("hidden");
  document.getElementById("landing").classList.remove("hidden");
}

// Personal friend-network graph: center node + its friends, force-directed
function renderFriendGraph(node) {
  const svg = d3.select("#friend-graph");
  svg.selectAll("*").remove();

  const vb = svg.attr("viewBox").split(" ").map(Number);
  const width = vb[2], height = vb[3];

  const friendIds = node.friends || [];
  const graphNodes = [
    { id: node.id, self: true, ...node },
    ...friendIds.map(fid => {
      const fnode = nodesById.get(fid);
      return fnode ? { ...fnode, self: false } : { id: fid, self: false, number_jumps: 0, friends: [] };
    })
  ];
  const graphLinks = friendIds.map(fid => ({ source: node.id, target: fid }));

  const zoomLayer = svg.append("g");
  zoomLayer.append("g").attr("class", "links");
  zoomLayer.append("g").attr("class", "nodes");

  svg.call(d3.zoom().scaleExtent([0.4, 3]).on("zoom", (event) => {
    zoomLayer.attr("transform", event.transform);
  }));

  const simulation = d3.forceSimulation(graphNodes)
    .force("link", d3.forceLink(graphLinks).id(d => d.id).distance(150))
    .force("charge", d3.forceManyBody().strength(-220))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide(50));

  const link = zoomLayer.select(".links").selectAll("line")
    .data(graphLinks).enter().append("line");

  const nodeG = zoomLayer.select(".nodes").selectAll(".node")
    .data(graphNodes).enter().append("g")
    .attr("class", d => "node" + (d.self ? " self" : ""))
    .style("cursor", d => d.self ? "default" : "pointer")
    .on("click", (event, d) => {
      if (!d.self && nodesById.has(d.id)) showProfile(d.id);
    });

  nodeG.append("text")
    .attr("text-anchor", "middle")
    .attr("alignment-baseline", "middle")
    .text(d => d.id);

  nodeG.each(function (d) {
    const g = d3.select(this);
    const bbox = g.select("text").node().getBBox();
    const xmargin = 16, ymargin = 10;
    g.insert("rect", "text")
      .attr("x", -bbox.width / 2 - xmargin / 2)
      .attr("y", -bbox.height / 2 - ymargin / 2 - 5)
      .attr("width", bbox.width + xmargin)
      .attr("height", bbox.height + ymargin)
      .attr("rx", 14)
      .attr("ry", 14);
  });

  simulation.on("tick", () => {
    link
      .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    nodeG.attr("transform", d => `translate(${d.x},${d.y})`);
  });
}

function renderFriendsList(node) {
  const list = document.getElementById("friends-list");
  const noFriends = document.getElementById("no-friends");
  list.innerHTML = "";

  const friends = node.friends || [];
  if (friends.length === 0) {
    noFriends.classList.remove("hidden");
    return;
  }
  noFriends.classList.add("hidden");

  var maxfriends = 0;

  friends.forEach(fid => {
    if (maxfriends<=10) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.className = "friend-link";
      a.textContent = fid;
      a.onclick = () => { if (nodesById.has(fid)) showProfile(fid); };
      li.appendChild(a);
      list.appendChild(li);
      maxfriends += 1;
    }
  });
}

// Timeline: drop-step chart. Uses node.jump_dates if present (array of ISO
// date strings), otherwise falls back to an evenly-spaced step per jump.
function renderTimeline(node) {
  const svg = d3.select("#timeline");
  svg.selectAll("*").remove();

  const vb = svg.attr("viewBox").split(" ").map(Number);
  const width = vb[2], height = vb[3];
  const margin = { top: 24, right: 24, bottom: 36, left: 36 };
  const w = width - margin.left - margin.right;
  const h = height - margin.top - margin.bottom;

  const jumps = node.number_jumps || 0;
  let dates = Array.isArray(node.jump_dates) && node.jump_dates.length === jumps
    ? node.jump_dates.map(d => new Date(d))
    : null;

  if (jumps === 0) {
    svg.append("text")
      .attr("x", width / 2).attr("y", height / 2)
      .attr("text-anchor", "middle")
      .attr("fill", COLORS.slate)
      .style("font-size", "14px")
      .text("Aucun saut enregistré pour l'instant.");
    return;
  }

  // x positions: real dates if available, else evenly spaced index
  let xScale, xValues;
  if (dates) {
    xScale = d3.scaleTime().domain(d3.extent(dates)).range([margin.left, margin.left + w]).nice();
    xValues = dates.map(d => xScale(d));
  } else {
    xScale = d3.scaleLinear().domain([1, jumps]).range([margin.left, margin.left + w]);
    xValues = d3.range(1, jumps + 1).map(i => xScale(i));
  }

  const yScale = d3.scaleLinear().domain([0, jumps]).range([margin.top + h, margin.top]);

  const g = svg.append("g");

  // axis lines
  g.append("line")
    .attr("x1", margin.left).attr("x2", margin.left + w)
    .attr("y1", margin.top + h).attr("y2", margin.top + h)
    .attr("stroke", "#dde4ea");

  // step path: cumulative jumps over time
  const stepPoints = [];
  xValues.forEach((x, i) => {
    stepPoints.push([x, yScale(i)]);
    stepPoints.push([x, yScale(i + 1)]);
  });
  // extend last step to the right edge
  if (stepPoints.length) {
    stepPoints.push([margin.left + w, yScale(jumps)]);
  }

  const line = d3.line().x(d => d[0]).y(d => d[1]);

  g.append("path")
    .datum(stepPoints)
    .attr("d", line)
    .attr("fill", "none")
    .attr("stroke", COLORS.canopy)
    .attr("stroke-width", 3)
    .attr("stroke-linejoin", "round");

  // area fill under the step
  const areaPoints = [[margin.left, margin.top + h], ...stepPoints, [margin.left + w, margin.top + h]];
  g.append("path")
    .datum(areaPoints)
    .attr("d", d3.line().x(d => d[0]).y(d => d[1]))
    .attr("fill", COLORS.canopy)
    .attr("opacity", 0.12);

  // jump markers
  g.selectAll(".jump-dot")
    .data(xValues)
    .enter().append("circle")
    .attr("class", "jump-dot")
    .attr("cx", d => d)
    .attr("cy", (d, i) => yScale(i + 1))
    .attr("r", 4)
    .attr("fill", COLORS.orange);

  // y axis label
  g.append("text")
    .attr("x", margin.left).attr("y", margin.top - 6)
    .attr("fill", COLORS.slate)
    .style("font-size", "12px")
    .text(`${jumps} saut${jumps === 1 ? "" : "s"} au total`);

  // x axis ticks
  if (dates) {
    const axis = d3.axisBottom(xScale).ticks(Math.min(6, jumps)).tickFormat(d3.timeFormat("%d/%m"));
    g.append("g")
      .attr("transform", `translate(0,${margin.top + h})`)
      .call(axis)
      .call(sel => sel.selectAll("text").attr("fill", COLORS.slate).style("font-size", "11px"))
      .call(sel => sel.selectAll("line, path").attr("stroke", "#dde4ea"));
  } else {
    g.append("text")
      .attr("x", margin.left + w / 2).attr("y", margin.top + h + 26)
      .attr("text-anchor", "middle")
      .attr("fill", COLORS.slate)
      .style("font-size", "11px")
      .text("ordre des sauts (dates non renseignées)");
  }
}

// ---------- Filter dropdown ----------
// function setupDropdown() {
//   document.getElementById("fileDropdown").addEventListener("change", async e => {
//     const fileName = path + files[e.target.value] + ".json";
//     try {
//       const data = await loadGraphFile(fileName);
//       fullGraph = data;
//       indexGraph(data);
//       renderClubOverview(data);
//     } catch (err) { console.error(err); }
//   });
// }

// ---------- Back button ----------
document.getElementById("back-btn").addEventListener("click", backToLanding);

// ---------- Init ----------
(async () => {
  setupSearch();
  // setupDropdown();
  try {
    const data = await loadGraphFile(path + "jumpers.json");
    fullGraph = data;
    indexGraph(data);
    renderClubOverview(data);
  } catch (err) {
    console.error("Failed to load club data", err);
  }
})();
