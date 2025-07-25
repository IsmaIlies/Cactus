import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface AccessibilityContextType {
  isDarkMode: boolean;
  setIsDarkMode: (v: boolean) => void;
  fontSize: number;
  setFontSize: (v: number) => void;
  highContrast: boolean;
  setHighContrast: (v: boolean) => void;
}

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

export const AccessibilityProvider = ({ children }: { children: ReactNode }) => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem("isDarkMode") === "true";
  });
  const [fontSize, setFontSize] = useState(() => {
    const stored = localStorage.getItem("fontSize");
    return stored ? parseInt(stored) : 16;
  });
  const [highContrast, setHighContrast] = useState(() => {
    return localStorage.getItem("highContrast") === "true";
  });

  useEffect(() => {
    document.body.classList.toggle("dark", isDarkMode);
    document.body.classList.toggle("high-contrast", highContrast);
    document.body.style.fontSize = fontSize + "px";
    localStorage.setItem("isDarkMode", String(isDarkMode));
    localStorage.setItem("fontSize", String(fontSize));
    localStorage.setItem("highContrast", String(highContrast));
  }, [isDarkMode, fontSize, highContrast]);

  return (
    <AccessibilityContext.Provider value={{ isDarkMode, setIsDarkMode, fontSize, setFontSize, highContrast, setHighContrast }}>
      {children}
    </AccessibilityContext.Provider>
  );
};

export const useAccessibility = () => {
  const context = useContext(AccessibilityContext);
  if (!context) throw new Error("useAccessibility must be used within AccessibilityProvider");
  return context;
};
