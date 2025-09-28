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

export const saveLeadSale = async (payload: LeadSaleInput) => {
  const normalizedType = payload.typeOffre.toLowerCase();
  const mobileCount = normalizedType.includes("mobile") ? 1 : 0;
  const boxCount = normalizedType.includes("internet") ? 1 : 0;

  const docRef = collection(db, COLLECTION_PATH);
  await addDoc(docRef, {
    ...payload,
    additionalOffers: payload.additionalOffers,
    dateTechnicien: payload.dateTechnicien ?? null,
    telephone: payload.telephone,
    mission: missionFilter,
    mobileCount,
    boxCount,
    createdAt: serverTimestamp(),
    createdBy: payload.createdBy || null,
  });
};

export type LeadKpiSnapshot = {
  hipto: { mobiles: number; box: number };
  dolead: { mobiles: number; box: number };
  mm: { mobiles: number; box: number };
};

export const subscribeToLeadKpis = (callback: (data: LeadKpiSnapshot) => void) => {
  const todayStart = startOfDay(new Date());
  const q = query(collection(db, COLLECTION_PATH), where("mission", "==", missionFilter));
  return onSnapshot(q, (snapshot) => {
    const aggregated: LeadKpiSnapshot = {
      hipto: { mobiles: 0, box: 0 },
      dolead: { mobiles: 0, box: 0 },
      mm: { mobiles: 0, box: 0 },
    };

    snapshot.forEach((doc) => {
      const data = doc.data() as any;
      const createdAt: Timestamp | null = data?.createdAt ?? null;
      if (!createdAt) return;
      const createdDate = createdAt.toDate();
      if (createdDate < todayStart) return;
      const origin = (data?.origineLead || "").toLowerCase();
      if (origin === "hipto" || origin === "dolead" || origin === "mm") {
        aggregated[origin].mobiles += Number(data?.mobileCount || 0);
        aggregated[origin].box += Number(data?.boxCount || 0);
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
      bucket.mobiles += Number(data?.mobileCount || 0);
      bucket.box += Number(data?.boxCount || 0);
      map.set(key, bucket);
    });

    const series = Array.from(map.entries())
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .map(([date, value]) => ({ date, ...value }));

    callback(series);
  });
};
