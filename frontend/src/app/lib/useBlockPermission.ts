import { useCallback, useEffect, useState } from "react";
import * as ProductService from "../../../bindings/alis-hub-v3/productservice";

export interface BlockAccessMember {
  member: string;
  displayName: string;
  email: string;
  photoUrl: string;
  role: string;
  roleLabel: string;
}

export interface BlockAccessData {
  members: BlockAccessMember[];
}

interface CodeblockPublisher {
  publisher: string;
}

// Resolves the current viewer's permission level on a block by comparing
// their account/user identity against the block's publisher field and its
// IAM access policy (roles/block.admin, roles/block.contributor). The
// publisher is always treated as at least admin, since blocks don't get an
// explicit IAM binding for their own creator.
//
// Pages reachable by a direct URL (edit/contribute/update) must call this
// themselves rather than trusting that the page which linked to them already
// gated navigation — the route itself has no server-side enforcement.
export function useBlockPermission(blockId: string) {
  const [loading, setLoading] = useState(true);
  const [publisher, setPublisher] = useState("");
  const [myAccountID, setMyAccountID] = useState("");
  const [myUserID, setMyUserID] = useState("");
  const [accessData, setAccessData] = useState<BlockAccessData | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);

  const loadAccessData = useCallback(() => {
    if (!blockId) return;
    setAccessError(null);
    (ProductService.GetBlockAccessData as (id: string) => Promise<BlockAccessData>)(blockId)
      .then((d) => setAccessData(d ?? { members: [] }))
      .catch((e) => setAccessError(String(e)));
  }, [blockId]);

  useEffect(() => {
    if (!blockId) return;
    setLoading(true);
    Promise.all([
      (ProductService.GetCodeblock as (id: string) => Promise<CodeblockPublisher>)(blockId).catch(
        () => null,
      ),
      (ProductService.GetMyPrimaryAccountID as () => Promise<string>)().catch(() => ""),
      (ProductService.GetMyUserID as () => Promise<string>)().catch(() => ""),
      (ProductService.GetBlockAccessData as (id: string) => Promise<BlockAccessData>)(
        blockId,
      ).catch(() => ({ members: [] })),
    ])
      .then(([block, accountID, userID, access]) => {
        setPublisher(block?.publisher ?? "");
        setMyAccountID(accountID ?? "");
        setMyUserID(userID ?? "");
        setAccessData(access ?? { members: [] });
      })
      .finally(() => setLoading(false));
  }, [blockId]);

  const isOwner = Boolean(myAccountID && publisher && publisher === myAccountID);
  const myRole = accessData?.members.find((m) => m.member === myUserID)?.role ?? null;
  const isAdmin = isOwner || myRole === "roles/block.admin";
  const isContributor = isAdmin || myRole === "roles/block.contributor";

  return {
    loading,
    isOwner,
    isAdmin,
    isContributor,
    accessData,
    accessError,
    reloadAccessData: loadAccessData,
  };
}
