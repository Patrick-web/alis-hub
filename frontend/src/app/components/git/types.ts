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

export interface PRCommit {
  sha: string;
  message: string;
  author: string;
  timestamp: string;
}

export interface PRComment {
  id: number;
  body: string;
  author: string;
  createdAt: string;
  updatedAt: string;
}

export interface ForgejoPR {
  number: number;
  title: string;
  body: string;
  state: string;
  headBranch: string;
  baseBranch: string;
  author: string;
  htmlUrl: string;
  createdAt: string;
  mergeable: boolean;
}
