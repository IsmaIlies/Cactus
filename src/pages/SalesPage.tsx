// ... toutes les autres importations restent inchangées
import React, { useState, useEffect } from "react";
import LeadsSalesTable from "../leads/components/LeadsSalesTable";
import { db } from "../firebase";
import { useRegion } from '../contexts/RegionContext';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  doc,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";

// Statuts panier améliorés
export type BasketStatus =
  | "ATT"           // panier non consenti
  | "OK"            // panier consenti
  | "PROBLÈME IBAN" // manque d'IBAN sur SOFT
  | "ROAC"          // refus avant consentement
  | "Valid SOFT";   // panier validé soft

interface Sale {
  id: string;
  orderNumber: string;
  offer: string;
  basketStatus: BasketStatus;
  // Peut être un Timestamp Firestore, une Date ou une string héritée d’anciennes écritures
  date: Timestamp | Date | string;
  name: string;
  campaign?: string;
  clientFirstName?: string;
  clientLastName?: string;
  clientPhone?: string;
}

interface SaleFormData {
  orderNumber: string;
  offer: string;
  basketStatus: BasketStatus;
  campaign: string;
  clientFirstName: string;
  clientLastName: string;
  clientPhone: string;
}

const SalesPage = () => {
  // Permet de basculer l'onglet Ventes entre Canal+ (par défaut) et LEADS
  const [mode, setMode] = useState<'canal' | 'leads'>(() => {
    try { return (localStorage.getItem('salesMode') as 'canal' | 'leads') || 'canal'; } catch { return 'canal'; }
  });
  useEffect(() => { try { localStorage.setItem('salesMode', mode); } catch {} }, [mode]);
  const { region } = useRegion();
  const [formData, setFormData] = useState<SaleFormData>({
    orderNumber: "",
    offer: "",
    basketStatus: "ATT",
    campaign: "",
    clientFirstName: "",
    clientLastName: "",
    clientPhone: "",
  });

  const [sales, setSales] = useState<Sale[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<SaleFormData>({
    orderNumber: "",
    offer: "",
    basketStatus: "ATT",
    campaign: "",
    clientFirstName: "",
    clientLastName: "",
    clientPhone: "",
  });
  // Erreurs de validation pour téléphone (création / édition)
  const [phoneError, setPhoneError] = useState("");
  const [editPhoneError, setEditPhoneError] = useState("");

  const [sortField, setSortField] = useState<"date" | "name" | "offer">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // (Ancien code filtres supprimé car non utilisé : offers, consent, date range)

  // Filtre par mois et année
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const [clientQuery, setClientQuery] = useState("");

   const parseDate = (date: any) => {
    if (!date) return null;
    if (date.toDate) return date.toDate();
    if (typeof date === "string") return new Date(date);
    return null;
  };

  const offers = [
    { id: "canal", name: "CANAL+" },
    { id: "canal-cine-series", name: "CANAL+ Ciné Séries" },
    { id: "canal-sport", name: "CANAL+ Sport" },
    { id: "canal-100", name: "CANAL+ 100%" },
  ];

  useEffect(() => {
    const fetchSales = async () => {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return;
      // Filtrer par user + region active (si définie)
      const baseConstraints: any[] = [where("userId", "==", user.uid)];
      if (region) baseConstraints.push(where('region', '==', region));
      const q = query(collection(db, "sales"), ...baseConstraints);
      const querySnapshot = await getDocs(q);
      const userSales: Sale[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        // Fallback anciens docs sans region: si region active FR et doc sans region, on l'autorise (migration souple)
        if (region && data.region && data.region !== region) return;
        if (region === 'FR' && !data.region) {
          // On autorise l'affichage mais on pourrait planifier une migration ultérieure
        } else if (!data.region && region === 'CIV') {
          // Masquer anciens docs côté CIV
          return;
        }
        let rawDate: any = data.date;
        // Normalisation: objet {seconds, nanoseconds} -> Timestamp
        if (
          rawDate &&
          typeof rawDate === "object" &&
          'seconds' in rawDate &&
          'nanoseconds' in rawDate &&
          !(rawDate as any).toDate
        ) {
          try {
            rawDate = new Timestamp((rawDate as any).seconds, (rawDate as any).nanoseconds);
          } catch {
            rawDate = new Date();
          }
        }
        userSales.push({
          id: docSnap.id,
          orderNumber: data.orderNumber,
          offer: data.offer,
          // Normalisation: remappe l'ancien statut "VALID FINALE" vers "Valid SOFT"
          basketStatus: (data.basketStatus === 'VALID FINALE' ? 'Valid SOFT' : data.basketStatus) || "OK", // Par défaut : validé
          date: rawDate,
          
          name: data.name,
          campaign: data.campaign || "",
          clientFirstName: data.clientFirstName,
          clientLastName: data.clientLastName,
          clientPhone: data.clientPhone,
        });
      });
      setSales(userSales);
    };
    fetchSales();
  }, [region]);

  const formatSaleDate = (dLike: Sale["date"]) => {
    if (!dLike) return "-";
    // Timestamp Firestore
    // @ts-ignore
    if (dLike?.toDate) {
      try {
        // @ts-ignore
        return dLike.toDate().toLocaleDateString('fr-FR');
      } catch {
        return "-";
      }
    }
    if (typeof dLike === "string") {
      const d = new Date(dLike);
      return isNaN(d.getTime()) ? "-" : d.toLocaleDateString('fr-FR');
    }
    if (dLike instanceof Date) {
      return dLike.toLocaleDateString('fr-FR');
    }
    return "-";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      alert("Vous devez être connecté pour enregistrer une vente.");
      return;
    }

    // Validation stricte téléphone obligatoire
    const rawPhone = formData.clientPhone.trim();
    const phoneDigits = rawPhone.replace(/\D/g, "");
    if (!rawPhone) {
      setPhoneError("Le téléphone client est obligatoire.");
      return;
    }
    if (phoneDigits.length < 8) {
      setPhoneError("Numéro trop court (8 chiffres minimum).");
      return;
    }

    const newSale = {
      orderNumber: formData.orderNumber,
      offer: formData.offer,
  basketStatus: formData.basketStatus || "OK", // Par défaut : validé
      campaign: formData.campaign,
      clientFirstName: formData.clientFirstName.trim(),
      clientLastName: formData.clientLastName.trim(),
      clientPhone: rawPhone,
      date: Timestamp.fromDate(new Date()),
      userId: user.uid,
      name: user.displayName || "Utilisateur inconnu",
      region: region || 'FR',
    };

    try {
      const docRef = await addDoc(collection(db, "sales"), newSale);
      const savedSale = { id: docRef.id, ...newSale };
      setSales([savedSale, ...sales]);

      try {
        const sendSaleNotification = httpsCallable(
          getFunctions(undefined, "europe-west9"),
          "sendSaleNotification"
        );
        await sendSaleNotification({
          sale: { ...savedSale, userName: user.displayName || "Utilisateur inconnu" },
          isConsentUpdate: false,
        });
      } catch (error) {
        console.error("Erreur lors de l'appel de la fonction sendSaleNotification :", error);
      }

  setFormData({
        orderNumber: "",
        offer: "",
  basketStatus: "ATT",
        campaign: "",
        clientFirstName: "",
        clientLastName: "",
        clientPhone: "",
      });
  setPhoneError("");
    } catch (error) {
      console.error("Erreur lors de l’ajout de la vente : ", error);
    }
  };

  const handleEditSubmit = async (id: string) => {
    try {
      const saleDoc = doc(db, "sales", id);
      const originalSale = sales.find((s) => s.id === id);

      const rawPhone = editFormData.clientPhone.trim();
      const phoneDigits = rawPhone.replace(/\D/g, "");
      if (!rawPhone) {
        setEditPhoneError("Téléphone obligatoire.");
        return;
      }
      if (phoneDigits.length < 8) {
        setEditPhoneError("Numéro trop court (8 chiffres min).");
        return;
      }

  const updatePayload: any = {
        orderNumber: editFormData.orderNumber,
        offer: editFormData.offer,
  basketStatus: editFormData.basketStatus,
        campaign: editFormData.campaign,
        clientFirstName: editFormData.clientFirstName.trim(),
        clientLastName: editFormData.clientLastName.trim(),
        clientPhone: rawPhone,
      };
  // On ne permet pas le changement de région via édition (verrou business). Si besoin: ajouter ici.

  if (originalSale?.basketStatus === "ATT" && editFormData.basketStatus === "OK") {
        updatePayload.date = Timestamp.fromDate(new Date());
      }

      await updateDoc(saleDoc, updatePayload);

      setSales(
        sales.map((sale) =>
          sale.id === id
            ? {
                ...sale,
                ...editFormData,
                ...(updatePayload.date ? { date: updatePayload.date } : {}),
              }
            : sale
        )
      );
      setEditingId(null);
  setEditPhoneError("");

  if (originalSale?.basketStatus === "ATT" && editFormData.basketStatus === "OK") {
        const sendSaleNotification = httpsCallable(
          getFunctions(undefined, "europe-west9"),
          "sendSaleNotification"
        );
        await sendSaleNotification({
          sale: { ...originalSale, ...editFormData },
          isBasketStatusUpdate: true,
        });
      }
    } catch (error) {
      console.error("Erreur lors de la mise à jour : ", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer cette vente ?")) {
      try {
        await deleteDoc(doc(db, "sales", id));
        setSales(sales.filter((sale) => sale.id !== id));
      } catch (error) {
        console.error("Erreur lors de la suppression : ", error);
      }
    }
  };

  const handleEdit = (sale: Sale) => {
    setEditingId(sale.id);
    setEditFormData({
      orderNumber: sale.orderNumber,
      offer: sale.offer,
  basketStatus: sale.basketStatus,
      campaign: sale.campaign || "",
      clientFirstName: sale.clientFirstName || "",
      clientLastName: sale.clientLastName || "",
      clientPhone: sale.clientPhone || "",
    });
  };

  const handleEditCancel = () => {
    setEditingId(null);
  };


  const handleSort = (field: "date") => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const sortedSales = [...sales].sort((a, b) => {
    let aValue: any, bValue: any;
switch (sortField) {
      case "date":
        aValue = parseDate(a.date)?.getTime() || 0;
        bValue = parseDate(b.date)?.getTime() || 0;
        break;
      default:
        return 0;
    }

    if (sortDirection === "asc") {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  // On filtre puis on trie pour l'affichage (par période)
const timeFilteredSales = sortedSales.filter(sale => {
  const d = parseDate(sale.date);
  if (!d) return false;
  return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
});

// Filtre recherche client (nom / prénom / téléphone)
const normalizedQuery = clientQuery.trim().toLowerCase().replace(/\s+/g, "");
const filteredSales = normalizedQuery
  ? timeFilteredSales.filter(s => {
      const fn = (s.clientFirstName || "").toLowerCase();
      const ln = (s.clientLastName || "").toLowerCase();
      const full = (fn + ln).replace(/\s+/g, "");
      const phone = (s.clientPhone || "").replace(/\D/g, "");
      return (
        fn.includes(normalizedQuery) ||
        ln.includes(normalizedQuery) ||
        full.includes(normalizedQuery) ||
        phone.includes(normalizedQuery.replace(/\D/g, ""))
      );
    })
  : timeFilteredSales;

  const getSortIcon = (field: string) => {
    if (sortField !== field) return "↕️";
    return sortDirection === "asc" ? "↑" : "↓";
  };

  if (mode === 'leads') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          {/* Mobile smaller title, larger from md */}
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Ventes — LEADS</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Mode:</span>
            <select value={mode} onChange={e => setMode(e.target.value as any)} className="border rounded px-2 py-1 text-sm">
              <option value="canal">Canal+</option>
              <option value="leads">Leads</option>
            </select>
          </div>
        </div>
        <LeadsSalesTable />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Mode:</span>
          <select value={mode} onChange={e => setMode(e.target.value as any)} className="border rounded px-2 py-1 text-sm">
            <option value="canal">Canal+</option>
            <option value="leads">Leads</option>
          </select>
        </div>
      </div>
      <div className="max-w-2xl mx-auto">
        {/* Title resized for mobile readability */}
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-6">
          Nouvelle Vente
        </h1>

        <form
          onSubmit={handleSubmit}
          className="bg-gradient-to-br from-cactus-50 via-white to-cactus-100 rounded-xl shadow-none md:shadow-lg p-6 border border-cactus-200"
        >
          <div className="space-y-6">
            <div>
              <label htmlFor="campaign" className="block text-sm font-medium text-gray-700 mb-1">
                Campagne
              </label>
              <select
                id="campaign"
                value={formData.campaign}
                onChange={e => setFormData({ ...formData, campaign: e.target.value })}
                className="input-field"
                required
              >
                <option value="">Sélectionner une campagne</option>
                <option value="214">Campagne 214</option>
                <option value="210">Campagne 210</option>
                <option value="211">Campagne 211</option>
                  {/* <option value="autre">Autre</option> */}
              </select>
            </div>
            <div>
              <label
                htmlFor="orderNumber"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Numéro de panier
              </label>
              <input
                type="text"
                id="orderNumber"
                value={formData.orderNumber}
                onChange={(e) =>
                  setFormData({ ...formData, orderNumber: e.target.value })
                }
                className="input-field"
                required
              />
            </div>

            <div>
              <label
                htmlFor="offer"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Offre
              </label>
              <select
                id="offer"
                value={formData.offer}
                onChange={(e) =>
                  setFormData({ ...formData, offer: e.target.value })
                }
                className="input-field"
                required
              >
                <option value="">Sélectionner une offre</option>
                {offers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offer.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Statut Panier</label>
              <select
                name="basketStatus"
                value={formData.basketStatus}
                onChange={e => setFormData({ ...formData, basketStatus: e.target.value as BasketStatus })}
                className="input-field"
                required
              >
                <option value="ATT">En attente</option>
                <option value="OK">Validé</option>
                <option value="PROBLÈME IBAN">Problème IBAN</option>
                <option value="ROAC">ROAC</option>
                <option value="Valid SOFT">Valid SOFT</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prénom client</label>
              <input
                type="text"
                value={formData.clientFirstName}
                onChange={(e) => setFormData({ ...formData, clientFirstName: e.target.value })}
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 mt-4">Nom client</label>
              <input
                type="text"
                value={formData.clientLastName}
                onChange={(e) => setFormData({ ...formData, clientLastName: e.target.value })}
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 mt-4">Téléphone client</label>
              <input
                type="tel"
                value={formData.clientPhone}
                onChange={(e) => {
                  setFormData({ ...formData, clientPhone: e.target.value });
                  if (phoneError) setPhoneError("");
                }}
                className="input-field"
                required
                pattern="[0-9 +]{8,20}"
                title="Numéro de téléphone (8-20 chiffres ou +)"
              />
              {phoneError && (
                <p className="mt-1 text-xs text-red-600 font-medium">{phoneError}</p>
              )}
            </div>

            <button type="submit" className="w-full btn-primary">
              Enregistrer la vente
            </button>
          </div>
        </form>
      </div>

      {/* Filtre par mois et année */}
      <div className="max-w-2xl mx-auto">
        <div className="flex gap-4 mb-6 items-center">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mois</label>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="input-field"
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <option key={i} value={i}>{new Date(2000, i).toLocaleString('fr-FR', { month: 'long' })}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Année</label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="input-field"
            >
              {Array.from({ length: 5 }).map((_, i) => {
                const year = new Date().getFullYear() - i;
                return <option key={year} value={year}>{year}</option>;
              })}
            </select>
          </div>
        </div>
      </div>

      {/* Historique des ventes filtrées */}
      <div className="max-w-5xl mx-auto">
        {/* Smaller mobile subtitle */}
        <h2 className="text-lg md:text-xl font-semibold text-gray-900 mb-4">
          Ventes du mois sélectionné
        </h2>
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
          <input
            type="text"
            value={clientQuery}
            onChange={e => setClientQuery(e.target.value)}
            placeholder="Rechercher client (téléphone)"
            className="w-full md:max-w-sm border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cactus-500"
          />
          {clientQuery && (
            <button
              type="button"
              onClick={() => setClientQuery("")}
              className="text-xs px-3 py-2 rounded bg-gray-100 hover:bg-gray-200"
            >
              Réinitialiser
            </button>
          )}
          <div className="text-xs text-gray-500 ml-auto">
            {filteredSales.length} résultat{filteredSales.length > 1 ? 's' : ''}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-none md:shadow-sm border border-gray-100 overflow-x-auto">
          {/* Inner min-width wrapper to allow horizontal scroll <360px */}
          <div className="min-w-[360px]">
          <table className="min-w-full divide-y divide-gray-200 text-xs md:text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th onClick={() => handleSort("date")} className="px-3 md:px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none">Date {getSortIcon("date")}</th>
                <th className="px-3 md:px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Vendeur</th>
                <th className="px-2 py-2 text-center font-medium text-gray-500 uppercase tracking-wider w-10">C</th>
                <th className="px-3 md:px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Panier</th>
                <th className="px-3 md:px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Offre</th>
                <th className="px-3 md:px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Consent.</th>
                <th className="px-3 md:px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Client</th>
                <th className="px-3 md:px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredSales.map(sale => (
                <tr key={sale.id} className="hover:bg-cactus-50">
                  <td className="px-3 md:px-4 py-2 whitespace-nowrap text-gray-500">{formatSaleDate(sale.date)}</td>
                  <td className="px-3 md:px-4 py-2 whitespace-nowrap text-gray-900">{sale.name}</td>
                  <td className="px-2 py-2 text-center align-middle">
                    {sale.campaign === '214' ? (
                      <span className="inline-block px-1.5 py-0.5 rounded bg-green-50 text-green-700 text-[10px] font-semibold border border-green-100" title="Campagne 214">214</span>
                    ) : sale.campaign === '210' ? (
                      <span className="inline-block px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-semibold border border-blue-100" title="Campagne 210">210</span>
                    ) : null}
                  </td>
                  <td className="px-3 md:px-4 py-2 whitespace-nowrap max-w-[120px]">
                    {editingId === sale.id ? (
                      <input
                        type="text"
                        value={editFormData.orderNumber}
                        onChange={e => setEditFormData({ ...editFormData, orderNumber: e.target.value })}
                        className="input-field py-1 px-2 text-xs"
                      />
                    ) : (
                      <span className="text-gray-900 truncate block" title={sale.orderNumber}>{sale.orderNumber}</span>
                    )}
                  </td>
                  <td className="px-3 md:px-4 py-2 whitespace-nowrap">
                    {editingId === sale.id ? (
                      <select
                        value={editFormData.offer}
                        onChange={e => setEditFormData({ ...editFormData, offer: e.target.value })}
                        className="input-field py-1 px-2 text-xs"
                      >
                        {offers.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    ) : (
                      <span className="text-gray-500">{offers.find(o => o.id === sale.offer)?.name}</span>
                    )}
                  </td>
                  <td className="px-3 md:px-4 py-2 whitespace-nowrap">
                    {editingId === sale.id ? (
                      <select
                        value={editFormData.basketStatus}
                        onChange={e => setEditFormData({ ...editFormData, basketStatus: e.target.value as BasketStatus })}
                        className="input-field py-1 px-2 text-xs"
                      >
                        <option value="ATT">En attente</option>
                        <option value="OK">Validé</option>
                        <option value="PROBLÈME IBAN">Problème IBAN</option>
                        <option value="ROAC">ROAC</option>
                        <option value="Valid SOFT">Valid SOFT</option>
                      </select>
                    ) : (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        sale.basketStatus === 'OK' ? 'bg-green-100 text-green-700' :
                        sale.basketStatus === 'ATT' ? 'bg-yellow-100 text-yellow-700' :
                        sale.basketStatus === 'PROBLÈME IBAN' ? 'bg-red-100 text-red-700' :
                        sale.basketStatus === 'ROAC' ? 'bg-blue-100 text-blue-700' :
                        sale.basketStatus === 'Valid SOFT' ? 'bg-cactus-100 text-cactus-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {sale.basketStatus === 'OK' && <span className="mr-1 text-lg">✅</span>}
                        {sale.basketStatus === 'ATT' && <span className="mr-1">⏳</span>}
                        {sale.basketStatus === 'PROBLÈME IBAN' && <span className="mr-1">⚠️</span>}
                        {sale.basketStatus === 'ROAC' && <span className="mr-1">🔵</span>}
                        {sale.basketStatus === 'OK' && 'Validé'}
                        {sale.basketStatus === 'ATT' && 'En attente'}
                        {sale.basketStatus === 'PROBLÈME IBAN' && 'Problème IBAN'}
                        {sale.basketStatus === 'ROAC' && 'ROAC'}
                        {sale.basketStatus === 'Valid SOFT' && 'Valid SOFT'}
                        {!['OK','ATT','PROBLÈME IBAN','ROAC','Valid SOFT'].includes(sale.basketStatus) && sale.basketStatus}
                      </span>
                    )}
                  </td>
                  <td className="px-3 md:px-4 py-2 whitespace-nowrap">
                    {editingId === sale.id ? (
                      <div className="flex flex-col gap-1">
                        <input type="text" placeholder="Prénom" value={editFormData.clientFirstName} onChange={e => setEditFormData({ ...editFormData, clientFirstName: e.target.value })} className="input-field py-1 px-2 text-[10px]" />
                        <input type="text" placeholder="Nom" value={editFormData.clientLastName} onChange={e => setEditFormData({ ...editFormData, clientLastName: e.target.value })} className="input-field py-1 px-2 text-[10px]" />
                        <input
                          type="tel"
                          placeholder="Téléphone"
                          value={editFormData.clientPhone}
                          onChange={e => {
                            setEditFormData({ ...editFormData, clientPhone: e.target.value });
                            if (editPhoneError) setEditPhoneError("");
                          }}
                          className="input-field py-1 px-2 text-[10px]"
                        />
                        {editingId === sale.id && editPhoneError && (
                          <span className="text-[10px] text-red-600">{editPhoneError}</span>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10px] leading-tight">
                        <div className="font-semibold">{sale.clientFirstName} {sale.clientLastName}</div>
                        {sale.clientPhone && <div className="text-gray-500">{sale.clientPhone}</div>}
                      </div>
                    )}
                  </td>
                  <td className="px-3 md:px-4 py-2 whitespace-nowrap text-right">
                    {editingId === sale.id ? (
                      <div className="space-x-2">
                        <button onClick={() => handleEditSubmit(sale.id)} className="text-green-600 hover:text-green-800 text-xs">Sauver</button>
                        <button onClick={handleEditCancel} className="text-gray-500 hover:text-gray-700 text-xs">Annuler</button>
                      </div>
                    ) : (
                      <div className="space-x-2">
                        <button onClick={() => handleEdit(sale)} className="text-cactus-600 hover:text-cactus-900 text-xs">Éditer</button>
                        <button onClick={() => handleDelete(sale.id)} className="text-red-600 hover:text-red-800 text-xs">Suppr.</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filteredSales.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-xs text-gray-500">Aucun résultat</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesPage;
