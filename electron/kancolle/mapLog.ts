import runtime = require('../runtime');

const recentLogs: string[] = [];
export function getMapLogs(): string[] { return [...recentLogs]; }

export function logMap(message: string, details?: unknown, warning = false, outputToConsole = true): void {
  const text = `[MapData] ${message}${details === undefined ? '' : ` ${JSON.stringify(details)}`}`;
  if (warning) console.warn(text);
  else console.log(text);
  if (!outputToConsole) return;
  recentLogs.push(text);
  if (recentLogs.length > 100) recentLogs.shift();
  if (runtime.mainWindow && !runtime.mainWindow.isDestroyed()) {
    runtime.mainWindow.webContents.send('kancolle:map-log', text);
  }
}
