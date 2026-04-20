import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";

export interface ConnectedAthlete {
  athleteProfileId: string;
  status: string;
  createdAt: string;
  athlete: {
    id: string;
    displayName: string;
    sports: string[];
    serviceCity: string | null;
    userId: string;
  };
}

export function BroadcastMessageModal({
  athletes,
  onClose,
  onConversationCreated,
}: {
  athletes: ConnectedAthlete[];
  onClose: () => void;
  onConversationCreated: (conversationId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"individual" | "group">("individual");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ sent: number; skipped: number } | null>(null);

  const allIds = useMemo(() => athletes.map((a) => a.athlete.userId), [athletes]);
  const allSelected = selectedIds.size === allIds.length && allIds.length > 0;

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allIds));
  };

  const toggleOne = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      const userIds = Array.from(selectedIds);
      const trimmed = message.trim();
      if (mode === "individual") {
        const res = await api<{ sentCount: number; skippedCount: number }>("/messages/broadcast", {
          method: "POST",
          body: JSON.stringify({ recipientUserIds: userIds, content: trimmed }),
        });
        return { kind: "individual" as const, ...res };
      }
      const res = await api<{ conversationId: string }>("/messages/conversations", {
        method: "POST",
        body: JSON.stringify({
          type: "group",
          participantUserIds: userIds,
          initialMessage: trimmed,
          title: `Group · ${userIds.length} athletes`,
        }),
      });
      return { kind: "group" as const, conversationId: res.conversationId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
      if (data.kind === "group") {
        onConversationCreated(data.conversationId);
      } else {
        setSuccessInfo({ sent: data.sentCount, skipped: data.skippedCount });
      }
    },
    onError: (err: Error) => setError(err.message),
  });

  const canSend = selectedIds.size > 0 && message.trim().length > 0 && !sendMutation.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="broadcast-title"
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 id="broadcast-title" className="text-lg font-semibold text-slate-900">Send message</h3>
            <p className="text-xs text-slate-500 mt-0.5">Reach one or more athletes at once.</p>
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

        {successInfo ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 inline-flex items-center justify-center">
              <Check className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-900">
                Sent to {successInfo.sent} athlete{successInfo.sent !== 1 ? "s" : ""}
              </p>
              {successInfo.skipped > 0 && (
                <p className="text-xs text-slate-500 mt-1">
                  {successInfo.skipped} skipped (not connected)
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-brand-500 text-white font-medium text-sm hover:bg-brand-600"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="px-5 pt-4">
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 w-full">
                <button
                  type="button"
                  onClick={() => setMode("individual")}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition ${
                    mode === "individual" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Individual messages
                </button>
                <button
                  type="button"
                  onClick={() => setMode("group")}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition ${
                    mode === "group" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Group chat
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2 leading-snug">
                {mode === "individual"
                  ? "Each athlete gets a private 1:1 message. They can't see each other."
                  : "Everyone is added to one group thread and can see each other's replies."}
              </p>
            </div>

            <div className="px-5 pt-4 flex-1 overflow-hidden flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Recipients ({selectedIds.size})
                </p>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-xs text-brand-600 hover:underline font-medium"
                >
                  {allSelected ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="border border-slate-200 rounded-lg overflow-y-auto max-h-48">
                {athletes.length === 0 ? (
                  <p className="p-4 text-center text-slate-400 text-sm">No connected athletes yet.</p>
                ) : (
                  athletes.map((a) => {
                    const checked = selectedIds.has(a.athlete.userId);
                    return (
                      <label
                        key={a.athleteProfileId}
                        className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 border-b border-slate-100 last:border-0 ${
                          checked ? "bg-brand-50/40" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(a.athlete.userId)}
                          className="rounded border-slate-300 text-brand-500 focus:ring-brand-500"
                        />
                        <Avatar
                          src={null}
                          displayName={a.athlete.displayName}
                          size="sm"
                          className="shrink-0"
                        />
                        <span className="text-sm text-slate-800 flex-1 truncate">{a.athlete.displayName}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div className="px-5 pt-4 pb-3">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide block mb-1.5">
                Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder={
                  mode === "individual"
                    ? "e.g. Hey! I have a couple open spots in Saturday's clinic — let me know if you'd like in."
                    : "e.g. Heads up — we're moving to Field B tomorrow."
                }
                className="w-full px-3 py-2 text-base sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
              />
            </div>

            {error && (
              <p className="px-5 pb-2 text-xs text-red-600" role="alert">{error}</p>
            )}

            <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => sendMutation.mutate()}
                disabled={!canSend}
                className="px-4 py-1.5 rounded-lg bg-brand-500 text-white font-medium text-sm hover:bg-brand-600 disabled:opacity-50"
              >
                {sendMutation.isPending
                  ? "Sending…"
                  : mode === "individual"
                    ? `Send to ${selectedIds.size || 0}`
                    : "Create group chat"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
