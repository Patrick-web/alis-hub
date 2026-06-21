"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const toastStyles = `
  [data-sonner-toast] {
    font-family: Inter, -apple-system, sans-serif !important;
    border-radius: 11px !important;
    backdrop-filter: blur(28px) saturate(160%) !important;
    -webkit-backdrop-filter: blur(28px) saturate(160%) !important;
    box-shadow: 0 8px 32px rgba(0,0,0,0.28), 0 0 0 0.5px rgba(255,255,255,0.04) inset !important;
  }

  /* Light mode base */
  [data-sonner-toast] {
    background: rgba(248,248,250,0.9) !important;
    border-color: rgba(0,0,0,0.07) !important;
    color: #1a1a1e !important;
  }
  [data-sonner-toast] [data-description] {
    color: rgba(26,26,30,0.5) !important;
  }
  [data-sonner-toast] [data-close-button] {
    background: rgba(0,0,0,0.05) !important;
    border-color: rgba(0,0,0,0.08) !important;
    color: rgba(26,26,30,0.45) !important;
  }

  /* Dark mode base */
  .dark [data-sonner-toast] {
    background: rgba(20,20,24,0.88) !important;
    border-color: rgba(255,255,255,0.08) !important;
    color: #f0f0f0 !important;
    box-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 0 0 0.5px rgba(255,255,255,0.04) inset !important;
  }
  .dark [data-sonner-toast] [data-description] {
    color: rgba(240,240,240,0.45) !important;
  }
  .dark [data-sonner-toast] [data-close-button] {
    background: rgba(255,255,255,0.05) !important;
    border-color: rgba(255,255,255,0.1) !important;
    color: rgba(240,240,240,0.4) !important;
  }

  /* Severity tints — radial scatter, info stays neutral */
  .dark [data-sonner-toast][data-type="success"] {
    background:
      radial-gradient(ellipse at 15% 60%, rgba(52,199,89,0.09) 0%, transparent 65%),
      radial-gradient(ellipse at 80% 20%, rgba(52,199,89,0.04) 0%, transparent 55%),
      rgba(20,20,24,0.88) !important;
  }
  .dark [data-sonner-toast][data-type="error"] {
    background:
      radial-gradient(ellipse at 15% 55%, rgba(212,24,61,0.11) 0%, transparent 65%),
      radial-gradient(ellipse at 85% 25%, rgba(212,24,61,0.04) 0%, transparent 55%),
      rgba(20,20,24,0.88) !important;
  }
  .dark [data-sonner-toast][data-type="warning"] {
    background:
      radial-gradient(ellipse at 15% 60%, rgba(250,200,0,0.08) 0%, transparent 65%),
      radial-gradient(ellipse at 80% 20%, rgba(250,200,0,0.03) 0%, transparent 55%),
      rgba(20,20,24,0.88) !important;
  }

  [data-sonner-toast][data-type="success"] {
    background:
      radial-gradient(ellipse at 15% 60%, rgba(52,199,89,0.08) 0%, transparent 65%),
      radial-gradient(ellipse at 80% 20%, rgba(52,199,89,0.03) 0%, transparent 55%),
      rgba(248,248,250,0.9) !important;
  }
  [data-sonner-toast][data-type="error"] {
    background:
      radial-gradient(ellipse at 15% 55%, rgba(212,24,61,0.09) 0%, transparent 65%),
      radial-gradient(ellipse at 85% 25%, rgba(212,24,61,0.03) 0%, transparent 55%),
      rgba(248,248,250,0.9) !important;
  }
  [data-sonner-toast][data-type="warning"] {
    background:
      radial-gradient(ellipse at 15% 60%, rgba(250,200,0,0.07) 0%, transparent 65%),
      radial-gradient(ellipse at 80% 20%, rgba(250,200,0,0.02) 0%, transparent 55%),
      rgba(248,248,250,0.9) !important;
  }

  /* Typography */
  [data-sonner-toast] [data-title] {
    font-size: 12px !important;
    font-weight: 600 !important;
    letter-spacing: -0.1px !important;
    line-height: 1.35 !important;
  }
  [data-sonner-toast] [data-description] {
    font-size: 11px !important;
    line-height: 1.45 !important;
    margin-top: 2px !important;
  }

  /* Action button — brand pink */
  [data-sonner-toast] [data-button] {
    font-size: 10.5px !important;
    font-weight: 600 !important;
    font-family: Inter, -apple-system, sans-serif !important;
    border-radius: 7px !important;
    padding: 4px 10px !important;
    height: auto !important;
    background: rgba(248,129,169,0.15) !important;
    color: #f881a9 !important;
    border: 1px solid rgba(248,129,169,0.25) !important;
    box-shadow: none !important;
  }
  [data-sonner-toast] [data-button]:hover {
    background: rgba(248,129,169,0.25) !important;
  }

  /* Cancel button */
  [data-sonner-toast] [data-cancel] {
    font-size: 10.5px !important;
    font-weight: 500 !important;
    font-family: Inter, -apple-system, sans-serif !important;
    border-radius: 7px !important;
    padding: 4px 10px !important;
    height: auto !important;
    background: rgba(255,255,255,0.06) !important;
    color: rgba(240,240,240,0.5) !important;
    border: 1px solid rgba(255,255,255,0.1) !important;
    box-shadow: none !important;
  }
  .dark [data-sonner-toast] [data-cancel]:hover {
    background: rgba(255,255,255,0.1) !important;
    color: rgba(240,240,240,0.7) !important;
  }

  /* Loading spinner track */
  [data-sonner-toast] [data-icon] svg circle {
    stroke: rgba(255,255,255,0.15) !important;
  }
`;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <>
      <style>{toastStyles}</style>
      <Sonner
        theme={theme as ToasterProps["theme"]}
        className="toaster group"
        closeButton
        expand={false}
        visibleToasts={5}
        gap={6}
        style={
          {
            "--border-radius": "11px",
          } as React.CSSProperties
        }
        {...props}
      />
    </>
  );
};

export { Toaster };
