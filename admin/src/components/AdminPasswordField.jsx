import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Reusable step-up admin password confirmation input for sensitive operations.
 */
export default function AdminPasswordField({
  id,
  label = "Confirm Your Admin Password",
  value,
  onChange,
  submitting = false,
  helperText = "",
  placeholder = "Enter your current admin password",
  onEnter
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="mt-4">
      <label className="form-label text-xs font-medium" htmlFor={id}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <input
          id={id}
          type={show ? "text" : "password"}
          className="form-input"
          style={{ paddingRight: 38 }}
          placeholder={placeholder}
          autoComplete="current-password"
          value={value}
          disabled={submitting}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onEnter ? (e) => { if (e.key === "Enter") { e.preventDefault(); onEnter(); } } : undefined}
          required
        />
        <button
          type="button"
          aria-label={show ? "Hide password" : "Show password"}
          onClick={() => setShow(prev => !prev)}
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: 4
          }}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {helperText && (
        <span className="text-muted text-xs mt-1 block">{helperText}</span>
      )}
    </div>
  );
}

