"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";

type PageState = "loading" | "form" | "submitting" | "success" | "error" | "not-found";

interface TeamInfo {
  name: string;
  entrySlug?: string;
  languageMode: string;
  contactPhone?: string;
  features?: Record<string, boolean>;
}

export default function ChatPage() {
  const params = useParams();
  const teamSlug = params.teamSlug as string;

  const [state, setState] = useState<PageState>("loading");
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const isBilingual = team?.languageMode !== "en";

  useEffect(() => {
    async function loadTeam() {
      try {
        const res = await fetch(`/api/teams/by-slug?slug=${encodeURIComponent(teamSlug)}`);
        if (!res.ok) {
          setState("not-found");
          return;
        }
        const data = await res.json();
        if (!data || !data.entrySlug) {
          setState("not-found");
          return;
        }
        if (data.features?.website_entry_enabled === false) {
          setState("not-found");
          return;
        }
        setTeam(data);
        setState("form");
      } catch {
        setState("not-found");
      }
    }
    loadTeam();
  }, [teamSlug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!team || !phone.trim()) return;

    setState("submitting");
    try {
      const hpField = (document.getElementById("_hp_chat") as HTMLInputElement)?.value;
      const res = await fetch("/api/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamSlug: team.entrySlug ?? teamSlug,
          patientName: name.trim() || undefined,
          patientPhone: phone.trim(),
          _hp: hpField || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setErrorMessage(data?.error || "Something went wrong");
        setState("error");
        return;
      }

      setState("success");
    } catch {
      setErrorMessage("Unable to connect. Please try again.");
      setState("error");
    }
  }

  if (state === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (state === "not-found") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Page Not Found
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            This page doesn&apos;t exist. Please check the link and try again.
          </p>
          {isBilingual && (
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Esta página no existe. Por favor verifique el enlace e intente de nuevo.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            {isBilingual ? "Thanks! / ¡Gracias!" : "Thanks!"}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            You&apos;ll receive a text shortly. Our team will follow up from there.
          </p>
          {isBilingual && (
            <p className="text-gray-600 dark:text-gray-400 mt-3">
              Recibirá un mensaje de texto en breve. Nuestro equipo le dará seguimiento.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Something Went Wrong
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{errorMessage}</p>
          <button
            onClick={() => setState("form")}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 transition-colors">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {isBilingual ? "Get in Touch / Contáctenos" : "Get in Touch"}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            {team?.name}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "-9999px" }}>
            <label htmlFor="_hp_chat">Leave blank</label>
            <input id="_hp_chat" name="_hp_chat" type="text" tabIndex={-1} autoComplete="off" />
          </div>

          <div>
            <label htmlFor="chat-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {isBilingual ? "Your Name / Su nombre" : "Your Name"}
            </label>
            <input
              id="chat-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isBilingual ? "John Doe / Juan Pérez" : "John Doe"}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="chat-phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {isBilingual ? "Phone Number / Número de teléfono *" : "Phone Number *"}
            </label>
            <input
              id="chat-phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={state === "submitting" || !phone.trim()}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors shadow-sm"
          >
            {state === "submitting"
              ? (isBilingual ? "Sending... / Enviando..." : "Sending...")
              : (isBilingual ? "Start Text Conversation / Iniciar conversación" : "Start Text Conversation")}
          </button>

          <p className="text-xs text-center text-gray-400 dark:text-gray-500">
            {isBilingual
              ? "We'll send you a text message to get started. / Le enviaremos un mensaje de texto para comenzar."
              : "We'll send you a text message to get started."}
          </p>
        </form>
      </div>
    </div>
  );
}
