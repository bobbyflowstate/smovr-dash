"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";

type PageState = "loading" | "ready" | "submitting" | "done" | "not-found" | "error";

interface ReferralInfo {
  _id: string;
  status: "pending" | "confirmed" | "needs_help";
  statusUpdatedAt?: string;
  createdAt: string;
  teamName: string;
  languageMode: string;
  patientName: string | null;
}

export default function ReferralStatusPage() {
  const params = useParams();
  const token = params.token as string;

  const [state, setState] = useState<PageState>("loading");
  const [referral, setReferral] = useState<ReferralInfo | null>(null);
  const [chosenStatus, setChosenStatus] = useState<"confirmed" | "needs_help" | null>(null);

  const isBilingual = referral?.languageMode !== "en";

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/referral-status?token=${encodeURIComponent(token)}`);
        if (!res.ok) {
          setState("not-found");
          return;
        }
        const data = await res.json();
        if (!data || !data._id) {
          setState("not-found");
          return;
        }
        setReferral(data);

        if (data.status !== "pending") {
          setChosenStatus(data.status);
          setState("done");
        } else {
          setState("ready");
        }
      } catch {
        setState("not-found");
      }
    }
    load();
  }, [token]);

  const handleSubmit = async (status: "confirmed" | "needs_help") => {
    setState("submitting");
    try {
      const res = await fetch("/api/referral-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, status }),
      });
      if (!res.ok) throw new Error("Failed to update");
      setChosenStatus(status);
      setState("done");
    } catch {
      setState("error");
    }
  };

  // --- Loading ---
  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
        <div className="animate-pulse text-gray-400 text-lg">Loading...</div>
      </div>
    );
  }

  // --- Not Found ---
  if (state === "not-found") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Link Not Found</h1>
          {isBilingual && <p className="text-gray-500 dark:text-gray-400 mb-2">Enlace no encontrado</p>}
          <p className="text-gray-600 dark:text-gray-300">
            This link may have expired or is invalid.
          </p>
          {isBilingual && (
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Este enlace puede haber expirado o no es válido.
            </p>
          )}
        </div>
      </div>
    );
  }

  // --- Error ---
  if (state === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.27 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Something went wrong</h1>
          {isBilingual && <p className="text-gray-500 dark:text-gray-400 mb-2">Algo salió mal</p>}
          <p className="text-gray-600 dark:text-gray-300">
            Please try again or contact the office directly.
          </p>
          {isBilingual && (
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Intente de nuevo o comuníquese directamente con la oficina.
            </p>
          )}
        </div>
      </div>
    );
  }

  // --- Already submitted / Done ---
  if (state === "done") {
    const isConfirmed = chosenStatus === "confirmed";
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
            isConfirmed
              ? "bg-green-100 dark:bg-green-900"
              : "bg-orange-100 dark:bg-orange-900"
          }`}>
            {isConfirmed ? (
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            )}
          </div>

          {isConfirmed ? (
            <>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Thank you!
              </h1>
              {isBilingual && <p className="text-gray-500 dark:text-gray-400 mb-2 font-medium">¡Gracias!</p>}
              <p className="text-gray-600 dark:text-gray-300">
                We&apos;re glad you were able to schedule your appointment.
              </p>
              {isBilingual && (
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                  Nos alegra que haya podido programar su cita.
                </p>
              )}
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                We&apos;ll be in touch
              </h1>
              {isBilingual && (
                <p className="text-gray-500 dark:text-gray-400 mb-2 font-medium">
                  Nos comunicaremos con usted
                </p>
              )}
              <p className="text-gray-600 dark:text-gray-300">
                Our team will reach out to help you schedule your appointment.
              </p>
              {isBilingual && (
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                  Nuestro equipo se comunicará con usted para ayudarle a programar su cita.
                </p>
              )}
            </>
          )}

          <p className="text-sm text-gray-400 mt-6">
            {referral?.teamName}
          </p>
        </div>
      </div>
    );
  }

  // --- Ready (pending - show buttons) ---
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-teal-100 dark:bg-teal-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
            {referral?.teamName}
          </h1>

          {referral?.patientName && (
            <p className="text-gray-600 dark:text-gray-300 mt-4 text-lg">
              Hi {referral.patientName}, how is your appointment going?
              {isBilingual && (
                <>
                  <br />
                  <span className="text-gray-500 dark:text-gray-400">
                    Hola {referral.patientName}, ¿cómo va su cita?
                  </span>
                </>
              )}
            </p>
          )}

          {!referral?.patientName && (
            <p className="text-gray-600 dark:text-gray-300 mt-4 text-lg">
              How is your appointment going?
              {isBilingual && (
                <>
                  <br />
                  <span className="text-gray-500 dark:text-gray-400">
                    ¿Cómo va su cita?
                  </span>
                </>
              )}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <button
            onClick={() => handleSubmit("confirmed")}
            disabled={state === "submitting"}
            className="w-full py-4 px-6 rounded-xl text-lg font-semibold transition-all bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 shadow-md hover:shadow-lg"
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <span>
                YES, I scheduled
                {isBilingual && <span className="block text-sm font-normal opacity-90">SÍ, ya programé la cita</span>}
              </span>
            </span>
          </button>

          <button
            onClick={() => handleSubmit("needs_help")}
            disabled={state === "submitting"}
            className="w-full py-4 px-6 rounded-xl text-lg font-semibold transition-all bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 shadow-md hover:shadow-lg"
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span>
                NEED HELP scheduling
                {isBilingual && <span className="block text-sm font-normal opacity-90">NECESITO AYUDA para programar</span>}
              </span>
            </span>
          </button>
        </div>

        {state === "submitting" && (
          <p className="text-center text-gray-400 mt-4 animate-pulse">
            Updating...
            {isBilingual && <span> / Actualizando...</span>}
          </p>
        )}
      </div>
    </div>
  );
}
