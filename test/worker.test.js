import assert from "node:assert/strict";
import test from "node:test";

import { createWorker } from "../src/index.js";

const screening = {
  id: "trip-to-the-moon-opening",
  title: "A Trip to the Moon",
  filmSlug: "a-trip-to-the-moon",
  framePrefix: "films/a-trip-to-the-moon",
  startAt: "2026-09-05T18:00:00.000Z",
  slotSeconds: 900,
  sampleFps: 1,
  frameCount: 766
};

const worker = createWorker([screening]);

function mockBucket() {
  return {
    async get(key) {
      return {
        body: new TextEncoder().encode(`image:${key}`),
        httpEtag: `\"${key}\"`,
        httpMetadata: { contentType: "image/png" },
        writeHttpMetadata(headers) {
          headers.set("content-type", "image/png");
        }
      };
    }
  };
}

test("the current-frame endpoint returns the globally selected object", async () => {
  const url = "https://slow.example/current/og.png?at=2026-09-05T18:31:00.000Z";
  const response = await worker.fetch(new Request(url), {
    FRAMES: mockBucket(),
    ALLOW_TIME_OVERRIDE: "true"
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-slow-cinema-frame"), "2");
  assert.equal(
    await response.text(),
    "image:films/a-trip-to-the-moon/og/000002.png"
  );
});

test("the API exposes current screening metadata", async () => {
  const url = "https://slow.example/api/now?at=2026-09-05T18:31:00.000Z";
  const response = await worker.fetch(new Request(url), { ALLOW_TIME_OVERRIDE: "true" });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "screening");
  assert.equal(body.screening.title, "A Trip to the Moon");
  assert.equal(body.frameIndex, 2);
  assert.equal(
    body.images.og,
    "https://slow.example/current/og.png?at=2026-09-05T18%3A31%3A00.000Z"
  );
  assert.equal(
    body.images.x,
    "https://slow.example/current/x.png?at=2026-09-05T18%3A31%3A00.000Z"
  );
});
