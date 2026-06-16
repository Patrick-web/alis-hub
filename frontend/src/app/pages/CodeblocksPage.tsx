import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { Input } from '../components/Input';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';
import { Loader } from '../components/Loader';

const RELEASE_LEVELS = ['All', 'Stable', 'Release Candidate', 'Beta', 'Alpha', 'Experimental'] as const;
type ReleaseFilter = typeof RELEASE_LEVELS[number];

const LEVEL_LABEL: Record<number, string> = {
  1: 'Experimental',
  2: 'Alpha',
  3: 'Beta',
  4: 'Release Candidate',
  5: 'Stable',
};

const LEVEL_COLOR: Record<number, string> = {
  1: 'text-red-400 border-red-400/30 bg-red-400/10',
  2: 'text-orange-400 border-orange-400/30 bg-orange-400/10',
  3: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
  4: 'text-blue-400 border-blue-400/30 bg-blue-400/10',
  5: 'text-green-400 border-green-400/30 bg-green-400/10',
};

const DEFAULT_BANNER = 'https://static.vecteezy.com/system/resources/previews/020/398/136/non_2x/abstract-background-banner-with-dark-red-and-black-gradations-vector.jpg';

interface Codeblock {
  name: string;
  displayName: string;
  releaseLevel: number;
  publisher: string;
  latestVersion: string;
  headline: string;
  description: string;
  bannerUrl: string;
  installCount: number;
}

function blockId(name: string): string {
  return name.replace('blocks/', '');
}

export function CodeblocksPage({ view = 'all' }: { view?: 'all' | 'mine' }) {
  const navigate = useNavigate();
  const [blocks, setBlocks] = useState<Codeblock[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [activeFilter, setActiveFilter] = useState<ReleaseFilter>('All');

  useEffect(() => {
    const fetch = view === 'mine'
      ? (ProductService.ListMyCodeblocks as () => Promise<Codeblock[]>)()
      : (ProductService.ListCodeblocks as () => Promise<Codeblock[]>)();
    fetch
      .then(data => setBlocks(data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [view]);

  const filtered = blocks.filter(cb => {
    if (activeFilter !== 'All') {
      const level = Object.entries(LEVEL_LABEL).find(([, v]) => v === activeFilter)?.[0];
      if (level && cb.releaseLevel !== Number(level)) return false;
    }
    if (filterText) {
      const q = filterText.toLowerCase();
      return cb.displayName.toLowerCase().includes(q) || cb.headline.toLowerCase().includes(q) || cb.description.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#1e1e1e]">
      {/* Toolbar */}
      <div className="border-b border-[#464646] px-[20px] py-[8px] flex items-center justify-between">
        <div className="flex items-center h-[34px]">
          <div className="bg-[#2c2c2c] border border-[#464646] px-[12px] h-full flex items-center justify-center border-r-0 rounded-l-[4px]">
            <p className="text-[12px] text-white">/</p>
          </div>
          <Input
            placeholder="Search blocks..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-[300px] border-l-0 rounded-l-none h-full"
            containerClassName="h-full"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="border-b border-[#464646] flex items-center px-[20px] gap-[4px]">
        {RELEASE_LEVELS.map(level => (
          <button
            key={level}
            onClick={() => setActiveFilter(level)}
            className={`px-[14px] py-[10px] text-[11px] font-bold uppercase transition-all relative ${
              activeFilter === level ? 'text-[#f881a9]' : 'text-white opacity-40 hover:opacity-70'
            }`}
          >
            {level}
            {activeFilter === level && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#f881a9]" />
            )}
          </button>
        ))}
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-auto p-[20px]">
        {loading ? (
          <div className="flex items-center justify-center h-[200px]">
            <Loader />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-[200px]">
            <p className="text-[13px] text-white opacity-30">No blocks found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[20px] max-w-[1400px]">
            {filtered.map(cb => (
              <div
                key={cb.name}
                onClick={() => navigate(`/codeblocks/${blockId(cb.name)}`)}
                className="bg-[#2c2c2c] border border-[#464646] rounded-[4px] cursor-pointer hover:border-[#f881a9] transition-all group overflow-hidden"
              >
                {/* Banner */}
                <div className="h-[140px] overflow-hidden relative">
                  <img
                    src={cb.bannerUrl || DEFAULT_BANNER}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_BANNER; }}
                  />
                  <div className="absolute top-[10px] right-[10px]">
                    <Icon icon="solar:info-circle-linear" className="text-white opacity-70 text-base" />
                  </div>
                </div>

                {/* Card body */}
                <div className="p-[16px]">
                  <div className="flex items-start justify-between mb-[8px]">
                    <h3 className="font-['JetBrains_Mono',sans-serif] font-bold text-[13px] text-white uppercase tracking-wider leading-[1.2] flex-1 pr-2">
                      {cb.displayName}
                    </h3>
                    {cb.releaseLevel > 0 && (
                      <span className={`text-[8px] font-bold uppercase border rounded px-[6px] py-[2px] shrink-0 ${LEVEL_COLOR[cb.releaseLevel] ?? 'text-white/50 border-white/10 bg-white/5'}`}>
                        {LEVEL_LABEL[cb.releaseLevel] ?? 'Unknown'}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-[rgba(255,255,255,0.6)] mb-[12px] leading-[1.4] h-[34px] overflow-hidden">
                    {cb.headline || cb.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-[rgba(255,255,255,0.4)] font-['JetBrains_Mono',sans-serif] truncate">
                      {cb.publisher || 'Alis Exchange'}
                    </p>
                    <div className="flex items-center gap-[5px]">
                      <Icon icon="solar:download-linear" className="text-white opacity-40 text-xs" />
                      <p className="text-[10px] text-[rgba(255,255,255,0.6)] font-bold">{cb.installCount}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
