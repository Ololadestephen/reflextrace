# ReflexTrace

ReflexTrace is a Qdrant-backed memory black box for physical AI. It shows how an agent can remember prior sensor-action episodes, retrieve similar moments, compare possible futures, and accept human safety feedback without becoming a chatbot.

Live demo: https://reflextrace.vercel.app/

Repository: https://github.com/Ololadestephen/reflextrace

The prototype runs a 2D robot simulator. Each episode stores the scene vector plus payload metadata such as action, outcome, risk, position, direction, and scenario. The current scene is vectorized, searched in Qdrant, grouped by possible action, and converted into a recommendation.

## Why It Matters

Physical AI systems need more than a single live sensor reading. They need operational memory: what happened last time a similar scene appeared, which action was unsafe, and whether a human corrected the decision.

ReflexTrace demonstrates that loop:

1. Sense the current grid scene.
2. Embed the scene into an 11-dimensional vector.
3. Upsert sensor-action episodes into Qdrant.
4. Search nearest memories for the current scene.
5. Compare forward, turn left, turn right, and stop.
6. Patch unsafe memories and immediately refresh the recommendation.

## Qdrant Usage

Qdrant is a material part of the runtime, not decorative.

- `server.js` creates or reuses the `reflextrace_episodes` collection.
- The browser upserts episodes through `POST /api/memories`.
- The browser searches nearest memories through `POST /api/search`.
- Human feedback patches Qdrant payloads through `POST /api/patch/:id`.
- The UI displays backend status, collection name, point count, nearest search count, and upsert/search/patch events.

Example point shape:

```json
{
  "collection": "reflextrace_episodes",
  "vector": "scene_embedding[11]",
  "payload": {
    "action": "turn_left",
    "outcome": "safe",
    "risk": 0.18,
    "position": [2, 6],
    "direction": "east",
    "scene": "facing east, goal distant, hazard clear, obstacle close",
    "environment_id": "hiddenHazard",
    "patched": false
  }
}
```

## Demo Flow

Use this flow for the hackathon video:

1. Open ReflexTrace and show `Vector Store Status` as Qdrant green.
2. Click `Memory Patch Test`.
3. Show the recommended action and Qdrant nearest-memory evidence.
4. Click `Mark Unsafe`.
5. Show the feedback message and changed unsafe evidence.
6. Click `Replay Decision` to show the recalled decision path.

The strongest story is: similar scenes looked safe, Qdrant found unsafe prior outcomes, and a human patch changed future behavior.

## Run

Create `.env` from `.env.example` and fill in your Qdrant values:

```bash
QDRANT_URL=https://YOUR-CLUSTER.cloud.qdrant.io
QDRANT_API_KEY=YOUR_API_KEY
QDRANT_COLLECTION=reflextrace_episodes
PORT=8003
```

Start the app:

```bash
set -a; source .env; set +a; node server.js
```

Open:

```text
http://localhost:8003
```

## Local Qdrant Option

You can also run Qdrant locally:

```bash
docker run --name reflextrace-qdrant -p 6333:6333 -p 6334:6334 qdrant/qdrant
```

Then use:

```bash
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
QDRANT_COLLECTION=reflextrace_episodes
PORT=8003
```

## Dependencies

- Node.js 18+.
- Qdrant Cloud or the `qdrant/qdrant` Docker image.
- No frontend package manager dependencies.
- No external CDN assets.


## Project Files

- `index.html` - app shell.
- `styles.css` - demo UI.
- `app.js` - simulator, vectorization, memory analysis, and UI state.
- `server.js` - static server plus Qdrant collection/upsert/search/patch API.
- `.env.example` - required environment variables.
