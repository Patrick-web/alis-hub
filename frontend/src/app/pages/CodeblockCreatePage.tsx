import { useState, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
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

export function CodeblockCreatePage() {
  const navigate = useNavigate();

  const [blockId, setBlockId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [tagline, setTagline] = useState('');
  const [heroStatement, setHeroStatement] = useState('');
  const [description, setDescription] = useState('');
  const [highlightInput, setHighlightInput] = useState('');
  const [highlights, setHighlights] = useState<string[]>([]);
  const [keyFeatures, setKeyFeatures] = useState<Feature[]>([{ title: '', description: '' }]);
  const [codeArchitecture, setCodeArchitecture] = useState<ArchLayer[]>([{ title: '', description: '' }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const highlightInputRef = useRef<HTMLInputElement>(null);

  function addHighlight(value: string) {
    const trimmed = value.trim();
    if (trimmed && !highlights.includes(trimmed)) {
      setHighlights(prev => [...prev, trimmed]);
    }
    setHighlightInput('');
  }

  function removeHighlight(idx: number) {
    setHighlights(prev => prev.filter((_, i) => i !== idx));
  }

  function updateFeature(idx: number, field: keyof Feature, value: string) {
    setKeyFeatures(prev => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f));
  }

  function addFeature() {
    setKeyFeatures(prev => [...prev, { title: '', description: '' }]);
  }

  function removeFeature(idx: number) {
    setKeyFeatures(prev => prev.filter((_, i) => i !== idx));
  }

  function updateLayer(idx: number, field: keyof ArchLayer, value: string) {
    setCodeArchitecture(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  }

  function addLayer() {
    setCodeArchitecture(prev => [...prev, { title: '', description: '' }]);
  }

  function removeLayer(idx: number) {
    setCodeArchitecture(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleCreate() {
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
      const name = await ProductService.CreateCodeblock(params);
      const id = name.replace('blocks/', '');
      navigate(id ? `/codeblocks/${id}` : '/codeblocks');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const textareaClass = 'bg-[#1e1e1e] border border-[#464646] rounded-[4px] p-[10px] text-white text-[12px] outline-none focus:border-[#f881a9] resize-none w-full';
  const labelClass = 'text-[11px] text-[rgba(255,255,255,0.7)] uppercase font-bold';

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#1e1e1e] p-[20px]">
      {/* Title Box */}
      <div className="inline-block bg-[#1e1e1e] border border-[#f881a9] px-[20px] py-[10px] mb-[20px] relative z-10 -ml-[5px]">
        <h1 className="font-['JetBrains_Mono',sans-serif] font-bold text-[16px] text-[#f881a9] uppercase">
          Create Code Block
        </h1>
      </div>

      {/* Main Container */}
      <div className="flex-1 bg-[#1e1e1e] border border-[#f881a9] p-[30px] flex flex-col relative -mt-[31px] overflow-hidden">
        <div className="flex-1 flex gap-[40px] overflow-auto mb-[20px]">
          {/* Core Details */}
          <div className="flex-1 flex flex-col gap-[20px]">
            <h2 className="font-['JetBrains_Mono',sans-serif] font-bold text-[14px] text-white uppercase">Core Details</h2>

            <div className="flex flex-col gap-[10px]">
              <label className={labelClass}>Block ID</label>
              <Input
                placeholder="e.g. helloworld"
                className="w-full"
                value={blockId}
                onChange={e => setBlockId((e.target as HTMLInputElement).value)}
              />
              <span className="text-[10px] text-[rgba(255,255,255,0.4)]">Lowercase letters and numbers only</span>
            </div>

            <div className="flex flex-col gap-[10px]">
              <label className={labelClass}>Display Name</label>
              <Input
                placeholder="Enter a descriptive name"
                className="w-full"
                value={displayName}
                onChange={e => setDisplayName((e.target as HTMLInputElement).value)}
              />
            </div>

            <div className="flex flex-col gap-[10px]">
              <label className={labelClass}>Tagline</label>
              <Input
                placeholder="Brief, compelling description"
                className="w-full"
                value={tagline}
                onChange={e => setTagline((e.target as HTMLInputElement).value)}
              />
            </div>

            <div className="flex flex-col gap-[10px]">
              <label className={labelClass}>Hero Statement</label>
              <textarea
                className={`${textareaClass} h-[80px]`}
                placeholder="Main value proposition or key message"
                value={heroStatement}
                onChange={e => setHeroStatement(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-[10px]">
              <label className={labelClass}>Description</label>
              <textarea
                className={`${textareaClass} h-[100px]`}
                placeholder="Detailed description of the block's functionality and benefits"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-[10px]">
              <label className={labelClass}>Highlights</label>
              <div className="border border-[#464646] rounded-[4px] p-[8px] flex flex-wrap gap-[6px] min-h-[40px] focus-within:border-[#f881a9]">
                {highlights.map((h, i) => (
                  <span key={i} className="flex items-center gap-[4px] bg-[#2c2c2c] text-white text-[11px] px-[8px] py-[3px] rounded-[3px]">
                    {h}
                    <button onClick={() => removeHighlight(i)} className="text-[rgba(255,255,255,0.5)] hover:text-white ml-[2px]">×</button>
                  </span>
                ))}
                <input
                  ref={highlightInputRef}
                  className="bg-transparent outline-none text-white text-[12px] flex-1 min-w-[120px]"
                  placeholder={highlights.length === 0 ? 'Type and press Enter' : ''}
                  value={highlightInput}
                  onChange={e => setHighlightInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHighlight(highlightInput); } }}
                  onBlur={() => { if (highlightInput.trim()) addHighlight(highlightInput); }}
                />
              </div>
              <span className="text-[10px] text-[rgba(255,255,255,0.4)]">Press Enter after each highlight</span>
            </div>
          </div>

          {/* Key Features */}
          <div className="flex-1 flex flex-col gap-[20px]">
            <h2 className="font-['JetBrains_Mono',sans-serif] font-bold text-[14px] text-white uppercase">Key Features</h2>
            {keyFeatures.map((feat, i) => (
              <div key={i} className="flex flex-col gap-[10px] border border-[#2c2c2c] rounded-[4px] p-[12px] relative">
                {keyFeatures.length > 1 && (
                  <button
                    onClick={() => removeFeature(i)}
                    className="absolute top-[8px] right-[8px] text-[rgba(255,255,255,0.3)] hover:text-[#f881a9]"
                  >
                    <Icon icon="solar:trash-bin-trash-linear" className="text-sm" />
                  </button>
                )}
                <div className="flex flex-col gap-[6px]">
                  <label className={labelClass}>Feature Title</label>
                  <Input
                    placeholder="Feature name"
                    className="w-full"
                    value={feat.title}
                    onChange={e => updateFeature(i, 'title', (e.target as HTMLInputElement).value)}
                  />
                </div>
                <div className="flex flex-col gap-[6px]">
                  <label className={labelClass}>Feature Description</label>
                  <textarea
                    className={`${textareaClass} h-[100px]`}
                    placeholder="Describe what this feature does and its benefits"
                    value={feat.description}
                    onChange={e => updateFeature(i, 'description', e.target.value)}
                  />
                </div>
              </div>
            ))}
            <Button
              variant="secondary"
              className="w-full bg-[rgba(255,255,255,0.03)] border-[#464646] h-[40px] uppercase font-bold text-[10px]"
              icon={<Icon icon="solar:add-circle-linear" className="text-lg" />}
              onClick={addFeature}
            >
              Add Key Feature
            </Button>
          </div>

          {/* Code Architecture */}
          <div className="flex-1 flex flex-col gap-[20px]">
            <h2 className="font-['JetBrains_Mono',sans-serif] font-bold text-[14px] text-white uppercase">Code Architecture</h2>
            {codeArchitecture.map((layer, i) => (
              <div key={i} className="flex flex-col gap-[10px] border border-[#2c2c2c] rounded-[4px] p-[12px] relative">
                {codeArchitecture.length > 1 && (
                  <button
                    onClick={() => removeLayer(i)}
                    className="absolute top-[8px] right-[8px] text-[rgba(255,255,255,0.3)] hover:text-[#f881a9]"
                  >
                    <Icon icon="solar:trash-bin-trash-linear" className="text-sm" />
                  </button>
                )}
                <div className="flex flex-col gap-[6px]">
                  <label className={labelClass}>Layer Title</label>
                  <Input
                    placeholder="Architecture layer name"
                    className="w-full"
                    value={layer.title}
                    onChange={e => updateLayer(i, 'title', (e.target as HTMLInputElement).value)}
                  />
                </div>
                <div className="flex flex-col gap-[6px]">
                  <label className={labelClass}>Layer Description</label>
                  <textarea
                    className={`${textareaClass} h-[100px]`}
                    placeholder="Describe the purpose and components of this architecture layer"
                    value={layer.description}
                    onChange={e => updateLayer(i, 'description', e.target.value)}
                  />
                </div>
              </div>
            ))}
            <Button
              variant="secondary"
              className="w-full bg-[rgba(255,255,255,0.03)] border-[#464646] h-[40px] uppercase font-bold text-[10px]"
              icon={<Icon icon="solar:add-circle-linear" className="text-lg" />}
              onClick={addLayer}
            >
              Add Code Architecture Layer
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-[12px] text-[12px] text-[#ff6b6b] bg-[rgba(255,107,107,0.08)] border border-[rgba(255,107,107,0.2)] rounded-[4px] p-[10px]">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-[15px]">
          <Button
            variant="secondary"
            className="w-[150px] border-[#f881a9] text-[#f881a9] uppercase font-bold h-[45px] hover:bg-[rgba(248,129,169,0.05)]"
            icon={<Icon icon="solar:alt-arrow-left-linear" className="text-xl" />}
            onClick={() => navigate('/codeblocks')}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            className="w-[150px] h-[45px] uppercase font-bold"
            icon={<Icon icon={loading ? 'solar:spinner-linear' : 'solar:add-square-linear'} className={`text-xl${loading ? ' animate-spin' : ''}`} />}
            onClick={handleCreate}
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  );
}
