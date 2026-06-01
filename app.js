const canvas = document.querySelector("#world");
const ctx = canvas.getContext("2d");

const elements = {
  playPause: document.querySelector("#playPause"),
  stepOnce: document.querySelector("#stepOnce"),
  resetWorld: document.querySelector("#resetWorld"),
  demoMode: document.querySelector("#demoMode"),
  trainMemory: document.querySelector("#trainMemory"),
  runHazardScenario: document.querySelector("#runHazardScenario"),
  patchUnsafe: document.querySelector("#patchUnsafe"),
  replayDecision: document.querySelector("#replayDecision"),
  narrowCorridor: document.querySelector("#narrowCorridor"),
  hiddenHazard: document.querySelector("#hiddenHazard"),
  blockedGoal: document.querySelector("#blockedGoal"),
  memoryPatchTest: document.querySelector("#memoryPatchTest"),
  markDecisionUnsafe: document.querySelector("#markDecisionUnsafe"),
  actionGrid: document.querySelector("#actionGrid"),
  memoryList: document.querySelector("#memoryList"),
  recommendation: document.querySelector("#recommendation"),
  timeline: document.querySelector("#timeline"),
  destinationStatus: document.querySelector("#destinationStatus"),
  destinationEta: document.querySelector("#destinationEta"),
  episodeCount: document.querySelector("#episodeCount"),
  memoryBackend: document.querySelector("#memoryBackend"),
  qdrantBackend: document.querySelector("#qdrantBackend"),
  qdrantCollection: document.querySelector("#qdrantCollection"),
  qdrantPoints: document.querySelector("#qdrantPoints"),
  eventLog: document.querySelector("#eventLog"),
  lastSearchCount: document.querySelector("#lastSearchCount"),
  theaterHeadline: document.querySelector("#theaterHeadline"),
  theaterMode: document.querySelector("#theaterMode"),
  decisionExplanation: document.querySelector("#decisionExplanation"),
  unsafeFeedbackStatus: document.querySelector("#unsafeFeedbackStatus"),
  runState: document.querySelector("#runState"),
  sceneSummary: document.querySelector("#sceneSummary"),
  queryLabel: document.querySelector("#queryLabel"),
  memoryShape: document.querySelector("#memoryShape"),
};

const grid = { cols: 19, rows: 13, cell: 40 };
const actions = ["forward", "turn_left", "turn_right", "stop"];
const actionLabels = {
  forward: "Forward",
  turn_left: "Turn Left",
  turn_right: "Turn Right",
  stop: "Stop",
};
const actionColors = {
  forward: "#ff6b68",
  turn_left: "#5dff7a",
  turn_right: "#00dbe9",
  stop: "#f7c948",
};
const directions = [
  { name: "east", x: 1, y: 0 },
  { name: "south", x: 0, y: 1 },
  { name: "west", x: -1, y: 0 },
  { name: "north", x: 0, y: -1 },
];

let running = false;
let timer = null;
let step = 0;
let world;
let memories = [];
let timeline = [];
let lastAnalysis = null;
let memoryBackend = "local-fallback";
let remoteResults = [];
let remoteQueryText = "";
let remoteRefreshInFlight = false;
let qdrantTelemetry = {
  collection: "reflextrace_episodes",
  pointsCount: 0,
  status: "offline",
};
let qdrantEvents = [];
let replayGhost = null;
let demoRunning = false;
let activeScenario = "default";
let unsafeFeedbackMessage = "No unsafe feedback applied yet.";

function createWorld() {
  return createScenarioWorld(activeScenario);
}

function createScenarioWorld(name) {
  const scenario = scenarios[name] || scenarios.default;
  return structuredClone({
    agent: scenario.agent,
    goal: scenario.goal,
    hazards: scenario.hazards,
    obstacles: scenario.obstacles,
  });
}

