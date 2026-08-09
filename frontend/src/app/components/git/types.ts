export interface GitFileStatus {
  path: string;
  statusCode: string;
  oldPath: string;
}

export interface GitStatus {
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: string[];
  conflicted: GitFileStatus[];
}

export interface GitFileDiff {
  oldContent: string;
  newContent: string;
  language: string;
  hunks: string[];
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
}

export interface GitCommit {
  hash: string;
  parentHashes: string[];
  subject: string;
  authorName: string;
  timestamp: number;
  refNames: string[];
}

// The pull request types are generated from the Go service, so they are
// re-exported here rather than restated. Hand-written copies were what forced
// the `as any as PRCommit[]` casts at every call site, and they silently went
// stale as fields were added to the Go structs.
export type {
  ForgejoPR,
  PRComment,
  PRCommit,
  PRCommentList,
  PRCommitList,
  PRDiff,
  PRDiffFile,
  PRFileList,
  PRList,
  PRRepoInfo,
  PRReview,
  PRReviewComment,
  PRUser,
  ReviewDraftComment,
} from "../../../../bindings/alis-hub-v3/models";
