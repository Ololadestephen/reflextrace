const {
  collection,
  collectionStats,
  ensureCollection,
  handleError,
  methodNotAllowed,
  qdrantUrl,
} = require("../lib/qdrant");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    methodNotAllowed(response, "GET");
    return;
  }

  try {
    await ensureCollection();
    const stats = await collectionStats();
    response.status(200).json({
      ok: true,
      backend: "qdrant",
      qdrantUrl,
      collection,
      stats,
    });
  } catch (error) {
    handleError(response, error);
  }
};
