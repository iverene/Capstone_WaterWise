import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AnnouncementPage from "../components/AnnouncementPage";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PageHeader from "../components/PageHeader";
import { isCanceledRequest } from "../services/apiClient";
import { fetchConsumerAnnouncements } from "../services/consumerPortal.service";

export default function AnnouncementsPage() {
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetchConsumerAnnouncements({ signal: controller.signal })
      .then(setAnnouncements)
      .catch((requestError) => {
        if (!isCanceledRequest(requestError)) setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="space-y-5 sm:space-y-6">
      <button
        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-water-700 hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
        onClick={() => navigate(-1)}
        type="button"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Back to home
      </button>
      <PageHeader
        description="Browse all official notice updates from WaterWise Administration."
        descriptionClassName="!text-[13px] !leading-5 sm:!text-sm sm:!leading-6"
        eyebrow="Community feed"
        title="Announcements"
      />
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <LoadingSkeleton count={4} label="Loading all announcements" variant="list" />
      ) : (
        <div className="mx-auto max-w-3xl">
          <AnnouncementPage announcements={announcements} showHeader={false} />
        </div>
      )}
    </div>
  );
}
