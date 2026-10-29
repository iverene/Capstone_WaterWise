import { FiHome } from "react-icons/fi";
import { Link } from "react-router";
import { getStoredAccount, hasAuthenticatedSession } from "../services/authToken";

const homeByRole = {
  admin: "/admin/dashboard",
  "super-admin": "/admin/dashboard",
  "meter-reader": "/meter-reader/readings-entry",
  consumer: "/consumer/home",
};

export default function NotFoundPage() {
  const homePath = hasAuthenticatedSession()
    ? (homeByRole[getStoredAccount()?.role] ?? "/login")
    : "/login";

  return (
    <main className="flex min-h-screen flex-col bg-canvas bg-gradient-to-b from-water-50 to-transparent px-5 py-8 font-sans text-slate-900 sm:px-8 sm:py-12">
      <div className="m-auto flex w-full max-w-md flex-col items-center">
        <img
          alt="Sucol WaterWise logo"
          className="h-[72px] w-auto sm:h-[88px]"
          height="314"
          src="/Sucol_logo.webp"
          width="314"
        />
        <div className="ww-glass-strong mt-8 w-full rounded-2xl bg-white p-6 text-center sm:p-8">
          <p aria-hidden="true" className="text-5xl font-extrabold tracking-[-0.04em] text-water-200 sm:text-6xl">
            404
          </p>
          <h1 className="mt-4 text-2xl font-extrabold leading-tight tracking-[-0.04em] text-slate-900">
            This page doesn&apos;t exist
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            The link may be mistyped, or the page was moved. Your account and data are unaffected.
          </p>
          <div className="mt-6">
            <Link
              className="ww-primary-button flex min-h-12 w-full items-center justify-center gap-2 px-5 py-3 text-sm"
              to={homePath}
            >
              <FiHome aria-hidden="true" className="h-4 w-4" />
              {homePath === "/login" ? "Back to sign in" : "Back to home"}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
