import React, { useState } from "react";

const offers = [
  {
    title: "CANAL+",
  img: "/Offre canal +.png",
    alt: "Offre Canal+"
  },
  {
    title: "CANAL+ CINÉ SERIES",
  img: "/Offre canal+ ciné series.png",
    alt: "Offre Canal+ Ciné Séries"
  },
  {
    title: "CANAL+ SPORT",
  img: "/Offre canal+ sport.png",
    alt: "Offre Canal+ Sport"
  },
  {
    title: "100% CANAL+",
  // % in filename must be encoded in URL, otherwise request may break
  img: "/Offre canal+ 100%25.png",
    alt: "Offre 100% Canal+"
  }
];

const OffersPage = () => {
  const [zoomedImg, setZoomedImg] = useState<string | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {offers.map((offer, idx) => (
          <div key={idx} className="bg-white rounded-lg shadow p-4 flex flex-col items-center">
            <h2 className="text-xl font-bold mb-4 text-center">{offer.title}</h2>
            <img
              src={offer.img}
              alt={offer.alt}
              className="w-full h-auto rounded cursor-pointer transition-transform hover:scale-105"
              onClick={() => setZoomedImg(offer.img)}
            />
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
          />
        </div>
      )}
    </>
  );
};

export default OffersPage;
