export interface GitFileStatus {
  path: string;
  statusCode: string;
  oldPath: string;
}

export interface GitStatus {
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: string[];
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
