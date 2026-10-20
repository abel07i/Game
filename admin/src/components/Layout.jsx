import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";

const pageTitles = {
  "/": { title: "Dashboard", subtitle: "Overview of platform activity" },
  "/players": { title: "Player Management", subtitle: "Manage and monitor all players" },
  "/games": { title: "Game Management", subtitle: "Monitor and manage all games" },
  "/transactions": { title: "Transactions", subtitle: "Complete transaction history" },
  "/withdrawals": { title: "Withdrawals", subtitle: "Process player payout requests" },
  "/profit": { title: "Profit & Revenue", subtitle: "Financial performance overview" },
  "/reports": { title: "Reports", subtitle: "Export and analyze platform data" },
  "/settings": { title: "Settings", subtitle: "Configure platform and admin settings" },
};

export default function Layout() {
  const { pathname } = useLocation();
  const basePath = "/" + pathname.split("/")[1];
  const meta = pageTitles[basePath] || { title: "Admin Panel", subtitle: "" };

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="main-content">
        <div className="topbar">
          <div>
            <div className="topbar-title">{meta.title}</div>
            {meta.subtitle && <div className="topbar-subtitle">{meta.subtitle}</div>}
          </div>
          <div className="topbar-right">
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </div>
          </div>
        </div>
        <div className="page-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
