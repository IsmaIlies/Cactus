import {
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  Timestamp,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../../firebase";
import type { AdditionalOffer } from "../types/sales";

const COLLECTION_PATH = "leads_sales";
const missionFilter = "ORANGE_LEADS";

const startOfDay = (ref: Date) => new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0);
const startOfMonth = (ref = new Date()) => new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0);
const startOfNextMonth = (ref = new Date()) => new Date(ref.getFullYear(), ref.getMonth() + 1, 1, 0, 0, 0, 0);
const formatDateKey = (date: Date) => date.toISOString().slice(0, 10);

type LeadSaleInput = {
  numeroId: string;
  typeOffre: string;
  dateTechnicien: string | null;
  intituleOffre: string;
  referencePanier: string;
  additionalOffers: Array<Pick<AdditionalOffer, "typeOffre" | "intituleOffre" | "referencePanier">>;
  ficheDuJour: string;
  origineLead: "hipto" | "dolead" | "mm";
  telephone: string;
  createdBy?: {
    userId?: string;
    displayName?: string;
    email?: string;
  };
};

export const categorize = (typeOffre: string | undefined | null) => {
  const type = (typeOffre || "").trim().toLowerCase().replace(/\s+/g, "");
  const zero = { internet: 0, mobile: 0, internetSosh: 0, mobileSosh: 0 } as const;

  switch (type) {
    case "mobile":
      return { ...zero, mobile: 1 };
    case "internet":
      return { ...zero, internet: 1 };
    case "internetsosh":
      return { ...zero, internetSosh: 1 };
    case "mobilesosh":
      return { ...zero, mobileSosh: 1 };
    case "internet + mobile":
      return { ...zero, internet: 1, mobile: 1 };
    case "internetsosh + mobilesosh":
      return { ...zero, internetSosh: 1, mobileSosh: 1 };
    default:
      return { ...zero };
  }
};

export const saveLeadSale = async (payload: LeadSaleInput) => {
  const functions = getFunctions(undefined, "europe-west9");
  const submitLeadSale = httpsCallable(functions, "submitLeadSale");
  try {
    await submitLeadSale({
      numeroId: payload.numeroId,
      typeOffre: payload.typeOffre,
      dateTechnicien: payload.dateTechnicien,
      intituleOffre: payload.intituleOffre,
      referencePanier: payload.referencePanier,
      additionalOffers: payload.additionalOffers,
      ficheDuJour: payload.ficheDuJour,
      origineLead: payload.origineLead,
      telephone: payload.telephone,
    });
    return;
  } catch (err: any) {
    const code: string = (err?.code || err?.details?.rawCode || 'unknown').toString();
    const message: string = (err?.message || '').toString();
    const isInternal = code === 'internal' || code === 'functions/internal' || /internal/i.test(code);
    const isUnavailable = code === 'unavailable' || code === 'functions/unavailable';
    const isUnknown = code === 'unknown' || code === 'functions/unknown';
    const looksLikeCorsOrNetwork = /CORS|Failed to fetch|net::ERR|preflight|No 'Access-Control-Allow-Origin'/i.test(message);
    // If the callable failed with an internal/server or network/CORS error, attempt a direct Firestore write as a fallback
    if (!(isInternal || isUnavailable || isUnknown || looksLikeCorsOrNetwork)) {
      throw err;
    }
    // Build a Firestore-compliant document that passes security rules
    const cat = categorize(payload.typeOffre);
    const doc: any = {
      numeroId: payload.numeroId,
      typeOffre: payload.typeOffre,
      dateTechnicien: payload.dateTechnicien || null,
      intituleOffre: payload.intituleOffre,
      referencePanier: payload.referencePanier,
      additionalOffers: Array.isArray(payload.additionalOffers) ? payload.additionalOffers : [],
      ficheDuJour: payload.ficheDuJour,
      origineLead: payload.origineLead,
      telephone: payload.telephone,
      mission: missionFilter,
      // Optional counters for convenience
      mobileCount: cat.mobile,
      boxCount: cat.internet,
      mobileSoshCount: cat.mobileSosh,
      internetSoshCount: cat.internetSosh,
      createdAt: serverTimestamp(),
    };
    if (payload.createdBy?.userId) {
      doc.createdBy = {
        userId: payload.createdBy.userId,
        displayName: payload.createdBy.displayName || '',
        email: payload.createdBy.email || '',
      };
    }
    await addDoc(collection(db, COLLECTION_PATH), doc);
  }
};

export type LeadKpiSnapshot = {
  hipto: { mobiles: number; box: number; mobileSosh: number; internetSosh: number };
  dolead: { mobiles: number; box: number; mobileSosh: number; internetSosh: number };
  mm: { mobiles: number; box: number; mobileSosh: number; internetSosh: number };
};

