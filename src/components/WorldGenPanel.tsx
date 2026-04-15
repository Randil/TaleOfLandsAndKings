import { useState, useRef } from 'react';
import { generateWorld } from '../game/mapGen';
import { useWorldStore } from '../store/worldStore';
import type { World } from '../types/world';

const MIN_REGIONS = 2;
const MAX_REGIONS = 50;

function isValidWorld(obj: unknown): obj is World {
  if (typeof obj !== 'object' || obj === null) return false;
  const w = obj as Record<string, unknown>;
  return (
    typeof w.config === 'object' &&
    typeof w.hexes === 'object' &&
    typeof w.regions === 'object'
  );
}

export function WorldGenPanel() {
  const { world, setWorld } = useWorldStore();
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 999999));
  const [numRegions, setNumRegions] = useState(12);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleGenerate() {
    const w = generateWorld({ seed, numRegions });
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
        // Sync inputs to loaded config
        setSeed(parsed.config.seed);
        setNumRegions(parsed.config.numRegions);
      } catch {
        setLoadError('Failed to parse file. Make sure it is a valid JSON world file.');
      }
    };
    reader.readAsText(file);
    // Reset so same file can be re-loaded
    e.target.value = '';
  }

  const hexCount = world ? Object.keys(world.hexes).length : 0;
  const regionCount = world ? Object.keys(world.regions).length - 1 : 0; // exclude water

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
        Regions
        <input
          type="number"
          value={numRegions}
          min={MIN_REGIONS}
          max={MAX_REGIONS}
          onChange={(e) => setNumRegions(Math.min(MAX_REGIONS, Math.max(MIN_REGIONS, Number(e.target.value))))}
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
          <p>Regions: {regionCount}</p>
          <p>Hexes: {hexCount.toLocaleString()}</p>
        </div>
      )}
    </aside>
  );
}
