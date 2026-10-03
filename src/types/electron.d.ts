import type { ElectronAPI } from '../../shared/electronApi';

declare global {
  interface Window {
    /** 通常のブラウザやpreload未読込の環境では存在しない。 */
    electronAPI?: ElectronAPI;
  }
}

export {};
