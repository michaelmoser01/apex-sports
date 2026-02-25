import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class CoachDetailErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("CoachDetail error:", error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-4xl mx-auto px-4 py-12">
          <p className="text-slate-700 font-medium">
            Something went wrong loading this page.
          </p>
          {this.state.error && (
            <p className="text-slate-500 text-sm mt-1 break-all">
              {this.state.error.message}
            </p>
          )}
          <div className="mt-4">
            <Link
              to="/coaches"
              className="text-brand-600 hover:underline font-medium"
            >
              ← Back to coaches
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
