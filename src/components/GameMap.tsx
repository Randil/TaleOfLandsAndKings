import { useWorldStore } from "../store/worldStore";
import { useUiStore } from "../store/uiStore";
import { HexGrid } from "./HexGrid";

export function GameMap() {
  const world = useWorldStore((s) => s.world);
  const setHoveredHexKey = useUiStore((s) => s.setHoveredHexKey);
  const setCursorPos = useUiStore((s) => s.setCursorPos);
  const mapMode = useUiStore((s) => s.mapMode);

  if (!world) {
    return (
      <div className="game-map game-map--empty">
        <p>No world loaded. Generate or load a world to begin.</p>
      </div>
    );
  }

  return (
    <div
      className="game-map"
      onMouseMove={(e) => setCursorPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setCursorPos(null)}
    >
      <HexGrid world={world} onHoverHex={setHoveredHexKey} mapMode={mapMode} />
    </div>
  );
}
