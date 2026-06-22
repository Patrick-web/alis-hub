import type { DownloadProgress } from './WailsNotificationBridge';

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes: string;
}

interface Props {
  info: UpdateInfo;
  progress: DownloadProgress | null;
  installError: string | null;
  onInstall: () => void;
  onRetryDownload: () => void;
  onViewNotes: () => void;
  onDismiss: () => void;
}

export function UpdateNotification({ info, progress, installError, onInstall, onRetryDownload, onViewNotes, onDismiss }: Props) {
  const isPreparing = progress === null;
  const isDownloading = progress !== null && !progress.done;
  const isDone = progress?.done === true;

  const pct = progress && progress.total > 0
    ? Math.round((progress.downloaded / progress.total) * 100)
    : 0;
  const downloadedMB = progress ? (progress.downloaded / 1024 / 1024).toFixed(1) : '0';
  const totalMB = progress ? (progress.total / 1024 / 1024).toFixed(1) : '0';

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 9999,
        width: 320,
        background: 'rgba(38, 38, 40, 0.96)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
        overflow: 'hidden',
        fontFamily: "'JetBrains Mono', monospace",
        color: '#f0f0f0',
      }}
    >
      {/* Header */}
      <div style={{ padding: '11px 14px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 18, height: 18, borderRadius: 4,
          background: '#111', border: '1px solid #333',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, overflow: 'hidden',
        }}>
          <svg viewBox="0 0 14 14" fill="#e8192c" width="11" height="11" xmlns="http://www.w3.org/2000/svg">
            <circle cx="8" cy="1.5" r="1.5"/>
            <circle cx="12" cy="1.5" r="1.5"/>
            <circle cx="8" cy="5.5" r="1.5"/>
            <circle cx="12" cy="5.5" r="1.5"/>
            <circle cx="2" cy="9" r="1.5"/>
            <circle cx="6" cy="9" r="1.5"/>
            <circle cx="10" cy="9" r="1.5"/>
            <circle cx="2" cy="13" r="1.5"/>
            <circle cx="6" cy="13" r="1.5"/>
          </svg>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', flex: 1, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          AlisHub
        </span>
        {!isDownloading && !isDone && (
          <button
            onClick={onDismiss}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 14, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '8px 14px 0' }}>
        {/* Preparing */}
        {isPreparing && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>
                v{info.latestVersion} is available
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
                Preparing download…
              </div>
            </div>
            <div style={{
              width: 44, height: 44, borderRadius: 10, background: '#111',
              border: '1px solid #333', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg viewBox="0 0 32 32" fill="#e8192c" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
                <circle cx="19" cy="4" r="3"/>
                <circle cx="28" cy="4" r="3"/>
                <circle cx="19" cy="13" r="3"/>
                <circle cx="28" cy="13" r="3"/>
                <circle cx="4" cy="20" r="3"/>
                <circle cx="13" cy="20" r="3"/>
                <circle cx="22" cy="20" r="3"/>
                <circle cx="4" cy="29" r="3"/>
                <circle cx="13" cy="29" r="3"/>
              </svg>
            </div>
          </div>
        )}

        {/* Downloading */}
        {isDownloading && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>
              Downloading v{info.latestVersion}…
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 10 }}>
              {downloadedMB} MB of {totalMB} MB
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden', marginBottom: 5 }}>
              <div style={{
                height: '100%', width: `${pct}%`,
                background: 'linear-gradient(90deg, #e8192c, #ff5566)',
                borderRadius: 3, transition: 'width 0.3s ease',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>
              <span>{pct}%</span>
              <span>Will restart automatically</span>
            </div>
          </>
        )}

        {/* Done — installing / error */}
        {isDone && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>
              {installError ? 'Install failed' : 'Restarting…'}
            </div>
            {installError ? (
              <div style={{ fontSize: 11, color: 'rgba(255,92,95,0.9)', lineHeight: 1.5 }}>
                {installError}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
                v{info.latestVersion} downloaded. Applying update…
              </div>
            )}
          </>
        )}
      </div>

      {/* Actions */}
      <div style={{
        padding: '10px 10px 12px',
        display: 'flex',
        gap: 6,
        borderTop: '1px solid rgba(255,255,255,0.07)',
        marginTop: 10,
      }}>
        {isDownloading ? (
          <div style={{ ...ghostBtn, flex: 1, textAlign: 'center', color: 'rgba(255,255,255,0.35)', cursor: 'default' }}>
            Downloading…
          </div>
        ) : isDone ? (
          installError ? (
            <>
              <button onClick={onRetryDownload} style={ghostBtn}>Retry Download</button>
              <button onClick={onInstall} style={primaryBtn}>Install &amp; Restart</button>
            </>
          ) : (
            <div style={{ ...ghostBtn, flex: 1, textAlign: 'center', color: 'rgba(255,255,255,0.35)', cursor: 'default' }}>
              Restarting…
            </div>
          )
        ) : (
          <>
            <button onClick={onDismiss} style={ghostBtn}>Later</button>
            <button onClick={onViewNotes} style={ghostBtn}>Release Notes</button>
          </>
        )}
      </div>
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  flex: 1,
  background: 'rgba(255,255,255,0.08)',
  border: 'none',
  padding: '8px',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 11,
  color: '#f0f0f0',
  borderRadius: 8,
  cursor: 'pointer',
  textAlign: 'center',
};

const primaryBtn: React.CSSProperties = {
  ...ghostBtn,
  background: '#e8192c',
  fontWeight: 700,
};
