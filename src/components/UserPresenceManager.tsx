import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export default function UserPresenceManager() {
  // useAuth() exposes `user`, not `currentUser`
  const { user } = useAuth();
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (!user) return;

    const userRef = doc(db, 'users', user.id);

    const sendHeartbeat = async (force = false) => {
      const now = Date.now();
      // Throttle updates: max 1 update per minute unless forced (interval or visibility change)
      if (!force && now - lastUpdateRef.current < 60 * 1000) {
        return;
      }

      try {
        lastUpdateRef.current = now;
        const payload: any = {
          lastActive: serverTimestamp(), // Server time for consistency
          lastPing: now, // Client time as backup
          isOnline: true,
        };
        if (user.email) {
          payload.email = user.email;
        }
        if (user.displayName) {
          payload.displayName = user.displayName;
        }

        await setDoc(userRef, payload, { merge: true });
      } catch (error) {
        console.error("Error sending heartbeat:", error);
      }
    };

    // Send immediately on mount
    sendHeartbeat(true);

    // Set up interval
    const intervalId = setInterval(() => sendHeartbeat(true), HEARTBEAT_INTERVAL_MS);

    // Activity listeners to trigger updates when user is active
    const handleActivity = () => sendHeartbeat(false);
    
    // Listen for user interactions
    window.addEventListener('click', handleActivity);
    window.addEventListener('keydown', handleActivity);
    
    // Listen for tab visibility
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat(true); // Force update when returning to tab
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Cleanup
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      document.removeEventListener('visibilitychange', handleVisibility);
      
      // Attempt to set offline on unmount
      setDoc(userRef, {
        isOnline: false,
        lastActive: serverTimestamp()
      }, { merge: true }).catch(err => console.error("Error setting offline:", err));
    };
  }, [user]);

  return null;
}
