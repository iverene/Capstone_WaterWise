import { useEffect, useState } from "react";
import AnnouncementPage from "../components/AnnouncementPage";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PageHeader from "../components/PageHeader";
import { isCanceledRequest } from "../services/apiClient";
import { fetchConsumerAnnouncements } from "../services/consumerPortal.service";

export default function AnnouncementsPage() {
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
      <PageHeader
        description="Browse all official notice updates from WaterWise Administration."
        descriptionClassName="!text-[13px] !leading-5 sm:!text-sm sm:!leading-6"
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
          <AnnouncementPage announcements={announcements} paginate={false} showHeader={false} />
        </div>
      )}
    </div>
  );
}
