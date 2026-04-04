import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { Input } from '../components/Input';
import { Button } from '../components/Button';

interface Codeblock {
  id: string;
  title: string;
  description: string;
  publisher: string;
  count: number;
}

const codeblocks: Codeblock[] = Array(18).fill({
  title: 'GEMINI ENTERPRISE',
  description: 'Creates a Gemini Enterprise App and provides RPCs to manage agents for it',
  publisher: 'Alis Exchange',
  count: 25,
}).map((cb, i) => ({ ...cb, id: i.toString() }));

export function CodeblocksPage() {
  const navigate = useNavigate();
  const [filterText, setFilterText] = useState('');

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#1e1e1e]">
      {/* Toolbar */}
      <div className="border-b border-[#464646] px-[20px] py-[8px] flex items-center justify-between">
        <div className="flex items-center h-[34px]">
          <div className="bg-[#2c2c2c] border border-[#464646] px-[12px] h-full flex items-center justify-center border-r-0 rounded-l-[4px]">
            <p className="text-[12px] text-white">/</p>
          </div>
          <Input 
            placeholder="Search..." 
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-[300px] border-l-0 rounded-l-none h-full"
            containerClassName="h-full"
          />
        </div>
        
        <div className="flex items-center gap-[10px]">
          <Button 
            variant="secondary" 
            className="px-[12px] py-[6px] h-[34px] uppercase text-[10px] font-bold" 
            icon={<Icon icon="solar:add-circle-linear" className="text-xl" />}
            onClick={() => navigate('/codeblocks/create')}
          >
            CREATE CODEBLOCK
          </Button>
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-auto p-[20px]">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[20px] max-w-[1400px]">
          {codeblocks.map((cb) => (
            <div 
              key={cb.id}
              onClick={() => navigate(`/codeblocks/${cb.id}`)}
              className="bg-[#2c2c2c] border border-[#464646] p-[20px] rounded-[4px] cursor-pointer hover:border-[#f881a9] transition-all group"
            >
              <div className="flex items-center justify-between mb-[10px]">
                <h3 className="font-['JetBrains_Mono',sans-serif] font-bold text-[14px] text-white uppercase tracking-wider">
                  {cb.title}
                </h3>
                <div className="bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded px-[6px] py-[2px]">
                  <p className="text-[8px] text-white opacity-50 font-bold italic">Alpha</p>
                </div>
              </div>
              <p className="text-[12px] text-[rgba(255,255,255,0.7)] mb-[15px] leading-[1.4] h-[34px] overflow-hidden">
                {cb.description}
              </p>
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-[rgba(255,255,255,0.5)] font-['JetBrains_Mono',sans-serif]">
                  {cb.publisher}
                </p>
                <div className="flex items-center gap-[5px]">
                  <p className="text-[10px] text-[rgba(255,255,255,0.7)] font-bold">{cb.count}</p>
                  <Icon icon="solar:box-linear" className="text-white opacity-50 text-xs" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
