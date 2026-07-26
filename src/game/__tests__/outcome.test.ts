import { describe, expect, it } from 'vitest';
import { basesFor, classifyBattedBall } from '../outcome';
import type { Trajectory } from '../types';

const traj = (over: Partial<Trajectory>): Trajectory => ({
  points: [],
  landing: { x: 0, y: 0, z: 0 },
  distance: 0,
  hangTime: 1,
  clearedWall: false,
  foul: false,
  ...over,
});

describe('classifyBattedBall', () => {
  it('a ball over the wall is a home run', () => {
    expect(classifyBattedBall(traj({ clearedWall: true, distance: 360 }))).toBe('home_run');
  });

  it('a foul ball is foul, even when hit deep', () => {
    expect(classifyBattedBall(traj({ foul: true, distance: 340 }))).toBe('foul');
  });

  it('buckets fair balls by distance', () => {
    expect(classifyBattedBall(traj({ distance: 40 }))).toBe('out');
    expect(classifyBattedBall(traj({ distance: 150 }))).toBe('single');
    expect(classifyBattedBall(traj({ distance: 240 }))).toBe('double');
    expect(classifyBattedBall(traj({ distance: 300 }))).toBe('triple');
  });

  it('a deep ball off the wall stretches to a triple', () => {
    expect(classifyBattedBall(traj({ distance: 335, clearedWall: false }))).toBe('triple');
  });
});

describe('basesFor', () => {
  it('maps hit types to base counts', () => {
    expect(basesFor('single')).toBe(1);
    expect(basesFor('double')).toBe(2);
    expect(basesFor('triple')).toBe(3);
    expect(basesFor('home_run')).toBe(4);
    expect(basesFor('out')).toBe(0);
    expect(basesFor('strike')).toBe(0);
  });
});
