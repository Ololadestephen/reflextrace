# ReflexTrace Submission Notes

## One-Liner

ReflexTrace is a Qdrant-backed memory black box for physical AI: it recalls similar sensor-action episodes, compares possible robot decisions, and lets a human patch unsafe memories so future recommendations change.

## Track

Primary track: Infrastructure & Developer Tools.

Secondary fit: Data Visualization & Analytics.

## What It Does

ReflexTrace turns a robot decision loop into an inspectable memory system:

- A 2D agent senses a grid scene with obstacles, hazards, goal direction, and local risk.
- The scene is embedded into an 11-dimensional vector.
- Sensor-action episodes are upserted to Qdrant with payload metadata.
- The current scene searches Qdrant for nearest prior episodes.
- The app compares four counterfactual actions: forward, turn left, turn right, and stop.
- Human feedback patches unsafe memories in Qdrant.
- The decision panel updates based on retrieved evidence.

## Why Qdrant Is Essential

Qdrant provides the episode memory layer:

- Collection: `reflextrace_episodes`.
- Vector search: nearest scene memories for the live robot state.
- Payload filters: scenario-specific retrieval through `environment_id`.
- Payload updates: unsafe feedback marks memories as `outcome=unsafe`, `risk=1`, and `patched=true`.
- Live observability: the demo shows backend status, point count, upserts, searches, and returned memory count.

Without Qdrant, the prototype is just a simulator. With Qdrant, it becomes a memory-backed safety debugger.

## Demo Video Script

Target length: 2 to 3 minutes.

1. Introduce ReflexTrace as a physical AI memory black box, not a chatbot.
2. Show Qdrant status: backend green, collection name, point count, and event log.
3. Click `Memory Patch Test`.
4. Explain that the agent is choosing from similar prior episodes, not hard-coded rules.
5. Point to the recommended action and action comparison cards.
6. Click `Mark Unsafe`.
7. Show the human feedback message and patched unsafe evidence.
8. Click `Replay Decision`.
9. Close with the core value: Qdrant lets physical AI remember, compare, and correct decisions from prior experience.

Suggested narration:

```text
ReflexTrace is a Qdrant memory black box for physical AI. Every robot step becomes a vector episode with payload metadata: action, risk, outcome, position, direction, and scenario. When the robot sees a new scene, it searches Qdrant for similar past moments and compares what happened when it moved forward, turned, or stopped.

Here I load the Memory Patch Test. The system retrieves nearest memories and recommends an action from Qdrant evidence. Now I mark the current decision unsafe. ReflexTrace patches matching Qdrant payloads, refreshes nearest search, and the recommendation/evidence updates. This is the safety loop: remember, compare, patch, replay.
```

## Eligibility Checklist

- Uses Qdrant as a material part of the project: yes.
- Includes project code: yes.
- Includes README with installation/run instructions: yes.
- Includes third-party dependencies: yes.
- Demo video must be no more than 3 minutes.
- Submission deadline: June 1, 2026 at 11:59 PM Pacific Time (UTC-7).
- Submission form: https://try.qdrant.tech/hackathon-vsd

## Run Instructions For Judges

Create `.env`:

```bash
QDRANT_URL=https://YOUR-CLUSTER.cloud.qdrant.io
QDRANT_API_KEY=YOUR_API_KEY
QDRANT_COLLECTION=reflextrace_episodes
PORT=8003
```

Start:

```bash
set -a; source .env; set +a; node server.js
```

Open:

```text
http://localhost:8003
```

## Dependencies And License Notes

- Qdrant Cloud or `qdrant/qdrant` Docker image.
- Node.js 18+.
- No frontend package manager dependencies.
- No external CDN assets.
- No bundled third-party media assets.
