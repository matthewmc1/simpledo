import { create } from "zustand";

interface State {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useProjectCreateModal = create<State>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
