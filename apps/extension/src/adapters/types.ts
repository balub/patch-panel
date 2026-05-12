export interface MetricSnapshot {
  ts: number;
  cpu?: number;     // 0–100
  ram?: number;     // 0–100
  gpu?: number;     // 0–100
  network?: { up: number; down: number };  // bytes/s
  disk?: number;    // 0–100 (first filesystem)
}
