import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  LayoutDashboard, Users, Gamepad2, ArrowLeftRight,
  TrendingUp, FileText, Settings, LogOut, DollarSign
} from "lucide-react";

const navItems = [
  { section: "Main" },
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { section: "Management" },
  { to: "/players", label: "Players", icon: Users },
  { to: "/games", label: "Games", icon: Gamepad2 },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { section: "Finance" },
  { to: "/withdrawals", label: "Withdrawals", icon: DollarSign },
  { to: "/profit", label: "Profit & Revenue", icon: TrendingUp },
  { to: "/reports", label: "Reports", icon: FileText },
  { section: "System" },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <img src="/logo.png" alt="Logo" style={{ width: 44, height: "auto" }} />
        <div>
          <h1>ፋስት እቁብ</h1>
          <span>Admin Panel</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item, i) => {
          if (item.section) {
            return <div key={i} className="sidebar-section-title">{item.section}</div>;
          }
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              <Icon size={18} className="nav-icon" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", marginBottom: 8 }}>
          <div className="avatar" style={{ width: 32, height: 32, fontSize: 12 }}>
            {(admin?.display_name || admin?.name || "A")[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {admin?.display_name || admin?.name || "Admin"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Administrator</div>
          </div>
        </div>
        <button className="nav-item" onClick={handleLogout} style={{ color: "var(--danger)" }}>
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </div>
  );
}
