import { useState } from "react";

// Use WebP by default with PNG fallback (files converted in /public by a script)
const offers = [
  {
    title: "CANAL+",
    webp: "/offre-canal-plus.webp",
    png: "/Offre canal +.png",
    alt: "Offre Canal+",
  },
  {
    title: "CANAL+ CINÉ SERIES",
    webp: "/offre-canal-plus-cine-series.webp",
    png: "/Offre canal+ ciné series.png",
    alt: "Offre Canal+ Ciné Séries",
  },
  {
    title: "CANAL+ SPORT",
    webp: "/offre-canal-plus-sport.webp",
    png: "/Offre canal+ sport.png",
    alt: "Offre Canal+ Sport",
  },
  {
    title: "100% CANAL+",
    webp: "/offre-100-canal-plus.webp",
    // PNG (optionnel) à déposer dans /public si besoin
    png: "/100% CANAL+.png",
    // En cas d'absence de PNG, on retombe sur le WebP existant
    fallback: "/offre-100-canal-plus.webp",
    alt: "Offre 100% Canal+",
  },
];

const OffersPage = () => {
  const [zoomedImg, setZoomedImg] = useState<string | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {offers.map((offer, idx) => (
          <div key={idx} className="bg-white rounded-lg shadow p-4 flex flex-col items-center">
            <h2 className="text-xl font-bold mb-4 text-center text-black !text-black">{offer.title}</h2>
            <picture>
              <source srcSet={offer.webp} type="image/webp" />
              <img
                src={offer.png}
                alt={offer.alt}
                className="w-full h-auto rounded cursor-pointer transition-transform hover:scale-105"
                onClick={() => setZoomedImg((offer as any).webp || offer.png)}
                loading="lazy"
                onError={(e) => {
                  const f = (offer as any).fallback as string | undefined;
                  if (f) {
                    e.currentTarget.onerror = null as any;
                    e.currentTarget.src = f;
                  }
                }}
              />
            </picture>
          </div>
        ))}
      </div>
      {zoomedImg && (
        <div
          className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50"
          style={{ cursor: 'default' }}
          onClick={() => setZoomedImg(null)}
        >
          <img
            src={zoomedImg}
            alt="Zoom Canal+"
            className="max-w-full max-h-full rounded-lg shadow-lg border-4 border-white"
            style={{ cursor: 'default' }}
            loading="eager"
          />
        </div>
      )}
    </>
  );
};

export default OffersPage;
