import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Icon } from '@iconify/react';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';
import * as models from '../../../bindings/alis-hub-v3/models';

interface FileEntry {
  name: string;
  content: string;
}

type FolderTab = 'proto' | 'infra' | 'build';
const TABS: FolderTab[] = ['proto', 'infra', 'build'];
const TAB_LABEL: Record<FolderTab, string> = { proto: 'Proto', infra: 'Infra', build: 'Build' };

const RELEASE_LEVELS = [
  { label: 'EXPERIMENTAL', value: 3 },
  { label: 'ALPHA', value: 6 },
  { label: 'BETA', value: 9 },
  { label: 'RC', value: 12 },
  { label: 'GA', value: 99 },
];

const labelClass = 'text-[10px] font-bold uppercase text-white/40 mb-[2px]';
const textareaClass = "bg-[#1e1e1e] border border-[#464646] rounded-[4px] p-[10px] text-white text-[12px] font-['JetBrains_Mono',sans-serif] outline-none focus:border-[#f881a9] resize-none w-full transition-colors";
const selectClass = "bg-[#1e1e1e] border border-[#464646] rounded-[4px] px-[10px] py-[8px] text-white text-[12px] outline-none focus:border-[#f881a9] w-full transition-colors appearance-none";

const emptyFile = (): FileEntry => ({ name: '', content: '' });

export function CodeblockContributePage() {
  const navigate = useNavigate();
  const { id: blockId } = useParams<{ id: string }>();

  const [activeTab, setActiveTab] = useState<FolderTab>('proto');
  const [versionTag, setVersionTag] = useState('');
  const [releaseLevel, setReleaseLevel] = useState(3);
  const [releaseNotes, setReleaseNotes] = useState('');

  const [protoFiles, setProtoFiles] = useState<FileEntry[]>([emptyFile()]);
  const [infraFiles, setInfraFiles] = useState<FileEntry[]>([emptyFile()]);
  const [buildFiles, setBuildFiles] = useState<FileEntry[]>([emptyFile()]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function getFiles(tab: FolderTab) {
    if (tab === 'proto') return protoFiles;
    if (tab === 'infra') return infraFiles;
    return buildFiles;
  }

  function setFiles(tab: FolderTab, files: FileEntry[]) {
    if (tab === 'proto') setProtoFiles(files);
    else if (tab === 'infra') setInfraFiles(files);
    else setBuildFiles(files);
  }

  function updateFile(tab: FolderTab, idx: number, field: keyof FileEntry, value: string) {
    setFiles(tab, getFiles(tab).map((f, i) => i === idx ? { ...f, [field]: value } : f));
  }

  function addFile(tab: FolderTab) {
    setFiles(tab, [...getFiles(tab), emptyFile()]);
  }

  function removeFile(tab: FolderTab, idx: number) {
    setFiles(tab, getFiles(tab).filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      const toItems = (files: FileEntry[]) =>
        files
          .filter(f => f.name.trim())
          .map(f => models.CodeblockFileItem.createFrom({ name: f.name, content: f.content }));

      const params = models.ContributeBlockParams.createFrom({
        blockId: blockId ?? '',
        versionTag,
        releaseNotes,
        releaseLevel,
        protoFiles: toItems(protoFiles),
        infraFiles: toItems(infraFiles),
        buildFiles: toItems(buildFiles),
      });

      await (ProductService.ContributeBlock as (p: typeof params) => Promise<string>)(params);
      navigate(`/codeblocks/${blockId}/versions`);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const files = getFiles(activeTab);

  return (
    <div className="flex-1 overflow-hidden flex flex-row bg-[#1e1e1e]">
      {/* Sidebar */}
      <div className="w-[280px] shrink-0 flex flex-col border-r border-[#464646]">
        <button
          onClick={() => navigate(`/codeblocks/${blockId}/versions`)}
          className="flex items-center gap-[8px] px-[16px] py-[12px] text-[11px] text-white/50 hover:text-white/80 border-b border-[#464646] transition-colors"
        >
          <Icon icon="solar:arrow-left-linear" />
          Versions
        </button>

        <div className="flex-1 overflow-auto p-[16px] flex flex-col gap-[16px]">
          <div>
            <p className={labelClass}>Version Tag</p>
            <Input
              placeholder="e.g. v1.0.0-experimental1"
              className="w-full"
              value={versionTag}
              onChange={e => setVersionTag((e.target as HTMLInputElement).value)}
            />
            <p className="text-[10px] text-white/30 mt-[6px]">Semantic version identifier</p>
          </div>

          <div>
            <p className={labelClass}>Release Level</p>
            <select
              className={selectClass}
              value={releaseLevel}
              onChange={e => setReleaseLevel(Number(e.target.value))}
            >
              {RELEASE_LEVELS.map(l => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>

          <div>
            <p className={labelClass}>Release Notes</p>
            <textarea
              className={`${textareaClass} h-[100px]`}
              placeholder="Describe what changed in this version"
              value={releaseNotes}
              onChange={e => setReleaseNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="p-[10px] border-t border-[#464646] flex flex-col gap-[8px]">
          {error && (
            <div className="text-[11px] text-[#ff6b6b] bg-[rgba(255,107,107,0.08)] border border-[rgba(255,107,107,0.2)] rounded-[4px] p-[10px]">
              {error}
            </div>
          )}
          <Button variant="secondary" className="w-full" onClick={() => navigate(`/codeblocks/${blockId}/versions`)} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="w-full"
            icon={<Icon icon={loading ? 'solar:spinner-linear' : 'solar:upload-linear'} className={loading ? 'animate-spin' : ''} />}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Publishing...' : 'Publish Version'}
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center border-b border-[#464646] shrink-0">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-[24px] py-[12px] text-[11px] font-bold uppercase tracking-wider transition-all relative ${
                activeTab === t ? 'text-[#f881a9]' : 'text-white/40 hover:text-white/70'
              }`}
            >
              {TAB_LABEL[t]}
              {activeTab === t && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#f881a9]" />}
            </button>
          ))}
        </div>

        {/* File list */}
        <div className="flex-1 overflow-auto p-[24px]">
          <div className="max-w-[800px] flex flex-col gap-[16px]">
            {files.map((file, i) => (
              <div key={i} className="border border-[#464646] rounded-[4px] p-[12px] flex flex-col gap-[10px] relative">
                {files.length > 1 && (
                  <button
                    onClick={() => removeFile(activeTab, i)}
                    className="absolute top-[10px] right-[10px] text-white/30 hover:text-[#f881a9] transition-colors"
                  >
                    <Icon icon="solar:trash-bin-trash-linear" className="text-sm" />
                  </button>
                )}
                <div>
                  <p className={labelClass}>Filename</p>
                  <Input
                    placeholder={activeTab === 'proto' ? 'e.g. service.proto' : activeTab === 'infra' ? 'e.g. main.tf' : 'e.g. cloudbuild.yaml'}
                    className="w-full"
                    value={file.name}
                    onChange={e => updateFile(activeTab, i, 'name', (e.target as HTMLInputElement).value)}
                  />
                </div>
                <div>
                  <p className={labelClass}>Content</p>
                  <textarea
                    className={`${textareaClass} h-[200px]`}
                    placeholder="File contents..."
                    value={file.content}
                    onChange={e => updateFile(activeTab, i, 'content', e.target.value)}
                  />
                </div>
              </div>
            ))}

            <Button
              variant="secondary"
              className="w-full h-[40px]"
              icon={<Icon icon="solar:add-circle-linear" className="text-lg" />}
              onClick={() => addFile(activeTab)}
            >
              Add {TAB_LABEL[activeTab]} File
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
