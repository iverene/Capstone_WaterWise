import { Droplet } from "lucide-react";

export default function ResidentRegistrationIntro() {
  return <aside className="resident-registration-sidebar">
    <div className="resident-brand"><span><Droplet aria-hidden="true" size={28} /></span><div><strong>WaterWise</strong><p>Sucol Water System</p></div></div>
    <h2>Add a New<br />Resident</h2>
    <p className="resident-intro">Register a resident’s details to create their account and enable access to WaterWise services.</p>
    <svg className="resident-neighborhood" viewBox="0 0 320 310" fill="none" aria-hidden="true">
      <path d="M0 120 70 80 130 100 220 20 320 80V310H0Z" fill="#0863ac" />
      <path d="m0 165 75-35 92 20 91-60 62 23v197H0Z" fill="#064b89" />
      <path d="M0 228c115-35 173-13 320 26v56H0Z" fill="#167bc4" />
      <path d="M207 196C95 223 101 252 320 291" stroke="#53a5dc" strokeWidth="19" />
      <path d="M105 129 163 77l62 52v91H105Z" fill="#137bc5" />
      <path d="m91 133 72-66 77 65-12 11-65-55-62 56Z" fill="#033e70" />
      <path d="m163 88 62 54v78h-62Z" fill="#07538f" />
      <path d="M124 143h29v37h-29zM186 152h20v29h-20z" fill="#ffe0a0" stroke="#033e70" strokeWidth="4" />
      <path d="M138 144v35" stroke="#fff4d6" strokeWidth="3" />
      <path d="M172 187h20v33h-20Z" fill="#033e70" />
      <ellipse cx="55" cy="168" rx="27" ry="43" fill="#05568e" /><path d="M55 160v64m0-34-15-15m15 27 14-18" stroke="#033e70" strokeWidth="3" />
      <ellipse cx="282" cy="157" rx="32" ry="66" fill="#06477e" /><path d="M280 158v93m0-51-16-20m16 40 20-26" stroke="#187dc0" strokeWidth="4" />
    </svg>
    <blockquote>“Clean Water<br />Stronger Communities”</blockquote>
    <div className="resident-sidebar-mark" aria-hidden="true"><i /><i /><i /></div>
  </aside>;
}