export const subscribeToLeadKpis = (callback: (data: LeadKpiSnapshot) => void) => {
  const todayStart = startOfDay(new Date());
  // IMPORTANT: limiter aux ventes du jour pour éviter de lire toute la collection (coûteux en reads)
  const q = query(
    collection(db, COLLECTION_PATH),
    where("mission", "==", missionFilter),
    where("createdAt", ">=", Timestamp.fromDate(todayStart))
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const aggregated: LeadKpiSnapshot = {
        hipto: { mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 },
        dolead: { mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 },
        mm: { mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 },
      };

      snapshot.forEach((doc) => {
        const data = doc.data() as any;
        // plus besoin de filtrer côté client: le where(createdAt >= todayStart) réduit la fenêtre
        const originRaw = (data?.origineLead || "").toLowerCase();
        if (originRaw === "hipto" || originRaw === "dolead" || originRaw === "mm") {
          const origin = originRaw as keyof LeadKpiSnapshot;
          const cat = categorize(data?.typeOffre);
          aggregated[origin].mobiles += cat.mobile + cat.mobileSosh;
          aggregated[origin].box += cat.internet + cat.internetSosh;
          aggregated[origin].mobileSosh += cat.mobileSosh;
          aggregated[origin].internetSosh += cat.internetSosh;
        }
      });

      callback(aggregated);
    },
    (error) => {
      if ((error as any)?.code === "permission-denied") {
        console.warn("subscribeToLeadKpis: accès refusé (auth/règles)", error);
      } else {
        console.error("subscribeToLeadKpis: erreur snapshot", error);
      }
      callback({
        hipto: { mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 },
        dolead: { mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 },
        mm: { mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 },
      });
    }
  );
};

export type LeadDailySeriesEntry = {
  date: string;
  mobiles: number;
  box: number;
};

export const subscribeToLeadMonthlySeries = (
  origin: "hipto" | "dolead" | "mm",
  callback: (series: LeadDailySeriesEntry[]) => void
) => {
  const monthStart = startOfMonth();
  const q = query(
    collection(db, COLLECTION_PATH),
    where("mission", "==", missionFilter),
    where("origineLead", "==", origin),
    where("createdAt", ">=", Timestamp.fromDate(monthStart)),
    orderBy("createdAt", "asc")
  );
  let unsubscribe: (() => void) | null = null;

  const computeAndCallback = (snapshot: any, filterByDate = false) => {
    const map = new Map<string, { mobiles: number; box: number }>();
    snapshot.forEach((doc: any) => {
      const data = doc.data() as any;
      const createdAt: Timestamp | null = data?.createdAt ?? null;
      if (!createdAt) return;
      const d = createdAt.toDate();
      if (filterByDate && d < monthStart) return;
      const key = formatDateKey(d);
      const bucket = map.get(key) || { mobiles: 0, box: 0 };
      const cat = categorize(data?.typeOffre);
      bucket.mobiles += cat.mobile + cat.mobileSosh;
      bucket.box += cat.internet + cat.internetSosh;
      map.set(key, bucket);
    });
    const series = Array.from(map.entries())
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .map(([date, value]) => ({ date, ...value }));
    callback(series);
  };

  const subscribePrimary = () => {
    unsubscribe = onSnapshot(
      q,
      (snapshot) => computeAndCallback(snapshot, false),
      (error) => {
        const code = (error as any)?.code;
        if (code === 'failed-precondition') {
          console.warn('subscribeToLeadMonthlySeries: index absent/en cours de construction, fallback sans filtre de date');
          try { unsubscribe && unsubscribe(); } catch {}
          const fb = query(
            collection(db, COLLECTION_PATH),
            where('mission', '==', missionFilter),
            where('origineLead', '==', origin)
          );
          unsubscribe = onSnapshot(
            fb,
            (snap) => computeAndCallback(snap, true),
            (err2) => {
              if ((err2 as any)?.code === 'permission-denied') {
                console.warn('subscribeToLeadMonthlySeries (fallback): accès refusé (auth/règles)', err2);
              } else {
                console.error('subscribeToLeadMonthlySeries (fallback): erreur snapshot', err2);
              }
              callback([]);
            }
          );
        } else if (code === 'permission-denied') {
          console.warn('subscribeToLeadMonthlySeries: accès refusé (auth/règles)', error);
          callback([]);
        } else {
          console.error('subscribeToLeadMonthlySeries: erreur snapshot', error);
          callback([]);
        }
      }
    );
  };

  subscribePrimary();
  return () => { if (unsubscribe) unsubscribe(); };
};

export type LeadAgentSummary = {
  mobiles: number;
  box: number;
  mobileSosh: number;
  internetSosh: number;
};

