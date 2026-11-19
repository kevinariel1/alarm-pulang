import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import type { OperatorCode } from "../shared/types.js";
import {
  attachRelay,
  getConnectedClientsCount,
  getRelayUptimeSec,
} from "./relay.js";
import {
  getCatalog,
  getMultiModalRoute,
  getStationLiveBoard,
  transitUpstreamState,
} from "./services/transit.js";
import {
  fetchWeatherForPoint,
  weatherUpstreamState,
} from "./services/weather.js";
import { transJakartaService } from "./services/transjakarta.js";
import { getJakartaNow } from "./utils/time.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");
const distIndex = path.join(distDir, "index.html");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  const now = getJakartaNow();
  res.json({
    status: "ok",
    serverTimeWib: now.formattedTime,
    dayType: now.dayType,
    uptimeSec: getRelayUptimeSec(),
    connectedClients: getConnectedClientsCount(),
    upstream: {
      shiori: transitUpstreamState.shiori,
      openMeteo: weatherUpstreamState.openMeteo,
      bmkg: weatherUpstreamState.bmkg,
    },
  });
});

app.get("/api/stations", async (req, res) => {
  try {
    const catalog = await getCatalog();
    const opFilter =
      typeof req.query.operator === "string"
        ? (req.query.operator.toUpperCase() as OperatorCode)
        : null;
    const q =
      typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";

    let list = catalog.stations;
    if (opFilter && ["KCI", "MRTJ"].includes(opFilter)) {
      list = list.filter((s) => s.operator === opFilter);
    }
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.officialName.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q)
      );
    }

    res.json({
      count: list.length,
      lines: Array.from(catalog.lines.entries()).map(([key, info]) => ({
        key,
        ...info,
      })),
      stations: list,
    });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : "Failed to load stations",
    });
  }
});

app.get("/api/route", async (req, res) => {
  const from = typeof req.query.from === "string" ? req.query.from : "";
  const to = typeof req.query.to === "string" ? req.query.to : "";
  if (!from || !to) {
    res.status(400).json({ error: "Query parameters 'from' and 'to' are required" });
    return;
  }

  try {
    const route = await getMultiModalRoute(from, to);
    if (!route) {
      res.status(404).json({ error: "No route found between selected stations" });
      return;
    }
    res.json({ data: route });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : "Failed to compute route",
    });
  }
});

app.get("/api/tj/buses", async (_req, res) => {
  try {
    const buses = await transJakartaService.getRoute6DBuses();
    res.json({
      status: "ok",
      count: buses.length,
      route: "6D",
      data: buses,
    });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : "Failed to fetch TJ buses",
    });
  }
});

app.get("/api/weather", async (req, res) => {
  const lat = Number.parseFloat(String(req.query.lat ?? "-6.2088"));
  const lon = Number.parseFloat(String(req.query.lon ?? "106.8456"));
  const label =
    typeof req.query.label === "string" && req.query.label.trim()
      ? req.query.label.trim()
      : "Jakarta";

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    res.status(400).json({ error: "Invalid lat/lon coordinates" });
    return;
  }

  try {
    const report = await fetchWeatherForPoint(label, lat, lon);
    res.json({ data: report });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : "Failed to fetch weather",
    });
  }
});

app.get("/api/board/:operator/:code", async (req, res) => {
  const operator = req.params.operator.toUpperCase() as OperatorCode;
  const code = req.params.code;
  if (!["KCI", "MRTJ"].includes(operator)) {
    res.status(400).json({ error: "Operator must be KCI or MRTJ" });
    return;
  }

  try {
    const catalog = await getCatalog();
    const station = catalog.stationMap.get(`${operator}-${code}`);
    if (!station) {
      res.status(404).json({ error: `Station ${operator}-${code} not found` });
      return;
    }
    const board = await getStationLiveBoard(station, { limit: 6 });
    res.json({ data: board });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : "Failed to load station board",
    });
  }
});

if (fs.existsSync(distIndex)) {
  app.use(express.static(distDir));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(distIndex);
  });
}

const PORT = Number.parseInt(process.env.PORT ?? "3001", 10);
const server = http.createServer(app);
attachRelay(server);

server.listen(PORT, () => {
  console.log(`[JKT Commute Relay] listening on http://localhost:${PORT} (WS /ws)`);
  // Warm up station catalog in background
  void getCatalog().catch((err) => {
    console.warn("[JKT Commute Relay] background catalog warmup failed:", err);
  });
});