const scenarios = {
  default: {
    label: "Default Grid",
    tests: "Baseline physical AI memory loop.",
    qdrant: "Qdrant recalls similar sensor-action episodes and compares possible futures.",
    agent: { x: 2, y: 2, dir: 0 },
    goal: { x: 16, y: 10 },
    hazards: [
      { x: 7, y: 4 },
      { x: 12, y: 7 },
      { x: 15, y: 4 },
      { x: 5, y: 10 },
    ],
    obstacles: [
      { x: 4, y: 2 },
      { x: 4, y: 3 },
      { x: 4, y: 4 },
      { x: 8, y: 8 },
      { x: 9, y: 8 },
      { x: 10, y: 8 },
      { x: 13, y: 2 },
      { x: 13, y: 3 },
      { x: 2, y: 7 },
      { x: 3, y: 7 },
      { x: 16, y: 8 },
    ],
  },
  narrowCorridor: {
    label: "Narrow Corridor",
    tests: "Obstacles close on both sides test whether the agent avoids collision.",
    qdrant: "Qdrant nearest memories reveal which actions stayed safe in tight passages.",
    agent: { x: 4, y: 6, dir: 0 },
    goal: { x: 15, y: 6 },
    hazards: [
      { x: 11, y: 6 },
      { x: 13, y: 5 },
    ],
    obstacles: [
      { x: 5, y: 5 },
      { x: 5, y: 7 },
      { x: 6, y: 5 },
      { x: 6, y: 7 },
      { x: 7, y: 5 },
      { x: 7, y: 7 },
      { x: 8, y: 5 },
      { x: 8, y: 7 },
      { x: 9, y: 5 },
      { x: 9, y: 7 },
      { x: 10, y: 5 },
      { x: 10, y: 7 },
      { x: 12, y: 5 },
      { x: 12, y: 7 },
    ],
  },
  hiddenHazard: {
    label: "Hidden Hazard",
    tests: "The direct path looks safe, but a nearby hazard makes prior experience matter.",
    qdrant: "Similar Qdrant memories can show that this pattern often ended unsafe.",
    agent: { x: 6, y: 4, dir: 0 },
    goal: { x: 15, y: 4 },
    hazards: [
      { x: 8, y: 4 },
      { x: 12, y: 3 },
      { x: 13, y: 7 },
    ],
    obstacles: [
      { x: 8, y: 3 },
      { x: 8, y: 5 },
      { x: 9, y: 5 },
      { x: 10, y: 5 },
      { x: 14, y: 5 },
      { x: 5, y: 8 },
    ],
  },
  blockedGoal: {
    label: "Blocked Goal",
    tests: "The goal is visible, but the direct route is blocked by obstacles and hazard risk.",
    qdrant: "Qdrant evidence helps reject the tempting forward move and choose a reroute.",
    agent: { x: 9, y: 8, dir: 3 },
    goal: { x: 9, y: 3 },
    hazards: [
      { x: 9, y: 5 },
      { x: 12, y: 5 },
      { x: 6, y: 4 },
    ],
    obstacles: [
      { x: 8, y: 6 },
      { x: 9, y: 6 },
      { x: 10, y: 6 },
      { x: 8, y: 4 },
      { x: 10, y: 4 },
      { x: 11, y: 4 },
      { x: 7, y: 7 },
    ],
  },
  memoryPatchTest: {
    label: "Memory Patch Test",
    tests: "A risky-looking-safe action is patched by the human after unsafe evidence appears.",
    qdrant: "Payload patching updates memory so future recommendations can change immediately.",
    agent: { x: 6, y: 4, dir: 0 },
    goal: { x: 15, y: 4 },
    hazards: [
      { x: 8, y: 4 },
      { x: 12, y: 8 },
    ],
    obstacles: [
      { x: 8, y: 3 },
      { x: 8, y: 5 },
      { x: 10, y: 5 },
      { x: 11, y: 5 },
      { x: 5, y: 7 },
    ],
  },
};

world = createWorld();

function reset() {
  running = false;
  clearInterval(timer);
  timer = null;
  step = 0;
  activeScenario = "default";
  world = createWorld();
  memories = seedMemories();
  timeline = [];
  lastAnalysis = null;
  remoteResults = [];
  remoteQueryText = "";
  memoryBackend = "local-fallback";
  qdrantEvents = [];
  replayGhost = null;
  unsafeFeedbackMessage = "No unsafe feedback applied yet.";
  elements.playPause.textContent = "Run";
  render();
  highlightScenarioButton();
  bootstrapQdrant();
}

async function activateScenario(name) {
  stopRunner();
  activeScenario = name;
  world = createWorld();
  replayGhost = null;
  timeline = [];
  remoteResults = [];
  remoteQueryText = "";
  unsafeFeedbackMessage = "No unsafe feedback applied yet.";
  addEvent("scenario", `${scenarios[name].label} loaded`);
  render();
  highlightScenarioButton();
  await trainScenarioMemory(name);
  await refreshRemoteAnalysis(true);
}

function highlightScenarioButton() {
  const ids = ["narrowCorridor", "hiddenHazard", "blockedGoal", "memoryPatchTest"];
  ids.forEach((id) => {
    elements[id].classList.toggle("active", id === activeScenario);
  });
}

function seedMemories() {
  const seeded = [];
  const starts = [
    { x: 3, y: 2, dir: 0 },
    { x: 6, y: 4, dir: 0 },
    { x: 11, y: 7, dir: 0 },
    { x: 15, y: 8, dir: 3 },
    { x: 8, y: 9, dir: 0 },
    { x: 13, y: 4, dir: 1 },
    { x: 5, y: 9, dir: 1 },
    { x: 2, y: 6, dir: 0 },
  ];

  starts.forEach((agent) => {
    actions.forEach((action) => {
      const snapshot = structuredClone(world);
      snapshot.agent = { ...agent };
      const scene = describeScene(snapshot);
      const outcome = simulateOutcome(snapshot, action);
      seeded.push(makeEpisode(snapshot, action, outcome, scene, true));
    });
  });

  return seeded;
}

