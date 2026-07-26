import { describe, expect, it } from 'vitest';
import { LAUNCH } from '../constants';
import { computeLaunch } from '../launch';
import { resolveTiming } from '../timing';

const CONTACT = 1100;
const perfect = resolveTiming(CONTACT, CONTACT);

describe('computeLaunch', () => {
  it('sends a perfect barrel out at max exit velocity, dead center', () => {
    const l = computeLaunch(perfect, 'contact');
    expect(l.exitVelocity).toBeCloseTo(LAUNCH.maxExitVelocity, 5);
    expect(l.launchAngleDeg).toBeCloseTo(LAUNCH.idealLaunchAngleDeg, 5);
    expect(l.sprayAngleDeg).toBeCloseTo(0, 5);
  });

  it('adds exit velocity on a power swing', () => {
    const contact = computeLaunch(perfect, 'contact');
    const power = computeLaunch(perfect, 'power');
    expect(power.exitVelocity).toBeGreaterThan(contact.exitVelocity);
  });

  it('lifts and pulls the ball when the batter is early', () => {
    const early = computeLaunch(resolveTiming(CONTACT - 120, CONTACT), 'contact');
    expect(early.launchAngleDeg).toBeGreaterThan(LAUNCH.idealLaunchAngleDeg);
    expect(early.sprayAngleDeg).toBeLessThan(0); // pulled to left field
  });

  it('flattens and pushes the ball when the batter is late', () => {
    const late = computeLaunch(resolveTiming(CONTACT + 120, CONTACT), 'contact');
    expect(late.launchAngleDeg).toBeLessThan(LAUNCH.idealLaunchAngleDeg);
    expect(late.sprayAngleDeg).toBeGreaterThan(0); // pushed to right field
  });

  it('is deterministic with zero wobble', () => {
    const a = computeLaunch(perfect, 'power');
    const b = computeLaunch(perfect, 'power');
    expect(a).toEqual(b);
  });
});
