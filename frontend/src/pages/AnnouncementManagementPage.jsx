import { useCallback, useEffect, useMemo, useState } from "react";
import { FiPlus } from "react-icons/fi";
import AnnouncementForm from "../components/AnnouncementForm";
import AnnouncementPage from "../components/AnnouncementPage";
import Filter from "../components/Filter";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PageHeader from "../components/PageHeader";
import Search from "../components/Search";
import { useToast } from "../components/Toast";
import {
  createAnnouncement,
  fetchAnnouncements,
} from "../services/announcementAPI";

export default function AnnouncementManagementPage() {
  const toast = useToast();
  const [announcements, setAnnouncements] = useState([]);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);

  const loadAnnouncements = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setAnnouncements(await fetchAnnouncements());
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ??
          requestError.message ??
          "Unable to load announcements.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () =>
      fetchAnnouncements()
        .then((records) => {
          if (active) {
            setAnnouncements(records);
            setError("");
          }
        })
        .catch((requestError) => {
          if (active) {
            setError(
              requestError?.response?.data?.message ??
                requestError.message ??
                "Unable to load announcements.",
            );
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });

    refresh();
    const intervalId = window.setInterval(refresh, 15000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const saveAnnouncement = async (announcement) => {
    try {
      setError("");
      const saved = await createAnnouncement(announcement);
      toast.success("Announcement published", "The announcement is now visible in every resident portal.");
      await loadAnnouncements();
      return saved;
    } catch (requestError) {
      const validationErrors = requestError?.response?.data?.errors;
      const message = validationErrors
        ? Object.values(validationErrors).join(" ")
        : requestError?.response?.data?.message ?? requestError.message ?? "Unable to save announcement.";
      setError(message);
      toast.error("Announcement not published", message);
      return false;
    }
  };

  const categories = useMemo(
    () => [...new Set(announcements.map((item) => item.relatedEvent).filter(Boolean))],
    [announcements],
  );

  const filteredAnnouncements = useMemo(() => {
    const term = query.trim().toLowerCase();
    return announcements.filter((announcement) => {
      const matchesCategory =
        category === "all" || announcement.relatedEvent === category;
      const matchesQuery =
        !term ||
        [announcement.title, announcement.content, announcement.relatedEvent]
          .some((value) => String(value ?? "").toLowerCase().includes(term));
      return matchesCategory && matchesQuery;
    });
  }, [announcements, category, query]);

  return (
    <main className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <PageHeader
          description="Publish clear service notices and keep residents informed about water-system updates."
          eyebrow="Community communication"
          title="Announcement management"
        />
        <div className="hidden pt-8 lg:block">
          <button
            className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-water-600 px-5 text-sm font-bold text-white shadow-card transition-colors hover:bg-water-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 focus-visible:ring-offset-2"
            onClick={() => setIsFormOpen(true)}
            type="button"
          >
            <FiPlus aria-hidden="true" className="h-5 w-5" />
            Create post
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="min-w-0 space-y-4">
        <div
          aria-label="Announcement list controls"
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
          role="search"
        >
          <Search
            ariaLabel="Search announcements"
            className="flex-1"
            onValueChange={setQuery}
            placeholder="Search title, message, or category"
            tone="emerald"
            value={query}
          />
          <Filter
            ariaLabel="Filter announcements by category"
            className="w-full sm:w-52"
            onValueChange={setCategory}
            options={[
              { label: "All categories", value: "all" },
              ...categories.map((item) => ({ label: item, value: item })),
            ]}
            tone="emerald"
            value={category}
          />
        </div>

        {loading ? (
          <LoadingSkeleton label="Loading announcements" variant="list" />
        ) : (
          <AnnouncementPage announcements={filteredAnnouncements} />
        )}
      </div>

      <AnnouncementForm
        hideComposeCard
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSubmit={saveAnnouncement}
      />
    </main>
  );
}
