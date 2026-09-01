export const screeningDrafts = [
  {
    enabled: false,
    id: "trip-to-the-moon-opening",
    title: "A Trip to the Moon",
    filmSlug: "a-trip-to-the-moon",
    framePrefix: "films/a-trip-to-the-moon",
    startAt: "2026-09-05T18:00:00.000Z",
    slotSeconds: 900,
    sampleFps: 1,
    frameCount: 709
  }
];

// A screening becomes public only after its frame set has been uploaded and
// its date has been explicitly approved.
export const schedule = screeningDrafts.filter((screening) => screening.enabled);

export const devices = {
  og: { width: 800, height: 480, extension: "png" },
  x: { width: 1872, height: 1404, extension: "png" }
};
