import { mountGame } from './App.ts';
import { loadGame, saveGame, newSeed } from './persistence.ts';
import './styles.css';

const root = document.getElementById('app');
if (root) mountGame(root, { load: loadGame, save: saveGame, newSeed });
