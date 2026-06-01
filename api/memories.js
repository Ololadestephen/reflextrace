const {
  ensureCollection,
  handleError,
  methodNotAllowed,
  qdrantRequest,
  readBody,
  toPoint,
  collection,
} = require("../lib/qdrant");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    methodNotAllowed(response, "POST");
    return;
  }

  try {
    await ensureCollection();
    const body = await readBody(request);
    const episodes = Array.isArray(body.episodes) ? body.episodes : [body.episode || body];
    const points = episodes.map(toPoint);

    await qdrantRequest(`/collections/${collection}/points?wait=true`, {
      method: "PUT",
      body: JSON.stringify({ points }),
    });

    response.status(200).json({ ok: true, upserted: points.length, backend: "qdrant" });
  } catch (error) {
    handleError(response, error);
  }
};
