import { useEffect, useRef, useState } from 'react';
import { Game } from '../core/Game.js';
import { appStore } from '../core/appStore.js';
import { settingsStore } from '../settings/SettingsManager.js';
import { useApp } from './shared.jsx';
import { LoadingScreen } from './LoadingScreen.jsx';
import { MainMenu } from './MainMenu.jsx';
import { LevelSelect } from './LevelSelect.jsx';
import { Settings } from './Settings.jsx';
import { Statistics } from './Statistics.jsx';
import { About } from './About.jsx';
import { HUD } from './HUD.jsx';
import { PauseMenu } from './PauseMenu.jsx';
import { Results } from './Results.jsx';
import { CourseInfo } from './CourseInfo.jsx';

export function App() {
  const canvasRef = useRef(null);
  const [game, setGame] = useState(null);
  const screen = useApp((s) => s.screen);
  const flow = useApp((s) => s.flow);
  const result = useApp((s) => s.result);
  const courseInfo = useApp((s) => s.showCourseInfo);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return undefined;
    started.current = true;
    const { set } = appStore.getState();
    let g;
    try {
      g = new Game(canvasRef.current);
    } catch (err) {
      set({ loadError: 'This browser could not start WebGL, which STRYDE needs. Turn on hardware acceleration, or try a current version of Chrome, Edge or Firefox.' });
      console.error(err);
      return undefined;
    }
    setGame(g);
    if (new URLSearchParams(location.search).has('debug')) {
      window.__stryde = g;
      window.__strydeSettings = settingsStore;
    }
    g.load((stage, progress) => set({ loadStage: stage, loadProgress: progress }))
      .then(() => set({ screen: 'menu' }))
      .catch((err) => {
        console.error(err);
        set({ loadError: `Loading failed during "${appStore.getState().loadStage}". Reload the page to try again. Detail: ${err.message}` });
      });
    return undefined;
  }, []);

  const inGame = screen === 'game' || (screen === 'settings' && appStore.getState().settingsFrom === 'pause');

  return (
    <>
      <canvas ref={canvasRef} className="game-canvas" tabIndex={-1} />
      {game && inGame && <HUD game={game} />}
      {game && screen === 'menu' && <MainMenu game={game} />}
      {game && screen === 'levels' && <LevelSelect game={game} />}
      {game && screen === 'settings' && <Settings game={game} />}
      {game && screen === 'stats' && <Statistics game={game} />}
      {game && screen === 'about' && <About game={game} />}
      {game && screen === 'game' && flow === 'paused' && <PauseMenu game={game} />}
      {game && screen === 'game' && flow === 'results' && result && <Results game={game} result={result} />}
      {game && screen === 'game' && courseInfo && <CourseInfo game={game} />}
      <LoadingScreen />
    </>
  );
}
