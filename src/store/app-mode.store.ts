import { create } from 'zustand';

export type AppMode = 'child' | 'parent';

type AppModeState = {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
};

export const useAppModeStore = create<AppModeState>((set) => ({
  mode: 'child',
  setMode: (mode) => set({ mode }),
}));
