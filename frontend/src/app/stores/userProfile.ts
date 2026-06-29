import { create } from 'zustand';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';

interface UserProfile {
  email: string;
  name: string;
  picture: string;
}

interface UserProfileStore {
  profile: UserProfile | null;
  profileError: string | null;
  fetchProfile: () => Promise<void>;
  clearProfile: () => void;
}

export const useUserProfile = create<UserProfileStore>((set, get) => ({
  profile: null,
  profileError: null,
  fetchProfile: async () => {
    if (get().profile) return;
    try {
      const p = await (ProductService.GetUserProfile as () => Promise<any>)();
      if (p) set({ profile: p as UserProfile });
    } catch (e) {
      set({ profileError: String(e) });
    }
  },
  clearProfile: () => set({ profile: null, profileError: null }),
}));
