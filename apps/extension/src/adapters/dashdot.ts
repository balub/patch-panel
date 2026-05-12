import type { MetricSnapshot } from './types';

export async function fetchDashdot(baseUrl: string): Promise<MetricSnapshot> {
  const base = baseUrl.replace(/\/$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);

  try {
    const get = (path: string) =>
      fetch(`${base}${path}`, { signal: ctrl.signal });

    const [infoRes, cpuRes, ramRes, gpuRes, netRes, storageRes] =
      await Promise.all([
        get('/info'),
        get('/load/cpu'),
        get('/load/ram'),
        get('/load/gpu').catch(() => null),
        get('/load/network').catch(() => null),
        get('/load/storage').catch(() => null),
      ]);

    const snap: MetricSnapshot = { ts: Date.now() };

    const infoText = infoRes.ok ? await infoRes.text() : '';
    const info = infoText
      ? (JSON.parse(infoText) as {
          ram: { size: number };
          storage: Array<{ size: number }>;
        })
      : null;

    // CPU: array of { load, temp } per core → average
    const cpuText = cpuRes.ok ? await cpuRes.text() : '';
    if (cpuText) {
      const cores = JSON.parse(cpuText) as Array<{ load: number }>;
      if (cores.length > 0) {
        snap.cpu = Math.round(
          cores.reduce((s, c) => s + c.load, 0) / cores.length,
        );
      }
    }

    // RAM: { load: bytesUsed } — percentage needs info.ram.size
    const ramText = ramRes.ok ? await ramRes.text() : '';
    if (ramText && info) {
      const parsed = JSON.parse(ramText) as Record<string, unknown>;
      if (Object.keys(parsed).length > 0) {
        const { load } = parsed as { load: number };
        snap.ram = Math.round((load / info.ram.size) * 100);
      }
    }

    // GPU: { layout: [{ load?, memory? }] } → first GPU load
    if (gpuRes?.ok) {
      const gpuText = await gpuRes.text();
      if (gpuText) {
        const { layout } = JSON.parse(gpuText) as {
          layout: Array<{ load?: number }>;
        };
        if (layout[0]?.load !== undefined) {
          snap.gpu = Math.round(layout[0].load);
        }
      }
    }

    // Network: { up, down } bytes/s
    if (netRes?.ok) {
      const netText = await netRes.text();
      if (netText) {
        snap.network = JSON.parse(netText) as { up: number; down: number };
      }
    }

    // Storage: number[] of bytes used per filesystem → first entry as %
    if (storageRes?.ok && info?.storage?.[0]) {
      const storageText = await storageRes.text();
      if (storageText) {
        const loads = JSON.parse(storageText) as number[];
        const used = loads[0];
        if (used !== undefined && used !== -1) {
          snap.disk = Math.round((used / info.storage[0].size) * 100);
        }
      }
    }

    return snap;
  } finally {
    clearTimeout(timer);
  }
}
