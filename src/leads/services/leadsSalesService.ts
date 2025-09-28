import {
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  where,
  Timestamp,
  orderBy,
} from "firebase/firestore";
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
  const baseCategory = categorize(payload.typeOffre);
  const mobileCount = baseCategory.mobile;
  const boxCount = baseCategory.internet;
  const mobileSoshCount = baseCategory.mobileSosh;
  const internetSoshCount = baseCategory.internetSosh;

  const docRef = collection(db, COLLECTION_PATH);
  await addDoc(docRef, {
    ...payload,
    additionalOffers: payload.additionalOffers,
    dateTechnicien: payload.dateTechnicien ?? null,
    telephone: payload.telephone,
    mission: missionFilter,
    mobileCount,
    boxCount,
    mobileSoshCount,
    internetSoshCount,
    createdAt: serverTimestamp(),
    createdBy: payload.createdBy || null,
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
  return onSnapshot(q, (snapshot) => {
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
      const origin = (data?.origineLead || "").toLowerCase();
      if (origin === "hipto" || origin === "dolead" || origin === "mm") {
        const cat = categorize(data?.typeOffre);
        aggregated[origin].mobiles += cat.mobile + cat.mobileSosh;
        aggregated[origin].box += cat.internet + cat.internetSosh;
        aggregated[origin].mobileSosh += cat.mobileSosh;
        aggregated[origin].internetSosh += cat.internetSosh;
      }
    });

    callback(aggregated);
  });
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

  return onSnapshot(q, (snapshot) => {
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
  });
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
  const q = query(
    collection(db, COLLECTION_PATH),
    where("mission", "==", missionFilter),
    where("createdBy.userId", "==", userId),
    where("createdAt", ">=", Timestamp.fromDate(monthStart)),
    where("createdAt", "<", Timestamp.fromDate(monthEnd)),
    orderBy("createdAt", "asc")
  );

  return onSnapshot(q, (snapshot) => {
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
  });
};

export type LeadAgentSaleEntry = {
  id: string;
  createdAt: Date | null;
  intituleOffre: string;
  additionalOffers: string[];
};

export const subscribeToLeadAgentSales = (
  userId: string,
  month: Date,
  callback: (sales: LeadAgentSaleEntry[]) => void
) => {
  const monthStart = startOfMonth(month);
  const monthEnd = startOfNextMonth(month);
  const q = query(
    collection(db, COLLECTION_PATH),
    where("mission", "==", missionFilter),
    where("createdBy.userId", "==", userId),
    where("createdAt", ">=", Timestamp.fromDate(monthStart)),
    where("createdAt", "<", Timestamp.fromDate(monthEnd)),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const sales: LeadAgentSaleEntry[] = snapshot.docs.map((doc) => {
      const data = doc.data() as any;
      const createdAt: Timestamp | null = data?.createdAt ?? null;
      const additionalOffers = Array.isArray(data?.additionalOffers)
        ? data.additionalOffers.map((offer: any) => offer?.intituleOffre || "")
        : [];
      return {
        id: doc.id,
        createdAt: createdAt ? createdAt.toDate() : null,
        intituleOffre: data?.intituleOffre || "",
        additionalOffers,
      };
    });

    callback(sales);
  });
};
