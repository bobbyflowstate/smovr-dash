"use client";

import { useParams } from "next/navigation";
import { LOG_ACTIONS } from "@/lib/log-actions";
import { useAppointmentAction } from "@/lib/use-appointment-action";
import AppointmentStatusCard from "@/components/AppointmentStatusCard";

export default function RescheduleCancelPage() {
  const params = useParams();
  const appointmentId = params.appointmentId as string;
  const { status, errorMessage, contactPhone } = useAppointmentAction(appointmentId, LOG_ACTIONS.RESCHEDULE_CANCEL);

  return (
    <AppointmentStatusCard
      status={status}
      errorMessage={errorMessage}
      successTitle="Need to Reschedule? / ¿Necesita reprogramar?"
      successMessage="Please call us at / Por favor llámenos al"
      successSubtext="Your provider has been notified of your request to reschedule or cancel. / Su proveedor ha sido notificado de su solicitud para reprogramar o cancelar."
      showPhoneNumber={true}
      phoneNumber={contactPhone}
    />
  );
}

