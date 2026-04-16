import { WorldGenPanel } from "./components/WorldGenPanel";
import { GameMap } from "./components/GameMap";
import "./App.css";

function App() {
  return (
    <div className="app-layout">
      <WorldGenPanel />
      <GameMap />
    </div>
  );
}

export default App;
