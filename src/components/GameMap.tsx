import { useWorldStore } from '../store/worldStore';
import { HexGrid } from './HexGrid';

export function GameMap() {
  const world = useWorldStore(s => s.world);

  if (!world) {
    return (
      <div className="game-map game-map--empty">
        <p>No world loaded. Generate or load a world to begin.</p>
      </div>
    );
  }

  return (
    <div className="game-map">
      <HexGrid world={world} />
    </div>
  );
}
