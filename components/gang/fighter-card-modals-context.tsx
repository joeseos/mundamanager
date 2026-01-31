'use client';

import React, { createContext, useContext } from 'react';
import type { FighterProps, Vehicle } from '@/types/fighter';

export interface OpenInjuryModalOptions {
  /** When true, open the Add Lasting Injuries / Add Rig Glitches modal instead of the list view */
  openAddModal?: boolean;
}

export interface OpenVehicleDamageModalOptions {
  /** When true, open the Add Lasting Damage modal instead of the list view */
  openAddModal?: boolean;
}

interface FighterCardModalsContextValue {
  openXpModal: (fighterId: string) => void;
  openInjuryModal: (fighterId: string, options?: OpenInjuryModalOptions) => void;
  openVehicleDamageModal: (fighterId: string, options?: OpenVehicleDamageModalOptions) => void;
  /** ID of the fighter whose action menu is open, or null if none. Only one menu is open at a time. */
  openActionMenuFighterId: string | null;
  setOpenActionMenuFighterId: (fighterId: string | null) => void;
}

const FighterCardModalsContext = createContext<FighterCardModalsContextValue | undefined>(undefined);

interface FighterCardModalsProviderProps {
  value: FighterCardModalsContextValue;
  children: React.ReactNode;
}

export function FighterCardModalsProvider({ value, children }: FighterCardModalsProviderProps) {
  return (
    <FighterCardModalsContext.Provider value={value}>
      {children}
    </FighterCardModalsContext.Provider>
  );
}

export function useFighterCardModals():
  | FighterCardModalsContextValue
  | undefined {
  return useContext(FighterCardModalsContext);
}

