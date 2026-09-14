import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";

export default function AccountBackButton({ fallbackPath }) {
  const navigate = useNavigate();

  const goBack = () => {
    if (window.history.state?.idx > 0) {
      navigate(-1);
    } else {
      navigate(fallbackPath, { replace: true });
    }
  };

  return (
    <button
      className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-water-700 transition-colors hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
      onClick={goBack}
      type="button"
    >
      <ArrowLeft aria-hidden="true" className="h-5 w-5" />
      Back
    </button>
  );
}
