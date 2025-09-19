import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';

export type RegionCode = 'FR' | 'CIV';

interface RegionContextType {
  region: RegionCode | null;
  loadingRegion: boolean;
  setRegion: (r: RegionCode) => void; // future multi-région
}

const RegionContext = createContext<RegionContextType | undefined>(undefined);

export const useRegion = () => {
  const ctx = useContext(RegionContext);
  if (!ctx) throw new Error('useRegion must be used within RegionProvider');
  return ctx;
};

export const RegionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [region, setRegion] = useState<RegionCode | null>(null);
  const [loadingRegion, setLoadingRegion] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user) { setRegion(null); return; }
      // Priorité à une sélection manuelle existante
      const stored = localStorage.getItem('activeRegion');
      if (stored === 'FR' || stored === 'CIV') {
        setRegion(stored);
        return; // ne pas surcharger par Firestore
      }
      setLoadingRegion(true);
      try {
        const snap = await getDoc(doc(db, 'users', user.id));
        if (!active) return;
        const data = snap.data();
        let reg = data?.region;
        if (reg !== 'FR' && reg !== 'CIV') {
          reg = 'FR';
        }
        setRegion(reg);
        localStorage.setItem('activeRegion', reg);
      } catch (e) {
        setRegion('FR');
      } finally {
        if (active) setLoadingRegion(false);
      }
    };
    load();
    return () => { active = false; };
  }, [user]);

  return (
    <RegionContext.Provider value={{ region, loadingRegion, setRegion: (r) => { setRegion(r); localStorage.setItem('activeRegion', r); } }}>
      {children}
    </RegionContext.Provider>
  );
};