function describeScene(state = world) {
  const { agent, goal, hazards, obstacles } = state;
  const dir = directions[agent.dir];
  const front = { x: agent.x + dir.x, y: agent.y + dir.y };
  const distanceToGoal = manhattan(agent, goal);
  const nearbyHazard = nearest(agent, hazards);
  const nearbyObstacle = nearest(agent, obstacles);
  const frontBlocked = isBlocked(front, state);
  const frontHazard = hasPoint(front, hazards);

  const tokens = [
    `facing ${dir.name}`,
    distanceToGoal < 4 ? "goal close" : distanceToGoal < 8 ? "goal midrange" : "goal distant",
    nearbyHazard.distance <= 2 ? "hazard close" : "hazard clear",
    nearbyObstacle.distance <= 2 ? "obstacle close" : "obstacle clear",
    frontBlocked ? "front blocked" : "front open",
    frontHazard ? "hazard ahead" : "no hazard ahead",
    agent.x < goal.x ? "goal east" : agent.x > goal.x ? "goal west" : "goal same column",
    agent.y < goal.y ? "goal south" : agent.y > goal.y ? "goal north" : "goal same row",
  ];

  return {
    text: tokens.join(", "),
    tokens,
    distanceToGoal,
    nearbyHazardDistance: nearbyHazard.distance,
    nearbyObstacleDistance: nearbyObstacle.distance,
    frontBlocked,
    frontHazard,
  };
}

function vectorize(scene) {
  const features = [
    scene.distanceToGoal / 32,
    Math.min(scene.nearbyHazardDistance, 8) / 8,
    Math.min(scene.nearbyObstacleDistance, 8) / 8,
    scene.frontBlocked ? 1 : 0,
    scene.frontHazard ? 1 : 0,
    scene.tokens.includes("goal east") ? 1 : 0,
    scene.tokens.includes("goal west") ? 1 : 0,
    scene.tokens.includes("goal south") ? 1 : 0,
    scene.tokens.includes("goal north") ? 1 : 0,
    scene.tokens.includes("hazard close") ? 1 : 0,
    scene.tokens.includes("obstacle close") ? 1 : 0,
  ];

  const length = Math.hypot(...features) || 1;
  return features.map((value) => value / length);
}

