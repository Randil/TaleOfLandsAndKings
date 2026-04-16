import { useState, useRef, useEffect, useMemo } from "react";
import { generateWorld } from "../game/mapGen";
import { useWorldStore } from "../store/worldStore";
import { useUiStore } from "../store/uiStore";
import type { World, MapGenAlgorithm } from "../types/world";

const ALGORITHMS: { value: MapGenAlgorithm; label: string }[] = [
  { value: "landmass-growth", label: "Landmass Growth" },
  { value: "landmass-growth-v3", label: "Landmass Growth v3" },
];

type RiverSize = "Small" | "Large" | "Very Large";
const RIVER_SIZE_RANK: Record<RiverSize, number> = { Small: 1, Large: 2, "Very Large": 3 };

function isValidWorld(obj: unknown): obj is World {
  if (typeof obj !== "object" || obj === null) return false;
  const w = obj as Record<string, unknown>;
  if (typeof w.config !== "object" || w.config === null) return false;
  const c = w.config as Record<string, unknown>;
  return (
    typeof c.seed === "number" &&
    typeof c.width === "number" &&
    typeof c.height === "number" &&
    typeof c.mapGenAlgorithm === "string" &&
    typeof w.hexes === "object" &&
    typeof w.regions === "object" &&
    Array.isArray((w as Record<string, unknown>).rivers)
  );
}

