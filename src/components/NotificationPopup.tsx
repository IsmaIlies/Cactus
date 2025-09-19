import React, { useEffect, useState } from "react";

type NotificationPopupProps = {
  message: string;
  onClose: () => void;
  userName?: string; // Ajouté pour recevoir le nom d'utilisateur
};

const NotificationPopup: React.FC<NotificationPopupProps> = ({ message, onClose, userName }) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    console.log("NotificationPopup props:", { message, userName }); // Log pour vérifier les props

    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300); // Wait for animation to finish before removing
    }, 300000); // Disparaît après 5 minutes

    return () => clearTimeout(timer);
  }, [onClose, message, userName]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "20px",
        right: "20px",
        backgroundColor: "#1e293b",
        color: "#f8fafc",
        padding: "20px 30px",
        borderRadius: "12px",
        boxShadow: "0 8px 20px rgba(0, 0, 0, 0.3)",
        zIndex: 1000,
        transition: "opacity 0.3s ease, transform 0.3s ease",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-20px)",
        fontFamily: "'Inter', sans-serif",
        fontSize: "15px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <button
        onClick={() => {
          setVisible(false);
          setTimeout(onClose, 300); // Wait for animation to finish before removing
        }}
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          background: "transparent",
          border: "none",
          color: "#f8fafc",
          fontSize: "20px",
          cursor: "pointer",
        }}
      >
        &times;
      </button>
      {userName && (
        <div style={{ fontWeight: "600", fontSize: "16px", color: "#38bdf8" }}>
          Vente réalisée par : {userName}
        </div>
      )}
      <div style={{ lineHeight: "1.6", fontSize: "14px" }}>{message}</div>
    </div>
  );
};

export default NotificationPopup;
