import { ProfileModal } from "./ProfileModal";
import { useProfileModal } from "../stores/profileModal";

export function GlobalProfileModal() {
  const { isOpen, initialTab, open, close } = useProfileModal();
  return (
    <ProfileModal
      open={isOpen}
      initialTab={initialTab}
      onOpenChange={(o) => (o ? open() : close())}
    />
  );
}
