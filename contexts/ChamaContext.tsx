import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Chama, Membership } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { DEMO_MODE } from '@/config/appConfig';

interface ChamaContextType {
  userChama: Chama | null;
  membership: Membership | null;
  chamaLoading: boolean;
  loadChama: () => Promise<void>;
  refreshChama: () => void;
}

const ChamaContext = createContext<ChamaContextType | null>(null);

// Demo Chama & Membership to preview all app UI screens
export const DEMO_CHAMA: Chama = {
  id: 'chama_demo_1',
  name: 'Tumaini Merry-Go-Round',
  description: 'Monthly savings and rotating payout Chama',
  chairpersonId: 'demo_user_chairperson',
  contributionAmount: 5000,
  contributionDayOfMonth: 15,
  fineAmount: 200,
  currency: 'KES',
  createdAt: '2025-01-01T00:00:00.000Z',
  currentCycleId: 'cycle_demo_1',
  memberCount: 6,
};

export const DEMO_MEMBERSHIP: Membership = {
  id: 'mem_demo_1',
  userId: 'demo_user_chairperson',
  chamaId: 'chama_demo_1',
  status: 'active',
  joinedAt: '2025-01-01T00:00:00.000Z',
  totalContributed: 30000,
  outstandingFine: 0,
  userName: 'Faith Wanjiku',
  userEmail: 'faith.wanjiku@connectchama.ke',
};

export function ChamaProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // Initialized with demo data so UI is immediately visible
  const [userChama, setUserChama] = useState<Chama | null>(DEMO_MODE ? DEMO_CHAMA : null);
  const [membership, setMembership] = useState<Membership | null>(DEMO_MODE ? DEMO_MEMBERSHIP : null);
  const [chamaLoading, setChamaLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadChama = useCallback(async () => {
    if (!user) {
      setUserChama(null);
      setMembership(null);
      return;
    }

    // Demo mode keeps the old behaviour: everyone lands in the sample chama.
    if (DEMO_MODE) {
      setUserChama({
        ...DEMO_CHAMA,
        chairpersonId: user.role === 'chairperson' ? user.uid : DEMO_CHAMA.chairpersonId,
      });
      setMembership({
        ...DEMO_MEMBERSHIP,
        userId: user.uid,
        userName: user.fullName,
        userEmail: user.email,
      });
      return;
    }

    setChamaLoading(true);
    try {
      // 1. Find this user's membership(s).
      const snap = await getDocs(query(collection(db, 'memberships'), where('userId', '==', user.uid)));
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Membership);

      // 2. Prefer a live membership; otherwise fall back to a pending request.
      const live = all.find((m) => m.status === 'active' || m.status === 'exit_requested');
      const pending = all.find((m) => m.status === 'pending');
      const current = live ?? pending ?? null;

      if (!current) {
        setUserChama(null);
        setMembership(null);
        return;
      }

      setMembership(current);

      // 3. Only approved members get the chama dashboard. Pending members see a waiting message.
      if (current.status === 'pending') {
        setUserChama(null);
        return;
      }
      const chamaSnap = await getDoc(doc(db, 'chamas', current.chamaId));
      setUserChama(chamaSnap.exists() ? ({ id: chamaSnap.id, ...chamaSnap.data() } as Chama) : null);
    } catch (err) {
      console.error('[ChamaContext] loadChama failed:', err);
    } finally {
      setChamaLoading(false);
    }
  }, [user]);

  const refreshChama = useCallback(() => {
    console.log('[ChamaContext] refreshChama triggered');
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    loadChama();
  }, [loadChama, refreshKey]);

  // Real-time listener for chama updates
  useEffect(() => {
    if (DEMO_MODE || !userChama?.id) return;
    const unsub = onSnapshot(
      doc(db, 'chamas', userChama.id),
      (snap) => {
        if (snap.exists()) setUserChama({ id: snap.id, ...snap.data() } as Chama);
      },
      (err) => console.error('[ChamaContext] chama listener error:', err)
    );
    return unsub;
  }, [userChama?.id]);

  // Real-time listener for membership updates. This is also how a pending member
  // finds out they were approved (status changes) or rejected (document deleted).
  useEffect(() => {
    if (DEMO_MODE || !membership?.id) return;
    const unsub = onSnapshot(
      doc(db, 'memberships', membership.id),
      (snap) => {
        if (!snap.exists()) {
          refreshChama();
          return;
        }
        const next = { id: snap.id, ...snap.data() } as Membership;
        setMembership(next);
        if (next.status === 'active' && !userChama) refreshChama();
      },
      (err) => console.error('[ChamaContext] membership listener error:', err)
    );
    return unsub;
  }, [membership?.id, userChama, refreshChama]);

  return (
    <ChamaContext.Provider value={{ userChama, membership, chamaLoading, loadChama, refreshChama }}>
      {children}
    </ChamaContext.Provider>
  );
}

export function useChama() {
  const ctx = useContext(ChamaContext);
  if (!ctx) throw new Error('useChama must be used within ChamaProvider');
  return ctx;
}
