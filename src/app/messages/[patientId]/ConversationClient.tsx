"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

interface Message {
  _id: string;
  _creationTime?: number;
  direction: "inbound" | "outbound";
  body: string;
  status: string;
  createdAt: string;
  sentAt?: string;
  senderName?: string | null;
  templateId?: string;
}

interface Template {
  _id: string;
  name: string;
  body: string;
  category?: string;
}

interface ConversationClientProps {
  patientId: string;
  patientName: string | null;
  patientPhone: string;
  teamName: string;
  userName: string;
}

const PAGE_SIZE = 50;

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", { 
    hour: "numeric", 
    minute: "2-digit",
    hour12: true 
  });
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return date.toLocaleDateString("en-US", { 
    weekday: "long",
    month: "short", 
    day: "numeric" 
  });
}

function groupMessagesByDate(messages: Message[]): Record<string, Message[]> {
  const groups: Record<string, Message[]> = {};
  
  for (const msg of messages) {
    const dateKey = new Date(msg.createdAt).toDateString();
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(msg);
  }
  
  return groups;
}

export default function ConversationClient({
  patientId,
  patientName,
  patientPhone,
  teamName,
  userName,
}: ConversationClientProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevCountRef = useRef(0);
  const shouldScrollRef = useRef(false);

  // Fetch messages
  useEffect(() => {
    const fetchMessages = async (isRefresh = false) => {
      try {
        const response = await fetch(
          `/api/messages?patientId=${patientId}&limit=${PAGE_SIZE}`
        );
        if (response.ok) {
          const data: Message[] = await response.json();
          setMessages((prev) => {
            if (!isRefresh) {
              const serverIds = new Set(data.map((m) => m._id));
              // Keep optimistic messages whose ID isn't in the server response yet
              const pending = prev.filter(
                (m) => m._id.startsWith("temp-") && !serverIds.has(m._id)
              );
              return [...data, ...pending];
            }

            // On refresh, replace newest page and keep older loaded pages.
            const serverIds = new Set(data.map((m) => m._id));
            const older = prev.filter(
              (m) => !m._id.startsWith("temp-") && !serverIds.has(m._id)
            );
            const pending = prev.filter(
              (m) => m._id.startsWith("temp-") && !serverIds.has(m._id)
            );
            return [...data, ...older, ...pending];
          });
          setHasMore(data.length === PAGE_SIZE);
        }
      } catch (error) {
        console.error("Error fetching messages:", error);
      } finally {
        if (!isRefresh) {
          setIsLoading(false);
        }
      }
    };

    fetchMessages();
    
    // Poll for new messages every 60 seconds
    const interval = setInterval(() => fetchMessages(true), 60000);
    return () => clearInterval(interval);
  }, [patientId]);

  // Fetch templates
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await fetch("/api/messages/templates");
        if (response.ok) {
          const data = await response.json();
          setTemplates(data);
        }
      } catch (error) {
        console.error("Error fetching templates:", error);
      }
    };

    fetchTemplates();
  }, []);

  // Scroll to bottom only when new messages arrive or after sending
  useEffect(() => {
    if (messages.length > prevCountRef.current || shouldScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      shouldScrollRef.current = false;
    }
    prevCountRef.current = messages.length;
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [messageText]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || isSending) return;

    setIsSending(true);
    setError(null);

    try {
      const response = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          body: messageText.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send message");
      }

      // Clear input and scroll to the new message
      setMessageText("");
      shouldScrollRef.current = true;
      
      // Optimistically add the message
      const optimisticMessage: Message = {
        _id: data.messageId || `temp-${Date.now()}`,
        direction: "outbound",
        body: messageText.trim(),
        status: data.ok ? "sent" : "failed",
        createdAt: new Date().toISOString(),
        senderName: userName,
      };
      
      setMessages((prev) => [...prev, optimisticMessage]);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTemplateSelect = (template: Template) => {
    // Replace placeholders with actual values
    let body = template.body;
    body = body.replace(/\{\{patientName\}\}/g, patientName || "");
    setMessageText(body);
    setShowTemplates(false);
    textareaRef.current?.focus();
  };

  const handleLoadOlder = async () => {
    if (isLoadingMore || !hasMore || messages.length === 0) return;
    const oldest = messages
      .filter((m) => typeof m._creationTime === "number")
      .reduce<number | null>((min, m) => {
        const created = m._creationTime as number;
        if (min === null || created < min) return created;
        return min;
      }, null);

    if (oldest === null) return;

    try {
      setIsLoadingMore(true);
      const response = await fetch(
        `/api/messages?patientId=${patientId}&limit=${PAGE_SIZE}&before=${oldest}`
      );
      if (!response.ok) return;
      const olderPage: Message[] = await response.json();
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m._id));
        const uniqueOlder = olderPage.filter((m) => !seen.has(m._id));
        return [...prev, ...uniqueOlder];
      });
      setHasMore(olderPage.length === PAGE_SIZE);
    } catch (error) {
      console.error("Error loading older messages:", error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const sortedForDisplay = [...messages].sort((a, b) => {
    const aTime = typeof a._creationTime === "number" ? a._creationTime : new Date(a.createdAt).getTime();
    const bTime = typeof b._creationTime === "number" ? b._creationTime : new Date(b.createdAt).getTime();
    return aTime - bTime;
  });

  const groupedMessages = groupMessagesByDate(sortedForDisplay);
  const dateKeys = Object.keys(groupedMessages).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-t-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/messages"
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                {patientName || "Unknown Patient"}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{patientPhone}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 dark:text-gray-400">{teamName}</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 bg-gray-50 dark:bg-gray-900 border-x border-gray-200 dark:border-gray-700 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p>No messages yet</p>
              <p className="text-sm mt-1">Send a message to start the conversation</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {hasMore && (
              <div className="flex justify-center">
                <button
                  onClick={handleLoadOlder}
                  disabled={isLoadingMore}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-full hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isLoadingMore ? "Loading..." : "Load older messages"}
                </button>
              </div>
            )}
            {dateKeys.map((dateKey) => (
              <div key={dateKey}>
                {/* Date divider */}
                <div className="flex items-center justify-center mb-4">
                  <span className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 rounded-full">
                    {formatDate(groupedMessages[dateKey][0].createdAt)}
                  </span>
                </div>
                
                {/* Messages for this date */}
                <div className="space-y-3">
                  {groupedMessages[dateKey].map((msg) => (
                    <div
                      key={msg._id}
                      className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                          msg.direction === "outbound"
                            ? "bg-blue-600 text-white rounded-br-md"
                            : "bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-md shadow-sm border border-gray-200 dark:border-gray-700"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                        <div
                          className={`flex items-center gap-2 mt-1 text-xs ${
                            msg.direction === "outbound"
                              ? "text-blue-200"
                              : "text-gray-500 dark:text-gray-400"
                          }`}
                        >
                          <span>{formatTime(msg.createdAt)}</span>
                          {msg.direction === "outbound" && (
                            <>
                              {msg.status === "sent" && (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                              {msg.status === "delivered" && (
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z" />
                                </svg>
                              )}
                              {msg.status === "failed" && (
                                <span className="text-red-300">Failed</span>
                              )}
                              {msg.status === "pending" && (
                                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                              )}
                              {msg.senderName && (
                                <span className="opacity-75">by {msg.senderName}</span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Quick Replies */}
      {showTemplates && templates.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border-x border-gray-200 dark:border-gray-700 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Quick Replies
            </span>
            <button
              onClick={() => setShowTemplates(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {templates.map((template) => (
              <button
                key={template._id}
                onClick={() => handleTemplateSelect(template)}
                className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-full transition-colors"
              >
                {template.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border-x border-gray-200 dark:border-gray-700 px-4 py-2">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Input */}
      <div className="bg-white dark:bg-gray-800 rounded-b-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 transition-colors">
        <div className="flex items-end gap-3">
          {/* Template button */}
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className={`flex-shrink-0 p-2 rounded-lg transition-colors ${
              showTemplates
                ? "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400"
                : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
            title="Quick replies"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </button>

          {/* Text input */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors resize-none"
              style={{ minHeight: "48px" }}
            />
          </div>

          {/* Send button */}
          <button
            onClick={handleSendMessage}
            disabled={!messageText.trim() || isSending}
            className="flex-shrink-0 p-3 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSending ? (
              <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

