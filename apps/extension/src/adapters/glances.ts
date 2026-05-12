import type { MetricSnapshot } from './types';

interface GlancesAll {
  cpu: { total: number };
  mem: { total: number; used: number };
  gpu?: Array<{ proc?: number | null }>;
  network?: Array<{
    bytes_sent_rate_per_sec: number;
    bytes_recv_rate_per_sec: number;
  }>;
  fs?: Array<{ percent: number }>;
}

export async function fetchGlances(baseUrl: string): Promise<MetricSnapshot> {
  const base = baseUrl.replace(/\/$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);

  try {
    const res = await fetch(`${base}/api/4/all`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Glances ${res.status}`);

    const data = (await res.json()) as GlancesAll;
    const snap: MetricSnapshot = { ts: Date.now() };

    snap.cpu = Math.round(data.cpu.total);
    snap.ram = Math.round((data.mem.used / data.mem.total) * 100);

    const gpuProc = data.gpu?.[0]?.proc;
    if (gpuProc != null) snap.gpu = Math.round(gpuProc);

    if (data.network?.length) {
      snap.network = {
        up: data.network.reduce((s, n) => s + n.bytes_sent_rate_per_sec, 0),
        down: data.network.reduce((s, n) => s + n.bytes_recv_rate_per_sec, 0),
      };
    }

    if (data.fs?.[0]) snap.disk = Math.round(data.fs[0].percent);

    return snap;
  } finally {
    clearTimeout(timer);
  }
}
