import { useState, useRef } from "react";
import { generateWorld } from "../game/mapGen";
import { useWorldStore } from "../store/worldStore";
import type { World, MapGenAlgorithm } from "../types/world";

const ALGORITHMS: { value: MapGenAlgorithm; label: string }[] = [
  { value: "landmass-growth", label: "Landmass Growth" },
  { value: "landmass-growth-v3", label: "Landmass Growth v3" },
];

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
  const { world, setWorld } = useWorldStore();
  const [seed, setSeed] = useState(() =>
    String(Math.floor(Math.random() * 999999)),
  );
  const [width, setWidth] = useState("80");
  const [height, setHeight] = useState("50");
  const [algorithm, setAlgorithm] =
    useState<MapGenAlgorithm>("landmass-growth-v3");

  // Algorithm-specific params (shared by both v1 and v2 for now)
  const [landPct, setLandPct] = useState("35");
  const [minLandmassForRiver, setMinLandmassForRiver] = useState("5");
  const [hexesPerRiver, setHexesPerRiver] = useState("30");

  const [loadError, setLoadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleGenerate() {
    const resolvedSeed = Math.max(0, parseInt(seed, 10) || 0);
    const resolvedWidth = Math.min(500, Math.max(10, parseInt(width, 10) || 10));
    const resolvedHeight = Math.min(
      500,
      Math.max(10, parseInt(height, 10) || 10),
    );
    const resolvedLandPct = Math.min(90, Math.max(1, parseInt(landPct, 10) || 1));
    const resolvedMinLandmass = Math.max(
      1,
      parseInt(minLandmassForRiver, 10) || 1,
    );
    const resolvedHexesPerRiver = Math.max(
      1,
      parseInt(hexesPerRiver, 10) || 1,
    );

    const w = generateWorld({
      seed: resolvedSeed,
      width: resolvedWidth,
      height: resolvedHeight,
      mapGenAlgorithm: algorithm,
      minLandFraction: resolvedLandPct / 100,
      minLandmassForRiver: resolvedMinLandmass,
      hexesPerRiver: resolvedHexesPerRiver,
    });
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
        setWorld(parsed);
        setLoadError(null);
        setSeed(String(parsed.config.seed));
        setWidth(String(parsed.config.width));
        setHeight(String(parsed.config.height));
        setAlgorithm(parsed.config.mapGenAlgorithm);
        setLandPct(String(Math.round(parsed.config.minLandFraction * 100)));
        setMinLandmassForRiver(String(parsed.config.minLandmassForRiver));
        setHexesPerRiver(String(parsed.config.hexesPerRiver));
      } catch {
        setLoadError(
          "Failed to parse file. Make sure it is a valid JSON world file.",
        );
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const hexCount = world ? Object.keys(world.hexes).length : 0;
  const riverCount = world ? (world.rivers?.length ?? 0) : 0;

  return (
    <aside className="world-gen-panel">
      <h2>World Generator</h2>

      <label>
        Seed
        <input
          type="number"
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
        />
      </label>

      <label>
        Width (hexes)
        <input
          type="number"
          value={width}
          onChange={(e) => setWidth(e.target.value)}
        />
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

      {/* Algorithm-specific parameters */}
      <label>
        Land coverage (%)
        <input
          type="number"
          value={landPct}
          onChange={(e) => setLandPct(e.target.value)}
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

      <hr />

      <button onClick={handleSave} disabled={!world}>
        Save to File
      </button>
      <button onClick={handleLoadClick}>Load from File</button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {loadError && <p className="error">{loadError}</p>}

      {world && (
        <div className="world-stats">
          <p>Seed: {world.config.seed}</p>
          <p>
            Size: {world.config.width} × {world.config.height}
          </p>
          <p>Hexes: {hexCount.toLocaleString()}</p>
          <p>Rivers: {riverCount}</p>
        </div>
      )}
    </aside>
  );
}