export const subscribeToLeadAgentSummary = (
  userId: string,
  month: Date,
  callback: (summary: LeadAgentSummary) => void
) => {
  const monthStart = startOfMonth(month);
  const monthEnd = startOfNextMonth(month);
  const primaryQuery = query(
    collection(db, COLLECTION_PATH),
    where("mission", "==", missionFilter),
    where("createdBy.userId", "==", userId),
    where("createdAt", ">=", Timestamp.fromDate(monthStart)),
    where("createdAt", "<", Timestamp.fromDate(monthEnd)),
    orderBy("createdAt", "asc")
  );
  let unsubscribe: (() => void) | null = null;

  const computeAndCallback = (snapshot: any) => {
    const summary: LeadAgentSummary = {
      mobiles: 0,
      box: 0,
      mobileSosh: 0,
      internetSosh: 0,
    };
    snapshot.forEach((doc: any) => {
      const data = doc.data() as any;
      // When using fallback (no date filter), filter client-side
      const createdAt: Timestamp | null = data?.createdAt ?? null;
      if (createdAt) {
        const d = createdAt.toDate();
        if (d < monthStart || d >= monthEnd) return;
      } else {
        // Skip documents without createdAt
        return;
      }
      const cat = categorize(data?.typeOffre);
      summary.mobiles += cat.mobile;
      summary.box += cat.internet;
      summary.mobileSosh += cat.mobileSosh;
      summary.internetSosh += cat.internetSosh;
    });
    callback(summary);
  };

  const subscribePrimary = () => {
    unsubscribe = onSnapshot(
      primaryQuery,
      (snapshot) => {
        // Primary already matches the date range, compute directly without extra filtering
        const summary: LeadAgentSummary = {
          mobiles: 0,
          box: 0,
          mobileSosh: 0,
          internetSosh: 0,
        };
        snapshot.forEach((doc) => {
          const data = doc.data() as any;
          const cat = categorize(data?.typeOffre);
          summary.mobiles += cat.mobile;
          summary.box += cat.internet;
          summary.mobileSosh += cat.mobileSosh;
          summary.internetSosh += cat.internetSosh;
        });
        callback(summary);
      },
      (error) => {
        const code = (error as any)?.code;
        if (code === "failed-precondition") {
          console.warn("subscribeToLeadAgentSummary: index absent/en cours de construction, on évite un fallback large pour économiser les reads");
          callback({ mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 });
        } else if (code === "permission-denied") {
          console.warn("subscribeToLeadAgentSummary: accès refusé (auth/règles)", error);
          callback({ mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 });
        } else {
          console.error("subscribeToLeadAgentSummary: erreur snapshot", error);
          callback({ mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 });
        }
      }
    );
  };

  subscribePrimary();
  return () => {
    if (unsubscribe) unsubscribe();
  };
};

// ---- Monthly totals across all sources (current month) ----
export type LeadMonthlyTotals = {
  mobiles: number;
  box: number;
  mobileSosh: number;
  internetSosh: number;
};

export const subscribeToLeadMonthlyTotalsAllSources = (
  callback: (totals: LeadMonthlyTotals) => void
) => {
  const monthStart = startOfMonth();
  const monthEnd = startOfNextMonth();
  const primaryQuery = query(
    collection(db, COLLECTION_PATH),
    where("mission", "==", missionFilter),
    where("createdAt", ">=", Timestamp.fromDate(monthStart)),
    where("createdAt", "<", Timestamp.fromDate(monthEnd)),
    orderBy("createdAt", "asc")
  );

  let unsubscribe: (() => void) | null = null;

  const computeAndCallback = (snapshot: any, filterByDate = false) => {
    const totals: LeadMonthlyTotals = {
      mobiles: 0,
      box: 0,
      mobileSosh: 0,
      internetSosh: 0,
    };
    snapshot.forEach((doc: any) => {
      const data = doc.data() as any;
      const createdAt: Timestamp | null = data?.createdAt ?? null;
      if (filterByDate) {
        if (!createdAt) return;
        const d = createdAt.toDate();
        if (d < monthStart || d >= monthEnd) return;
      }
      const cat = categorize(data?.typeOffre);
      totals.mobiles += cat.mobile + cat.mobileSosh;
      totals.box += cat.internet + cat.internetSosh;
      totals.mobileSosh += cat.mobileSosh;
      totals.internetSosh += cat.internetSosh;
    });
    callback(totals);
  };

  const subscribePrimary = () => {
    unsubscribe = onSnapshot(
      primaryQuery,
      (snapshot) => computeAndCallback(snapshot, false),
      (error) => {
        const code = (error as any)?.code;
        if (code === "failed-precondition") {
          console.warn(
            "subscribeToLeadMonthlyTotalsAllSources: index absent/en cours de construction, on évite un fallback large pour économiser les reads"
          );
          callback({ mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 });
        } else if (code === "permission-denied") {
          console.warn(
            "subscribeToLeadMonthlyTotalsAllSources: accès refusé (auth/règles)",
            error
          );
          callback({ mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 });
        } else {
          console.error(
            "subscribeToLeadMonthlyTotalsAllSources: erreur snapshot",
            error
          );
          callback({ mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 });
        }
      }
    );
  };

  subscribePrimary();
  return () => {
    if (unsubscribe) unsubscribe();
  };
};

