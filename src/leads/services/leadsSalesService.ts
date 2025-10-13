import {
  collection,
  onSnapshot,
  query,
  where,
  Timestamp,
  orderBy,
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
  additionalOffers: Array<Pick<AdditionalOffer, "intituleOffre" | "referencePanier">>;
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
  const type = (typeOffre || "").trim().toLowerCase();
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
};

export type LeadKpiSnapshot = {
  hipto: { mobiles: number; box: number; mobileSosh: number; internetSosh: number };
  dolead: { mobiles: number; box: number; mobileSosh: number; internetSosh: number };
  mm: { mobiles: number; box: number; mobileSosh: number; internetSosh: number };
};

export const subscribeToLeadKpis = (callback: (data: LeadKpiSnapshot) => void) => {
  const todayStart = startOfDay(new Date());
  const q = query(collection(db, COLLECTION_PATH), where("mission", "==", missionFilter));
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
        const createdAt: Timestamp | null = data?.createdAt ?? null;
        if (!createdAt) return;
        const createdDate = createdAt.toDate();
        if (createdDate < todayStart) return;
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

  return onSnapshot(
    q,
    (snapshot) => {
      const map = new Map<string, { mobiles: number; box: number }>();
      snapshot.forEach((doc) => {
        const data = doc.data() as any;
        const createdAt: Timestamp | null = data?.createdAt ?? null;
        if (!createdAt) return;
        const key = formatDateKey(createdAt.toDate());
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
    },
    (error) => {
      if ((error as any)?.code === "permission-denied") {
        console.warn("subscribeToLeadMonthlySeries: accès refusé (auth/règles)", error);
      } else {
        console.error("subscribeToLeadMonthlySeries: erreur snapshot", error);
      }
      callback([]);
    }
  );
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
          console.warn("subscribeToLeadAgentSummary: index absent/en cours de construction, fallback sans filtre de date");
          // Fallback without date range/order to avoid composite index requirement
          try { unsubscribe && unsubscribe(); } catch {}
          const fbQuery = query(
            collection(db, COLLECTION_PATH),
            where("mission", "==", missionFilter),
            where("createdBy.userId", "==", userId)
          );
          unsubscribe = onSnapshot(
            fbQuery,
            (snap) => computeAndCallback(snap),
            (err2) => {
              if ((err2 as any)?.code === "permission-denied") {
                console.warn("subscribeToLeadAgentSummary (fallback): accès refusé (auth/règles)", err2);
              } else {
                console.error("subscribeToLeadAgentSummary (fallback): erreur snapshot", err2);
              }
              callback({ mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 });
            }
          );
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
          console.warn("subscribeToLeadAgentSales: index absent/en cours de construction, fallback sans filtre de date");
          try { unsubscribe && unsubscribe(); } catch {}
          const fbQuery = query(
            collection(db, COLLECTION_PATH),
            where("mission", "==", missionFilter),
            where("createdBy.userId", "==", userId)
          );
          unsubscribe = onSnapshot(
            fbQuery,
            (snap) => {
              // Filter by month and sort desc client-side
              const items = snap.docs
                .map(mapDoc)
                .filter((d) => d.createdAt && d.createdAt >= monthStart && d.createdAt < monthEnd)
                .sort((a, b) => {
                  const ta = a.createdAt ? a.createdAt.getTime() : 0;
                  const tb = b.createdAt ? b.createdAt.getTime() : 0;
                  return tb - ta;
                });
              callback(items);
            },
            (err2) => {
              if ((err2 as any)?.code === "permission-denied") {
                console.warn("subscribeToLeadAgentSales (fallback): accès refusé (auth/règles)", err2);
              } else {
                console.error("subscribeToLeadAgentSales (fallback): erreur snapshot", err2);
              }
              callback([]);
            }
          );
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
