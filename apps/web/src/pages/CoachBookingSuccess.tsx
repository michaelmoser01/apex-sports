import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface CoachSuccessData {
  id: string;
  displayName: string;
}

export default function CoachBookingSuccess() {
  const { id } = useParams<{ id: string }>();

  const { data: coach } = useQuery({
    queryKey: ["coach", id],
    queryFn: () => api<CoachSuccessData>(`/coaches/${id}`),
    enabled: !!id,
  });

  const coachName = coach?.displayName ?? "the coach";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-12 space-y-8">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-8 sm:py-10 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 mb-4" aria-hidden>
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-slate-900">Request sent</h1>
            <p className="text-slate-600 mt-2 max-w-sm mx-auto">
              We’ll email you when {coachName} responds. Your card won’t be charged until the coach marks the session complete.
            </p>
          </div>
          <div className="px-5 py-4 bg-slate-50/80 border-t border-slate-100 space-y-3">
            <Link
              to={`/coaches/${id}`}
              className="block w-full text-center px-4 py-3 rounded-lg font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors"
            >
              ← Back to {coachName}&apos;s profile
            </Link>
            <Link
              to="/find"
              className="block w-full text-center px-4 py-3 rounded-lg font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors"
            >
              Find more coaches
            </Link>
            <Link
              to="/bookings"
              className="block w-full text-center px-4 py-3 rounded-lg font-medium text-brand-600 bg-brand-50 border border-brand-200 hover:bg-brand-100 transition-colors"
            >
              View my bookings
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
