// ... toutes les autres importations restent inchangées
import React, { useState, useEffect } from "react";
import { db } from "../firebase";
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

interface Sale {
  id: string;
  orderNumber: string;
  offer: string;
  consent: "yes" | "pending";
  date: Timestamp;
  name: string;
  campaign?: string;
}

interface SaleFormData {
  orderNumber: string;
  offer: string;
  consent: "yes" | "pending";
  campaign: string;
}

const SalesPage = () => {
  const [formData, setFormData] = useState<SaleFormData>({
    orderNumber: "",
    offer: "",
    consent: "pending",
    campaign: "",
  });

  const [sales, setSales] = useState<Sale[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<SaleFormData>({
    orderNumber: "",
    offer: "",
    consent: "pending",
    campaign: "",
  });

  const [sortField, setSortField] = useState<"date" | "name" | "offer">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

    // Filtres
  const [selectedOffers, setSelectedOffers] = useState<string[]>([]);
  const [selectedConsent, setSelectedConsent] = useState<string[]>(["yes"]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

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

      if (user) {
        const q = query(
          collection(db, "sales"),
          where("userId", "==", user.uid)
        );

        const querySnapshot = await getDocs(q);
        const userSales: Sale[] = [];
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          userSales.push({
            id: docSnap.id,
            orderNumber: data.orderNumber,
            offer: data.offer,
            consent: data.consent,
            date: data.date,
            name: data.name,
            campaign: data.campaign || "",
          });
        });

        setSales(userSales);
      }
    };

    fetchSales();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      alert("Vous devez être connecté pour enregistrer une vente.");
      return;
    }

    const newSale = {
      orderNumber: formData.orderNumber,
      offer: formData.offer,
      consent: formData.consent,
      campaign: formData.campaign,
      date: Timestamp.fromDate(new Date()),
      userId: user.uid,
      name: user.displayName || "Utilisateur inconnu",
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
        await sendSaleNotification({ sale: savedSale, isConsentUpdate: false });
      } catch (error) {
        console.error("Erreur lors de l'appel de la fonction sendSaleNotification :", error);
      }

      setFormData({ orderNumber: "", offer: "", consent: "pending", campaign: "" });
    } catch (error) {
      console.error("Erreur lors de l’ajout de la vente : ", error);
    }
  };

  const handleEditSubmit = async (id: string) => {
    try {
      const saleDoc = doc(db, "sales", id);
      const originalSale = sales.find((s) => s.id === id);

      const updatePayload: any = {
        orderNumber: editFormData.orderNumber,
        offer: editFormData.offer,
        consent: editFormData.consent,
        campaign: editFormData.campaign,
      };

      if (originalSale?.consent === "pending" && editFormData.consent === "yes") {
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

      if (originalSale?.consent === "pending" && editFormData.consent === "yes") {
        const sendSaleNotification = httpsCallable(
          getFunctions(undefined, "europe-west9"),
          "sendSaleNotification"
        );
        await sendSaleNotification({
          sale: { ...originalSale, ...editFormData },
          isConsentUpdate: true,
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
      consent: sale.consent,
      campaign: sale.campaign || "",
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

  const getSortIcon = (field: string) => {
    if (sortField !== field) return "↕️";
    return sortDirection === "asc" ? "↑" : "↓";
  };

  return (
    <div className="space-y-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Nouvelle Vente
        </h1>

        <form
          onSubmit={handleSubmit}
          className="bg-gradient-to-br from-cactus-50 via-white to-cactus-100 rounded-xl shadow-lg p-6 border border-cactus-200"
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
                  {/* <option value="autre">Autre</option> */}
              </select>
            </div>
            <div>
              <label
                htmlFor="orderNumber"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Numéro de commande
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Consentement
              </label>
              <div className="space-x-4">
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    name="consent"
                    value="yes"
                    checked={formData.consent === "yes"}
                    onChange={() =>
                      setFormData({
                        ...formData,
                        consent: "yes",
                      })
                    }
                    className="form-radio text-cactus-600 focus:ring-cactus-500"
                  />
                  <span className="ml-2">Oui</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    name="consent"
                    value="pending"
                    checked={formData.consent === "pending"}
                    onChange={() =>
                      setFormData({
                        ...formData,
                        consent: "pending",
                      })
                    }
                    className="form-radio text-cactus-600 focus:ring-cactus-500"
                  />
                  <span className="ml-2">En attente</span>
                </label>
              </div>
            </div>

            <button type="submit" className="w-full btn-primary">
              Enregistrer la vente
            </button>
          </div>
        </form>
      </div>

      {/* Historique des ventes */}
      <div className="max-w-5xl mx-auto">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Historique des ventes
        </h2>
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th 
                onClick={() => handleSort("date")}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date {getSortIcon("date")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nom</th>
                <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12">C</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">N° Commande</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Offre</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Consentement</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedSales.map((sale) => (
                <tr key={sale.id} className="hover:bg-cactus-50 transition">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {sale.date.toDate().toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {sale.name}
                  </td>
                  <td className="px-2 py-4 whitespace-nowrap text-center align-middle">
                    {sale.campaign === "214" ? (
                      <span className="inline-block px-2 py-0.5 rounded bg-green-50 text-green-700 text-xs font-semibold border border-green-100" title="Campagne 214">214</span>
                    ) : sale.campaign === "210" ? (
                      <span className="inline-block px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-100" title="Campagne 210">210</span>
                    ) : null}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingId === sale.id ? (
                      <input
                        type="text"
                        value={editFormData.orderNumber}
                        onChange={(e) =>
                          setEditFormData({
                            ...editFormData,
                            orderNumber: e.target.value,
                          })
                        }
                        className="input-field py-1 px-2 text-sm"
                      />
                    ) : (
                      <span className="text-sm font-medium text-gray-900">
                        {sale.orderNumber}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingId === sale.id ? (
                      <select
                        value={editFormData.offer}
                        onChange={(e) =>
                          setEditFormData({
                            ...editFormData,
                            offer: e.target.value,
                          })
                        }
                        className="input-field py-1 px-2 text-sm"
                      >
                        {offers.map((offer) => (
                          <option key={offer.id} value={offer.id}>
                            {offer.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sm text-gray-500">
                        {offers.find((o) => o.id === sale.offer)?.name}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingId === sale.id ? (
                      <div className="space-x-4">
                        <label className="inline-flex items-center">
                          <input
                            type="radio"
                            name={`consent-${sale.id}`}
                            value="yes"
                            checked={editFormData.consent === "yes"}
                            onChange={() =>
                              setEditFormData({
                                ...editFormData,
                                consent: "yes",
                              })
                            }
                            className="form-radio text-cactus-600 focus:ring-cactus-500"
                          />
                          <span className="ml-2 text-sm">Oui</span>
                        </label>
                        <label className="inline-flex items-center">
                          <input
                            type="radio"
                            name={`consent-${sale.id}`}
                            value="pending"
                            checked={editFormData.consent === "pending"}
                            onChange={() =>
                              setEditFormData({
                                ...editFormData,
                                consent: "pending",
                              })
                            }
                            className="form-radio text-cactus-600 focus:ring-cactus-500"
                          />
                          <span className="ml-2 text-sm">En attente</span>
                        </label>
                      </div>
                    ) : (
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          sale.consent === "yes"
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {sale.consent === "yes" ? "Oui" : "En attente"}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {editingId === sale.id ? (
                      <div className="space-x-2">
                        <button
                          onClick={() => handleEditSubmit(sale.id)}
                          className="text-green-600 hover:text-green-900"
                        >
                          Sauvegarder
                        </button>
                        <button
                          onClick={handleEditCancel}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <div className="space-x-2">
                        <button
                          onClick={() => handleEdit(sale)}
                          className="text-cactus-600 hover:text-cactus-900"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => handleDelete(sale.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Supprimer
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-4 text-center text-sm text-gray-500"
                  >
                    Aucune vente enregistrée
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SalesPage;
