type ReleaseFn = () => void;

const rawMax = Number.parseInt(process.env.TRANSCRIBE_MAX_CONCURRENCY || "1", 10);
const MAX_CONCURRENCY = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 1;

let active = 0;
const waiters: Array<(release: ReleaseFn) => void> = [];

function makeRelease(): ReleaseFn {
  let released = false;
  return () => {
    if (released) return;
    released = true;

    active = Math.max(0, active - 1);
    const next = waiters.shift();
    if (!next) return;

    active += 1;
    next(makeRelease());
  };
}

export function getTranscribeLoad() {
  return {
    active,
    queued: waiters.length,
    max: MAX_CONCURRENCY,
  };
}

export function acquireTranscribeSlot(
  onQueued?: (queuePosition: number) => void
): Promise<ReleaseFn> {
  if (active < MAX_CONCURRENCY) {
    active += 1;
    return Promise.resolve(makeRelease());
  }

  const position = waiters.length + 1;
  onQueued?.(position);

  return new Promise<ReleaseFn>((resolve) => {
    waiters.push(resolve);
  });
}

