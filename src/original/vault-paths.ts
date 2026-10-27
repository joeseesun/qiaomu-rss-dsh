// Extracted unchanged from Qiaomu RSS 0.32.9 vault-export.ts.
import {normalizePath} from '../client/original-ui';
import {folderPath} from './model';

/** An empty value or the picker root means the vault root, never an OS path. */
export function articleFolderPath(value: string): string {
  return !value.trim() || value.trim() === '/' ? '' : folderPath(value);
}

/** "<name>.md", then "<name> (2).md" … — saving the same article twice never overwrites the first note. */
export function availableNotePath(exists: (path: string) => boolean, folder: string, name: string): string {
  for (let n = 1; ; n++) {
    const path = normalizePath(`${folder && folder !== '/' ? `${folder}/` : ''}${name}${n > 1 ? ` (${n})` : ''}.md`);
    if (!exists(path)) return path;
  }
}

/** Replaces the placeholder image targets turndown wrote with the host-generated embed for each saved attachment. */
export function linkAttachments(markdown: string, links: Map<string, string>): string {
  return markdown.replace(/!\[(?:\\.|[^\]\\])*\]\((qrs-asset-\d+)(?: "(?:\\.|[^"\\])*")?\)/g, (match, token: string) => {
    const link = links.get(token); if (!link) return match;
    return link.startsWith('!') ? link : `!${link}`;
  });
}

