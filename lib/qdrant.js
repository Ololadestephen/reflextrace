const qdrantUrl = process.env.QDRANT_URL || "http://localhost:6333";
const qdrantApiKey = process.env.QDRANT_API_KEY || "";
const collection = process.env.QDRANT_COLLECTION || "reflextrace_episodes";
const vectorSize = 11;

let readyPromise = null;

async function qdrantRequest(endpoint, options = {}) {
  const response = await fetch(`${qdrantUrl}${endpoint}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(qdrantApiKey ? { "api-key": qdrantApiKey } : {}),
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(body?.status?.error || body?.message || `Qdrant ${response.status}`);
  }

  return body;
}

async function ensureCollection() {
  if (!readyPromise) {
    readyPromise = ensureCollectionInner();
  }

  return readyPromise;
}

async function ensureCollectionInner() {
  try {
    await qdrantRequest(`/collections/${collection}`);
  } catch {
    await qdrantRequest(`/collections/${collection}`, {
      method: "PUT",
      body: JSON.stringify({
        vectors: {
          size: vectorSize,
          distance: "Cosine",
        },
      }),
    });
  }

  await ensurePayloadIndexes();
}

async function ensurePayloadIndexes() {
  try {
    await qdrantRequest(`/collections/${collection}/index`, {
      method: "PUT",
      body: JSON.stringify({
        field_name: "environment_id",
        field_schema: "keyword",
      }),
    });
  } catch (error) {
    if (!error.message.toLowerCase().includes("already")) {
      throw error;
    }
  }
}

async function collectionStats() {
  const info = await qdrantRequest(`/collections/${collection}`);
  return {
    status: info.result?.status || "unknown",
    pointsCount: info.result?.points_count || 0,
    vectorsSize: info.result?.config?.params?.vectors?.size || vectorSize,
    distance: info.result?.config?.params?.vectors?.distance || "Cosine",
  };
}

function toPoint(episode) {
  return {
    id: episode.id,
    vector: episode.vector,
    payload: {
      scene: episode.scene,
      action: episode.action,
      outcome: episode.outcome,
      risk: episode.risk,
      progress: episode.progress,
      position: episode.position,
      direction: episode.direction,
      patched: Boolean(episode.patched),
      seeded: Boolean(episode.seeded),
      step: episode.step,
      timestamp: episode.timestamp || new Date().toISOString(),
      environment_id: episode.environment_id || "demo-grid",
    },
  };
}

async function readBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string" && request.body.length) return JSON.parse(request.body);
  return {};
}

function methodNotAllowed(response, allowed) {
  response.setHeader("allow", allowed);
  response.status(405).json({ ok: false, error: "Method not allowed" });
}

function handleError(response, error) {
  response.status(503).json({
    ok: false,
    backend: "local-fallback",
    error: error.message,
  });
}

module.exports = {
  collection,
  collectionStats,
  ensureCollection,
  handleError,
  methodNotAllowed,
  qdrantRequest,
  readBody,
  toPoint,
  qdrantUrl,
};