function cosine(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function simulateOutcome(state, action) {
  const beforeDistance = manhattan(state.agent, state.goal);
  const next = nextAgent(state.agent, action);

  if (action === "stop") {
    return {
      outcome: "safe",
      risk: nearbyRisk(state.agent, state),
      nextAgent: state.agent,
      progress: 0,
    };
  }

  if (isOutside(next) || hasPoint(next, state.obstacles)) {
    return { outcome: "collision", risk: 0.96, nextAgent: state.agent, progress: 0 };
  }

  if (hasPoint(next, state.hazards)) {
    return { outcome: "unsafe", risk: 0.9, nextAgent: next, progress: -0.4 };
  }

  const afterDistance = manhattan(next, state.goal);
  const progress = beforeDistance - afterDistance;
  const risk = Math.max(0.04, nearbyRisk(next, state) - Math.max(progress, 0) * 0.08);
  const outcome = afterDistance === 0 ? "success" : risk > 0.58 ? "near_miss" : "safe";

  return { outcome, risk, nextAgent: next, progress };
}

function nextAgent(agent, action) {
  if (action === "turn_left") {
    const dir = (agent.dir + 3) % 4;
    return { ...agent, dir, x: agent.x + directions[dir].x, y: agent.y + directions[dir].y };
  }

  if (action === "turn_right") {
    const dir = (agent.dir + 1) % 4;
    return { ...agent, dir, x: agent.x + directions[dir].x, y: agent.y + directions[dir].y };
  }

  const dir = directions[agent.dir];
  return { ...agent, x: agent.x + dir.x, y: agent.y + dir.y };
}

function chooseAction() {
  if (!lastAnalysis || memories.length < 10) {
    return actions[Math.floor(Math.random() * actions.length)];
  }

  if (Math.random() < 0.18) {
    return actions[Math.floor(Math.random() * actions.length)];
  }

  return lastAnalysis.bestAction || "forward";
}

function tick() {
  const scene = describeScene();
  const action = chooseAction();
  const outcome = simulateOutcome(world, action);
  const episode = makeEpisode(world, action, outcome, scene, false);
  memories.unshift(episode);
  memories = memories.slice(0, 240);
  upsertEpisodes([episode]);
  timeline.unshift(outcome);
  timeline = timeline.slice(0, 48);
  world.agent = outcome.nextAgent;

  if (outcome.outcome === "success") {
    stopRunner();
    addEvent("goal", "destination reached; run paused");
  }

  step += 1;
  render();
  refreshRemoteAnalysis();
}

async function trainMemory() {
  stopRunner();
  const trainingEpisodes = [];
  const starts = [
    { x: 6, y: 4, dir: 0 },
    { x: 11, y: 7, dir: 0 },
    { x: 15, y: 8, dir: 3 },
    { x: 5, y: 9, dir: 1 },
    { x: 13, y: 4, dir: 1 },
  ];

  starts.forEach((agent) => {
    actions.forEach((action) => {
      const snapshot = structuredClone(world);
      snapshot.agent = { ...agent };
      const scene = describeScene(snapshot);
      const outcome = simulateOutcome(snapshot, action);
      trainingEpisodes.push(makeEpisode(snapshot, action, outcome, scene, true));
    });
  });

  memories = [...trainingEpisodes, ...memories].slice(0, 240);
  addEvent("train", `prepared ${trainingEpisodes.length} sensor-action episodes`);
  render();
  await upsertEpisodes(trainingEpisodes, true);
  await refreshRemoteAnalysis(true);
}

async function trainScenarioMemory(name) {
  const scenario = scenarios[name];
  if (!scenario) return;

  const trainingEpisodes = [];
  const starts = scenarioTrainingStarts(name);

  starts.forEach((agent) => {
    actions.forEach((action) => {
      const snapshot = createScenarioWorld(name);
      snapshot.agent = { ...agent };
      const scene = describeScene(snapshot);
      let outcome = simulateOutcome(snapshot, action);

      if (name === "memoryPatchTest" && action === "forward") {
        outcome = { ...outcome, outcome: "safe", risk: 0.08, progress: 1 };
      }

      trainingEpisodes.push(makeEpisode(snapshot, action, outcome, scene, true));
    });
  });

  memories = [...trainingEpisodes, ...memories].slice(0, 240);
  addEvent("train", `${scenario.label}: ${trainingEpisodes.length} Qdrant memories prepared`);
  render();
  await upsertEpisodes(trainingEpisodes, true);
}

function scenarioTrainingStarts(name) {
  const scenario = scenarios[name] || scenarios.default;
  const base = scenario.agent;
  return [
    base,
    { ...base, x: Math.max(1, base.x - 1) },
    { ...base, y: Math.max(1, base.y - 1) },
    { ...base, y: Math.min(grid.rows - 2, base.y + 1) },
    { ...base, dir: (base.dir + 1) % 4 },
    { ...base, dir: (base.dir + 3) % 4 },
  ];
}

async function runHazardScenario() {
  stopRunner();
  replayGhost = null;
  activeScenario = "hiddenHazard";
  world = createWorld();
  highlightScenarioButton();
  addEvent("scenario", "Hidden Hazard loaded for counterfactual search");
  render();
  await trainScenarioMemory("hiddenHazard");
  await refreshRemoteAnalysis(true);
}

async function patchMostUnsafe() {
  const targetAction = activeScenario === "memoryPatchTest" ? "forward" : lastAnalysis?.bestAction;

  if (targetAction) {
    const targetMemories = lastAnalysis?.nearestEpisodes
      .filter((memory) => !memory.patched && memory.action === targetAction)
      .slice(0, 8);

    if (targetMemories?.length) {
      addEvent("patch", `patching ${targetMemories.length} ${actionLabels[targetAction]} memories`);
      unsafeFeedbackMessage = `Applied: ${targetMemories.length} ${actionLabels[targetAction]} memories marked unsafe.`;
      for (const memory of targetMemories) {
        await patchMemory(memory.id, false);
      }
      await refreshRemoteAnalysis(true);
      render();
      return;
    }
  }

  const candidate =
    lastAnalysis?.nearestEpisodes.find((memory) => !memory.patched && memory.action === "forward") ||
    lastAnalysis?.nearestEpisodes.find((memory) => !memory.patched && memory.outcome !== "unsafe") ||
    lastAnalysis?.nearestEpisodes[0];

  if (!candidate) {
    addEvent("patch", "no nearest memory available to patch");
    unsafeFeedbackMessage = "No matching Qdrant memory found to patch.";
    render();
    return;
  }

  unsafeFeedbackMessage = `Applied: 1 ${actionLabels[candidate.action]} memory marked unsafe.`;
  await patchMemory(candidate.id, false);
}

async function replayDecision() {
  const best = lastAnalysis?.nearestEpisodes.find(
    (memory) => memory.action === lastAnalysis.bestAction,
  );

  if (!best) {
    addEvent("replay", "no decision memory available to replay");
    return;
  }

  replayGhost = { position: best.position, action: best.action, outcome: best.outcome };
  addEvent("replay", `${actionLabels[best.action]} recalled from ${Math.round(best.score * 100)}% similar memory`);
  addEvent("theater", "four counterfactual futures projected onto simulator");
  render();
}

async function runDemoMode() {
  if (demoRunning) return;

  demoRunning = true;
  elements.demoMode.disabled = true;
  elements.demoMode.textContent = "Demo Running...";
  addEvent("demo", "starting scripted ReflexTrace sequence");
  render();

  try {
    await pause(450);
    await activateScenario("memoryPatchTest");
    await pause(850);
    await patchMostUnsafe();
    await pause(850);
    await replayDecision();
    addEvent("demo", "sequence complete: challenge -> search -> patch -> replay");
  } finally {
    demoRunning = false;
    elements.demoMode.disabled = false;
    elements.demoMode.textContent = "Demo Mode";
    render();
  }
}

function makeEpisode(state, action, result, scene, seeded) {
  const vector = vectorize(scene);
  return {
    id: crypto.randomUUID(),
    step,
    vector,
    scene: scene.text,
    action,
    outcome: result.outcome,
    risk: Number(result.risk.toFixed(2)),
    progress: Number(result.progress.toFixed(2)),
    position: [state.agent.x, state.agent.y],
    direction: directions[state.agent.dir].name,
    environment_id: activeScenario,
    patched: false,
    seeded,
  };
}

function analyzeCurrentScene() {
  const scene = describeScene();
  const vector = vectorize(scene);
  const source =
    memoryBackend === "qdrant" && remoteQueryText === scene.text && remoteResults.length
      ? remoteResults
      : memories
          .map((memory) => ({ ...memory, score: cosine(vector, memory.vector) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 28);
  const nearestEpisodes = source.slice(0, 28);

  const byAction = actions.map((action) => {
    const episodes = nearestEpisodes.filter((episode) => episode.action === action).slice(0, 8);
    const averageRisk = episodes.length
      ? episodes.reduce((sum, episode) => sum + episode.risk, 0) / episodes.length
      : 0.75;
    const successRate = episodes.length
      ? episodes.filter((episode) => ["safe", "success"].includes(episode.outcome)).length / episodes.length
      : 0;
    const unsafeRate = episodes.length
      ? episodes.filter((episode) => ["collision", "unsafe", "near_miss"].includes(episode.outcome)).length /
        episodes.length
      : 1;
    const progress = episodes.length
      ? episodes.reduce((sum, episode) => sum + episode.progress, 0) / episodes.length
      : 0;
    const stopPenalty = action === "stop" ? 0.24 : 0;
    const utility =
      successRate * 0.48 + Math.max(progress, 0) * 0.42 - averageRisk * 0.5 - stopPenalty;

    return { action, episodes, averageRisk, successRate, unsafeRate, progress, utility };
  });

  const best = [...byAction].sort((a, b) => b.utility - a.utility)[0];
  const projections = byAction.map((item) => makeProjection(item));
  return { scene, nearestEpisodes, byAction, bestAction: best?.action, projections };
}

function makeProjection(item) {
  const path = [{ ...world.agent }];
  let projectionAgent = { ...world.agent };
  const first = nextAgent(projectionAgent, item.action);
  path.push(first);
  projectionAgent = first;

  for (let index = 0; index < 2; index += 1) {
    const next = nextAgent(projectionAgent, "forward");
    path.push(next);
    projectionAgent = next;
  }

  const simulated = simulateOutcome(world, item.action);
  const status =
    simulated.outcome === "collision" || simulated.outcome === "unsafe" || item.unsafeRate > 0.55
      ? "unsafe"
      : simulated.outcome === "near_miss" || item.averageRisk > 0.42
        ? "caution"
        : "safe";

  return {
    action: item.action,
    path,
    status,
    evidenceCount: item.episodes.length,
    unsafeRate: item.unsafeRate,
    averageRisk: item.averageRisk,
    score: item.utility,
  };
}

function render() {
  lastAnalysis = analyzeCurrentScene();
  if (elements.episodeCount) elements.episodeCount.textContent = `${memories.length} memories`;
  if (elements.memoryBackend) {
    elements.memoryBackend.textContent =
      memoryBackend === "qdrant" ? "Memory: Qdrant" : "Memory: local fallback";
  }
  elements.qdrantBackend.textContent =
    memoryBackend === "qdrant" ? `Qdrant (${qdrantTelemetry.status})` : "Local fallback";
  elements.qdrantCollection.textContent = qdrantTelemetry.collection;
  elements.qdrantPoints.textContent = String(qdrantTelemetry.pointsCount);
  if (elements.runState) elements.runState.textContent = running ? "Running" : "Paused";
  elements.sceneSummary.textContent = lastAnalysis.scene.text;
  elements.queryLabel.textContent = `top ${lastAnalysis.nearestEpisodes.length} nearest`;

  drawWorld();
  renderRecommendation();
  renderTheater();
  renderDestinationStatus();
  renderDecisionExplanation();
  renderActionCards();
  renderMemories();
  renderTimeline();
  renderEvents();
  renderMemoryShape();
}

function drawWorld() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#121917";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let x = 0; x <= grid.cols; x += 1) {
    line(x * grid.cell, 0, x * grid.cell, canvas.height, "#21302b");
  }

  for (let y = 0; y <= grid.rows; y += 1) {
    line(0, y * grid.cell, canvas.width, y * grid.cell, "#21302b");
  }

  world.obstacles.forEach((point) => rectCell(point, "#68736e"));
  world.hazards.forEach((point) => rectCell(point, "#ef6a5b"));
  rectCell(world.goal, "#58c27d");

  const { agent } = world;
  const cx = agent.x * grid.cell + grid.cell / 2;
  const cy = agent.y * grid.cell + grid.cell / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((agent.dir * Math.PI) / 2);
  ctx.fillStyle = "#6db7d8";
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-12, -11);
  ctx.lineTo(-8, 0);
  ctx.lineTo(-12, 11);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (lastAnalysis?.nearestEpisodes?.length) {
    ctx.strokeStyle = "rgba(109, 183, 216, 0.35)";
    ctx.lineWidth = 2;
    lastAnalysis.nearestEpisodes.slice(0, 7).forEach((episode) => {
      const [x, y] = episode.position;
      line(cx, cy, x * grid.cell + grid.cell / 2, y * grid.cell + grid.cell / 2, "rgba(109, 183, 216, 0.25)");
    });
  }

  drawCounterfactualProjections();

  if (replayGhost) {
    const [x, y] = replayGhost.position;
    const cx2 = x * grid.cell + grid.cell / 2;
    const cy2 = y * grid.cell + grid.cell / 2;
    ctx.strokeStyle = "#e7bc4f";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx2, cy2, 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#e7bc4f";
    ctx.font = "700 12px system-ui";
    ctx.fillText("replay", cx2 + 20, cy2 + 4);
  }
}

