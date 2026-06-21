import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { Loader } from '../Loader';
import { Button } from '../Button';
import * as GS from '../../../../bindings/alis-hub-v3/gcloudservice';
import type { SMSecret, SMSecretVersion } from '../../../../bindings/alis-hub-v3/models';

interface Props {
  projectID: string;
}

const VERSION_STATE_STYLES: Record<string, string> = {
  ENABLED: 'text-green-400 bg-green-400/10',
  DISABLED: 'text-[rgba(255,255,255,0.3)] bg-[rgba(255,255,255,0.05)]',
  DESTROYED: 'text-red-400/50 bg-red-400/05',
};

function shortSecretName(resourceName: string): string {
  const parts = resourceName.split('/');
  return parts[parts.length - 1] ?? resourceName;
}

function shortVersionName(resourceName: string): string {
  const parts = resourceName.split('/');
  return parts[parts.length - 1] ?? resourceName;
}

function formatDate(ts: string): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString();
}

export function SecretManager({ projectID }: Props) {
  const [secrets, setSecrets] = useState<SMSecret[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedSecret, setExpandedSecret] = useState<string | null>(null);
  const [versions, setVersions] = useState<Record<string, SMSecretVersion[]>>({});
  const [versionsLoading, setVersionsLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLoading(true);
    setError(null);
    GS.ListSecrets(projectID)
      .then(setSecrets)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projectID]);

  function toggleSecret(secret: SMSecret) {
    if (expandedSecret === secret.name) {
      setExpandedSecret(null);
      return;
    }
    setExpandedSecret(secret.name);
    if (!versions[secret.name]) {
      setVersionsLoading((v) => ({ ...v, [secret.name]: true }));
      GS.ListSecretVersions(secret.name)
        .then((vs) => setVersions((v) => ({ ...v, [secret.name]: vs })))
        .catch(() => setVersions((v) => ({ ...v, [secret.name]: [] })))
        .finally(() => setVersionsLoading((v) => ({ ...v, [secret.name]: false })));
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-[16px] py-[10px] border-b border-border">
        <p className="text-[9px] font-bold uppercase text-[rgba(255,255,255,0.4)] font-mono">
          {secrets.length} secrets · Values are never shown
        </p>
        <Button
          variant="ghost"
          onClick={() => GS.OpenInConsole('secrets', projectID, '')}
          icon={<Icon icon="solar:export-linear" className="text-xs" />}
          className="text-[rgba(255,255,255,0.5)] hover:text-white"
        >
          Open in Console
        </Button>
      </div>

      {/* Notice */}
      <div className="flex items-center gap-[8px] px-[16px] py-[8px] bg-[rgba(248,129,169,0.05)] border-b border-border">
        <Icon icon="solar:shield-warning-linear" className="text-sm text-[rgba(248,129,169,0.5)] shrink-0" />
        <p className="text-[9px] text-[rgba(255,255,255,0.4)] font-mono">
          Secret values are access-controlled and are never fetched or displayed here
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-[48px]"><Loader size={32} /></div>
        ) : error ? (
          <div className="m-[16px] p-[12px] bg-red-900/20 border border-red-800 rounded-[4px]">
            <p className="text-[10px] text-red-400 font-mono">{error}</p>
          </div>
        ) : secrets.length === 0 ? (
          <div className="flex items-center justify-center py-[48px]">
            <p className="text-[10px] text-[rgba(255,255,255,0.3)] font-mono">No secrets found</p>
          </div>
        ) : (
          secrets.map((secret) => {
            const isExpanded = expandedSecret === secret.name;
            const secretVersions = versions[secret.name] ?? [];
            const secretLoading = versionsLoading[secret.name] ?? false;

            return (
              <div key={secret.name} className="border-b border-border">
                <button
                  onClick={() => toggleSecret(secret)}
                  className="w-full flex items-center gap-[10px] px-[16px] py-[10px] hover:bg-[rgba(255,255,255,0.03)] transition-colors text-left"
                >
                  <Icon icon="solar:lock-keyhole-linear" className="text-base text-[rgba(255,255,255,0.3)] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-mono text-white truncate">
                      {shortSecretName(secret.name)}
                    </p>
                    {secret.createTime && (
                      <p className="text-[9px] text-[rgba(255,255,255,0.3)]">Created {formatDate(secret.createTime)}</p>
                    )}
                  </div>
                  {secret.labels && Object.keys(secret.labels).length > 0 && (
                    <div className="flex gap-[4px] flex-wrap shrink-0 max-w-[120px]">
                      {Object.entries(secret.labels).slice(0, 2).map(([k, v]) => (
                        <span key={k} className="text-[8px] px-[4px] py-[1px] bg-[rgba(255,255,255,0.05)] rounded-[2px] text-[rgba(255,255,255,0.3)] font-mono">
                          {k}={v as string}
                        </span>
                      ))}
                    </div>
                  )}
                  <Icon
                    icon={isExpanded ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'}
                    className="text-xs text-[rgba(255,255,255,0.3)] shrink-0"
                  />
                </button>

                {isExpanded && (
                  <div className="bg-background border-t border-border">
                    <div className="px-[16px] py-[8px] border-b border-border">
                      <p className="text-[9px] text-[rgba(255,255,255,0.3)] font-mono uppercase font-bold">Versions</p>
                    </div>
                    {secretLoading ? (
                      <div className="flex items-center justify-center py-[20px]"><Loader size={20} /></div>
                    ) : secretVersions.length === 0 ? (
                      <p className="text-[10px] text-[rgba(255,255,255,0.2)] font-mono px-[16px] py-[12px]">
                        No versions
                      </p>
                    ) : (
                      secretVersions.map((v) => {
                        const state = v.state ?? 'ENABLED';
                        const stateStyle = VERSION_STATE_STYLES[state] ?? VERSION_STATE_STYLES['DISABLED'];
                        return (
                          <div
                            key={v.name}
                            className="flex items-center gap-[12px] px-[24px] py-[8px] border-b border-border last:border-0"
                          >
                            <Icon icon="solar:document-linear" className="text-sm text-[rgba(255,255,255,0.2)] shrink-0" />
                            <span className="text-[10px] font-mono text-[rgba(255,255,255,0.6)] w-[60px] shrink-0">
                              v{shortVersionName(v.name)}
                            </span>
                            <span className={`text-[8px] uppercase px-[5px] py-[1px] rounded-[2px] font-mono shrink-0 ${stateStyle}`}>
                              {state}
                            </span>
                            <span className="text-[9px] text-[rgba(255,255,255,0.2)] font-mono flex-1 text-right">
                              {formatDate(v.createTime)}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
