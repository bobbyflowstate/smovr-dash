"use client";

import { useParams } from "next/navigation";
import { LOG_ACTIONS } from "@/lib/log-actions";
import { useAppointmentAction } from "@/lib/use-appointment-action";
import AppointmentStatusCard from "@/components/AppointmentStatusCard";

export default function ThirtyMinutesLatePage() {
  const params = useParams();
  const appointmentId = params.appointmentId as string;
  const { status, errorMessage } = useAppointmentAction(appointmentId, LOG_ACTIONS.THIRTY_LATE);

  return (
    <AppointmentStatusCard
      status={status}
      errorMessage={errorMessage}
      successSubtext="Your provider has been notified that you're running 30 minutes late. / Su proveedor ha sido notificado de que llegará 30 minutos tarde."
    />
  );
}