function drawCounterfactualProjections() {
  if (!lastAnalysis?.projections?.length) return;

  lastAnalysis.projections.forEach((projection, index) => {
    const color =
      projection.status === "unsafe"
        ? actionColors.forward
        : projection.status === "caution"
          ? actionColors.stop
          : actionColors[projection.action];
    const offset = (index - 1.5) * 4;

    ctx.save();
    ctx.lineWidth = projection.action === lastAnalysis.bestAction ? 5 : 3;
    ctx.globalAlpha = projection.action === lastAnalysis.bestAction ? 0.95 : 0.58;
    ctx.strokeStyle = color;
    ctx.setLineDash(projection.action === "stop" ? [2, 8] : [10, 7]);
    ctx.beginPath();
    projection.path.forEach((point, pointIndex) => {
      const x = point.x * grid.cell + grid.cell / 2 + offset;
      const y = point.y * grid.cell + grid.cell / 2 + offset;
      if (pointIndex === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    const end = projection.path[projection.path.length - 1];
    const endX = end.x * grid.cell + grid.cell / 2 + offset;
    const endY = end.y * grid.cell + grid.cell / 2 + offset;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(endX, endY, projection.action === lastAnalysis.bestAction ? 8 : 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "800 11px system-ui";
    ctx.fillText(actionLabels[projection.action], endX + 10, endY + 4);
    ctx.restore();
  });
}

function renderRecommendation() {
  const best = lastAnalysis.byAction.find((item) => item.action === lastAnalysis.bestAction);
  const label = best ? actionLabels[best.action] : "Collecting memory...";
  const confidence = best ? Math.round(best.successRate * 100) : 0;

  elements.recommendation.innerHTML = `
    <span>Recommended action</span>
    <strong>${label}</strong>
    <p>${confidence}% safe/success from Qdrant nearest memories.</p>
  `;
}

function renderTheater() {
  if (!elements.theaterHeadline || !elements.theaterMode) return;

  const best = lastAnalysis.byAction.find((item) => item.action === lastAnalysis.bestAction);
  const evidence = best?.episodes.length || 0;
  const unsafe = best ? Math.round(best.unsafeRate * 100) : 0;
  elements.theaterHeadline.textContent = `${actionLabels[lastAnalysis.bestAction] || "Best action"} wins after comparing ${evidence} similar Qdrant memories; unsafe evidence ${unsafe}%.`;
  elements.theaterMode.textContent =
    memoryBackend === "qdrant" ? "Qdrant-backed futures" : "Local fallback futures";
}

function renderDecisionExplanation() {
  const best = lastAnalysis.byAction.find((item) => item.action === lastAnalysis.bestAction);
  if (!best) {
    elements.decisionExplanation.textContent = "Waiting for Qdrant evidence.";
    elements.unsafeFeedbackStatus.textContent = unsafeFeedbackMessage;
    return;
  }

  const action = actionLabels[best.action];
  const safe = Math.round(best.successRate * 100);
  const risk = Math.round(best.averageRisk * 100);
  const count = best.episodes.length;
  elements.decisionExplanation.textContent = `${action} is recommended because Qdrant found ${count} similar episode${count === 1 ? "" : "s"} with ${safe}% safe outcomes and ${risk}% average risk.`;
  elements.unsafeFeedbackStatus.textContent = unsafeFeedbackMessage;
}

function renderDestinationStatus() {
  const distance = manhattan(world.agent, world.goal);
  const bestAction = actionLabels[lastAnalysis.bestAction] || "Collecting memory";
  const tickSeconds = 0.68;
  const bestCaseSeconds = Math.ceil(distance * tickSeconds);

  if (distance === 0) {
    elements.destinationStatus.textContent = "Destination reached. Run paused.";
    elements.destinationEta.textContent = "ETA: arrived";
    return;
  }

  elements.destinationStatus.textContent = `Goal is ${distance} grid step${distance === 1 ? "" : "s"} away. Current decision: ${bestAction}.`;
  elements.destinationEta.textContent = `ETA: ~${distance} decisions / ${bestCaseSeconds}s best-case`;
}

function renderActionCards() {
  elements.actionGrid.innerHTML = lastAnalysis.byAction
    .map((item) => {
      const risk = Math.round(item.averageRisk * 100);
      const safe = Math.round(item.successRate * 100);
      const color = risk > 70 ? "var(--red)" : risk > 42 ? "var(--yellow)" : "var(--green)";
      const bestClass = item.action === lastAnalysis.bestAction ? " best" : "";
      const unsafe = Math.round(item.unsafeRate * 100);

      return `
        <article class="action-card${bestClass}">
          <h3>${actionLabels[item.action]} <span class="risk">${risk}% risk</span></h3>
          <div class="meter"><span style="width:${risk}%; background:${color}"></span></div>
          <p>${safe}% safe outcomes, ${item.progress.toFixed(1)} avg progress, ${item.episodes.length} memories.</p>
          <div class="evidence-strip" aria-label="Qdrant evidence for ${actionLabels[item.action]}">
            <span><b>${item.episodes.length}</b>similar</span>
            <span><b>${unsafe}%</b>unsafe</span>
            <span><b>${item.utility.toFixed(2)}</b>utility</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderMemories() {
  elements.memoryList.innerHTML = lastAnalysis.nearestEpisodes
    .slice(0, 10)
    .map((memory) => {
      const score = Math.round(memory.score * 100);
      return `
        <article class="memory-card">
          <header>
            <strong>${actionLabels[memory.action]}</strong>
            <span class="tag">${score}% similar</span>
          </header>
          <p>${memory.scene}</p>
          <div class="tag-row">
            <span class="tag">${memory.outcome}</span>
            <span class="tag">${Math.round(memory.risk * 100)}% risk</span>
            <span class="tag">x${memory.position[0]} y${memory.position[1]}</span>
            ${memory.patched ? '<span class="tag">patched unsafe</span>' : ""}
          </div>
          <button class="patch-button" type="button" data-patch="${memory.id}">Mark unsafe</button>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll("[data-patch]").forEach((button) => {
    button.addEventListener("click", () => patchMemory(button.dataset.patch));
  });
}

function renderTimeline() {
  elements.timeline.innerHTML = timeline
    .map((item) => {
      const color =
        item.outcome === "collision" || item.outcome === "unsafe"
          ? "var(--red)"
          : item.outcome === "near_miss"
            ? "var(--yellow)"
            : item.outcome === "success"
              ? "var(--green)"
              : "var(--cyan)";
      return `<span class="tick" title="${item.outcome}" style="background:${color}; opacity:${0.35 + item.risk * 0.65}"></span>`;
    })
    .join("");
}

function renderEvents() {
  elements.lastSearchCount.textContent = `${remoteResults.length || lastAnalysis.nearestEpisodes.length} returned`;
  elements.eventLog.innerHTML = qdrantEvents
    .slice(0, 5)
    .map(
      (event) => `
        <div class="event-item">
          <strong>${event.type}</strong>
          <span>${event.message}</span>
        </div>
      `,
    )
    .join("");
}

function renderMemoryShape() {
  const example = {
    collection: "reflextrace_episodes",
    vector: "scene_embedding[11]",
    payload: {
      action: "turn_left",
      outcome: "safe | near_miss | collision | unsafe | success",
      risk: 0.18,
      position: [world.agent.x, world.agent.y],
      direction: directions[world.agent.dir].name,
      scene: lastAnalysis.scene.text,
      filters: ["environment_id", "action", "outcome", "risk"],
    },
  };

  elements.memoryShape.textContent = JSON.stringify(example, null, 2);
}

async function patchMemory(id, updateFeedback = true) {
  let memory = memories.find((item) => item.id === id);
  if (!memory) {
    memory = remoteResults.find((item) => item.id === id);
  }
  if (!memory) return;
  memory.outcome = "unsafe";
  memory.risk = 1;
  memory.patched = true;
  if (updateFeedback) {
    unsafeFeedbackMessage = `Applied: 1 ${actionLabels[memory.action]} memory marked unsafe.`;
  }
  memories = memories.map((item) => (item.id === id ? { ...item, ...memory } : item));
  remoteResults = remoteResults.map((item) => (item.id === id ? { ...item, ...memory } : item));
  addEvent("patch", "local payload marked unsafe");
  render();
  await patchRemoteMemory(id);
}

async function bootstrapQdrant() {
  try {
    const health = await apiJson("/api/health");
    if (health.backend !== "qdrant") return;
    syncTelemetry(health);
    memoryBackend = "qdrant";
    addEvent("health", `${health.collection} online with ${qdrantTelemetry.pointsCount} points`);
    render();
    await upsertEpisodes(memories, true);
    await refreshRemoteAnalysis(true);
  } catch {
    memoryBackend = "local-fallback";
    render();
  }
}

async function refreshRemoteAnalysis(force = false) {
  if (memoryBackend !== "qdrant" || remoteRefreshInFlight) return;
  const scene = describeScene();
  if (!force && remoteQueryText === scene.text) return;

  remoteRefreshInFlight = true;
  try {
    const result = await apiJson("/api/search", {
      method: "POST",
      body: JSON.stringify({ vector: vectorize(scene), limit: 28, environment_id: activeScenario }),
    });
    remoteResults = result.results || [];
    remoteQueryText = scene.text;
    memoryBackend = "qdrant";
    addEvent("search", `nearest search returned ${remoteResults.length} memories`);
  } catch {
    memoryBackend = "local-fallback";
  } finally {
    remoteRefreshInFlight = false;
    render();
  }
}

async function upsertEpisodes(episodes, renderAfter = false) {
  if (!episodes.length) return;

  try {
    const result = await apiJson("/api/memories", {
      method: "POST",
      body: JSON.stringify({ episodes }),
    });
    memoryBackend = result.backend === "qdrant" ? "qdrant" : "local-fallback";
    addEvent("upsert", `${result.upserted} episode${result.upserted === 1 ? "" : "s"} upserted`);
    await refreshTelemetry();
  } catch {
    memoryBackend = "local-fallback";
  }

  if (renderAfter) render();
}

async function patchRemoteMemory(id) {
  if (memoryBackend !== "qdrant") return;

  try {
    await apiJson(`/api/patch/${encodeURIComponent(id)}`, { method: "POST" });
    addEvent("patch", "Qdrant payload updated: outcome=unsafe, risk=1");
    remoteResults = remoteResults.map((memory) =>
      memory.id === id ? { ...memory, outcome: "unsafe", risk: 1, patched: true } : memory,
    );
    await refreshRemoteAnalysis(true);
  } catch {
    memoryBackend = "local-fallback";
    render();
  }
}

async function refreshTelemetry() {
  try {
    const health = await apiJson("/api/health");
    syncTelemetry(health);
  } catch {
    memoryBackend = "local-fallback";
  }
}

function syncTelemetry(health) {
  qdrantTelemetry = {
    collection: health.collection || qdrantTelemetry.collection,
    pointsCount: health.stats?.pointsCount || 0,
    status: health.stats?.status || "unknown",
  };
}

function addEvent(type, message) {
  qdrantEvents.unshift({ type, message });
  qdrantEvents = qdrantEvents.slice(0, 12);
}

function stopRunner() {
  running = false;
  clearInterval(timer);
  timer = null;
  elements.playPause.textContent = "Run";
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok || body.ok === false) {
    throw new Error(body.error || `API ${response.status}`);
  }
  return body;
}

function rectCell(point, color) {
  ctx.fillStyle = color;
  ctx.fillRect(point.x * grid.cell + 4, point.y * grid.cell + 4, grid.cell - 8, grid.cell - 8);
}

function line(x1, y1, x2, y2, color) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function nearest(point, points) {
  return points
    .map((candidate) => ({ point: candidate, distance: manhattan(point, candidate) }))
    .sort((a, b) => a.distance - b.distance)[0];
}

function nearbyRisk(point, state) {
  const hazard = nearest(point, state.hazards).distance;
  const obstacle = nearest(point, state.obstacles).distance;
  return Math.max(0.05, 0.7 / Math.max(hazard, 1) + 0.28 / Math.max(obstacle, 1));
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function hasPoint(point, points) {
  return points.some((candidate) => candidate.x === point.x && candidate.y === point.y);
}

function isOutside(point) {
  return point.x < 0 || point.y < 0 || point.x >= grid.cols || point.y >= grid.rows;
}

function isBlocked(point, state) {
  return isOutside(point) || hasPoint(point, state.obstacles);
}

elements.playPause.addEventListener("click", () => {
  running = !running;
  elements.playPause.textContent = running ? "Pause" : "Run";

  if (running) {
    timer = setInterval(tick, 680);
  } else {
    clearInterval(timer);
    timer = null;
  }

  render();
});

elements.stepOnce.addEventListener("click", tick);
elements.resetWorld.addEventListener("click", reset);
elements.demoMode.addEventListener("click", runDemoMode);
elements.trainMemory.addEventListener("click", trainMemory);
elements.runHazardScenario.addEventListener("click", runHazardScenario);
elements.patchUnsafe.addEventListener("click", patchMostUnsafe);
elements.markDecisionUnsafe.addEventListener("click", patchMostUnsafe);
elements.replayDecision.addEventListener("click", replayDecision);
elements.narrowCorridor.addEventListener("click", () => activateScenario("narrowCorridor"));
elements.hiddenHazard.addEventListener("click", () => activateScenario("hiddenHazard"));
elements.blockedGoal.addEventListener("click", () => activateScenario("blockedGoal"));
elements.memoryPatchTest.addEventListener("click", () => activateScenario("memoryPatchTest"));

reset();
