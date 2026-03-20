"use client";

import { useParams } from "next/navigation";
import { AUDIT_LOG_ACTIONS } from "@/lib/audit-log-actions";
import { useAppointmentAction } from "@/lib/use-appointment-action";
import AppointmentStatusCard from "@/components/AppointmentStatusCard";

export default function FifteenMinutesLatePage() {
  const params = useParams();
  const appointmentId = params.appointmentId as string;
  const { status, errorMessage, languageMode } = useAppointmentAction(
    appointmentId,
    AUDIT_LOG_ACTIONS.FIFTEEN_LATE,
  );
  const isEnglishOnly = languageMode === "en";

  return (
    <AppointmentStatusCard
      status={status}
      languageMode={languageMode}
      errorMessage={errorMessage}
      successSubtext={
        isEnglishOnly
          ? "Your provider has been notified that you're running 15 minutes late."
          : "Your provider has been notified that you're running 15 minutes late. / Su proveedor ha sido notificado de que llegará 15 minutos tarde."
      }
    />
  );
}
