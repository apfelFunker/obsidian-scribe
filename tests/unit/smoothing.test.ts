import { resamplePoints, simplifyPoints, smoothPoints, smoothStroke } from '@/sketch/smoothing';

function rounded(points: ReadonlyArray<{ x: number; y: number }>): number[][] {
  return points.map(({ x, y }) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
}

describe('stroke smoothing', () => {
  it('places points at even distances along the path and keeps both ends', () => {
    expect(rounded(resamplePoints([{ x: 0, y: 0 }, { x: 10, y: 0 }], 2.5))).toEqual([[0, 0], [2.5, 0], [5, 0], [7.5, 0], [10, 0]]);
    expect(rounded(resamplePoints([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }], 3.5))).toEqual([[0, 0], [3, 0.5], [3, 4]]);
  });

  it('irons out jitter without moving the ends of the stroke', () => {
    const jittery = Array.from({ length: 41 }, (_, index) => ({
      x: index,
      y: index === 0 || index === 40 ? 0 : index % 2 === 0 ? 1 : -1,
    }));

    const smoothed = smoothPoints(resamplePoints(jittery, 1), 5);

    expect(smoothed[0]).toEqual({ x: 0, y: 0 });
    expect(smoothed[smoothed.length - 1]).toEqual({ x: 40, y: 0 });
    const middle = smoothed.filter((point) => point.x >= 10 && point.x <= 30);
    expect(middle.length).toBeGreaterThan(10);
    expect(Math.max(...middle.map((point) => Math.abs(point.y)))).toBeLessThan(0.35);
  });

  it('rounds a sharp corner without swinging past it', () => {
    const smoothed = smoothStroke([{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 40, y: 40 }], 1, 5);

    expect(smoothed[0]).toEqual({ x: 0, y: 0 });
    expect(smoothed[smoothed.length - 1]).toEqual({ x: 40, y: 40 });
    for (const point of smoothed) {
      expect(point.x).toBeGreaterThanOrEqual(-1e-9);
      expect(point.y).toBeLessThanOrEqual(40 + 1e-9);
    }
    expect(smoothed.some((point) => Math.hypot(point.x, point.y - 40) < 0.5)).toBe(false);
  });

  it('drops points that barely leave the line between their neighbours and keeps corners', () => {
    const jittery = [{ x: 0, y: 0 }, { x: 10, y: 0.2 }, { x: 20, y: -0.3 }, { x: 30, y: 0.1 }, { x: 40, y: 0 }];
    const corner = [{ x: 0, y: 0 }, { x: 20, y: 0.3 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 40.2, y: 40 }];

    expect(simplifyPoints(jittery, 0.5)).toEqual([{ x: 0, y: 0 }, { x: 40, y: 0 }]);
    expect(simplifyPoints(corner, 0.5)).toEqual([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40.2, y: 40 }]);
    expect(simplifyPoints([{ x: 1, y: 1 }], 0.5)).toEqual([{ x: 1, y: 1 }]);
  });
});
