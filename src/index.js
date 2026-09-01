import { getBroadcastState, frameObjectKey, validateSchedule } from "./clock.js";
import { devices, schedule } from "./schedule.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "cache-control": "no-store"
};

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}

function requestTime(url, env) {
  const override = url.searchParams.get("at");
  return override && env.ALLOW_TIME_OVERRIDE === "true" ? new Date(override) : new Date();
}

function publicSchedule(screenings) {
  return screenings.map((item) => {
    const start = new Date(item.startAt);
    const end = new Date(start.getTime() + item.frameCount * item.slotSeconds * 1000);
    return {
      id: item.id,
      title: item.title,
      filmSlug: item.filmSlug,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      slotSeconds: item.slotSeconds,
      frameCount: item.frameCount
    };
  });
}

function broadcastPayload(state, url, env) {
  if (state.status !== "screening") {
    return { ...state, images: null };
  }

  const override = url.searchParams.get("at");
  const suffix = override && env.ALLOW_TIME_OVERRIDE === "true"
    ? `?at=${encodeURIComponent(override)}`
    : "";

  return {
    ...state,
    images: {
      og: `${url.origin}/current/og.png${suffix}`,
      x: `${url.origin}/current/x.png${suffix}`
    }
  };
}

async function currentFrame(request, env, url, device, screenings) {
  if (!devices[device]) {
    return json({ error: "Unknown device", supported: Object.keys(devices) }, 404);
  }

  const state = getBroadcastState(screenings, requestTime(url, env));
  if (state.status !== "screening") {
    return json({ error: "No screening is currently active", broadcast: state }, 404);
  }

  if (!env.FRAMES || typeof env.FRAMES.get !== "function") {
    return json({ error: "The frame store is not configured" }, 503);
  }

  const key = frameObjectKey(state, device, devices[device].extension);
  const object = await env.FRAMES.get(key);
  if (!object) {
    return json({ error: "Broadcast frame is not available", key, broadcast: state }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  headers.set("content-type", object.httpMetadata?.contentType || "image/png");
  headers.set("cache-control", "no-store, max-age=0");
  headers.set("access-control-allow-origin", "*");
  headers.set("x-slow-cinema-film", state.screening.filmSlug);
  headers.set("x-slow-cinema-frame", String(state.frameIndex));
  headers.set("x-slow-cinema-slot-end", state.slotEndAt);
  if (object.httpEtag) headers.set("etag", object.httpEtag);

  return new Response(object.body, { headers });
}

export function createWorker(screenings = schedule) {
  validateSchedule(screenings);

  return {
    async fetch(request, env = {}) {
      const url = new URL(request.url);

      if (request.method !== "GET" && request.method !== "HEAD") {
        return json({ error: "Method not allowed" }, 405, { allow: "GET, HEAD" });
      }

      if (url.pathname === "/" || url.pathname === "/health") {
        return json({
          service: "TRMNL Slow Cinema",
          status: "ok",
          description: "A global movie, frame by frame",
          endpoints: ["/api/now", "/api/schedule", "/current/og.png", "/current/x.png"]
        });
      }

      if (url.pathname === "/api/now") {
        const state = getBroadcastState(screenings, requestTime(url, env));
        return json(broadcastPayload(state, url, env));
      }

      if (url.pathname === "/api/schedule") {
        return json({ screenings: publicSchedule(screenings) });
      }

      const match = url.pathname.match(/^\/current\/(og|x)\.png$/);
      if (match) {
        return currentFrame(request, env, url, match[1], screenings);
      }

      return json({ error: "Not found" }, 404);
    }
  };
}

export default createWorker();
