import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Icon } from '@iconify/react';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Loader } from '../components/Loader';
import { FilterSelect } from '../components/FilterSelect';
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

interface InstallOrg { name: string; displayName: string; }
interface InstallProduct { name: string; displayName: string; }
interface InstallNeuron { name: string; displayName: string; package: string; }

type Tab = 'overview' | 'features' | 'architecture' | 'files';

const BLOCK_ID_REGEX = /^[a-z0-9]{2,20}$/;

function deriveBlockId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
}

const TAB_LABEL: Record<Tab, string> = {
  overview: 'Overview',
  features: 'Features',
  architecture: 'Architecture',
  files: 'Files',
};

const CATEGORY_LABEL: Record<string, string> = { build: 'Build', infra: 'Infra', proto: 'Proto' };

const labelClass = 'text-[10px] font-bold uppercase text-foreground/40 mb-[2px]';
const textareaClass = 'bg-background border border-border rounded-[4px] p-[10px] text-foreground text-[12px] font-mono outline-none focus:border-brand-fill resize-none w-full transition-colors';

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

  // Cascade picker state
  const [orgs, setOrgs] = useState<InstallOrg[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [orgsError, setOrgsError] = useState<string | null>(null);
  const [orgsLoadAttempt, setOrgsLoadAttempt] = useState(0);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [products, setProducts] = useState<InstallProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [neurons, setNeurons] = useState<InstallNeuron[]>([]);
  const [neuronsLoading, setNeuronsLoading] = useState(false);
  const [selectedNeuron, setSelectedNeuron] = useState<InstallNeuron | null>(null);

  // Scanned files state
  const [scannedFiles, setScannedFiles] = useState<models.ScannedNeuronFile[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockIdTouched, setBlockIdTouched] = useState(false);
  const highlightInputRef = useRef<HTMLInputElement>(null);

  const suggestedBlockId = deriveBlockId(displayName);
  const showSuggestion = !isEditing && suggestedBlockId.length >= 2 && suggestedBlockId !== blockId;
  const blockIdError = (blockIdTouched && blockId.length > 0 && !BLOCK_ID_REGEX.test(blockId))
    ? 'Must be 2–20 lowercase letters and numbers only'
    : null;
  const blockIdInvalid = !isEditing && !BLOCK_ID_REGEX.test(blockId);

  const tabs: Tab[] = isEditing
    ? ['overview', 'features', 'architecture']
    : ['overview', 'features', 'architecture', 'files'];

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

  // Load orgs on mount (create mode only)
  useEffect(() => {
    if (isEditing || orgs.length > 0) return;
    setOrgsLoading(true);
    setOrgsError(null);
    (ProductService.ListInstallOrgs as () => Promise<InstallOrg[]>)()
      .then(list => setOrgs(list ?? []))
      .catch(e => setOrgsError(String(e)))
      .finally(() => setOrgsLoading(false));
  }, [orgsLoadAttempt]);

  // Load products when org selected
  useEffect(() => {
    if (!selectedOrg) return;
    setSelectedProduct('');
    setSelectedNeuron(null);
    setNeurons([]);
    setScannedFiles([]);
    setScanError(null);
    setActiveTab('overview');
    setProductsLoading(true);
    const orgId = selectedOrg.replace('organisations/', '');
    (ProductService.ListProducts as (org: string) => Promise<InstallProduct[]>)(orgId)
      .then(list => setProducts(list ?? []))
      .catch(e => setError(String(e)))
      .finally(() => setProductsLoading(false));
  }, [selectedOrg]);

  // Load neurons when product selected
  useEffect(() => {
    if (!selectedOrg || !selectedProduct) return;
    setSelectedNeuron(null);
    setScannedFiles([]);
    setScanError(null);
    setActiveTab('overview');
    setNeuronsLoading(true);
    const orgId = selectedOrg.replace('organisations/', '');
    const productId = selectedProduct.replace(/.*\/products\//, '');
    (ProductService.ListInstallNeurons as (org: string, product: string) => Promise<InstallNeuron[]>)(orgId, productId)
      .then(list => setNeurons(list ?? []))
      .catch(e => setError(String(e)))
      .finally(() => setNeuronsLoading(false));
  }, [selectedOrg, selectedProduct]);

  // Scan files when neuron selected
  useEffect(() => {
    if (!selectedNeuron) return;
    setScanLoading(true);
    setScanError(null);
    setScannedFiles([]);
    (ProductService.ScanNeuronFiles as (pkg: string) => Promise<models.NeuronScanResult | null>)(selectedNeuron.package)
      .then(result => {
        if (!result) return;
        if (result.error) {
          setScanError(result.error);
        } else {
          setScannedFiles(result.files ?? []);
          setActiveTab('files');
        }
      })
      .catch(e => setScanError(String(e)))
      .finally(() => setScanLoading(false));
  }, [selectedNeuron]);

  function toggleFile(idx: number) {
    setScannedFiles(prev => prev.map((f, i) => i === idx ? { ...f, selected: !f.selected } : f));
  }

  function selectAllFiles(selected: boolean) {
    setScannedFiles(prev => prev.map(f => ({ ...f, selected })));
  }

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

  function buildUpdateParams() {
    return models.CreateCodeblockParams.createFrom({
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
  }

  async function handleSubmit() {
    setError(null);
    if (!isEditing && !BLOCK_ID_REGEX.test(blockId)) {
      setBlockIdTouched(true);
      setError('Block ID must be 2–20 lowercase letters and numbers only (a-z, 0-9)');
      return;
    }
    setLoading(true);
    try {
      if (isEditing) {
        const params = buildUpdateParams();
        await (ProductService.UpdateCodeblock as (p: typeof params) => Promise<void>)(params);
        navigate(`/codeblocks/${editId}`);
      } else {
        const bParams = models.BootstrapBlockParams.createFrom({
          blockId,
          displayName,
          tagline,
          package: selectedNeuron!.package,
          files: scannedFiles,
        });
        const name = await (ProductService.BootstrapBlock as (p: typeof bParams) => Promise<string>)(bParams);
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

  const selectedFileCount = scannedFiles.filter(f => f.selected).length;
  const bootstrapSubmitDisabled = !isEditing && (!selectedNeuron || scanLoading || selectedFileCount === 0);
  const submitDisabled = loading || initLoading || bootstrapSubmitDisabled || blockIdInvalid;

  const submitLabel = loading
    ? (isEditing ? 'Saving...' : 'Bootstrapping...')
    : (isEditing ? 'Save Changes' : 'Bootstrap Block');

  const submitIcon = loading
    ? 'solar:spinner-linear'
    : isEditing ? 'solar:pen-linear' : 'solar:upload-square-linear';

  return (
    <div className="flex-1 overflow-hidden flex flex-row bg-background">
      {/* Sidebar */}
      <div className="w-[280px] shrink-0 flex flex-col border-r border-border">
        {/* Back */}
        <button
          onClick={handleCancel}
          className="flex items-center gap-[8px] px-[16px] py-[12px] text-[11px] text-foreground/50 hover:text-foreground/80 border-b border-border transition-colors"
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
              {/* Neuron cascade picker — create mode only */}
              {!isEditing && (
                <div className="flex flex-col gap-[12px]">
                  <div>
                    <p className={labelClass}>Organisation</p>
                    <FilterSelect
                      size="sm"
                      value={selectedOrg}
                      onChange={setSelectedOrg}
                      loading={orgsLoading}
                      placeholder="Select org…"
                      emptyLabel="No organisations"
                      options={orgs.map(o => ({ value: o.name, label: o.displayName || o.name.replace('organisations/', '') }))}
                    />
                    {orgsError && (
                      <button
                        onClick={() => setOrgsLoadAttempt(n => n + 1)}
                        className="mt-[4px] text-[10px] text-destructive hover:underline"
                      >
                        Failed to load — retry
                      </button>
                    )}
                  </div>
                  <div>
                    <p className={labelClass}>Product</p>
                    <FilterSelect
                      size="sm"
                      value={selectedProduct}
                      onChange={setSelectedProduct}
                      loading={productsLoading}
                      disabled={!selectedOrg}
                      placeholder="Select product…"
                      emptyLabel="No products"
                      options={products.map(p => ({ value: p.name, label: p.displayName || p.name }))}
                    />
                  </div>
                  <div>
                    <p className={labelClass}>Neuron</p>
                    <FilterSelect
                      size="sm"
                      value={selectedNeuron?.name ?? ''}
                      onChange={v => setSelectedNeuron(neurons.find(n => n.name === v) ?? null)}
                      loading={neuronsLoading}
                      disabled={!selectedProduct}
                      placeholder="Select neuron…"
                      emptyLabel="No neurons"
                      options={neurons.map(n => ({ value: n.name, label: n.displayName }))}
                    />
                    {selectedNeuron && !scanLoading && !scanError && (
                      <p className="mt-[6px] text-[10px] font-mono text-foreground/30">{selectedNeuron.package}</p>
                    )}
                    {scanLoading && (
                      <div className="flex items-center gap-[6px] mt-[6px]">
                        <Icon icon="solar:spinner-linear" className="text-[10px] text-foreground/40 animate-spin" />
                        <span className="text-[10px] text-foreground/40">Scanning files…</span>
                      </div>
                    )}
                    {scanError && (
                      <p className="mt-[6px] text-[10px] text-destructive">{scanError}</p>
                    )}
                  </div>
                </div>
              )}

              <div>
                <p className={labelClass}>Block ID</p>
                <Input
                  placeholder="e.g. helloworld"
                  className="w-full"
                  value={blockId}
                  onChange={e => { setBlockId((e.target as HTMLInputElement).value); setBlockIdTouched(true); }}
                  disabled={isEditing}
                  style={isEditing ? { opacity: 0.4 } : undefined}
                />
                {!isEditing && blockIdError && (
                  <p className="text-[10px] text-destructive mt-[4px]">{blockIdError}</p>
                )}
                {!isEditing && !blockIdError && showSuggestion && (
                  <div className="flex items-center gap-[6px] mt-[6px]">
                    <span className="text-[10px] text-foreground/30">Suggested:</span>
                    <button
                      onClick={() => { setBlockId(suggestedBlockId); setBlockIdTouched(true); }}
                      className="text-[10px] font-mono text-brand hover:underline"
                    >
                      {suggestedBlockId}
                    </button>
                  </div>
                )}
                {!isEditing && !blockIdError && !showSuggestion && (
                  <p className="text-[10px] text-foreground/30 mt-[6px]">Lowercase letters and numbers only, 2–20 chars</p>
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
        <div className="p-[10px] border-t border-border flex flex-col gap-[8px]">
          {error && (
            <div className="text-[11px] text-destructive bg-[rgba(255,107,107,0.08)] border border-[rgba(255,107,107,0.2)] rounded-[4px] p-[10px]">
              {error}
            </div>
          )}
          <Button variant="secondary" className="w-full" onClick={handleCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="w-full"
            icon={<Icon icon={submitIcon} className={loading ? 'animate-spin' : ''} />}
            onClick={handleSubmit}
            disabled={submitDisabled}
          >
            {submitLabel}
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center border-b border-border shrink-0">
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-[24px] py-[12px] text-[11px] font-bold uppercase tracking-wider transition-all relative ${
                activeTab === t ? 'text-brand' : 'text-foreground/40 hover:text-foreground/70'
              }`}
            >
              {TAB_LABEL[t]}
              {t === 'files' && selectedFileCount > 0 && (
                <span className="ml-[6px] text-[9px] bg-brand-fill/20 text-brand rounded-full px-[5px] py-[1px]">
                  {selectedFileCount}
                </span>
              )}
              {activeTab === t && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-fill" />}
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
                  <div className="border border-border rounded-[4px] p-[8px] flex flex-wrap gap-[6px] min-h-[42px] focus-within:border-brand-fill transition-colors">
                    {highlights.map((h, i) => (
                      <span key={i} className="flex items-center gap-[4px] bg-card text-foreground text-[11px] px-[8px] py-[3px] rounded-[3px]">
                        {h}
                        <button onClick={() => setHighlights(prev => prev.filter((_, j) => j !== i))} className="text-foreground/40 hover:text-foreground ml-[2px]">×</button>
                      </span>
                    ))}
                    <input
                      ref={highlightInputRef}
                      className="bg-transparent outline-none text-foreground text-[12px] font-mono flex-1 min-w-[140px]"
                      placeholder={highlights.length === 0 ? 'Type and press Enter…' : ''}
                      value={highlightInput}
                      onChange={e => setHighlightInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHighlight(highlightInput); } }}
                      onBlur={() => { if (highlightInput.trim()) addHighlight(highlightInput); }}
                    />
                  </div>
                  <p className="text-[10px] text-foreground/30 mt-[6px]">Press Enter after each highlight</p>
                </div>
              </>
            )}

            {activeTab === 'features' && (
              <>
                {keyFeatures.map((feat, i) => (
                  <div key={i} className="border border-border rounded-[4px] p-[12px] flex flex-col gap-[10px] relative">
                    {keyFeatures.length > 1 && (
                      <button
                        onClick={() => setKeyFeatures(prev => prev.filter((_, j) => j !== i))}
                        className="absolute top-[10px] right-[10px] text-foreground/30 hover:text-brand transition-colors"
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
                  <div key={i} className="border border-border rounded-[4px] p-[12px] flex flex-col gap-[10px] relative">
                    {codeArchitecture.length > 1 && (
                      <button
                        onClick={() => setCodeArchitecture(prev => prev.filter((_, j) => j !== i))}
                        className="absolute top-[10px] right-[10px] text-foreground/30 hover:text-brand transition-colors"
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

            {activeTab === 'files' && (
              <div className="flex flex-col gap-[16px]">
                {!selectedNeuron ? (
                  <p className="text-[12px] text-foreground/40">Select a neuron in the sidebar to scan its local files.</p>
                ) : scanLoading ? (
                  <div className="flex items-center gap-[10px] py-[20px]">
                    <Loader />
                    <span className="text-[12px] text-foreground/40">Scanning neuron files…</span>
                  </div>
                ) : scanError ? (
                  <div className="text-[12px] text-destructive bg-[rgba(255,107,107,0.06)] border border-[rgba(255,107,107,0.2)] rounded-[4px] p-[12px]">
                    {scanError}
                  </div>
                ) : scannedFiles.length === 0 ? (
                  <p className="text-[12px] text-foreground/40">No files found in this neuron.</p>
                ) : (
                  <>
                    <div className="flex items-center gap-[12px]">
                      <button
                        onClick={() => selectAllFiles(true)}
                        className="text-[10px] font-bold uppercase text-foreground/50 hover:text-foreground/80 tracking-wider transition-colors"
                      >
                        Select All
                      </button>
                      <span className="text-foreground/20">·</span>
                      <button
                        onClick={() => selectAllFiles(false)}
                        className="text-[10px] font-bold uppercase text-foreground/50 hover:text-foreground/80 tracking-wider transition-colors"
                      >
                        Deselect All
                      </button>
                      <span className="ml-auto text-[10px] text-foreground/30">
                        {selectedFileCount} / {scannedFiles.length} selected
                      </span>
                    </div>

                    {(Object.keys(CATEGORY_LABEL) as Array<keyof typeof CATEGORY_LABEL>).map(cat => {
                      const catFiles = scannedFiles
                        .map((f, idx) => ({ ...f, idx }))
                        .filter(f => f.category === cat);
                      if (catFiles.length === 0) return null;
                      return (
                        <div key={cat}>
                          <p className="text-[10px] font-bold uppercase text-foreground/40 mb-[8px] tracking-wider">
                            {CATEGORY_LABEL[cat]}
                          </p>
                          <div className="border border-border rounded-[4px] overflow-hidden">
                            {catFiles.map((file, i) => (
                              <label
                                key={file.idx}
                                className={`flex items-center gap-[10px] px-[12px] py-[8px] cursor-pointer hover:bg-foreground/[3%] transition-colors ${
                                  i > 0 ? 'border-t border-border' : ''
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={file.selected}
                                  onChange={() => toggleFile(file.idx)}
                                  className="accent-brand shrink-0"
                                />
                                <Icon icon="solar:file-code-linear" className="text-foreground/30 shrink-0 text-sm" />
                                <span className={`text-[11px] font-mono truncate ${
                                  file.selected ? 'text-foreground/80' : 'text-foreground/30'
                                }`}>
                                  {file.path}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
