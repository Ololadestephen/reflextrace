const {
  ensureCollection,
  handleError,
  methodNotAllowed,
  qdrantRequest,
  readBody,
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

    response.status(200).json({
      ok: true,
      backend: "qdrant",
      results: (result.result || []).map((point) => ({
        id: point.id,
        score: point.score,
        vector: point.vector,
        ...point.payload,
      })),
    });
  } catch (error) {
    handleError(response, error);
  }
};
