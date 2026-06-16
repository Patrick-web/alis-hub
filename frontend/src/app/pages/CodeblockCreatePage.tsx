import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Icon } from '@iconify/react';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Loader } from '../components/Loader';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';
import * as models from '../../../bindings/alis-hub-v3/models';

interface Feature {
  title: string;
  description: string;
}

interface ArchLayer {
  title: string;
  description: string;
}

type Tab = 'overview' | 'features' | 'architecture';
const TABS: Tab[] = ['overview', 'features', 'architecture'];
const TAB_LABEL: Record<Tab, string> = {
  overview: 'Overview',
  features: 'Features',
  architecture: 'Architecture',
};

const labelClass = 'text-[10px] font-bold uppercase text-white/40 mb-[2px]';
const textareaClass = 'bg-[#1e1e1e] border border-[#464646] rounded-[4px] p-[10px] text-white text-[12px] font-[\'JetBrains_Mono\',sans-serif] outline-none focus:border-[#f881a9] resize-none w-full transition-colors';

export function CodeblockCreatePage() {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id?: string }>();
  const isEditing = Boolean(editId);

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [initLoading, setInitLoading] = useState(isEditing);

  // Core identity (sidebar)
  const [blockId, setBlockId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [tagline, setTagline] = useState('');

  // Overview tab
  const [heroStatement, setHeroStatement] = useState('');
  const [description, setDescription] = useState('');
  const [highlightInput, setHighlightInput] = useState('');
  const [highlights, setHighlights] = useState<string[]>([]);

  // Features tab
  const [keyFeatures, setKeyFeatures] = useState<Feature[]>([{ title: '', description: '' }]);

  // Architecture tab
  const [codeArchitecture, setCodeArchitecture] = useState<ArchLayer[]>([{ title: '', description: '' }]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const highlightInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill in edit mode
  useEffect(() => {
    if (!isEditing || !editId) return;
    setInitLoading(true);
    (ProductService.GetCodeblock as (id: string) => Promise<any>)(editId)
      .then(b => {
        setBlockId(editId);
        setDisplayName(b.displayName ?? '');
        setTagline(b.tagline ?? '');
        setHeroStatement(b.headline ?? '');
        setDescription(b.description ?? '');
        setHighlights(b.highlights ?? []);
        if (b.keyFeatures?.length) {
          setKeyFeatures(b.keyFeatures.map((f: any) => ({ title: f.title ?? '', description: f.description ?? '' })));
        }
        if (b.codeArchitecture?.length) {
          setCodeArchitecture(b.codeArchitecture.map((l: any) => ({ title: l.title ?? '', description: l.description ?? '' })));
        }
      })
      .catch(console.error)
      .finally(() => setInitLoading(false));
  }, [editId, isEditing]);

  function addHighlight(value: string) {
    const trimmed = value.trim();
    if (trimmed && !highlights.includes(trimmed)) {
      setHighlights(prev => [...prev, trimmed]);
    }
    setHighlightInput('');
  }

  function updateFeature(idx: number, field: keyof Feature, value: string) {
    setKeyFeatures(prev => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f));
  }

  function updateLayer(idx: number, field: keyof ArchLayer, value: string) {
    setCodeArchitecture(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  }

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
        const params = models.CreateCodeblockParams.createFrom({
        blockId,
        displayName,
        tagline,
        heroStatement,
        description,
        highlights,
        keyFeatures: keyFeatures.filter(f => f.title || f.description).map(f =>
          models.CodeblockFeature.createFrom({ title: f.title, description: f.description })
        ),
        codeArchitecture: codeArchitecture.filter(l => l.title || l.description).map(l =>
          models.CodeblockLayer.createFrom({ title: l.title, description: l.description })
        ),
      });
      if (isEditing) {
        await (ProductService.UpdateCodeblock as (p: typeof params) => Promise<void>)(params);
        navigate(`/codeblocks/${editId}`);
      } else {
        const name = await (ProductService.CreateCodeblock as (p: typeof params) => Promise<string>)(params);
        const id = name.replace('blocks/', '');
        navigate(id ? `/codeblocks/${id}` : '/codeblocks');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    if (isEditing && editId) {
      navigate(`/codeblocks/${editId}`);
    } else {
      navigate('/codeblocks');
    }
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-row bg-[#1e1e1e]">
      {/* Sidebar */}
      <div className="w-[280px] shrink-0 flex flex-col border-r border-[#464646]">
        {/* Back */}
        <button
          onClick={handleCancel}
          className="flex items-center gap-[8px] px-[16px] py-[12px] text-[11px] text-white/50 hover:text-white/80 border-b border-[#464646] transition-colors"
        >
          <Icon icon="solar:arrow-left-linear" />
          {isEditing ? 'Block Details' : 'All Blocks'}
        </button>

        {/* Fields */}
        <div className="flex-1 overflow-auto p-[16px] flex flex-col gap-[16px]">
          {initLoading ? (
            <div className="flex items-center justify-center py-[40px]"><Loader /></div>
          ) : (
            <>
              <div>
                <p className={labelClass}>Block ID</p>
                <Input
                  placeholder="e.g. helloworld"
                  className="w-full"
                  value={blockId}
                  onChange={e => setBlockId((e.target as HTMLInputElement).value)}
                  disabled={isEditing}
                  style={isEditing ? { opacity: 0.4 } : undefined}
                />
                {!isEditing && (
                  <p className="text-[10px] text-white/30 mt-[6px]">Lowercase letters and numbers only</p>
                )}
              </div>

              <div>
                <p className={labelClass}>Display Name</p>
                <Input
                  placeholder="Enter a descriptive name"
                  className="w-full"
                  value={displayName}
                  onChange={e => setDisplayName((e.target as HTMLInputElement).value)}
                />
              </div>

              <div>
                <p className={labelClass}>Tagline</p>
                <Input
                  placeholder="Brief, compelling description"
                  className="w-full"
                  value={tagline}
                  onChange={e => setTagline((e.target as HTMLInputElement).value)}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-[10px] border-t border-[#464646] flex flex-col gap-[8px]">
          {error && (
            <div className="text-[11px] text-[#ff6b6b] bg-[rgba(255,107,107,0.08)] border border-[rgba(255,107,107,0.2)] rounded-[4px] p-[10px]">
              {error}
            </div>
          )}
          <Button variant="secondary" className="w-full" onClick={handleCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="w-full"
            icon={<Icon icon={loading ? 'solar:spinner-linear' : isEditing ? 'solar:pen-linear' : 'solar:add-square-linear'} className={loading ? 'animate-spin' : ''} />}
            onClick={handleSubmit}
            disabled={loading || initLoading}
          >
            {loading ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save Changes' : 'Create Block')}
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

        {/* Tab content */}
        <div className="flex-1 overflow-auto p-[24px]">
          <div className="max-w-[800px] flex flex-col gap-[20px]">

            {activeTab === 'overview' && (
              <>
                <div>
                  <p className={labelClass}>Hero Statement</p>
                  <textarea
                    className={`${textareaClass} h-[80px]`}
                    placeholder="Main value proposition or key message"
                    value={heroStatement}
                    onChange={e => setHeroStatement(e.target.value)}
                  />
                </div>

                <div>
                  <p className={labelClass}>Description</p>
                  <textarea
                    className={`${textareaClass} h-[120px]`}
                    placeholder="Detailed description of the block's functionality and benefits"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                  />
                </div>

                <div>
                  <p className={labelClass}>Highlights</p>
                  <div className="border border-[#464646] rounded-[4px] p-[8px] flex flex-wrap gap-[6px] min-h-[42px] focus-within:border-[#f881a9] transition-colors">
                    {highlights.map((h, i) => (
                      <span key={i} className="flex items-center gap-[4px] bg-[#2c2c2c] text-white text-[11px] px-[8px] py-[3px] rounded-[3px]">
                        {h}
                        <button onClick={() => setHighlights(prev => prev.filter((_, j) => j !== i))} className="text-white/40 hover:text-white ml-[2px]">×</button>
                      </span>
                    ))}
                    <input
                      ref={highlightInputRef}
                      className="bg-transparent outline-none text-white text-[12px] font-['JetBrains_Mono',sans-serif] flex-1 min-w-[140px]"
                      placeholder={highlights.length === 0 ? 'Type and press Enter…' : ''}
                      value={highlightInput}
                      onChange={e => setHighlightInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHighlight(highlightInput); } }}
                      onBlur={() => { if (highlightInput.trim()) addHighlight(highlightInput); }}
                    />
                  </div>
                  <p className="text-[10px] text-white/30 mt-[6px]">Press Enter after each highlight</p>
                </div>
              </>
            )}

            {activeTab === 'features' && (
              <>
                {keyFeatures.map((feat, i) => (
                  <div key={i} className="border border-[#464646] rounded-[4px] p-[12px] flex flex-col gap-[10px] relative">
                    {keyFeatures.length > 1 && (
                      <button
                        onClick={() => setKeyFeatures(prev => prev.filter((_, j) => j !== i))}
                        className="absolute top-[10px] right-[10px] text-white/30 hover:text-[#f881a9] transition-colors"
                      >
                        <Icon icon="solar:trash-bin-trash-linear" className="text-sm" />
                      </button>
                    )}
                    <div>
                      <p className={labelClass}>Feature Title</p>
                      <Input
                        placeholder="Feature name"
                        className="w-full"
                        value={feat.title}
                        onChange={e => updateFeature(i, 'title', (e.target as HTMLInputElement).value)}
                      />
                    </div>
                    <div>
                      <p className={labelClass}>Description</p>
                      <textarea
                        className={`${textareaClass} h-[80px]`}
                        placeholder="Describe what this feature does and its benefits"
                        value={feat.description}
                        onChange={e => updateFeature(i, 'description', e.target.value)}
                      />
                    </div>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  className="w-full h-[40px]"
                  icon={<Icon icon="solar:add-circle-linear" className="text-lg" />}
                  onClick={() => setKeyFeatures(prev => [...prev, { title: '', description: '' }])}
                >
                  Add Key Feature
                </Button>
              </>
            )}

            {activeTab === 'architecture' && (
              <>
                {codeArchitecture.map((layer, i) => (
                  <div key={i} className="border border-[#464646] rounded-[4px] p-[12px] flex flex-col gap-[10px] relative">
                    {codeArchitecture.length > 1 && (
                      <button
                        onClick={() => setCodeArchitecture(prev => prev.filter((_, j) => j !== i))}
                        className="absolute top-[10px] right-[10px] text-white/30 hover:text-[#f881a9] transition-colors"
                      >
                        <Icon icon="solar:trash-bin-trash-linear" className="text-sm" />
                      </button>
                    )}
                    <div>
                      <p className={labelClass}>Layer Title</p>
                      <Input
                        placeholder="Architecture layer name"
                        className="w-full"
                        value={layer.title}
                        onChange={e => updateLayer(i, 'title', (e.target as HTMLInputElement).value)}
                      />
                    </div>
                    <div>
                      <p className={labelClass}>Description</p>
                      <textarea
                        className={`${textareaClass} h-[80px]`}
                        placeholder="Describe the purpose and components of this layer"
                        value={layer.description}
                        onChange={e => updateLayer(i, 'description', e.target.value)}
                      />
                    </div>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  className="w-full h-[40px]"
                  icon={<Icon icon="solar:add-circle-linear" className="text-lg" />}
                  onClick={() => setCodeArchitecture(prev => [...prev, { title: '', description: '' }])}
                >
                  Add Architecture Layer
                </Button>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
