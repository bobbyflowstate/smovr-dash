"use client";

import { useEffect, useState, useRef } from "react";
import { LOG_ACTIONS, type LogAction } from "@/lib/log-actions";

export type AppointmentStatus = "loading" | "success" | "error" | "not-found" | "passed";

export function useAppointmentAction(appointmentId: string | undefined, action: LogAction) {
  const [status, setStatus] = useState<AppointmentStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [contactPhone, setContactPhone] = useState<string | undefined>(undefined);
  const hasLogged = useRef(false);

  useEffect(() => {
    const checkAndLogAction = async () => {
      // Prevent duplicate logging in StrictMode
      if (hasLogged.current || !appointmentId) return;
      hasLogged.current = true;

      try {
        // Attempt to log the action - server will check if appointment exists and hasn't passed
        const response = await fetch("/api/logs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            appointmentId,
            action,
          }),
        });

        const responseData: any = await response.json().catch(() => ({}));
        if (responseData?.contactPhone) {
          setContactPhone(responseData.contactPhone);
        }

        if (response.status === 404) {
          setStatus("not-found");
          return;
        }

        if (response.status === 410) {
          // 410 Gone - appointment has passed
          setStatus("passed");
          return;
        }

        if (!response.ok) {
          // Other errors (500, network failures, etc.) should throw to be caught below
          throw new Error(responseData?.error || `Failed to log action: ${response.status}`);
        }

        setStatus("success");
      } catch (error) {
        console.error("Error logging action:", error);
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Unknown error");
      }
    };

    checkAndLogAction();
  }, [appointmentId, action]);

  return { status, errorMessage, contactPhone };
}



