import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { Loader } from '../Loader';
import { Button } from '../Button';
import * as GS from '../../../../bindings/alis-hub-v3/gcloudservice';
import type { ARRepository, ARPackage, ARVersion } from '../../../../bindings/alis-hub-v3/models';

interface Props {
  projectID: string;
  region: string;
}

const FORMAT_ICONS: Record<string, string> = {
  GO: 'solar:code-linear',
  NPM: 'solar:box-minimalistic-linear',
  PYTHON: 'solar:programming-linear',
  DOCKER: 'solar:server-square-linear',
  MAVEN: 'solar:box-linear',
};

const FORMAT_LABELS: Record<string, string> = {
  GO: 'Go',
  NPM: 'NPM',
  PYTHON: 'Python',
  DOCKER: 'Docker',
  MAVEN: 'Maven',
};

function shortName(resourceName: string): string {
  const parts = resourceName.split('/');
  return parts[parts.length - 1] ?? resourceName;
}

function formatDate(ts: string): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString();
}

export function ArtifactRegistry({ projectID, region }: Props) {
  const [repos, setRepos] = useState<ARRepository[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedRepo, setExpandedRepo] = useState<string | null>(null);
  const [packages, setPackages] = useState<Record<string, ARPackage[]>>({});
  const [packagesLoading, setPackagesLoading] = useState<Record<string, boolean>>({});

  const [expandedPkg, setExpandedPkg] = useState<string | null>(null);
  const [versions, setVersions] = useState<Record<string, ARVersion[]>>({});
  const [versionsLoading, setVersionsLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!region) return;
    setLoading(true);
    setError(null);
    GS.ListRepositories(projectID, region)
      .then(setRepos)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projectID, region]);

  function toggleRepo(repoName: string) {
    if (expandedRepo === repoName) {
      setExpandedRepo(null);
      return;
    }
    setExpandedRepo(repoName);
    setExpandedPkg(null);
    if (!packages[repoName]) {
      const short = shortName(repoName);
      setPackagesLoading((p) => ({ ...p, [repoName]: true }));
      GS.ListPackages(projectID, region, short)
        .then((pkgs) => setPackages((p) => ({ ...p, [repoName]: pkgs })))
        .catch(() => setPackages((p) => ({ ...p, [repoName]: [] })))
        .finally(() => setPackagesLoading((p) => ({ ...p, [repoName]: false })));
    }
  }

  function togglePackage(pkg: ARPackage) {
    if (expandedPkg === pkg.name) {
      setExpandedPkg(null);
      return;
    }
    setExpandedPkg(pkg.name);
    if (!versions[pkg.name]) {
      setVersionsLoading((v) => ({ ...v, [pkg.name]: true }));
      GS.ListVersions(pkg.name)
        .then((vs) => setVersions((v) => ({ ...v, [pkg.name]: vs })))
        .catch(() => setVersions((v) => ({ ...v, [pkg.name]: [] })))
        .finally(() => setVersionsLoading((v) => ({ ...v, [pkg.name]: false })));
    }
  }

  if (!region) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[11px] text-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif]">
          No GCP region configured for this product
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-[16px] py-[10px] border-b border-[#464646]">
        <p className="text-[9px] font-bold uppercase text-[rgba(255,255,255,0.4)] font-['JetBrains_Mono',sans-serif]">
          {region} · {repos.length} repositories
        </p>
        <Button
          variant="ghost"
          onClick={() => GS.OpenInConsole('artifactregistry', projectID, '')}
          icon={<Icon icon="solar:export-linear" className="text-xs" />}
          className="text-[rgba(255,255,255,0.5)] hover:text-white"
        >
          Open in Console
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-[48px]"><Loader size={32} /></div>
        ) : error ? (
          <div className="m-[16px] p-[12px] bg-red-900/20 border border-red-800 rounded-[4px]">
            <p className="text-[10px] text-red-400 font-['JetBrains_Mono',sans-serif]">{error}</p>
          </div>
        ) : repos.length === 0 ? (
          <div className="flex items-center justify-center py-[48px]">
            <p className="text-[10px] text-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif]">No repositories found</p>
          </div>
        ) : (
          repos.map((repo) => {
            const repoShort = shortName(repo.name);
            const isExpanded = expandedRepo === repo.name;
            const icon = FORMAT_ICONS[repo.format] ?? 'solar:archive-linear';
            const formatLabel = FORMAT_LABELS[repo.format] ?? repo.format;
            const repoPackages = packages[repo.name] ?? [];
            const repoLoading = packagesLoading[repo.name] ?? false;

            return (
              <div key={repo.name} className="border-b border-[#2a2a2a]">
                <button
                  onClick={() => toggleRepo(repo.name)}
                  className="w-full flex items-center gap-[10px] px-[16px] py-[10px] hover:bg-[rgba(255,255,255,0.03)] transition-colors text-left"
                >
                  <Icon icon={icon} className="text-base text-[rgba(255,255,255,0.4)] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-['JetBrains_Mono',sans-serif] text-white truncate">{repoShort}</p>
                    {repo.description && (
                      <p className="text-[9px] text-[rgba(255,255,255,0.3)] truncate">{repo.description}</p>
                    )}
                  </div>
                  <span className="text-[8px] uppercase px-[5px] py-[1px] bg-[rgba(255,255,255,0.06)] rounded-[2px] text-[rgba(255,255,255,0.4)] font-['JetBrains_Mono',sans-serif] shrink-0">
                    {formatLabel}
                  </span>
                  <Icon
                    icon={isExpanded ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'}
                    className="text-xs text-[rgba(255,255,255,0.3)] shrink-0"
                  />
                </button>

                {isExpanded && (
                  <div className="bg-[#1e1e1e] border-t border-[#2a2a2a]">
                    {repoLoading ? (
                      <div className="flex items-center justify-center py-[24px]"><Loader size={20} /></div>
                    ) : repoPackages.length === 0 ? (
                      <p className="text-[10px] text-[rgba(255,255,255,0.2)] font-['JetBrains_Mono',sans-serif] px-[24px] py-[12px]">
                        No packages
                      </p>
                    ) : (
                      repoPackages.map((pkg) => {
                        const isPkgExpanded = expandedPkg === pkg.name;
                        const pkgDisplay = pkg.displayName || shortName(pkg.name);
                        const pkgVersions = versions[pkg.name] ?? [];
                        const pkgLoading = versionsLoading[pkg.name] ?? false;

                        return (
                          <div key={pkg.name} className="border-b border-[#2a2a2a] last:border-0">
                            <button
                              onClick={() => togglePackage(pkg)}
                              className="w-full flex items-center gap-[10px] px-[24px] py-[8px] hover:bg-[rgba(255,255,255,0.02)] transition-colors text-left"
                            >
                              <Icon icon="solar:box-minimalistic-linear" className="text-sm text-[rgba(255,255,255,0.3)] shrink-0" />
                              <span className="text-[10px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.7)] flex-1 truncate">
                                {pkgDisplay}
                              </span>
                              <span className="text-[9px] text-[rgba(255,255,255,0.2)] font-['JetBrains_Mono',sans-serif] shrink-0">
                                {formatDate(pkg.updateTime)}
                              </span>
                              <Icon
                                icon={isPkgExpanded ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'}
                                className="text-xs text-[rgba(255,255,255,0.2)] shrink-0"
                              />
                            </button>

                            {isPkgExpanded && (
                              <div className="bg-[#161616] border-t border-[#2a2a2a]">
                                {pkgLoading ? (
                                  <div className="flex items-center justify-center py-[16px]"><Loader size={16} /></div>
                                ) : pkgVersions.length === 0 ? (
                                  <p className="text-[9px] text-[rgba(255,255,255,0.2)] font-['JetBrains_Mono',sans-serif] px-[32px] py-[8px]">
                                    No versions
                                  </p>
                                ) : (
                                  pkgVersions.map((v) => (
                                    <div
                                      key={v.name}
                                      className="flex items-center gap-[10px] px-[32px] py-[6px] border-b border-[#1e1e1e] last:border-0"
                                    >
                                      <Icon icon="solar:tag-linear" className="text-xs text-[rgba(255,255,255,0.2)] shrink-0" />
                                      <span className="text-[9px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.6)] flex-1 truncate">
                                        {shortName(v.name)}
                                      </span>
                                      <span className="text-[9px] text-[rgba(255,255,255,0.2)] font-['JetBrains_Mono',sans-serif] shrink-0">
                                        {formatDate(v.createTime)}
                                      </span>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
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
