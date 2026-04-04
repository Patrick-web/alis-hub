import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { Input } from '../components/Input';
import { Button } from '../components/Button';

export function CodeblockCreatePage() {
  const navigate = useNavigate();

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#1e1e1e] p-[20px]">
      {/* Title Box */}
      <div className="inline-block bg-[#1e1e1e] border border-[#f881a9] px-[20px] py-[10px] mb-[20px] relative z-10 -ml-[5px]">
        <h1 className="font-['JetBrains_Mono',sans-serif] font-bold text-[16px] text-[#f881a9] uppercase">
          Create Code Block
        </h1>
      </div>

      {/* Main Container */}
      <div className="flex-1 bg-[#1e1e1e] border border-[#f881a9] p-[30px] flex flex-col relative -mt-[31px]">
        <div className="flex-1 flex gap-[40px] overflow-auto mb-[20px]">
          {/* Core Details */}
          <div className="flex-1 flex flex-col gap-[20px]">
            <h2 className="font-['JetBrains_Mono',sans-serif] font-bold text-[14px] text-white uppercase">Core Details</h2>
            <div className="flex flex-col gap-[10px]">
              <label className="text-[11px] text-[rgba(255,255,255,0.7)] uppercase font-bold">Name</label>
              <Input placeholder="" className="w-full" />
            </div>
            <div className="flex flex-col gap-[10px]">
              <label className="text-[11px] text-[rgba(255,255,255,0.7)] uppercase font-bold">Tagline</label>
              <textarea className="bg-[#1e1e1e] border border-[#464646] rounded-[4px] p-[10px] h-[100px] text-white text-[12px] outline-none" />
            </div>
            <div className="flex flex-col gap-[10px]">
              <label className="text-[11px] text-[rgba(255,255,255,0.7)] uppercase font-bold">Hero Statement</label>
              <textarea className="bg-[#1e1e1e] border border-[#464646] rounded-[4px] p-[10px] h-[80px] text-white text-[12px] outline-none" />
            </div>
            <div className="flex flex-col gap-[10px]">
              <label className="text-[11px] text-[rgba(255,255,255,0.7)] uppercase font-bold">Description</label>
              <textarea className="bg-[#1e1e1e] border border-[#464646] rounded-[4px] p-[10px] h-[100px] text-white text-[12px] outline-none" />
            </div>
            <div className="flex flex-col gap-[10px]">
              <label className="text-[11px] text-[rgba(255,255,255,0.7)] uppercase font-bold">Highlights</label>
              <textarea className="bg-[#1e1e1e] border border-[#464646] rounded-[4px] p-[10px] h-[60px] text-white text-[12px] outline-none" />
            </div>
          </div>

          {/* Key Features */}
          <div className="flex-1 flex flex-col gap-[20px]">
            <h2 className="font-['JetBrains_Mono',sans-serif] font-bold text-[14px] text-white uppercase">Key Features</h2>
            <div className="flex flex-col gap-[10px]">
              <label className="text-[11px] text-[rgba(255,255,255,0.7)] uppercase font-bold">Feature Highlight</label>
              <Input placeholder="" className="w-full" />
            </div>
            <div className="flex flex-col gap-[10px]">
              <label className="text-[11px] text-[rgba(255,255,255,0.7)] uppercase font-bold">Feature Description</label>
              <textarea className="bg-[#1e1e1e] border border-[#464646] rounded-[4px] p-[10px] h-[150px] text-white text-[12px] outline-none" />
            </div>
            <Button variant="secondary" className="w-full bg-[rgba(255,255,255,0.03)] border-[#464646] h-[40px] uppercase font-bold text-[10px]" icon={<Icon icon="solar:add-circle-linear" className="text-lg" />}>
              Add Key Feature
            </Button>
          </div>

          {/* Code Architecture */}
          <div className="flex-1 flex flex-col gap-[20px]">
            <h2 className="font-['JetBrains_Mono',sans-serif] font-bold text-[14px] text-white uppercase">Code Architecture</h2>
            <div className="flex flex-col gap-[10px]">
              <label className="text-[11px] text-[rgba(255,255,255,0.7)] uppercase font-bold">Layer Title</label>
              <Input placeholder="" className="w-full" />
            </div>
            <div className="flex flex-col gap-[10px]">
              <label className="text-[11px] text-[rgba(255,255,255,0.7)] uppercase font-bold">Layer Description</label>
              <textarea className="bg-[#1e1e1e] border border-[#464646] rounded-[4px] p-[10px] h-[150px] text-white text-[12px] outline-none" />
            </div>
            <Button variant="secondary" className="w-full bg-[rgba(255,255,255,0.03)] border-[#464646] h-[40px] uppercase font-bold text-[10px]" icon={<Icon icon="solar:add-circle-linear" className="text-lg" />}>
              Add Code Architecture Layer
            </Button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-[15px]">
          <Button 
            variant="secondary" 
            className="w-[150px] border-[#f881a9] text-[#f881a9] uppercase font-bold h-[45px] hover:bg-[rgba(248,129,169,0.05)]"
            icon={<Icon icon="solar:alt-arrow-left-linear" className="text-xl" />}
            onClick={() => navigate('/codeblocks')}
          >
            Cancel
          </Button>
          <Button 
            variant="primary" 
            className="w-[150px] h-[45px] uppercase font-bold"
            icon={<Icon icon="solar:add-square-linear" className="text-xl" />}
          >
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}
