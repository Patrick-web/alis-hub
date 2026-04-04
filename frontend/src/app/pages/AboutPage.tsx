import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { Card, CardListItem } from '../components/Card';
import { ListItem } from '../components/ListItem';
import { Button } from '../components/Button';
import { Greet } from '../../../bindings/alis-hub-v3/greetservice';

export function AboutPage() {
  const [greeting, setGreeting] = useState('Calling Wails...');

  useEffect(() => {
    Greet('Design Library').then(setGreeting).catch(err => setGreeting('Error: ' + err));
  }, []);

  return (
    <div className="flex-1 overflow-auto p-[20px]">
      <div className="mb-[20px] p-[10px] bg-[#2c2c2c] rounded border border-[#464646] text-white">
        Wails Greeting: {greeting}
      </div>
      <div className="grid grid-cols-2 gap-[20px] max-w-[1200px]">
        {/* Project Details Card */}
        <Card title="Project Details" className="w-[475px]">
          <CardListItem label="Folder Identifier" value="626277833935" />
          <CardListItem label="Project Identifier" value="voyage-org-41x" />
          <CardListItem label="Billing Account" value="Alis Managed" />
          <CardListItem label="Default Region" value="us-east4" noBorder />
        </Card>

        {/* Git Repository Card */}
        <Card title="Git Repository" className="w-[475px]">
          <ListItem label="Git Remote server" icon={<Icon icon="solar:diamond-linear" className="text-white text-xl" />} onClick={() => {}} />
          <ListItem label="Cloud Run Instance" icon={<Icon icon="solar:diamond-linear" className="text-white text-xl" />} onClick={() => {}} />
          <ListItem label="Compute Engine VM" icon={<Icon icon="solar:diamond-linear" className="text-white text-xl" />} onClick={() => {}} />
          <ListItem label="Cloud Storage Bucket" icon={<Icon icon="solar:diamond-linear" className="text-white text-xl" />} onClick={() => {}} />
        </Card>

        {/* Google Cloud Spanner Instance Card */}
        <Card title="Google Cloud Spanner Instance" className="w-[475px]">
          <CardListItem label="Instance Project" value="voyage-org-41x" />
          <CardListItem label="Instance Name" value="default" />
          <CardListItem label="Processing Units" value="100" />
          <CardListItem label="Default Region" value="us-east4" noBorder />
          <div className="p-[10px] w-full">
            <Button 
              variant="secondary" 
              icon={<Icon icon="solar:link-square-linear" className="text-base" />}
              className="w-full"
            >
              Open on Google Cloud Console
            </Button>
          </div>
        </Card>

        {/* Cloud Load Balancing Card */}
        <Card title="Cloud Load Balancing" className="w-[475px]">
          <ListItem label="Navigate to Load Balancer" icon={<Icon icon="solar:diamond-linear" className="text-white text-xl" />} onClick={() => {}} />
          <ListItem label="Navigate to IP Addresses" icon={<Icon icon="solar:diamond-linear" className="text-white text-xl" />} onClick={() => {}} />
          <ListItem label="Navigate to Certificate Map" icon={<Icon icon="solar:diamond-linear" className="text-white text-xl" />} onClick={() => {}} />
        </Card>
      </div>
    </div>
  );
}
