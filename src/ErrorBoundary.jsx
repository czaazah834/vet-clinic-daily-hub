import React from "react";
import { TriangleAlert } from "lucide-react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("PawCare UI Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          padding: "24px",
          fontFamily: "Poppins, sans-serif"
        }}>
          <div style={{
            background: "#fff",
            borderRadius: "16px",
            padding: "32px",
            maxWidth: "520px",
            width: "100%",
            boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)",
            border: "1px solid #e2e8f0",
            textAlign: "center"
          }}>
            <div style={{ marginBottom: "12px", color: "#b42318" }}><TriangleAlert size={42} aria-hidden="true" /></div>
            <h2 style={{ margin: "0 0 8px", color: "var(--navy, #0f172a)", fontSize: "20px" }}>Something went wrong</h2>
            <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: "14px" }}>
              An error occurred while rendering the interface.
            </p>
            {this.state.error && (
              <pre style={{
                background: "#fef2f2",
                color: "#991b1b",
                padding: "12px",
                borderRadius: "8px",
                fontSize: "12px",
                textAlign: "left",
                overflowX: "auto",
                border: "1px solid #fecaca",
                marginBottom: "20px"
              }}>
                {String(this.state.error?.message || this.state.error)}
              </pre>
            )}
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button
                className="btn gold"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
                style={{ padding: "10px 20px" }}
              >
                Reload Clinic Hub
              </button>
              <button
                className="btn ghost"
                onClick={() => {
                  localStorage.clear();
                  window.location.href = "/";
                }}
                style={{ padding: "10px 20px" }}
              >
                Reset &amp; Home
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

