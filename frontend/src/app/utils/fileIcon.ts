export function getFileIcon(path: string): string {
  const filename = (path.split('/').pop() ?? path).toLowerCase();

  // Special filenames
  if (filename === 'dockerfile' || filename.startsWith('dockerfile.')) return 'vscode-icons:file-type-docker';
  if (filename === '.gitignore' || filename === '.gitattributes' || filename === '.gitmodules') return 'vscode-icons:file-type-git';
  if (filename === 'package.json' || filename === 'package-lock.json') return 'vscode-icons:file-type-node';
  if (filename === 'tsconfig.json' || filename.startsWith('tsconfig')) return 'vscode-icons:file-type-tsconfig';
  if (filename === '.env' || filename.startsWith('.env.')) return 'vscode-icons:file-type-dotenv';
  if (filename === 'makefile') return 'vscode-icons:file-type-makefile';

  const ext = filename.split('.').pop() ?? '';
  switch (ext) {
    case 'ts':   return 'vscode-icons:file-type-typescript';
    case 'tsx':  return 'vscode-icons:file-type-reactts';
    case 'js':   return 'vscode-icons:file-type-js';
    case 'jsx':  return 'vscode-icons:file-type-reactjs';
    case 'go':   return 'vscode-icons:file-type-go';
    case 'py':   return 'vscode-icons:file-type-python';
    case 'rs':   return 'vscode-icons:file-type-rust';
    case 'json': return 'vscode-icons:file-type-json';
    case 'yaml':
    case 'yml':  return 'vscode-icons:file-type-yaml';
    case 'toml': return 'vscode-icons:file-type-toml';
    case 'html': return 'vscode-icons:file-type-html';
    case 'css':  return 'vscode-icons:file-type-css';
    case 'scss': return 'vscode-icons:file-type-scss';
    case 'md':   return 'vscode-icons:file-type-markdown';
    case 'sh':
    case 'bash': return 'vscode-icons:file-type-shell';
    case 'proto':return 'vscode-icons:file-type-proto';
    case 'sql':  return 'vscode-icons:file-type-db';
    case 'svg':  return 'vscode-icons:file-type-svg';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp': return 'vscode-icons:file-type-image';
    case 'lock': return 'vscode-icons:file-type-lock';
    default:     return 'vscode-icons:default-file';
  }
}
