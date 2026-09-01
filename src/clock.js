const SECOND_MS = 1000;

function asTimestamp(value, label) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    throw new TypeError(`${label} must be a valid date`);
  }
  return timestamp;
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive integer`);
  }
}

export function validateSchedule(screenings) {
  if (!Array.isArray(screenings)) {
    throw new TypeError("schedule must be an array");
  }

  let previousEnd = -Infinity;

  screenings.forEach((screening, index) => {
    const label = `schedule[${index}]`;
    if (!screening.id || !screening.title || !screening.filmSlug || !screening.framePrefix) {
      throw new TypeError(`${label} is missing required metadata`);
    }

    assertPositiveInteger(screening.slotSeconds, `${label}.slotSeconds`);
    assertPositiveInteger(screening.frameCount, `${label}.frameCount`);

    if (screening.sampleFps !== 1) {
      throw new TypeError(`${label}.sampleFps must be 1 for the initial format`);
    }

    const start = asTimestamp(screening.startAt, `${label}.startAt`);
    const end = start + screening.frameCount * screening.slotSeconds * SECOND_MS;
    if (start < previousEnd) {
      throw new TypeError(`${label} overlaps the previous screening`);
    }
    previousEnd = end;
  });

  return screenings;
}

function publicScreening(screening) {
  const start = asTimestamp(screening.startAt, "screening.startAt");
  const end = start + screening.frameCount * screening.slotSeconds * SECOND_MS;
  return {
    id: screening.id,
    title: screening.title,
    filmSlug: screening.filmSlug,
    framePrefix: screening.framePrefix,
    startAt: new Date(start).toISOString(),
    endAt: new Date(end).toISOString(),
    slotSeconds: screening.slotSeconds,
    frameCount: screening.frameCount
  };
}

export function getBroadcastState(screenings, now = new Date()) {
  validateSchedule(screenings);
  const nowMs = asTimestamp(now, "now");

  for (let index = 0; index < screenings.length; index += 1) {
    const screening = screenings[index];
    const startMs = asTimestamp(screening.startAt, "screening.startAt");
    const slotMs = screening.slotSeconds * SECOND_MS;
    const endMs = startMs + screening.frameCount * slotMs;

    if (nowMs < startMs) {
      return {
        status: "intermission",
        now: new Date(nowMs).toISOString(),
        next: publicScreening(screening)
      };
    }

    if (nowMs >= endMs) {
      continue;
    }

    const frameIndex = Math.floor((nowMs - startMs) / slotMs);
    const slotStartMs = startMs + frameIndex * slotMs;
    const next = screenings[index + 1] ? publicScreening(screenings[index + 1]) : null;

    return {
      status: "screening",
      now: new Date(nowMs).toISOString(),
      screening: publicScreening(screening),
      frameIndex,
      frameNumber: frameIndex + 1,
      movieSecond: frameIndex,
      progress: (frameIndex + 1) / screening.frameCount,
      slotStartAt: new Date(slotStartMs).toISOString(),
      slotEndAt: new Date(slotStartMs + slotMs).toISOString(),
      next
    };
  }

  return {
    status: "ended",
    now: new Date(nowMs).toISOString(),
    next: null
  };
}

export function frameObjectKey(state, device, extension = "png") {
  if (state.status !== "screening") {
    throw new TypeError("a frame key requires an active screening");
  }
  const frame = String(state.frameIndex).padStart(6, "0");
  const screening = state.screening;
  return `${screening.framePrefix}/${device}/${frame}.${extension}`;
}
