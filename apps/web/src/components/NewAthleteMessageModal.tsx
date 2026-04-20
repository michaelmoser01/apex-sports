import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";

export interface CoachPickerItem {
  userId: string;
  coachId: string;
  displayName: string;
  sports: string[];
  avatarUrl: string | null;
}

export function NewAthleteMessageModal({
  coaches,
  onClose,
  onConversationCreated,
}: {
  coaches: CoachPickerItem[];
  onClose: () => void;
  onConversationCreated: (conversationId: string) => void;
}) {
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startMutation = useMutation({
    mutationFn: (targetUserId: string) =>
      api<{ conversationId: string }>(`/messages/conversations/direct/${targetUserId}`, {
        method: "POST",
      }),
    onSuccess: (data) => {
      onConversationCreated(data.conversationId);
    },
    onError: (err: Error) => {
      setError(err.message);
      setPendingUserId(null);
    },
  });

  const handlePick = (userId: string) => {
    setError(null);
    setPendingUserId(userId);
    startMutation.mutate(userId);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-message-title"
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 id="new-message-title" className="text-lg font-semibold text-slate-900">Message a coach</h3>
            <p className="text-xs text-slate-500 mt-0.5">Pick a coach to open a private chat.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-slate-100"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {coaches.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-slate-600">You're not connected to any coaches yet.</p>
              <p className="text-xs text-slate-400 mt-1">
                <Link to="/find" className="text-brand-600 hover:underline font-medium" onClick={onClose}>
                  Find a coach
                </Link>{" "}
                to book or favorite first.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {coaches.map((c) => {
                const isPending = pendingUserId === c.userId && startMutation.isPending;
                const sport = c.sports[0] ?? null;
                return (
                  <li key={c.coachId}>
                    <button
                      type="button"
                      onClick={() => handlePick(c.userId)}
                      disabled={startMutation.isPending}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 disabled:opacity-50 text-left transition"
                    >
                      <Avatar
                        src={c.avatarUrl}
                        displayName={c.displayName}
                        size="sm"
                        className="shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 truncate">{c.displayName}</p>
                        {sport && (
                          <p className="text-xs text-slate-500 truncate">{sport}</p>
                        )}
                      </div>
                      {isPending && (
                        <span className="text-xs text-slate-400">Opening…</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error && (
          <p className="px-5 py-2 text-xs text-red-600 border-t border-slate-200" role="alert">
            {error}
          </p>
        )}

        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 rounded-lg"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
