// Harness copy of src/components/quotes/QuotesLayout.tsx from the Lovable project (search box left out).
import { ReactNode, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";
import "./quotes.css";

const NAV = [
  { to: "/quotes", label: "Dashboard", end: true },
  { to: "/quotes/customers", label: "Customers", end: false },
  { to: "/quotes/quotes", label: "Quotes", end: false },
  { to: "/quotes/agreements", label: "Agreements", end: false },
  { to: "/quotes/settings", label: "Settings", end: false },
];

function Nav({ onPick }: { onPick?: () => void }) {
  return (
    <nav className="q-nav" aria-label="Quotes">
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} onClick={onPick} className={({ isActive }) => (isActive ? "active" : "")}>
          {n.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function QuotesLayout({ title, children }: { title: string; children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  document.title = title;
  return (
    <div className="q-root">
      <header className="q-header">
        <div className="q-header-inner">
          <Link to="/quotes" className="q-wordmark">AGILE RV HOUSING</Link>
          <div className="q-header-desktop">
            <Nav />
            <Link to="/quotes/new?kind=quote" className="q-new">New quote</Link>
          </div>
          <div className="q-header-phone">
            <button type="button" className="q-iconbtn" aria-label={menu ? "Close menu" : "Menu"} onClick={() => setMenu(!menu)}>
              {menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {menu && (
          <div className="q-phone-panel">
            <Nav onPick={() => setMenu(false)} />
          </div>
        )}
      </header>
      <main className="q-main">{children}</main>
    </div>
  );
}
