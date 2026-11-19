interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  updatedAt: number;
}

export class TtlCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private inFlight = new Map<string, Promise<T>>();

  constructor(private readonly defaultTtlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) return undefined;
    return entry.value;
  }

  getStale(key: string): { value: T; updatedAt: number; isExpired: boolean } | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    return {
      value: entry.value,
      updatedAt: entry.updatedAt,
      isExpired: Date.now() > entry.expiresAt,
    };
  }

  set(key: string, value: T, ttlMs: number = this.defaultTtlMs): T {
    const now = Date.now();
    this.store.set(key, {
      value,
      updatedAt: now,
      expiresAt: now + ttlMs,
    });
    return value;
  }

  async getOrLoad(
    key: string,
    loader: () => Promise<T>,
    ttlMs: number = this.defaultTtlMs
  ): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const promise = loader()
      .then((val) => {
        this.set(key, val, ttlMs);
        return val;
      })
      .catch((err) => {
        // Serve stale value if upstream temporarily fails
        const stale = this.store.get(key);
        if (stale) return stale.value;
        throw err;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  hasAnyExpired(): boolean {
    const now = Date.now();
    for (const entry of this.store.values()) {
      if (now > entry.expiresAt) return true;
    }
    return false;
  }
}

export async function fetchJsonWithTimeout<T>(
  url: string,
  timeoutMs: number = 8000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
