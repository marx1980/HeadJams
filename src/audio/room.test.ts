import { describe, expect, it } from 'vitest';
import { addRoom, roomImpulse } from './room';
import { renderProject } from './render';
import { createChannel, createProject, setLoopBars } from '../model/project';
import { normalizeProject } from '../model/storage';

describe('room', () => {
  it('has a deterministic, unit-energy stereo response that differs left and right', () => {
    const [left, right] = roomImpulse(8000);
    expect(roomImpulse(8000)[0]).toBe(left);
    const energy = [...left, ...right].reduce((sum, value) => sum + value * value, 0);
    expect(energy).toBeCloseTo(2, 5);
    expect(left.some((value, i) => Math.abs(value - right[i]) > 1e-3)).toBe(true);
  });

  it('convolves exactly like direct convolution', () => {
    const sr = 4000;
    const [irLeft, irRight] = roomImpulse(sr);
    const send = new Float32Array(20000);
    for (let i = 0; i < send.length; i += 997) send[i] = 1 - (i % 3) * 0.3;
    const left = new Float32Array(send.length + irLeft.length);
    const right = new Float32Array(send.length + irLeft.length);
    addRoom(send, left, right, sr);
    for (const at of [1500, 9000, 19999, 21000]) {
      let l = 0;
      let r = 0;
      for (let k = 0; k < irLeft.length; k++) {
        if (at - k >= 0 && at - k < send.length) { l += send[at - k] * irLeft[k]; r += send[at - k] * irRight[k]; }
      }
      expect(left[at]).toBeCloseTo(l, 4);
      expect(right[at]).toBeCloseTo(r, 4);
    }
  });

  it('adds a tail only to tracks with a Room, and is saved with the project', () => {
    let p = setLoopBars(createProject(), 1);
    const notes = [{ id: 'a', step: 0, pitch: 60, durationSteps: 2 }];
    p = { ...p, channels: [{ ...createChannel('l', 'Lead', 'lead-2', 16), notes }] };
    const dry = renderProject(p, 8000);
    const wet = renderProject({ ...p, channels: [{ ...p.channels[0], room: 0.8 }] }, 8000);
    expect(wet.left.length).toBeGreaterThan(dry.left.length);
    const tailEnergy = (out: Float32Array, from: number) => out.subarray(from).reduce((sum, value) => sum + value * value, 0);
    const end = Math.round(0.6 * 8000);
    expect(tailEnergy(wet.left, end)).toBeGreaterThan(tailEnergy(dry.left, end) * 2);
    const saved = normalizeProject(JSON.stringify({ ...p, channels: [{ ...p.channels[0], room: 3 }] }))!;
    expect(saved.channels[0].room).toBe(1);
  });
});
