/**
 * Stride-cycle measurement, lifted from the chess fork's pieces.ts.
 *
 * Generated / sourced walk clips often pack several gait cycles into one file.
 * Retiming against total duration makes legs blur; retiming against the measured
 * cycle keeps the footfalls locked to travel speed.
 */

import * as THREE from "three";

const GAIT_PERIODS = new WeakMap<THREE.AnimationClip, number>();
const LEG_BONES = [/upleg/i, /thigh/i, /(^|[^a-z])leg/i, /foot/i];

/** Length of one stride cycle (two footfalls) inside a locomotion clip, seconds. */
export function gaitCycle(clip: THREE.AnimationClip): number {
  const cached = GAIT_PERIODS.get(clip);
  if (cached !== undefined) return cached;
  const period = measureGaitCycle(clip);
  GAIT_PERIODS.set(clip, period);
  return period;
}

function measureGaitCycle(clip: THREE.AnimationClip): number {
  const track = findLegTrack(clip);
  if (!track || track.times.length < 12) return clip.duration;

  const frames = track.times.length;
  const signal = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    let dot = 0;
    for (let c = 0; c < 4; c += 1) dot += track.values[i * 4 + c] * track.values[c];
    signal[i] = 2 * Math.acos(Math.min(1, Math.abs(dot)));
  }

  let mean = 0;
  for (const value of signal) mean += value;
  mean /= frames;
  let energy = 0;
  for (let i = 0; i < frames; i += 1) {
    signal[i] -= mean;
    energy += signal[i] * signal[i];
  }
  if (energy < 1e-6) return clip.duration;

  const limit = Math.floor(frames * 0.8);
  const correlation = new Float32Array(limit);
  for (let lag = 0; lag < limit; lag += 1) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i + lag < frames; i += 1) {
      sum += signal[i] * signal[i + lag];
      count += 1;
    }
    correlation[lag] = sum / count / (energy / frames);
  }
  let lag = 1;
  while (lag < limit && correlation[lag] > 0.1) lag += 1;
  let period = 0;
  for (; lag < limit - 1; lag += 1) {
    if (correlation[lag] > correlation[lag - 1] && correlation[lag] >= correlation[lag + 1]) {
      if (correlation[lag] > 0.55) period = lag;
      break;
    }
  }
  if (period <= 0) return clip.duration;

  const step = (track.times[frames - 1] - track.times[0]) / (frames - 1);
  const seconds = period * step;
  if (seconds < 0.3 || seconds > clip.duration * 0.8) return clip.duration;
  return seconds;
}

function findLegTrack(clip: THREE.AnimationClip): THREE.QuaternionKeyframeTrack | null {
  for (const pattern of LEG_BONES) {
    for (const track of clip.tracks) {
      if (!track.name.endsWith(".quaternion")) continue;
      if (track.values.length / 4 !== track.times.length) continue;
      if (pattern.test(track.name)) return track as THREE.QuaternionKeyframeTrack;
    }
  }
  return null;
}
