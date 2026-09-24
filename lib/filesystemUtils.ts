import { VirtualFile } from '../types';
import { VIRTUAL_FILESYSTEM } from '../constants/virtualFilesystem';

/**
 * Resolve a relative or absolute path from a current directory
 */
export const resolvePath = (currentPath: string, targetPath: string): string => {
    // Handle absolute paths
    if (targetPath.startsWith('/')) {
        return normalizePath(targetPath);
    }

    // Handle special cases
    if (targetPath === '.') {
        return currentPath;
    }

    if (targetPath === '..') {
        return getParentPath(currentPath);
    }

    // Handle relative paths with '..'
    if (targetPath.includes('..')) {
        const parts = targetPath.split('/');
        let resolved = currentPath;

        for (const part of parts) {
            if (part === '..') {
                resolved = getParentPath(resolved);
            } else if (part !== '.' && part !== '') {
                resolved = joinPaths(resolved, part);
            }
        }

        return normalizePath(resolved);
    }

    // Simple relative path
    return normalizePath(joinPaths(currentPath, targetPath));
};

/**
 * Get parent path of a given path
 */
export const getParentPath = (path: string): string => {
    if (path === '/' || path === '') return '/';
    const parts = path.split('/').filter(p => p);
    parts.pop();
    return '/' + parts.join('/') || '/';
};

/**
 * Join two path segments
 */
export const joinPaths = (base: string, segment: string): string => {
    const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
    const normalizedSegment = segment.startsWith('/') ? segment.slice(1) : segment;
    return `${normalizedBase}/${normalizedSegment}`;
};

/**
 * Normalize path (remove double slashes, trailing slashes except root)
 */
export const normalizePath = (path: string): string => {
    if (path === '/') return '/';

    const parts = path.split('/').filter(p => p);
    const normalized = '/' + parts.join('/');

    return normalized;
};

/**
 * Get all files in a specific directory path
 */
export const getFilesInPath = (path: string): VirtualFile[] => {
    const normalizedPath = normalizePath(path);
    return VIRTUAL_FILESYSTEM.filter(f => f.parentPath === normalizedPath);
};

/**
 * Get a file by its absolute path
 */
export const getFileByPath = (path: string): VirtualFile | undefined => {
    const normalizedPath = normalizePath(path);
    return VIRTUAL_FILESYSTEM.find(f => f.path === normalizedPath);
};

/**
 * Get a file by its ID
 */
export const getFileById = (id: string): VirtualFile | undefined => {
    return VIRTUAL_FILESYSTEM.find(f => f.id === id);
};

/**
 * Check if a path exists
 */
export const pathExists = (path: string): boolean => {
    return getFileByPath(path) !== undefined;
};

/**
 * Get breadcrumb path segments for display
 */
export const getPathBreadcrumbs = (path: string): Array<{ name: string; path: string }> => {
    if (path === '/') {
        return [{ name: '~', path: '/' }];
    }

    const parts = path.split('/').filter(p => p);
    const breadcrumbs: Array<{ name: string; path: string }> = [
        { name: '~', path: '/' }
    ];

    let currentPath = '';
    for (const part of parts) {
        currentPath += '/' + part;
        breadcrumbs.push({
            name: part,
            path: normalizePath(currentPath)
        });
    }

    return breadcrumbs;
};

/**
 * Get icon for file type
 */
export const getFileIcon = (type: VirtualFile['type']): string => {
    const icons: Record<VirtualFile['type'], string> = {
        folder: '📁',
        markdown: '📄',
        link: '🔗',
        image: '🖼️',
        pdf: '📋',
        text: '📝',
    };

    return icons[type] || '📄';
};

/**
 * Build a tree view string for terminal output
 */
export const buildTreeView = (path: string, indent: string = '', isLast: boolean = true): string[] => {
    const file = getFileByPath(path);
    if (!file) return [];

    const lines: string[] = [];
    const prefix = isLast ? '└── ' : '├── ';
    const icon = getFileIcon(file.type);

    lines.push(indent + prefix + icon + ' ' + file.name);

    if (file.type === 'folder') {
        const children = getFilesInPath(file.path);
        const newIndent = indent + (isLast ? '    ' : '│   ');

        children.forEach((child, index) => {
            const childIsLast = index === children.length - 1;
            const childLines = buildTreeView(child.path, newIndent, childIsLast);
            lines.push(...childLines);
        });
    }

    return lines;
};

/**
 * Search for files by name (fuzzy search)
 */
export const searchFiles = (query: string): VirtualFile[] => {
    const lowerQuery = query.toLowerCase();
    return VIRTUAL_FILESYSTEM.filter(file =>
        file.name.toLowerCase().includes(lowerQuery) ||
        file.path.toLowerCase().includes(lowerQuery)
    );
};

/**
 * Get file extension
 */
export const getFileExtension = (filename: string): string => {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : '';
};
