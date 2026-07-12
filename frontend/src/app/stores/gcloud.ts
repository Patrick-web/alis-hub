import { create } from 'zustand';

interface GCloudStore {
  ready: boolean;
  setReady: (ready: boolean) => void;
  isAuthError: (e: unknown) => boolean;
  handleError: (e: unknown) => boolean;
}

export const useGCloud = create<GCloudStore>((set, get) => ({
  ready: false,
  setReady: (ready) => set({ ready }),
  isAuthError: (e) => {
    const s = String(e).toLowerCase();
    return (
      s.includes('not authenticated') ||
      s.includes('gcloud auth login') ||
      s.includes('empty token')
    );
  },
  handleError: (e) => {
    if (get().isAuthError(e)) {
      set({ ready: false });
      return true;
    }
    return false;
  },
}));
