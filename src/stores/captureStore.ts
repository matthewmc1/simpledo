import { create } from "zustand";

interface CaptureState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const useCaptureModal = create<CaptureState>((set, get) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set({ open: !get().open }),
}));
