"use client";

import { useParams } from "next/navigation";
import { AUDIT_LOG_ACTIONS } from "@/lib/audit-log-actions";
import { useAppointmentAction } from "@/lib/use-appointment-action";
import AppointmentStatusCard from "@/components/AppointmentStatusCard";

export default function RescheduleCancelPage() {
  const params = useParams();
  const appointmentId = params.appointmentId as string;
  const { status, errorMessage, contactPhone, languageMode } = useAppointmentAction(
    appointmentId,
    AUDIT_LOG_ACTIONS.RESCHEDULE_CANCEL,
  );
  const isEnglishOnly = languageMode === "en";

  return (
    <AppointmentStatusCard
      status={status}
      languageMode={languageMode}
      errorMessage={errorMessage}
      successTitle={isEnglishOnly ? "Need to Reschedule?" : "Need to Reschedule? / ¿Necesita reprogramar?"}
      successMessage={isEnglishOnly ? "Please call us at" : "Please call us at / Por favor llámenos al"}
      successSubtext={
        isEnglishOnly
          ? "Your provider has been notified of your request to reschedule or cancel."
          : "Your provider has been notified of your request to reschedule or cancel. / Su proveedor ha sido notificado de su solicitud para reprogramar o cancelar."
      }
      showPhoneNumber={true}
      phoneNumber={contactPhone}
    />
  );
}
