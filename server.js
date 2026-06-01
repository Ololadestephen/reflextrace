const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 8000);
const qdrantUrl = process.env.QDRANT_URL || "http://localhost:6333";
const qdrantApiKey = process.env.QDRANT_API_KEY || "";
const collection = process.env.QDRANT_COLLECTION || "reflextrace_episodes";
const vectorSize = 11;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

let qdrantReady = false;

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
  try {
    await qdrantRequest(`/collections/${collection}`);
    qdrantReady = true;
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
    qdrantReady = true;
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

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function writeJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
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

async function handleApi(request, response) {
  try {
    if (request.method === "GET" && request.url === "/api/health") {
      const stats = qdrantReady
        ? await collectionStats()
        : { status: "offline", pointsCount: 0, vectorsSize: vectorSize, distance: "Cosine" };
      writeJson(response, 200, {
        ok: true,
        backend: qdrantReady ? "qdrant" : "local-fallback",
        qdrantUrl,
        collection,
        stats,
      });
      return;
    }

    if (request.method === "POST" && request.url === "/api/memories") {
      const body = await readJson(request);
      const episodes = Array.isArray(body.episodes) ? body.episodes : [body.episode || body];
      const points = episodes.map(toPoint);
      await qdrantRequest(`/collections/${collection}/points?wait=true`, {
        method: "PUT",
        body: JSON.stringify({ points }),
      });
      writeJson(response, 200, { ok: true, upserted: points.length, backend: "qdrant" });
      return;
    }

    if (request.method === "POST" && request.url === "/api/search") {
      const body = await readJson(request);
      const limit = Number(body.limit || 28);
      const filter = body.environment_id
        ? {
            must: [
              {
                key: "environment_id",
                match: { value: body.environment_id },
              },
            ],
          }
        : undefined;
      const result = await qdrantRequest(`/collections/${collection}/points/search`, {
        method: "POST",
        body: JSON.stringify({
          vector: body.vector,
          limit,
          ...(filter ? { filter } : {}),
          with_payload: true,
          with_vector: true,
        }),
      });
      writeJson(response, 200, {
        ok: true,
        backend: "qdrant",
        results: (result.result || []).map((point) => ({
          id: point.id,
          score: point.score,
          vector: point.vector,
          ...point.payload,
        })),
      });
      return;
    }

    const patchMatch = request.url.match(/^\/api\/patch\/([^/]+)$/);
    if (request.method === "POST" && patchMatch) {
      const id = decodeURIComponent(patchMatch[1]);
      await qdrantRequest(`/collections/${collection}/points/payload?wait=true`, {
        method: "POST",
        body: JSON.stringify({
          points: [id],
          payload: {
            outcome: "unsafe",
            risk: 1,
            patched: true,
          },
        }),
      });
      writeJson(response, 200, { ok: true, id, backend: "qdrant" });
      return;
    }

    writeJson(response, 404, { ok: false, error: "Not found" });
  } catch (error) {
    writeJson(response, 503, {
      ok: false,
      backend: "local-fallback",
      error: error.message,
    });
  }
}

function serveStatic(request, response) {
  const safePath = request.url === "/" ? "/index.html" : decodeURIComponent(request.url);
  const filePath = path.normalize(path.join(root, safePath));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "content-type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(data);
  });
}

const server = http.createServer((request, response) => {
  if (request.url.startsWith("/api/")) {
    handleApi(request, response);
    return;
  }

  serveStatic(request, response);
});

ensureCollection()
  .then(() => {
    console.log(`Qdrant ready: ${qdrantUrl}, collection ${collection}`);
  })
  .catch((error) => {
    console.warn(`Qdrant unavailable, frontend will use fallback: ${error.message}`);
  })
  .finally(() => {
    server.listen(port, () => {
      console.log(`ReflexTrace listening on http://localhost:${port}`);
    });
  });
