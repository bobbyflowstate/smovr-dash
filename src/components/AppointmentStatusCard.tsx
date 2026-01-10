"use client";

import { AppointmentStatus } from "@/lib/use-appointment-action";

interface AppointmentStatusCardProps {
  status: AppointmentStatus;
  errorMessage?: string;
  successTitle?: string;
  successMessage?: string; // Can be bilingual (e.g., "English / Spanish") or just English
  successSubtext?: string;
  showPhoneNumber?: boolean;
}

export default function AppointmentStatusCard({
  status,
  errorMessage,
  successTitle = "No worries! / ¡No se preocupe!",
  successMessage = "We'll be waiting for you. / Lo estaremos esperando.",
  successSubtext,
  showPhoneNumber = false,
}: AppointmentStatusCardProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center transition-colors">
        {status === "loading" && (
          <>
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
              <svg
                className="w-8 h-8 text-blue-600 dark:text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Processing... / Procesando...
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Please wait while we record your status.
            </p>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Por favor espere mientras registramos su estado.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <div className={`w-16 h-16 ${showPhoneNumber ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-green-100 dark:bg-green-900/30'} rounded-full flex items-center justify-center mx-auto mb-6`}>
              {showPhoneNumber ? (
                <svg
                  className="w-8 h-8 text-blue-600 dark:text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-8 h-8 text-green-600 dark:text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              {successTitle}
            </h1>
            {successMessage && (
              <>
                <p className="text-lg text-gray-700 dark:text-gray-300 mb-2">
                  {successMessage.split(' / ')[0]}
                </p>
                {successMessage.includes(' / ') && (
                  <p className="text-lg text-gray-700 dark:text-gray-300 mb-2">
                    {successMessage.split(' / ')[1]}
                  </p>
                )}
              </>
            )}
            {showPhoneNumber && (
              <>
                <a
                  href="tel:+15551234567"
                  className="inline-block text-3xl font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors mb-6"
                >
                  (555) 123-4567
                </a>
              </>
            )}
            {successSubtext && (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  {successSubtext}
                </p>
              </>
            )}
          </>
        )}

        {status === "not-found" && (
          <>
            <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-8 h-8 text-yellow-600 dark:text-yellow-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Appointment Not Found / Cita no encontrada
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-2">
              We couldn&apos;t find this appointment. Please check the link or contact your provider.
            </p>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              No pudimos encontrar esta cita. Por favor verifique el enlace o contacte a su proveedor.
            </p>
            {showPhoneNumber && (
              <>
                <p className="text-lg text-gray-700 dark:text-gray-300 mb-2 mt-4">
                  Please call us at
                </p>
                <p className="text-lg text-gray-700 dark:text-gray-300 mb-4">
                  Por favor llámenos al
                </p>
                <a
                  href="tel:+15551234567"
                  className="inline-block text-2xl font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                >
                  (555) 123-4567
                </a>
              </>
            )}
          </>
        )}

        {status === "passed" && (
          <>
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-8 h-8 text-blue-600 dark:text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Appointment Already Passed / La cita ya pasó
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-2">
              This appointment has already passed. If you need assistance, please contact your provider.
            </p>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Esta cita ya pasó. Si necesita asistencia, por favor contacte a su proveedor.
            </p>
            {showPhoneNumber && (
              <>
                <p className="text-lg text-gray-700 dark:text-gray-300 mb-2 mt-4">
                  Please call us at
                </p>
                <p className="text-lg text-gray-700 dark:text-gray-300 mb-4">
                  Por favor llámenos al
                </p>
                <a
                  href="tel:+15551234567"
                  className="inline-block text-2xl font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                >
                  (555) 123-4567
                </a>
              </>
            )}
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-8 h-8 text-red-600 dark:text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Something went wrong / Algo salió mal
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-2">
              {errorMessage || "Unable to process your request. Please contact your provider."}
            </p>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {errorMessage || "No se pudo procesar su solicitud. Por favor contacte a su proveedor."}
            </p>
            {showPhoneNumber && (
              <>
                <p className="text-lg text-gray-700 dark:text-gray-300 mb-2 mt-4">
                  Please call us at
                </p>
                <p className="text-lg text-gray-700 dark:text-gray-300 mb-4">
                  Por favor llámenos al
                </p>
                <a
                  href="tel:+15551234567"
                  className="inline-block text-2xl font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                >
                  (555) 123-4567
                </a>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

