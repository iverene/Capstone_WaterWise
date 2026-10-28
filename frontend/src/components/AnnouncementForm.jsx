import { useRef, useState } from "react";
import {
  FileText,
  Megaphone,
  Send,
  ShieldCheck,
} from "lucide-react";
import Dropdown from "./Dropdown";
import Modal from "./Modal";

const ANNOUNCEMENT_CATEGORIES = [
  "General Announcement",
  "Water Interruption",
  "System Maintenance",
  "Service Restoration",
  "Emergency Notice",
];

const emptyAnnouncement = () => ({
  title: "",
  content: "",
  relatedEvent: "",
});

export default function AnnouncementForm({
  onSubmit,
  initialData = null,
  onCancel,
  hideComposeCard = false,
  isOpen: controlledIsOpen,
  onOpenChange: controlledOnOpenChange,
}) {
  const [announcement, setAnnouncement] = useState(() => initialData ?? emptyAnnouncement());
  const [errors, setErrors] = useState({});
  const [internalIsOpen, setInternalIsOpen] = useState(Boolean(initialData));
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef(null);

  const isOpen = controlledIsOpen ?? internalIsOpen;
  const setIsOpen = controlledOnOpenChange ?? setInternalIsOpen;

  const closeComposer = () => {
    if (submitting) return;
    setIsOpen(false);
    setErrors({});
    onCancel?.();
  };

  const handleChange = ({ target }) => {
    setAnnouncement((current) => ({ ...current, [target.name]: target.value }));
    setErrors((current) => ({ ...current, [target.name]: "" }));
  };

  const fieldClass = (name, extra = "") =>
    `mt-2 min-h-12 w-full rounded-xl border bg-white px-4 py-3 text-sm text-navy-900 outline-none transition-colors placeholder:text-slate-400 focus:ring-4 ${
      errors[name]
        ? "border-red-600 focus:border-red-600 focus:ring-red-100"
        : "border-slate-300 focus:border-water-600 focus:ring-water-100"
    } ${extra}`;
  const accessibility = (name) => ({
    "aria-describedby": errors[name] ? `announcement-${name}-error` : undefined,
    "aria-invalid": Boolean(errors[name]),
  });
  const fieldError = (name) =>
    errors[name] ? (
      <p className="mt-1.5 text-sm font-semibold text-red-700" id={`announcement-${name}-error`} role="alert">
        {errors[name]}
      </p>
    ) : null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!announcement.title.trim()) nextErrors.title = "Enter an announcement title.";
    if (!announcement.content.trim()) nextErrors.content = "Write the message residents need to know.";
    if (!announcement.relatedEvent) nextErrors.relatedEvent = "Select an announcement category.";
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      requestAnimationFrame(() =>
        formRef.current?.querySelector('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    if (!onSubmit) return;

    try {
      setSubmitting(true);
      const saved = await onSubmit(announcement);
      if (saved !== false) {
        if (!initialData) setAnnouncement(emptyAnnouncement());
        setIsOpen(false);
        setErrors({});
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {!hideComposeCard && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-5" aria-label="Create announcement">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-water-100 text-water-700">
              <Megaphone aria-hidden="true" className="h-5 w-5" />
            </span>
            <button
              className="min-h-12 flex-1 rounded-full bg-slate-100 px-5 text-left text-sm font-semibold text-slate-500 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
              onClick={() => setIsOpen(true)}
              type="button"
            >
              Share an update with residents…
            </button>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 text-emerald-600" />
              Published by WaterWise administrators
            </span>
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-water-700 hover:bg-water-50"
              onClick={() => setIsOpen(true)}
              type="button"
            >
              <Send aria-hidden="true" className="h-4 w-4" />
              Create post
            </button>
          </div>
        </section>
      )}

      <Modal
        closeLabel="Close announcement form"
        description="This message will appear in every resident portal."
        dismissible={!submitting}
        eyebrow="Community post"
        isOpen={isOpen}
        onClose={closeComposer}
        showCloseButton={false}
        size="md"
        title={initialData ? "Update Announcement" : "Create Announcement"}
      >
              <form className="space-y-5 p-5 sm:p-6" onSubmit={handleSubmit} ref={formRef}>
                <div>
                  <label className="text-sm font-bold text-slate-700" htmlFor="announcement-title">Announcement title</label>
                  <div className="relative">
                    <FileText aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 mt-1 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      {...accessibility("title")}
                      autoComplete="off"
                      className={fieldClass("title", "pl-11")}
                      id="announcement-title"
                      maxLength={255}
                      name="title"
                      onChange={handleChange}
                      placeholder="Enter a clear announcement title"
                      value={announcement.title}
                    />
                  </div>
                  {fieldError("title")}
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-bold text-slate-700" htmlFor="announcement-content">Message</label>
                    <span className="text-xs font-medium text-slate-400">{announcement.content.length} characters</span>
                  </div>
                  <textarea
                    {...accessibility("content")}
                    className={fieldClass("content", "min-h-40 resize-y leading-6")}
                    id="announcement-content"
                    name="content"
                    onChange={handleChange}
                    placeholder="Write the information residents need to know…"
                    rows={6}
                    value={announcement.content}
                  />
                  {fieldError("content")}
                </div>

                <div>
                    <label className="text-sm font-bold text-slate-700" htmlFor="announcement-type">Category</label>
                    <Dropdown
                      ariaDescribedBy={accessibility("relatedEvent")["aria-describedby"]}
                      ariaInvalid={accessibility("relatedEvent")["aria-invalid"]}
                      ariaLabel="Select announcement category"
                      className="mt-2"
                      id="announcement-type"
                      name="relatedEvent"
                      onValueChange={(value) => handleChange({ target: { name: "relatedEvent", value } })}
                      options={ANNOUNCEMENT_CATEGORIES.map((category) => ({ label: category, value: category }))}
                      placeholder="Select category"
                      value={announcement.relatedEvent}
                    />
                    {fieldError("relatedEvent")}
                </div>

                <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
                  <button
                    className="min-h-12 rounded-xl border border-slate-300 bg-white px-5 font-bold text-navy-900 hover:bg-slate-50 disabled:opacity-60"
                    disabled={submitting}
                    onClick={closeComposer}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-water-600 px-5 font-bold text-white hover:bg-water-700 disabled:bg-water-300"
                    disabled={submitting}
                    type="submit"
                  >
                    <Send aria-hidden="true" className="h-4 w-4" />
                    {submitting ? "Publishing…" : initialData ? "Save changes" : "Publish announcement"}
                  </button>
                </div>
              </form>
      </Modal>
    </>
  );
}
