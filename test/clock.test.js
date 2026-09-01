import assert from "node:assert/strict";
import test from "node:test";

import { frameObjectKey, getBroadcastState, validateSchedule } from "../src/clock.js";

const screening = {
  id: "test-screening",
  title: "Test Film",
  filmSlug: "test-film",
  framePrefix: "films/test-film",
  startAt: "2026-09-01T12:00:00.000Z",
  slotSeconds: 900,
  sampleFps: 1,
  frameCount: 60
};

test("the opening slot displays frame zero", () => {
  const state = getBroadcastState([screening], "2026-09-01T12:00:00.000Z");
  assert.equal(state.status, "screening");
  assert.equal(state.frameIndex, 0);
  assert.equal(state.movieSecond, 0);
  assert.equal(state.slotEndAt, "2026-09-01T12:15:00.000Z");
});

test("all requests inside a global slot receive the same frame", () => {
  const early = getBroadcastState([screening], "2026-09-01T12:16:00.000Z");
  const late = getBroadcastState([screening], "2026-09-01T12:29:59.999Z");
  assert.equal(early.frameIndex, 1);
  assert.equal(late.frameIndex, 1);
});

test("a late installer joins the current global frame", () => {
  const state = getBroadcastState([screening], "2026-09-01T14:31:00.000Z");
  assert.equal(state.frameIndex, 10);
  assert.equal(state.movieSecond, 10);
  assert.equal(state.frameNumber, 11);
});

test("the frame key is deterministic for each device", () => {
  const state = getBroadcastState([screening], "2026-09-01T14:31:00.000Z");
  assert.equal(frameObjectKey(state, "og"), "films/test-film/og/000010.png");
  assert.equal(frameObjectKey(state, "x"), "films/test-film/x/000010.png");
});

test("the screening ends exactly after its last slot", () => {
  const last = getBroadcastState([screening], "2026-09-02T02:59:59.999Z");
  const ended = getBroadcastState([screening], "2026-09-02T03:00:00.000Z");
  assert.equal(last.frameIndex, 59);
  assert.equal(ended.status, "ended");
});

test("overlapping screenings are rejected", () => {
  const overlap = { ...screening, id: "overlap", startAt: "2026-09-01T12:15:00.000Z" };
  assert.throws(() => validateSchedule([screening, overlap]), /overlaps/);
});
