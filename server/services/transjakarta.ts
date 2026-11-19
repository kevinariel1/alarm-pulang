import { randomUUID } from "node:crypto";

const BASE_URL = "https://tijeapi.transjakarta.co.id";

export interface TJBusPosition {
  busNo: string;
  routeCode: string;
  routeName: string;
  type: string;
  latitude: number;
  longitude: number;
  speed: number;
  bearing: number;
  nextStop: string | null;
  etaNextStop: string | number | null;
  timestamp: string;
}

class TJService {
  private deviceId: string = randomUUID();
  private token: string | null = null;
  private tokenExpiry: number = 0;
  private cachedBuses: TJBusPosition[] = [];
  private lastFetchTime: number = 0;

  private async ensureAuth(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiry - 60000) {
      return this.token;
    }

    try {
      const res = await fetch(`${BASE_URL}/v1/auth/login/guest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "okhttp/4.12.0",
          "X-App-OS": "android",
          "X-App-Version": "2.10.2",
          "X-Device-ID": this.deviceId,
        },
        body: JSON.stringify({ device_id: this.deviceId }),
      });

      if (!res.ok) {
        throw new Error(`TJ Login failed with status ${res.status}`);
      }

      const json = (await res.json()) as { token?: string; data?: { token?: string } };
      this.token = json.token || json.data?.token || null;
      if (!this.token) throw new Error("No token returned by TJ API");
      this.tokenExpiry = Date.now() + 3600000; // 1 hour
      return this.token;
    } catch (err) {
      console.error("[TJ Service] Auth error:", err);
      throw err;
    }
  }

  public async fetchBusesNear(lat: number, lon: number, radiusKm: number = 2.0): Promise<TJBusPosition[]> {
    const token = await this.ensureAuth();
    const url = new URL(`${BASE_URL}/v1/bus`);
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lon));
    url.searchParams.set("radius", String(radiusKm));

    const res = await fetch(url.toString(), {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "okhttp/4.12.0",
        "X-App-OS": "android",
        "X-App-Version": "2.10.2",
        "X-Device-ID": this.deviceId,
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      console.warn(`[TJ Service] Fetch bus returned ${res.status}`);
      return [];
    }

    const json = (await res.json()) as { data?: any[] };
    const rawList = json.data || [];

    return rawList.map((b) => ({
      busNo: b.bus_body_no || "Unknown",
      routeCode: String(b.route_code || "").trim(),
      routeName: b.route_name || "",
      type: b.type || "BRT",
      latitude: Number(b.latitude),
      longitude: Number(b.longitude),
      speed: Number(b.speed || 0),
      bearing: Number(b.bearing || 0),
      nextStop: b.next_stops || null,
      etaNextStop: b.estimated_time_next_stops || null,
      timestamp: b.timestamp || new Date().toISOString(),
    }));
  }

  public async getRoute6DBuses(): Promise<TJBusPosition[]> {
    // Cache bus for 6 seconds to avoid hammering upstream
    if (Date.now() - this.lastFetchTime < 6000 && this.cachedBuses.length > 0) {
      return this.cachedBuses;
    }

    try {
      // Fetch near Tebet and near Sahid
      const [busesTebet, busesSahid] = await Promise.all([
        this.fetchBusesNear(-6.2263, 106.8582, 2.5),
        this.fetchBusesNear(-6.2088, 106.8225, 2.5),
      ]);

      const busMap = new Map<string, TJBusPosition>();
      for (const b of [...busesTebet, ...busesSahid]) {
        if (b.routeCode.toUpperCase().includes("6D")) {
          busMap.set(b.busNo, b);
        }
      }

      this.cachedBuses = Array.from(busMap.values());
      this.lastFetchTime = Date.now();
      return this.cachedBuses;
    } catch (err) {
      console.error("[TJ Service] Error fetching 6D buses:", err);
      return this.cachedBuses;
    }
  }
}

export const transJakartaService = new TJService();
