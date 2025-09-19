import React from "react";
import NotificationPopup from "./NotificationPopup";

// Define the type for notifications
interface Notification {
  message: string;
  type: "sale" | "message" | "objective";
  userName?: string; // Added userName as an optional property
}

// Define props type for NotificationSystem
interface NotificationSystemProps {
  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
}

const NotificationSystem = ({
  notifications,
  setNotifications,
}: NotificationSystemProps) => {
  // Group notifications by type and user, and count them
  const groupedNotifications = notifications
    .filter((notification) => notification.type === "sale") // Conserver uniquement les notifications de ventes
    .reduce<Record<string, { count: number; message: string; userName?: string }>>(
      (acc, notification) => {
        const key = notification.type + (notification.userName || "");
        if (acc[key]) {
          acc[key].count += 1;
        } else {
          acc[key] = { count: 1, message: notification.message, userName: notification.userName };
        }
        return acc;
      },
      {}
    );

  return (
    <>
      {Object.entries(groupedNotifications).map(
        ([key, { count, message, userName }]) => (
          <NotificationPopup
            key={key}
            message={`${message}${count > 1 ? ` (${count})` : ""}`}
            userName={userName}
            onClose={() => {
              setNotifications((prev) =>
                prev.filter(
                  (n) => n.type + (n.userName || "") !== key
                )
              );
            }}
          />
        )
      )}
    </>
  );
};

export default NotificationSystem;