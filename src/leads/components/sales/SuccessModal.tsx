import React from "react";

type SuccessModalProps = {
  open: boolean;
  onClose: () => void;
  onNewSale: () => void;
};

const SuccessModal: React.FC<SuccessModalProps> = ({ open, onClose, onNewSale }) => {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      const t = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(t);
    }
    setMounted(false);
    return undefined;
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        className={`w-full max-w-md transform rounded-2xl bg-white p-6 text-center shadow-xl transition-all duration-200 ease-out ${
          mounted ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
          <span className="text-3xl">✨</span>
        </div>
        <h3 className="mt-4 text-2xl font-semibold text-[#002FA7]">Bravo pour la vente !</h3>
        <p className="mt-2 text-sm text-gray-600">
          Rendez-vous dans quelques instants pour la prochaine 😉
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={onNewSale}
            className="w-full sm:w-auto rounded-md bg-[#002FA7] px-4 py-2 text-white shadow hover:bg-[#00208f] transition"
          >
            Nouvelle vente
          </button>
          <button
            onClick={onClose}
            className="w-full sm:w-auto rounded-md bg-gray-100 px-4 py-2 text-gray-800 hover:bg-gray-200 transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuccessModal;
