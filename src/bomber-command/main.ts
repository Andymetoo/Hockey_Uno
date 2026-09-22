import { mountBomberCommand } from './App.ts';
import './styles.css';
const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing application root');
mountBomberCommand(root);
