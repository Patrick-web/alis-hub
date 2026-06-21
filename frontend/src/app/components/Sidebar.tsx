import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Icon } from "@iconify/react";
import { SidebarNavItem } from "./SidebarNavItem";
import { Button } from "./Button";
import { Input } from "./Input";
import { EnvFormSheet } from "./EnvFormSheet";
import { ConfirmDialog } from "./ConfirmDialog";
import { MissingVarsModal } from "./MissingVarsModal";
import { useWorkspace, type LoadedEnv } from "../stores/workspace";
import { Call } from "@wailsio/runtime";
import * as ProductService from "../../../bindings/alis-hub-v3/productservice";

const developNavItems: {
  id: string;
  label: string;
  route?: string | null;
  icon: JSX.Element;
}[] = [];

const envNavItems = [
  {
    id: "production",
    label: "Production",
    icon: <Icon icon="solar:earth-linear" className="text-brand text-xl" />,
  },
  {
    id: "staging",
    label: "Staging",
    icon: <Icon icon="solar:cloud-linear" className="text-white text-xl" />,
  },
  {
    id: "development",
    label: "Development",
    icon: <Icon icon="solar:code-linear" className="text-white text-xl" />,
  },
];

const codeblockNavItems = [
  {
    id: "all",
    label: "All Codeblocks",
    route: "/codeblocks",
    icon: <Icon icon="solar:box-linear" className="text-brand text-xl" />,
  },
  {
    id: "mine",
    label: "My Codeblocks",
    route: "/codeblocks/mine",
    icon: <Icon icon="solar:user-linear" className="text-white text-xl" />,
  },
  {
    id: "starred",
    label: "Starred",
    route: null,
    icon: <Icon icon="solar:star-linear" className="text-white text-xl" />,
  },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, setActiveEnv, setLoadedEnvs, setActiveNeurons } =
    useWorkspace();
  const [activeBuildItem] = useState("");
  const [neuronFilter, setNeuronFilter] = useState("");

  // Env CRUD state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"create" | "edit">("create");
  const [editTarget, setEditTarget] = useState<LoadedEnv | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LoadedEnv | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [missingVarsOpen, setMissingVarsOpen] = useState(false);

  const isEnvironments = location.pathname.includes("/environments");
  const isBuilds = location.pathname.includes("/builds");
  const isCodeblocks = location.pathname.includes("/codeblocks");

  const currentPath = location.pathname;
  const activeDevelopId =
    developNavItems.find((i) => i.route === currentPath)?.id ?? "about";

  const dynamicEnvItems = state.loadedEnvs.map((env) => ({
    id: env.name,
    label: env.displayName,
    icon: (
      <Icon
        icon="solar:server-square-cloud-linear"
        className="text-brand text-xl"
      />
    ),
  }));

  let items: {
    id: string;
    label: string;
    route?: string | null;
    icon: JSX.Element;
  }[] = developNavItems;
  let header = "DEVELOP";
  let bottomButtonLabel = "";
  let bottomButtonIcon = (
    <Icon icon="solar:keyboard-linear" className="text-xl" />
  );
  let onBottomButtonClick: (() => void) | undefined;

  if (isEnvironments) {
    items = dynamicEnvItems.length > 0 ? dynamicEnvItems : envNavItems;
    header = "ENVIRONMENTS";
    bottomButtonLabel = "New Environment";
    bottomButtonIcon = (
      <Icon icon="solar:add-circle-linear" className="text-xl" />
    );
    onBottomButtonClick = () => {
      setSheetMode("create");
      setEditTarget(null);
      setSheetOpen(true);
    };
  } else if (isBuilds) {
    const q = neuronFilter.toLowerCase();
    items = state.neurons
      .filter((n) => !q || n.name.toLowerCase().includes(q))
      .map((n) => ({
      id: n.name,
      label: n.name,
      icon: (
        <Icon
          icon="solar:sledgehammer-line-duotone"
          className="text-xl"
          style={{
            color: state.activeNeuronIds[0] === n.name ? "#F881A9" : "white",
          }}
        />
      ),
    }));
    header = "BUILDS";
    bottomButtonLabel = "New Service";
    bottomButtonIcon = (
      <Icon icon="solar:add-circle-linear" className="text-xl" />
    );
  } else if (isCodeblocks) {
    items = codeblockNavItems;
    header = "CODEBLOCKS";
    bottomButtonLabel = "Create Block";
    bottomButtonIcon = (
      <Icon icon="solar:add-square-linear" className="text-xl" />
    );
    onBottomButtonClick = () => navigate("/codeblocks/create");
  }

  const getActiveItem = () => {
    if (isEnvironments) {
      if (dynamicEnvItems.length > 0)
        return state.activeEnvName || dynamicEnvItems[0]?.id;
      return envNavItems[0]?.id;
    }
    if (isBuilds)
      return (
        state.activeNeuronIds[0] || state.neurons[0]?.id || activeBuildItem
      );
    if (isCodeblocks)
      return (
        codeblockNavItems.find((i) => i.route && currentPath === i.route)?.id ??
        codeblockNavItems[0]?.id
      );
    return activeDevelopId;
  };

  const handleItemClick = (item: (typeof items)[0]) => {
    if (isEnvironments && dynamicEnvItems.length > 0) {
      setActiveEnv(item.id);
      const env = state.loadedEnvs.find(e => e.name === item.id);
      if (env) {
        Call.ByName('main.ProductService.SwitchEnvironment',
          state.organisation, state.product, env.name,
          env.gcpProjectId ?? '', env.gcpProjectNumber ?? '', env.gcpRegion ?? ''
        ).catch(console.error);
      }
    } else if (isBuilds) {
      setActiveNeurons([item.id]);
    }
    if ("route" in item && item.route) {
      navigate(item.route);
    }
  };

  const handleCreateEnv = async (
    displayName: string,
    envType: number,
    region: string,
  ) => {
    const result = await (
      ProductService.CreateEnvironment as (
        org: string,
        product: string,
        displayName: string,
        region: string,
        envType: number,
      ) => Promise<any>
    )(state.organisation, state.product, displayName, region, envType);
    const newEnv: LoadedEnv = {
      name: result?.name ?? "",
      displayName: result?.displayName ?? displayName,
      state: result?.state ?? 0,
      envType: result?.envType ?? envType,
    };
    const updated = [...state.loadedEnvs, newEnv];
    setLoadedEnvs(updated);
    if (newEnv.name) setActiveEnv(newEnv.name);
  };

  const handleEditEnv = async (displayName: string) => {
    if (!editTarget) return;
    const result = await (
      ProductService.UpdateEnvironment as (
        envName: string,
        displayName: string,
      ) => Promise<any>
    )(editTarget.name, displayName);
    const updated = state.loadedEnvs.map((e) =>
      e.name === editTarget.name
        ? { ...e, displayName: result?.displayName ?? displayName }
        : e,
    );
    setLoadedEnvs(updated);
  };

  const handleDeleteEnv = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await (
        ProductService.DeleteEnvironment as (envName: string) => Promise<void>
      )(deleteTarget.name);
      const updated = state.loadedEnvs.filter(
        (e) => e.name !== deleteTarget.name,
      );
      setLoadedEnvs(updated);
      if (state.activeEnvName === deleteTarget.name) {
        setActiveEnv(updated[0]?.name ?? "");
      }
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <div className="bg-card h-full relative shrink-0 w-[300px]">
        <div className="content-stretch flex flex-col items-center justify-between overflow-clip relative rounded-[inherit] size-full">
          <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
            <div className="px-[20px] py-[10px] w-full border-b border-border">
              <p className="font-mono font-bold text-[11px] text-white uppercase opacity-50">
                {header}
              </p>
            </div>
            {isBuilds && (
              <div className="px-[10px] py-[8px] border-b border-border w-full">
                <Input
                  placeholder="Filter services..."
                  value={neuronFilter}
                  onChange={(e) => setNeuronFilter(e.target.value)}
                  icon={<Icon icon="solar:magnifer-linear" className="text-[rgba(255,255,255,0.3)] text-sm" />}
                  className="w-full"
                />
              </div>
            )}
            {items.map((item) => (
              <SidebarNavItem
                key={item.id}
                label={item.label}
                icon={item.icon}
                active={getActiveItem() === item.id}
                onClick={() => handleItemClick(item)}
                onEdit={
                  isEnvironments && dynamicEnvItems.length > 0
                    ? () => {
                        const env = state.loadedEnvs.find(
                          (e) => e.name === item.id,
                        );
                        if (env) {
                          setEditTarget(env);
                          setSheetMode("edit");
                          setSheetOpen(true);
                        }
                      }
                    : undefined
                }
                onDelete={
                  isEnvironments && dynamicEnvItems.length > 0
                    ? () => {
                        const env = state.loadedEnvs.find(
                          (e) => e.name === item.id,
                        );
                        if (env) setDeleteTarget(env);
                      }
                    : undefined
                }
              />
            ))}
          </div>

          <div className="relative shrink-0 w-full">
            <div className="content-stretch flex flex-col items-start p-[10px] gap-[6px] relative w-full">
              {isEnvironments && (
                <Button
                  variant="secondary"
                  icon={
                    <Icon
                      icon="solar:danger-triangle-linear"
                      className="text-xl"
                    />
                  }
                  className="w-full h-[34px] text-[10px] font-bold uppercase"
                  onClick={() => setMissingVarsOpen(true)}
                >
                  Check Missing
                </Button>
              )}
              {bottomButtonLabel && (
                <Button
                  variant="primary"
                  icon={bottomButtonIcon}
                  className="w-full flex-col h-[60px]"
                  onClick={onBottomButtonClick}
                >
                  {bottomButtonLabel}
                </Button>
              )}
            </div>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="absolute border-border border-r border-solid inset-0 pointer-events-none"
        />
      </div>

      {/* Create / Edit sheet */}
      <EnvFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        mode={sheetMode}
        initialDisplayName={
          sheetMode === "edit" ? (editTarget?.displayName ?? "") : ""
        }
        onSubmit={
          sheetMode === "create"
            ? handleCreateEnv
            : (displayName, _envType, _region) => handleEditEnv(displayName)
        }
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Environment"
        description={
          <>
            Delete{" "}
            <span className="text-white">{deleteTarget?.displayName}</span>?
            This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        loading={deleteLoading}
        onConfirm={handleDeleteEnv}
      />

      {/* Missing variables modal */}
      <MissingVarsModal
        open={missingVarsOpen}
        onOpenChange={setMissingVarsOpen}
        loadedEnvs={state.loadedEnvs}
      />
    </>
  );
}