export function WorldGenPanel() {
  const { world, phase, logEntries, setWorld, clearWorld, appendLog, clearLog } =
    useWorldStore();
  const hoveredHexKey = useUiStore((s) => s.hoveredHexKey);

  const [seed, setSeed] = useState(() => String(Math.floor(Math.random() * 999999)));
  const [width, setWidth] = useState("80");
  const [height, setHeight] = useState("50");
  const [algorithm, setAlgorithm] = useState<MapGenAlgorithm>("landmass-growth-v3");
  const [landPct, setLandPct] = useState("60");
  const [mountainDensityPct, setMountainDensityPct] = useState("10");
  const [minLandmassForRiver, setMinLandmassForRiver] = useState("5");
  const [hexesPerRiver, setHexesPerRiver] = useState("30");
  const [loadError, setLoadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const genStartRef = useRef<number>(0);

  // Auto-scroll log to bottom on new entries
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logEntries]);

  // Build hex → max river size map whenever world changes
  const hexRiverSizes = useMemo(() => {
    const map = new Map<string, RiverSize>();
    if (!world) return map;
    for (const river of world.rivers) {
      for (let ci = 0; ci < river.corners.length; ci++) {
        const size: RiverSize =
          river.veryLargeFromIndex !== undefined && ci >= river.veryLargeFromIndex
            ? "Very Large"
            : river.largeFromIndex !== undefined && ci >= river.largeFromIndex
              ? "Large"
              : "Small";
        for (const hk of river.corners[ci].split("|")) {
          const existing = map.get(hk);
          if (!existing || RIVER_SIZE_RANK[size] > RIVER_SIZE_RANK[existing]) {
            map.set(hk, size);
          }
        }
      }
    }
    return map;
  }, [world]);

  function handleGenerate() {
    const resolvedSeed = Math.max(0, parseInt(seed, 10) || 0);
    const resolvedWidth = Math.min(500, Math.max(10, parseInt(width, 10) || 10));
    const resolvedHeight = Math.min(500, Math.max(10, parseInt(height, 10) || 10));
    const resolvedLandPct = Math.min(90, Math.max(1, parseInt(landPct, 10) || 1));
    const resolvedMountainDensity =
      Math.min(100, Math.max(0, parseInt(mountainDensityPct, 10) || 0)) / 100;
    const resolvedMinLandmass = Math.max(1, parseInt(minLandmassForRiver, 10) || 1);
    const resolvedHexesPerRiver = Math.max(1, parseInt(hexesPerRiver, 10) || 1);

    clearLog();
    genStartRef.current = Date.now();

    const onLog = (msg: string) => {
      const elapsed = ((Date.now() - genStartRef.current) / 1000).toFixed(1);
      appendLog(`[${elapsed}s] ${msg}`);
    };

    const w = generateWorld(
      {
        seed: resolvedSeed,
        width: resolvedWidth,
        height: resolvedHeight,
        mapGenAlgorithm: algorithm,
        minLandFraction: resolvedLandPct / 100,
        mountainDensity: resolvedMountainDensity,
        minLandmassForRiver: resolvedMinLandmass,
        hexesPerRiver: resolvedHexesPerRiver,
      },
      onLog,
    );
    setWorld(w);
    setLoadError(null);
  }

  function handleSave() {
    if (!world) return;
    const json = JSON.stringify(world, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `world-${world.config.seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleLoadClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (!isValidWorld(parsed)) {
          setLoadError("Invalid world file: missing required fields.");
          return;
        }
        clearLog();
        appendLog(`[0.0s] Loaded world — seed ${parsed.config.seed}, ${parsed.config.width}×${parsed.config.height}`);
        appendLog(`[0.0s] Done — ${Object.keys(parsed.hexes).length.toLocaleString()} hexes, ${parsed.rivers.length} rivers`);
        setWorld(parsed);
        setLoadError(null);
        setSeed(String(parsed.config.seed));
        setWidth(String(parsed.config.width));
        setHeight(String(parsed.config.height));
        setAlgorithm(parsed.config.mapGenAlgorithm);
        setLandPct(String(Math.round(parsed.config.minLandFraction * 100)));
        setMountainDensityPct(
          String(Math.round((parsed.config.mountainDensity ?? 0.2) * 100)),
        );
        setMinLandmassForRiver(String(parsed.config.minLandmassForRiver));
        setHexesPerRiver(String(parsed.config.hexesPerRiver));
      } catch {
        setLoadError("Failed to parse file. Make sure it is a valid JSON world file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // Hex inspector data
  const hoveredHex = world && hoveredHexKey ? world.hexes[hoveredHexKey] : null;
  const hoveredRegion =
    hoveredHex && world ? world.regions[hoveredHex.regionId] : null;
  const hoveredRiverSize = hoveredHexKey ? (hexRiverSizes.get(hoveredHexKey) ?? null) : null;

  const logSection = (
    <div className="panel-section">
      <div className="panel-section-title">Generation Log</div>
      <div className="gen-log" ref={logRef}>
        {logEntries.length === 0 ? (
          <span className="gen-log__empty">No log entries yet.</span>
        ) : (
          logEntries.map((entry, i) => (
            <div key={i} className="gen-log__entry">
              {entry}
            </div>
          ))
        )}
      </div>
    </div>
  );

  if (phase === "generation") {
    return (
      <aside className="world-gen-panel">
        <h2>World Generator</h2>

        <label>
          Seed
          <input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} />
        </label>

        <label>
          Width (hexes)
          <input type="number" value={width} onChange={(e) => setWidth(e.target.value)} />
        </label>

        <label>
          Height (hexes)
          <input
            type="number"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
        </label>

        <label>
          Algorithm
          <select
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value as MapGenAlgorithm)}
          >
            {ALGORITHMS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Land coverage (%)
          <input
            type="number"
            value={landPct}
            onChange={(e) => setLandPct(e.target.value)}
          />
        </label>

        <label>
          Mountain density (% of land)
          <input
            type="number"
            value={mountainDensityPct}
            onChange={(e) => setMountainDensityPct(e.target.value)}
          />
        </label>

        <label>
          Min landmass size for rivers
          <input
            type="number"
            value={minLandmassForRiver}
            onChange={(e) => setMinLandmassForRiver(e.target.value)}
          />
        </label>

        <label>
          Hexes per river
          <input
            type="number"
            value={hexesPerRiver}
            onChange={(e) => setHexesPerRiver(e.target.value)}
          />
        </label>

        <button onClick={handleGenerate}>Generate</button>

        <button onClick={handleLoadClick}>Load from File</button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {loadError && <p className="error">{loadError}</p>}

        {logSection}
      </aside>
    );
  }

  // Phase: playing
  return (
    <aside className="world-gen-panel">
      <h2>World Map</h2>

      <button className="btn-return" onClick={() => { clearWorld(); setLoadError(null); }}>
        ← Return to Map Generation
      </button>

      <button onClick={handleSave} disabled={!world}>
        Save to File
      </button>

      {logSection}

      <div className="panel-section">
        <div className="panel-section-title">Hex Inspector</div>
        {hoveredHex ? (
          <div className="hex-inspector">
            <div className="hex-inspector__row">
              <span className="hex-inspector__label">ID</span>
              <span className="hex-inspector__value">{hoveredHexKey}</span>
            </div>
            <div className="hex-inspector__row">
              <span className="hex-inspector__label">Terrain</span>
              <span className="hex-inspector__value">{hoveredHex.terrain}</span>
            </div>
            <div className="hex-inspector__row">
              <span className="hex-inspector__label">Region</span>
              <span className="hex-inspector__value">
                {hoveredRegion?.name ?? "—"}
              </span>
            </div>
            <div className="hex-inspector__row">
              <span className="hex-inspector__label">River</span>
              <span className="hex-inspector__value">
                {hoveredRiverSize ?? "None"}
              </span>
            </div>
          </div>
        ) : (
          <p className="hex-inspector__placeholder">Hover a hex to inspect</p>
        )}
      </div>
    </aside>
  );
}
