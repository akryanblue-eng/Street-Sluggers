import { describe, expect, it } from 'vitest';
import { resolveTiming } from '../timing';

const CONTACT = 1100;

describe('resolveTiming', () => {
  it('treats a dead-center swing as a perfect barrel', () => {
    const r = resolveTiming(CONTACT, CONTACT);
    expect(r.swung).toBe(true);
    expect(r.contact).toBe(true);
    expect(r.errorMs).toBe(0);
    expect(r.quality).toBe(1);
    expect(r.band).toBe('perfect');
  });

  it('reports a take when the batter does not swing', () => {
    const r = resolveTiming(null, CONTACT);
    expect(r.swung).toBe(false);
    expect(r.contact).toBe(false);
    expect(r.band).toBe('take');
  });

  it('signs the error: early is negative, late is positive', () => {
    expect(resolveTiming(CONTACT - 100, CONTACT).errorMs).toBeLessThan(0);
    expect(resolveTiming(CONTACT + 100, CONTACT).errorMs).toBeGreaterThan(0);
  });

  it('whiffs when the swing falls outside the contact window', () => {
    const r = resolveTiming(CONTACT + 400, CONTACT);
    expect(r.swung).toBe(true);
    expect(r.contact).toBe(false);
    expect(r.band).toBe('miss');
    expect(r.quality).toBe(0);
  });

  it('grades good and weak contact by how far off the timing is', () => {
    expect(resolveTiming(CONTACT + 40, CONTACT).band).toBe('perfect');
    expect(resolveTiming(CONTACT + 100, CONTACT).band).toBe('good');
    expect(resolveTiming(CONTACT + 180, CONTACT).band).toBe('weak');
  });

  it('degrades quality monotonically as timing worsens', () => {
    const near = resolveTiming(CONTACT + 30, CONTACT).quality;
    const mid = resolveTiming(CONTACT + 90, CONTACT).quality;
    const far = resolveTiming(CONTACT + 170, CONTACT).quality;
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
  });
});
