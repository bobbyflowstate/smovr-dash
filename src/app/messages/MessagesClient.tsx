"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Conversation {
  _id: string;
  patientId: string;
  patientPhone: string;
  patientName: string | null;
  lastMessageBody: string;
  lastMessageDirection: "inbound" | "outbound";
  lastMessageAt: string;
  unreadCount: number;
  latestAppointmentId?: string;
}

interface MessagesClientProps {
  userName: string;
  teamName: string;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function MessagesClient({ userName, teamName }: MessagesClientProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/messages");
        if (response.ok) {
          const data = await response.json();
          setConversations(data);
        }
      } catch (error) {
        console.error("Error fetching conversations:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchConversations();
    
    // Poll for updates every 15 seconds
    const interval = setInterval(fetchConversations, 15000);
    return () => clearInterval(interval);
  }, []);

  const filteredConversations = conversations.filter((conv) => {
    const query = searchQuery.toLowerCase();
    const name = conv.patientName?.toLowerCase() || "";
    const phone = conv.patientPhone.toLowerCase();
    return name.includes(query) || phone.includes(query);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Messages</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Patient conversations for: {teamName}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/messages/templates"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              Templates
            </Link>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
              {conversations.length} conversations
            </span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 transition-colors">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search by name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors"
          />
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center transition-colors">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading conversations...</p>
        </div>
      )}

      {/* Conversations List */}
      {!isLoading && filteredConversations.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredConversations.map((conv) => (
              <Link
                key={conv._id}
                href={`/messages/${conv.patientId}`}
                className="block hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="px-6 py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Unread indicator */}
                      <div className="pt-1.5">
                        {conv.unreadCount > 0 ? (
                          <div className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
                        ) : (
                          <div className="w-2.5 h-2.5" />
                        )}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold truncate ${
                            conv.unreadCount > 0 
                              ? "text-gray-900 dark:text-white" 
                              : "text-gray-700 dark:text-gray-300"
                          }`}>
                            {conv.patientName || "Unknown"}
                          </span>
                          <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
                            {conv.patientPhone}
                          </span>
                        </div>
                        
                        <p className={`mt-1 text-sm truncate ${
                          conv.unreadCount > 0 
                            ? "text-gray-900 dark:text-gray-100 font-medium" 
                            : "text-gray-600 dark:text-gray-400"
                        }`}>
                          {conv.lastMessageDirection === "outbound" && (
                            <span className="text-gray-500 dark:text-gray-500">You: </span>
                          )}
                          {conv.lastMessageBody}
                        </p>
                      </div>
                    </div>
                    
                    {/* Time and badge */}
                    <div className="flex flex-col items-end gap-1 ml-4 flex-shrink-0">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatRelativeTime(conv.lastMessageAt)}
                      </span>
                      {conv.unreadCount > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-xs font-bold text-white bg-blue-500 rounded-full">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredConversations.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center transition-colors">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          {searchQuery ? (
            <>
              <p className="text-gray-600 dark:text-gray-400">No conversations match your search.</p>
              <button
                onClick={() => setSearchQuery("")}
                className="mt-4 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
              >
                Clear search
              </button>
            </>
          ) : (
            <>
              <p className="text-gray-600 dark:text-gray-400">No conversations yet.</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                Conversations will appear here when patients reply to SMS messages.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

