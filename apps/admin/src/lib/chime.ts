let ctx: AudioContext | null = null;

function getContext() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/** Browsers keep a fresh AudioContext suspended until a user gesture unlocks it — call once on first click/keydown. */
export function unlockAudio() {
  getContext();
}

function tone(freq: number, startAt: number, duration: number, gain: number) {
  const audioCtx = getContext();
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, startAt);
  g.gain.linearRampToValueAtTime(gain, startAt + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(g);
  g.connect(audioCtx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration);
}

/** Ascending two-note chime — new order. */
export function playOrderChime() {
  const audioCtx = getContext();
  const now = audioCtx.currentTime;
  tone(587.33, now, 0.18, 0.18); // D5
  tone(880, now + 0.12, 0.22, 0.18); // A5
}

/** Two quick identical blips — new support message. */
export function playChatChime() {
  const audioCtx = getContext();
  const now = audioCtx.currentTime;
  tone(740, now, 0.1, 0.15); // F#5
  tone(740, now + 0.14, 0.1, 0.15);
}
