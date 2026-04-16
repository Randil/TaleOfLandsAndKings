import { useState, useRef } from 'react';
import { generateWorld } from '../game/mapGen';
import { useWorldStore } from '../store/worldStore';
import type { World, MapGenAlgorithm } from '../types/world';

const ALGORITHMS: { value: MapGenAlgorithm; label: string }[] = [
  { value: 'landmass-growth',    label: 'Landmass Growth v1' },
  { value: 'landmass-growth-v2', label: 'Landmass Growth v2' },
];

function isValidWorld(obj: unknown): obj is World {
  if (typeof obj !== 'object' || obj === null) return false;
  const w = obj as Record<string, unknown>;
  if (typeof w.config !== 'object' || w.config === null) return false;
  const c = w.config as Record<string, unknown>;
  return (
    typeof c.seed === 'number' &&
    typeof c.width === 'number' &&
    typeof c.height === 'number' &&
    typeof c.mapGenAlgorithm === 'string' &&
    typeof w.hexes === 'object' &&
    typeof w.regions === 'object' &&
    Array.isArray((w as Record<string, unknown>).rivers)
  );
}

export function WorldGenPanel() {
  const { world, setWorld } = useWorldStore();
  const [seed, setSeed]       = useState(() => Math.floor(Math.random() * 999999));
  const [width, setWidth]     = useState(80);
  const [height, setHeight]   = useState(50);
  const [algorithm, setAlgorithm] = useState<MapGenAlgorithm>('landmass-growth-v2');

  // Algorithm-specific params (shared by both v1 and v2 for now)
  const [landPct, setLandPct]                     = useState(35);
  const [minLandmassForRiver, setMinLandmassForRiver] = useState(5);
  const [hexesPerRiver, setHexesPerRiver]             = useState(30);

  const [loadError, setLoadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleGenerate() {
    const w = generateWorld({
      seed,
      width,
      height,
      mapGenAlgorithm: algorithm,
      minLandFraction: landPct / 100,
      minLandmassForRiver,
      hexesPerRiver,
    });
    setWorld(w);
    setLoadError(null);
  }

  function handleSave() {
    if (!world) return;
    const json = JSON.stringify(world, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
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
          setLoadError('Invalid world file: missing required fields.');
          return;
        }
        setWorld(parsed);
        setLoadError(null);
        setSeed(parsed.config.seed);
        setWidth(parsed.config.width);
        setHeight(parsed.config.height);
        setAlgorithm(parsed.config.mapGenAlgorithm);
        setLandPct(Math.round(parsed.config.minLandFraction * 100));
        setMinLandmassForRiver(parsed.config.minLandmassForRiver);
        setHexesPerRiver(parsed.config.hexesPerRiver);
      } catch {
        setLoadError('Failed to parse file. Make sure it is a valid JSON world file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  const hexCount    = world ? Object.keys(world.hexes).length : 0;
  const riverCount  = world ? (world.rivers?.length ?? 0) : 0;

  return (
    <aside className="world-gen-panel">
      <h2>World Generator</h2>

      <label>
        Seed
        <input
          type="number"
          value={seed}
          onChange={(e) => setSeed(Number(e.target.value))}
        />
      </label>

      <label>
        Width (hexes)
        <input
          type="number"
          value={width}
          min={10}
          max={500}
          onChange={(e) => setWidth(Math.min(500, Math.max(10, Number(e.target.value))))}
        />
      </label>

      <label>
        Height (hexes)
        <input
          type="number"
          value={height}
          min={10}
          max={500}
          onChange={(e) => setHeight(Math.min(500, Math.max(10, Number(e.target.value))))}
        />
      </label>

      <label>
        Algorithm
        <select
          value={algorithm}
          onChange={(e) => setAlgorithm(e.target.value as MapGenAlgorithm)}
        >
          {ALGORITHMS.map(a => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
      </label>

      {/* Algorithm-specific parameters */}
      <label>
        Land coverage (%)
        <input
          type="number"
          value={landPct}
          min={1}
          max={90}
          onChange={(e) => setLandPct(Math.min(90, Math.max(1, Number(e.target.value))))}
        />
      </label>

      <label>
        Min landmass size for rivers
        <input
          type="number"
          value={minLandmassForRiver}
          min={1}
          onChange={(e) => setMinLandmassForRiver(Math.max(1, Number(e.target.value)))}
        />
      </label>

      <label>
        Hexes per river
        <input
          type="number"
          value={hexesPerRiver}
          min={1}
          onChange={(e) => setHexesPerRiver(Math.max(1, Number(e.target.value)))}
        />
      </label>

      <button onClick={handleGenerate}>Generate</button>

      <hr />

      <button onClick={handleSave} disabled={!world}>Save to File</button>
      <button onClick={handleLoadClick}>Load from File</button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {loadError && <p className="error">{loadError}</p>}

      {world && (
        <div className="world-stats">
          <p>Seed: {world.config.seed}</p>
          <p>Size: {world.config.width} × {world.config.height}</p>
          <p>Hexes: {hexCount.toLocaleString()}</p>
          <p>Rivers: {riverCount}</p>
        </div>
      )}
    </aside>
  );
}
