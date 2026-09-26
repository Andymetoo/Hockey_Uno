import { createGame } from './generation.ts';
// Generation and witness search stay off the UI thread, especially on mobile.
self.onmessage = (event: MessageEvent<string>) => {
 try { self.postMessage({ state: createGame(event.data, attempt => self.postMessage({ attempt })) }); }
 catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'House generation failed.' }); }
};
