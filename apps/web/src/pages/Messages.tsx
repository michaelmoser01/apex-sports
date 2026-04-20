import { useState, useEffect, useRef, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiRequestError } from "@/lib/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { ArrowLeft, Send, MessageSquare, Users, ChevronDown, Lock, Plus } from "lucide-react";
import { BroadcastMessageModal, type ConnectedAthlete } from "@/components/BroadcastMessageModal";

interface ConversationListItem {
  id: string;
  type: string;
  title: string | null;
  slotId: string | null;
  participants: { userId: string; name: string | null; email: string }[];
  lastMessage: {
    id: string;
    content: string;
    senderName: string | null;
    senderUserId: string;
    createdAt: string;
  } | null;
  unreadCount: number;
  updatedAt: string;
}

interface Message {
  id: string;
  content: string;
  senderUserId: string;
  senderName: string | null;
  createdAt: string;
}

interface ConversationDetail {
  conversation: {
    id: string;
    type: string;
    title: string | null;
    slotId: string | null;
    participants: { userId: string; name: string | null; email: string }[];
  };
  messages: Message[];
  hasMore: boolean;
  nextCursor: string | null;
}

function getConversationDisplayName(
  conv: { type: string; title: string | null; participants: { userId: string; name: string | null }[] },
  currentUserId: string,
): string {
  if (conv.title) return conv.title;
  const others = conv.participants.filter((p) => p.userId !== currentUserId);
  if (others.length === 0) return "Conversation";
  return others.map((p) => p.name ?? "Unknown").join(", ");
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Render message text with URLs and email addresses turned into clickable links.
// Matches http(s)://, www., and bare emails. Splits on the match so plain text
// keeps its surrounding whitespace (parent uses whitespace-pre-wrap).
const URL_OR_EMAIL = /((?:https?:\/\/|www\.)[^\s]+|[\w.+-]+@[\w-]+\.[\w.-]+)/gi;

function linkifyContent(text: string, isMine: boolean): ReactNode[] {
  const parts = text.split(URL_OR_EMAIL);
  return parts.map((part, i) => {
    if (!part) return null;
    if (i % 2 === 1) {
      const isEmail = part.includes("@") && !part.startsWith("http") && !part.startsWith("www.");
      const href = isEmail
        ? `mailto:${part}`
        : part.startsWith("http")
          ? part
          : `https://${part}`;
      return (
        <a
          key={i}
          href={href}
          target={isEmail ? undefined : "_blank"}
          rel={isEmail ? undefined : "noopener noreferrer"}
          onClick={(e) => e.stopPropagation()}
          className={`underline break-all ${
            isMine ? "text-white hover:text-white/90" : "text-brand-600 hover:text-brand-700"
          }`}
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function ConversationList({
  conversations,
  activeId,
  currentUserId,
  onSelect,
}: {
  conversations: ConversationListItem[];
  activeId: string | null;
  currentUserId: string;
  onSelect: (id: string) => void;
}) {
  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
        <MessageSquare className="w-12 h-12 mb-3 text-slate-300" />
        <p className="font-medium text-slate-500">No messages yet</p>
        <p className="text-sm mt-1">Start a conversation from a session or athlete profile.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {conversations.map((conv) => {
        const displayName = getConversationDisplayName(conv, currentUserId);
        const isActive = conv.id === activeId;
        return (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors ${
              isActive ? "bg-brand-50 border-l-2 border-l-brand-500" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-sm truncate ${conv.unreadCount > 0 ? "font-bold text-slate-900" : "font-medium text-slate-700"}`}>
                    {displayName}
                  </span>
                  {conv.type === "session" && (
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">
                      Session
                    </span>
                  )}
                  {conv.type === "group" && (
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                      Group
                    </span>
                  )}
                </div>
                {conv.lastMessage && (
                  <p className={`text-xs mt-0.5 truncate ${conv.unreadCount > 0 ? "text-slate-700 font-medium" : "text-slate-500"}`}>
                    {conv.lastMessage.senderUserId === currentUserId ? "You: " : ""}
                    {conv.lastMessage.content}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {conv.lastMessage && (
                  <span className="text-[11px] text-slate-400">
                    {formatRelativeTime(conv.lastMessage.createdAt)}
                  </span>
                )}
                {conv.unreadCount > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-brand-500 rounded-full">
                    {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

interface PendingMessage extends Message {
  pending: true;
  failed?: boolean;
}

function MessageThread({
  conversationId,
  currentUserId,
  currentUserName,
  onBack,
}: {
  conversationId: string;
  currentUserId: string;
  currentUserName: string | null;
  onBack?: () => void;
}) {
  const [input, setInput] = useState("");
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showParticipants, setShowParticipants] = useState(false);
  const queryClient = useQueryClient();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => api<ConversationDetail>(`/messages/conversations/${conversationId}`),
    refetchInterval: (query) => (query.state.error ? false : 5000),
    retry: (failureCount, err) => {
      if (err instanceof ApiRequestError && err.status >= 400 && err.status < 500) return false;
      return failureCount < 2;
    },
  });

  const apiError = error instanceof ApiRequestError ? error : null;
  const isAccessDenied = apiError?.status === 403;
  const isNotFound = apiError?.status === 404;
  const hasFatalError = !!error && !data;

  // Reset pending messages when switching conversations
  useEffect(() => {
    setPendingMessages([]);
    setSendError(null);
    setInput("");
    setShowParticipants(false);
  }, [conversationId]);

  const sendMutation = useMutation({
    mutationFn: (vars: { content: string; tempId: string }) =>
      api<Message>(`/messages/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: vars.content }),
      }),
    onSuccess: (_data, vars) => {
      setPendingMessages((prev) => prev.filter((m) => m.id !== vars.tempId));
      queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
    },
    onError: (err: unknown, vars) => {
      setPendingMessages((prev) =>
        prev.map((m) => (m.id === vars.tempId ? { ...m, failed: true } : m)),
      );
      setSendError(err instanceof Error ? err.message : "Failed to send. Tap a message to retry.");
    },
  });

  const sendNow = (content: string) => {
    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: PendingMessage = {
      id: tempId,
      content,
      senderUserId: currentUserId,
      senderName: currentUserName,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setPendingMessages((prev) => [...prev, optimistic]);
    setSendError(null);
    sendMutation.mutate({ content, tempId });
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    sendNow(trimmed);
  };

  const handleRetry = (failed: PendingMessage) => {
    setPendingMessages((prev) => prev.filter((m) => m.id !== failed.id));
    sendNow(failed.content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const conv = data?.conversation;
  const displayName = conv ? getConversationDisplayName(conv, currentUserId) : "";
  const participantCount = conv?.participants.length ?? 0;
  const isGroupThread = conv?.type === "session" || conv?.type === "group";
  const otherParticipants = conv?.participants.filter((p) => p.userId !== currentUserId) ?? [];
  const groupLabel = conv?.type === "session" ? "Session group chat" : "Group chat";

  // Combine server messages with pending optimistic ones for display
  const allMessages: (Message | PendingMessage)[] = [
    ...(data?.messages ?? []),
    ...pendingMessages,
  ];

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [allMessages.length]);

  if (hasFatalError) {
    const title = isAccessDenied
      ? "You don't have access to this conversation"
      : isNotFound
        ? "Conversation not found"
        : "Couldn't load this conversation";
    const body = isAccessDenied
      ? "This thread is between other people. If you think you should have access, sign in with the account that's part of the conversation."
      : isNotFound
        ? "It may have been deleted, or the link is incorrect."
        : apiError?.message || "Something went wrong while loading the messages. Please try again.";
    return (
      <div className="flex flex-col h-full">
        <div
          className="border-b border-slate-200 bg-white shrink-0"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="px-3 sm:px-4 py-2.5 flex items-center gap-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="md:hidden inline-flex items-center gap-1 -ml-1 px-2 py-1.5 rounded-lg text-brand-600 hover:bg-slate-100 active:bg-slate-200 font-medium text-sm shrink-0"
                aria-label="Back to conversations"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>Back</span>
              </button>
            )}
            <h2 className="text-sm font-semibold text-slate-900 truncate">Conversation</h2>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            <p className="text-sm text-slate-600">{body}</p>
            <button
              type="button"
              onClick={() => navigate("/messages")}
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
            >
              Back to messages
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="border-b border-slate-200 bg-white shrink-0"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="px-3 sm:px-4 py-2.5 flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="md:hidden inline-flex items-center gap-1 -ml-1 px-2 py-1.5 rounded-lg text-brand-600 hover:bg-slate-100 active:bg-slate-200 font-medium text-sm shrink-0"
              aria-label="Back to conversations"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back</span>
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-sm font-semibold text-slate-900 truncate">{displayName}</h2>
              {conv?.type === "session" && (
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">
                  Session
                </span>
              )}
              {conv?.type === "group" && (
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                  Group
                </span>
              )}
            </div>
            {isGroupThread ? (
              <button
                type="button"
                onClick={() => setShowParticipants((v) => !v)}
                className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
              >
                <Users className="w-3 h-3" />
                <span>
                  {groupLabel} · {participantCount} {participantCount === 1 ? "person" : "people"}
                </span>
                <ChevronDown
                  className={`w-3 h-3 transition-transform ${showParticipants ? "rotate-180" : ""}`}
                />
              </button>
            ) : (
              <p className="text-xs text-slate-500">Direct message</p>
            )}
          </div>
        </div>
        {isGroupThread && showParticipants && (
          <div className="px-4 pb-3 -mt-1 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center text-[11px] font-medium text-brand-700 bg-brand-50 border border-brand-200 px-2 py-0.5 rounded-full">
              You
            </span>
            {otherParticipants.map((p) => (
              <span
                key={p.userId}
                className="inline-flex items-center text-[11px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full"
              >
                {p.name ?? "Unknown"}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-1">
        {isLoading && allMessages.length === 0 && (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading...</div>
        )}
        {allMessages.map((msg, idx) => {
          const isMine = msg.senderUserId === currentUserId;
          const prevMsg = idx > 0 ? allMessages[idx - 1] : null;
          const showSender = !isMine && msg.senderUserId !== prevMsg?.senderUserId;
          const showTime = !prevMsg || new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() > 300000;
          const isPending = "pending" in msg && msg.pending;
          const isFailed = "failed" in msg && msg.failed;

          return (
            <div key={msg.id}>
              {showTime && (
                <div className="text-center my-3">
                  <span className="text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    {formatMessageTime(msg.createdAt)}
                  </span>
                </div>
              )}
              {showSender && (
                <p className="text-xs text-slate-500 font-medium mt-3 mb-0.5 ml-1">
                  {msg.senderName ?? "Unknown"}
                </p>
              )}
              <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div className="flex flex-col items-end max-w-[80%]">
                  <div
                    className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                      isMine
                        ? `text-white rounded-br-md ${isFailed ? "bg-red-400" : isPending ? "bg-brand-400 opacity-80" : "bg-brand-500"}`
                        : "bg-slate-100 text-slate-800 rounded-bl-md"
                    }`}
                  >
                    {linkifyContent(msg.content, isMine)}
                  </div>
                  {isMine && isPending && !isFailed && (
                    <span className="text-[10px] text-slate-400 mt-0.5">Sending…</span>
                  )}
                  {isMine && isFailed && (
                    <button
                      type="button"
                      onClick={() => handleRetry(msg as PendingMessage)}
                      className="text-[10px] text-red-600 hover:underline mt-0.5"
                    >
                      Failed — tap to retry
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="border-t border-slate-200 bg-white p-3 shrink-0">
        {sendError && (
          <div className="mb-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700 flex items-start justify-between gap-2">
            <span>{sendError}</span>
            <button
              type="button"
              onClick={() => setSendError(null)}
              className="text-red-400 hover:text-red-600 shrink-0"
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}
        {isGroupThread && (
          <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] text-slate-500">
            <Users className="w-3 h-3" />
            <span>
              Visible to everyone in this {conv?.type === "session" ? "session" : "group"} ({participantCount} people)
            </span>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isGroupThread ? "Message the group..." : "Type a message..."}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent max-h-32"
            style={{ minHeight: "40px" }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="shrink-0 w-10 h-10 rounded-xl bg-brand-500 text-white flex items-center justify-center hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Messages() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const { data: currentUser } = useCurrentUser(true);
  const currentUserId = currentUser?.id ?? "";
  const currentUserName = currentUser?.name ?? null;

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api<ConversationListItem[]>("/messages/conversations"),
    refetchInterval: 15000,
  });

  const isCoach = !!currentUser?.coachProfile;
  const { data: coachAthletes = [] } = useQuery({
    queryKey: ["coachAthletes"],
    queryFn: () => api<ConnectedAthlete[]>("/coaches/me/athletes"),
    enabled: isCoach,
  });

  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(!!conversationId);

  useEffect(() => {
    setMobileShowThread(!!conversationId);
  }, [conversationId]);

  useEffect(() => {
    if (conversationId && window.innerWidth < 768) {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [conversationId]);

  // Lock body scroll on mobile when a conversation is open so the page can't drift
  // behind the keyboard. Desktop is unaffected (md+ shows both panels normally).
  const isMobileThreadOpen = mobileShowThread && !!conversationId;
  useEffect(() => {
    if (!isMobileThreadOpen) return;
    const mql = window.matchMedia("(max-width: 767px)");
    if (!mql.matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobileThreadOpen]);

  const handleSelectConversation = (id: string) => {
    navigate(`/messages/${id}`);
    setMobileShowThread(true);
  };

  const handleBack = () => {
    setMobileShowThread(false);
    navigate("/messages");
  };

  // Auto-select first conversation on desktop if none selected
  useEffect(() => {
    if (!conversationId && conversations.length > 0 && window.innerWidth >= 768) {
      navigate(`/messages/${conversations[0].id}`, { replace: true });
    }
  }, [conversations, conversationId, navigate]);

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-40 bg-slate-200 rounded" />
          <div className="h-64 bg-slate-100 rounded-xl" />
        </div>
      </div>
    );
  }

  // On mobile + active conversation: render as a fixed full-screen overlay so the
  // composer stays pinned and iOS keyboard shrinks the visual viewport correctly.
  // On md+ everything stays as the normal padded card layout.
  const mobileOverlay = isMobileThreadOpen;

  return (
    <div
      className={
        mobileOverlay
          ? "fixed inset-0 z-[60] bg-white md:static md:inset-auto md:z-auto md:bg-transparent md:max-w-6xl md:mx-auto md:px-4 md:py-6"
          : "max-w-6xl mx-auto px-4 py-6"
      }
    >
      <div className={mobileOverlay ? "hidden md:flex md:items-center md:justify-between md:gap-3 md:mb-4" : "flex items-center justify-between gap-3 mb-4"}>
        <h1 className="text-2xl font-bold text-slate-900">Messages</h1>
        {isCoach && (
          <button
            type="button"
            onClick={() => setBroadcastOpen(true)}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-white text-sm font-bold hover:bg-brand-600 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New message
          </button>
        )}
      </div>

      <div
        className={`bg-white overflow-hidden md:rounded-xl md:border md:border-slate-200 md:shadow-sm ${
          mobileOverlay
            ? "h-[100dvh] md:h-[calc(100vh-180px)] md:min-h-[500px]"
            : "h-[calc(100vh-180px)] min-h-[500px]"
        }`}
      >
        <div className="flex h-full">
          {/* Conversation list */}
          <div
            className={`w-full md:w-80 md:border-r border-slate-200 flex flex-col shrink-0 ${
              mobileShowThread ? "hidden md:flex" : "flex"
            }`}
          >
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              <h2 className="text-sm font-semibold text-slate-700">Conversations</h2>
            </div>
            <ConversationList
              conversations={conversations}
              activeId={conversationId ?? null}
              currentUserId={currentUserId}
              onSelect={handleSelectConversation}
            />
          </div>

          {/* Message thread */}
          <div
            className={`flex-1 flex flex-col min-w-0 ${
              mobileShowThread ? "flex" : "hidden md:flex"
            }`}
          >
            {conversationId ? (
              <MessageThread
                conversationId={conversationId}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                onBack={handleBack}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
                <MessageSquare className="w-16 h-16 mb-4 text-slate-200" />
                <p className="text-slate-500 font-medium">Select a conversation</p>
                <p className="text-sm mt-1">Choose from the list or start a new conversation.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {broadcastOpen && (
        <BroadcastMessageModal
          athletes={coachAthletes}
          onClose={() => setBroadcastOpen(false)}
          onConversationCreated={(conversationId) => {
            setBroadcastOpen(false);
            navigate(`/messages/${conversationId}`);
          }}
        />
      )}
    </div>
  );
}
