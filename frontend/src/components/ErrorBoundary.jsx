import { Component } from "react";
import { useLocation } from "react-router";

class Boundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Page render failed", error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center justify-center p-4">
        <div className="w-full rounded-2xl border border-red-200 bg-white p-6 shadow-card sm:p-8" role="alert">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-red-600">Unexpected error</p>
          <h1 className="mt-2 text-xl font-extrabold tracking-[-0.02em] text-navy-900 sm:text-2xl">
            This page could not be displayed
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            The rest of the app is still running. Try again, or open another page from the sidebar.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            {String(this.state.error?.message ?? this.state.error)}
          </pre>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-navy-900 hover:bg-slate-50"
              onClick={() => window.location.reload()}
              type="button"
            >
              Reload app
            </button>
            <button className="ww-primary-button min-h-11 px-5 text-sm" onClick={this.reset} type="button">
              Try again
            </button>
          </div>
        </div>
      </main>
    );
  }
}

/**
 * Keeps a render error inside the current page instead of unmounting the whole
 * app into a blank screen. Navigating elsewhere resets the boundary.
 */
export default function ErrorBoundary({ children }) {
  const location = useLocation();
  return <Boundary key={location.pathname}>{children}</Boundary>;
}