// ---- Recent sales feed ----
export type RecentLeadSale = {
  id: string;
  createdAt: Date | null;
  intituleOffre: string;
  typeOffre: string;
  origineLead?: "hipto" | "dolead" | "mm" | "";
  agent?: string; // createdBy.displayName
};

export const subscribeToRecentLeadSales = (
  maxCount: number,
  callback: (sales: RecentLeadSale[]) => void
) => {
  const q = query(
    collection(db, COLLECTION_PATH),
    where("mission", "==", missionFilter),
    orderBy("createdAt", "desc"),
    limit(Math.max(1, Math.min(maxCount || 10, 100)))
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: RecentLeadSale[] = snapshot.docs.map((doc) => {
        const data = doc.data() as any;
        const createdAt: Timestamp | null = data?.createdAt ?? null;
        const originRaw = (data?.origineLead || "").toString().toLowerCase();
        const origin: "hipto" | "dolead" | "mm" | "" =
          originRaw === "hipto" || originRaw === "dolead" || originRaw === "mm" ? (originRaw as any) : "";
        return {
          id: doc.id,
          createdAt: createdAt ? createdAt.toDate() : null,
          intituleOffre: data?.intituleOffre || "",
          typeOffre: data?.typeOffre || "",
          origineLead: origin,
          agent: data?.createdBy?.displayName || data?.createdBy?.email || "",
        };
      });
      callback(items);
    },
    (error) => {
      if ((error as any)?.code === "permission-denied") {
        console.warn("subscribeToRecentLeadSales: accès refusé (auth/règles)", error);
      } else if ((error as any)?.code === "failed-precondition") {
        console.warn(
          "subscribeToRecentLeadSales: index manquant, on évite un fallback large pour économiser les reads"
        );
        callback([]);
      } else {
        console.error("subscribeToRecentLeadSales: erreur snapshot", error);
      }
      callback([]);
    }
  );
};

export type LeadAgentSaleEntry = {
  id: string;
  createdAt: Date | null;
  intituleOffre: string;
  additionalOffers: string[];
  origineLead?: "hipto" | "dolead" | "mm" | "";
};

export const subscribeToLeadAgentSales = (
  userId: string,
  month: Date,
  callback: (sales: LeadAgentSaleEntry[]) => void
) => {
  const monthStart = startOfMonth(month);
  const monthEnd = startOfNextMonth(month);
  const primaryQuery = query(
    collection(db, COLLECTION_PATH),
    where("mission", "==", missionFilter),
    where("createdBy.userId", "==", userId),
    where("createdAt", ">=", Timestamp.fromDate(monthStart)),
    where("createdAt", "<", Timestamp.fromDate(monthEnd)),
    orderBy("createdAt", "desc")
  );
  let unsubscribe: (() => void) | null = null;

  const mapDoc = (doc: any): LeadAgentSaleEntry => {
    const data = doc.data() as any;
    const createdAt: Timestamp | null = data?.createdAt ?? null;
    const additionalOffers = Array.isArray(data?.additionalOffers)
      ? data.additionalOffers.map((offer: any) => offer?.intituleOffre || "")
      : [];
    const originRaw = (data?.origineLead || "").toString().toLowerCase();
    const origin: "hipto" | "dolead" | "mm" | "" =
      originRaw === "hipto" || originRaw === "dolead" || originRaw === "mm" ? (originRaw as any) : "";
    return {
      id: doc.id,
      createdAt: createdAt ? createdAt.toDate() : null,
      intituleOffre: data?.intituleOffre || "",
      additionalOffers,
      origineLead: origin,
    };
  };

  const subscribePrimary = () => {
    unsubscribe = onSnapshot(
      primaryQuery,
      (snapshot) => {
        const sales: LeadAgentSaleEntry[] = snapshot.docs.map(mapDoc);
        callback(sales);
      },
      (error) => {
        const code = (error as any)?.code;
        if (code === "failed-precondition") {
          console.warn("subscribeToLeadAgentSales: index absent/en cours de construction, on évite un fallback large pour économiser les reads");
          callback([]);
        } else if (code === "permission-denied") {
          console.warn("subscribeToLeadAgentSales: accès refusé (auth/règles)", error);
          callback([]);
        } else {
          console.error("subscribeToLeadAgentSales: erreur snapshot", error);
          callback([]);
        }
      }
    );
  };

  subscribePrimary();
  return () => {
    if (unsubscribe) unsubscribe();
  };
};
