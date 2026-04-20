import { useState, useRef, useEffect } from "react";
import { generateWorld } from "../game/mapGen";
import { useWorldStore } from "../store/worldStore";
import { useUiStore } from "../store/uiStore";
import type { MapMode } from "../store/uiStore";
import type { World, MapGenAlgorithm, RegionGenAlgorithm, City } from "../types/world";
import { RESOURCE_BY_ID } from "../game/resources";

const ALGORITHMS: { value: MapGenAlgorithm; label: string }[] = [
  { value: "landmass-growth", label: "Landmass Growth" },
  { value: "landmass-growth-v3", label: "Landmass Growth v3" },
];

const REGION_ALGORITHMS: { value: RegionGenAlgorithm; label: string }[] = [
  { value: "weighted-bfs", label: "Weighted BFS" },
  { value: "none", label: "None" },
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
  const { world, phase, logEntries, setWorld, clearWorld, appendLog, clearLog } =
    useWorldStore();
  const hoveredHexKey = useUiStore((s) => s.hoveredHexKey);
  const cursorPos = useUiStore((s) => s.cursorPos);
  const mapMode = useUiStore((s) => s.mapMode);
  const setMapMode = useUiStore((s) => s.setMapMode);

  const [seed, setSeed] = useState(() => String(Math.floor(Math.random() * 999999)));
  const [width, setWidth] = useState("80");
  const [height, setHeight] = useState("50");
  const [algorithm, setAlgorithm] = useState<MapGenAlgorithm>("landmass-growth-v3");
  const [regionAlgorithm, setRegionAlgorithm] = useState<RegionGenAlgorithm>("weighted-bfs");
  const [meanRegionSize, setMeanRegionSize] = useState("15");
  const [landPct, setLandPct] = useState("60");
  const [mountainDensityPct, setMountainDensityPct] = useState("10");
  const [minLandmassForRiver, setMinLandmassForRiver] = useState("5");
  const [hexesPerRiver, setHexesPerRiver] = useState("30");
  const [hexesPerCity, setHexesPerCity] = useState("30");
  const [loadError, setLoadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const genStartRef = useRef<number>(0);

  // Auto-scroll log to bottom on new entries
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logEntries]);


  function handleGenerate() {
    const resolvedSeed = Math.max(0, parseInt(seed, 10) || 0);
    const resolvedWidth = Math.min(500, Math.max(10, parseInt(width, 10) || 10));
    const resolvedHeight = Math.min(500, Math.max(10, parseInt(height, 10) || 10));
    const resolvedLandPct = Math.min(90, Math.max(1, parseInt(landPct, 10) || 1));
    const resolvedMountainDensity =
      Math.min(100, Math.max(0, parseInt(mountainDensityPct, 10) || 0)) / 100;
    const resolvedMinLandmass = Math.max(1, parseInt(minLandmassForRiver, 10) || 1);
    const resolvedHexesPerRiver = Math.max(1, parseInt(hexesPerRiver, 10) || 1);
    const resolvedHexesPerCity = Math.max(1, parseInt(hexesPerCity, 10) || 30);
    const resolvedMeanRegionSize = Math.min(500, Math.max(10, parseInt(meanRegionSize, 10) || 15));

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
        regionGenAlgorithm: regionAlgorithm,
        meanRegionSize: resolvedMeanRegionSize,
        minLandFraction: resolvedLandPct / 100,
        mountainDensity: resolvedMountainDensity,
        minLandmassForRiver: resolvedMinLandmass,
        hexesPerRiver: resolvedHexesPerRiver,
        hexesPerCity: resolvedHexesPerCity,
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
        setRegionAlgorithm(parsed.config.regionGenAlgorithm ?? "none");
        setMeanRegionSize(String(parsed.config.meanRegionSize ?? 15));
        setLandPct(String(Math.round(parsed.config.minLandFraction * 100)));
        setMountainDensityPct(
          String(Math.round((parsed.config.mountainDensity ?? 0.2) * 100)),
        );
        setMinLandmassForRiver(String(parsed.config.minLandmassForRiver));
        setHexesPerRiver(String(parsed.config.hexesPerRiver));
        setHexesPerCity(String(parsed.config.hexesPerCity ?? 30));
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
  const hoveredRiverSize = hoveredHex?.riverSize ?? null;
  const hoveredCity: City | undefined =
    hoveredHexKey && world ? world.cities.find((c) => c.hexKey === hoveredHexKey) : undefined;
  const hoveredResource =
    hoveredHex?.resourceId ? RESOURCE_BY_ID[hoveredHex.resourceId] ?? null : null;

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
          Region Algorithm
          <select
            value={regionAlgorithm}
            onChange={(e) => setRegionAlgorithm(e.target.value as RegionGenAlgorithm)}
          >
            {REGION_ALGORITHMS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        {regionAlgorithm === "weighted-bfs" && (
          <label>
            Mean region size (hexes)
            <input
              type="number"
              value={meanRegionSize}
              min={10}
              max={500}
              onChange={(e) => setMeanRegionSize(e.target.value)}
            />
          </label>
        )}

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

        <label>
          Hexes per city
          <input
            type="number"
            value={hexesPerCity}
            onChange={(e) => setHexesPerCity(e.target.value)}
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
    <>
    {hoveredCity && cursorPos && (
      <div
        style={{
          position: "fixed",
          left: cursorPos.x + 14,
          top: cursorPos.y - 28,
          background: "rgba(20,20,20,0.85)",
          color: "#fff",
          fontSize: 11,
          padding: "2px 7px",
          borderRadius: 3,
          pointerEvents: "none",
          zIndex: 1000,
          whiteSpace: "nowrap",
        }}
      >
        {hoveredCity.name}
      </div>
    )}
    {mapMode === "resources" && hoveredResource && cursorPos && (
      <div
        style={{
          position: "fixed",
          left: cursorPos.x + 14,
          top: cursorPos.y - 28,
          background: "rgba(20,20,20,0.85)",
          color: "#fff",
          fontSize: 11,
          padding: "2px 7px",
          borderRadius: 3,
          pointerEvents: "none",
          zIndex: 1000,
          whiteSpace: "nowrap",
        }}
      >
        {hoveredResource.name}
      </div>
    )}
    <aside className="world-gen-panel">
      <h2>World Map</h2>

      <button className="btn-return" onClick={() => { clearWorld(); setLoadError(null); }}>
        ← Return to Map Generation
      </button>

      <button onClick={handleSave} disabled={!world}>
        Save to File
      </button>

      <div className="panel-section">
        <div className="panel-section-title">Map Mode</div>
        <label>
          <select
            value={mapMode}
            onChange={(e) => setMapMode(e.target.value as MapMode)}
          >
            <option value="terrain">Terrain</option>
            <option value="rivers">Rivers Highlight</option>
            <option value="climate">Climate</option>
            <option value="fertility">Fertility</option>
            <option value="settler-attraction">Settler Attraction</option>
            <option value="regions">Regions</option>
            <option value="resources">Resources</option>
            <option value="population">Population</option>
            <option value="wealth">Wealth</option>
          </select>
        </label>
      </div>

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
              <span className="hex-inspector__label">River</span>
              <span className="hex-inspector__value">
                {hoveredRiverSize === "veryLarge" ? "Very Large" : hoveredRiverSize === "large" ? "Large" : hoveredRiverSize === "small" ? "Small" : "None"}
              </span>
            </div>
            <div className="hex-inspector__row">
              <span className="hex-inspector__label">Climate</span>
              <span className="hex-inspector__value">
                {hoveredHex.climate != null ? hoveredHex.climate : "—"}
              </span>
            </div>
            <div className="hex-inspector__row">
              <span className="hex-inspector__label">Fertility</span>
              <span className="hex-inspector__value">
                {hoveredHex.currentFertility != null
                  ? hoveredHex.currentFertility !== hoveredHex.baseFertility
                    ? `${hoveredHex.currentFertility} (base: ${hoveredHex.baseFertility})`
                    : hoveredHex.currentFertility
                  : "—"}
              </span>
            </div>
            <div className="hex-inspector__row">
              <span className="hex-inspector__label">Base Settler Attr.</span>
              <span className="hex-inspector__value">
                {hoveredHex.baseSettlerAttraction != null
                  ? hoveredHex.baseSettlerAttraction === -100
                    ? "ineligible"
                    : hoveredHex.baseSettlerAttraction
                  : "—"}
              </span>
            </div>
            <div className="hex-inspector__row">
              <span className="hex-inspector__label">Settler Attraction</span>
              <span className="hex-inspector__value">
                {hoveredHex.currentSettlerAttraction != null
                  ? hoveredHex.currentSettlerAttraction === -100
                    ? "ineligible"
                    : hoveredHex.currentSettlerAttraction
                  : "—"}
              </span>
            </div>
            {hoveredResource && (
              <>
                <div className="hex-inspector__section-title">Resource</div>
                <div className="hex-inspector__row">
                  <span className="hex-inspector__label">Name</span>
                  <span className="hex-inspector__value">{hoveredResource.name}</span>
                </div>
                <div className="hex-inspector__row">
                  <span className="hex-inspector__label">Category</span>
                  <span className="hex-inspector__value">{hoveredResource.category}</span>
                </div>
                <div className="hex-inspector__row">
                  <span className="hex-inspector__label">Rarity</span>
                  <span className="hex-inspector__value">{hoveredResource.rarity}</span>
                </div>
                <div className="hex-inspector__row">
                  <span className="hex-inspector__label">Value</span>
                  <span className="hex-inspector__value">{hoveredResource.value}</span>
                </div>
              </>
            )}
            {hoveredCity && (
              <>
                <div className="hex-inspector__section-title">City</div>
                <div className="hex-inspector__row">
                  <span className="hex-inspector__label">Name</span>
                  <span className="hex-inspector__value">{hoveredCity.name}</span>
                </div>
              </>
            )}
            {hoveredRegion && (
              <>
                <div className="hex-inspector__section-title">Region</div>
                <div className="hex-inspector__row">
                  <span className="hex-inspector__label">Name</span>
                  <span className="hex-inspector__value">{hoveredRegion.name}</span>
                </div>
                <div className="hex-inspector__row">
                  <span className="hex-inspector__label">Type</span>
                  <span className="hex-inspector__value">
                    {!hoveredRegion.isImpassable
                      ? "Land"
                      : ["water", "coast", "lake"].includes(hoveredRegion.dominantTerrain)
                        ? "Ocean"
                        : "Wasteland"}
                  </span>
                </div>
                <div className="hex-inspector__row">
                  <span className="hex-inspector__label">Terrain</span>
                  <span className="hex-inspector__value">{hoveredRegion.dominantTerrain}</span>
                </div>
                <div className="hex-inspector__row">
                  <span className="hex-inspector__label">Size</span>
                  <span className="hex-inspector__value">{hoveredRegion.hexIds.length} hexes</span>
                </div>
                {!hoveredRegion.isImpassable && (
                  <>
                    <div className="hex-inspector__row">
                      <span className="hex-inspector__label">Development</span>
                      <span className="hex-inspector__value">{hoveredRegion.development}</span>
                    </div>
                    <div className="hex-inspector__row">
                      <span className="hex-inspector__label">Population</span>
                      <span className="hex-inspector__value">
                        {hoveredRegion.population.toLocaleString()} / {hoveredRegion.maxPopulation.toLocaleString()}
                        {" "}({Math.round(hoveredRegion.population / hoveredRegion.maxPopulation * 100)}%)
                      </span>
                    </div>
                    <div className="hex-inspector__row">
                      <span className="hex-inspector__label">Wealth</span>
                      <span className="hex-inspector__value">{hoveredRegion.wealth.toLocaleString()}</span>
                    </div>
                  </>
                )}
                {(hoveredRegion.resourceIds?.length ?? 0) > 0 && (
                  <div className="hex-inspector__row">
                    <span className="hex-inspector__label">Resources</span>
                    <span className="hex-inspector__value">
                      {hoveredRegion.resourceIds!.map((id) => RESOURCE_BY_ID[id]?.name ?? id).join(", ")}
                    </span>
                  </div>
                )}
                {(hoveredRegion.goodIds?.length ?? 0) > 0 && (
                  <div className="hex-inspector__row">
                    <span className="hex-inspector__label">Goods</span>
                    <span className="hex-inspector__value">
                      {hoveredRegion.goodIds!.join(", ")}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <p className="hex-inspector__placeholder">Hover a hex to inspect</p>
        )}
      </div>
    </aside>
    </>
  );
}
