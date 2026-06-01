const {
  ensureCollection,
  handleError,
  methodNotAllowed,
  qdrantRequest,
  collection,
} = require("../../lib/qdrant");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    methodNotAllowed(response, "POST");
    return;
  }

  try {
    await ensureCollection();
    const { id } = request.query;

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

    response.status(200).json({ ok: true, id, backend: "qdrant" });
  } catch (error) {
    handleError(response, error);
  }
};
