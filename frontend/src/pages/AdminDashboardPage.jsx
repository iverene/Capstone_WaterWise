import { Link } from "react-router";
import { BarChart3 } from "lucide-react";
import PageHeader from "../components/PageHeader";

export default function AdminDashboardPage() {
  return (
    <main className="space-y-5" data-testid="admin-dashboard">
      <PageHeader
        description="Review recorded consumption using historical water data."
        eyebrow="Operations overview"
        title="Dashboard"
      />

      <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-water-50 text-water-700">
          <BarChart3 aria-hidden="true" className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-base font-extrabold text-navy-900">Reports live in Water Analytics</h2>
        <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">
          Historical summaries, trends, and forecasts moved to the descriptive analytics workspace. This page will grow live operational indicators next.
        </p>
        <Link
          className="ww-primary-button mt-5 inline-flex min-h-11 items-center justify-center px-5 text-sm"
          to="/admin/analytics?tab=descriptive"
        >
          Open Water Analytics
        </Link>
      </div>
    </main>
  );
}
