import React, { useState, useEffect } from 'react';
import { useKernel } from '../../store/kernel';
import {
    Folder,
    FileText,
    Image as ImageIcon,
    Link as LinkIcon,
    FileCode,
    ChevronRight,
    ArrowLeft,
    ArrowUp,
    Home,
    Search
} from 'lucide-react';
import {
    getFilesInPath,
    getParentPath,
    getPathBreadcrumbs,
    getFileIcon,
    resolvePath
} from '../../lib/filesystemUtils';
import { VirtualFile, VirtualFileType } from '../../types';

const FileIcon = ({ type, className }: { type: VirtualFileType, className?: string }) => {
    switch (type) {
        case 'folder': return <Folder className={className} />;
        case 'markdown': return <FileText className={className} />;
        case 'image': return <ImageIcon className={className} />;
        case 'link': return <LinkIcon className={className} />;
        case 'pdf': return <FileText className={className} />; // Generic text for now
        case 'text': return <FileCode className={className} />;
        default: return <FileText className={className} />;
    }
};

const FileManager: React.FC = () => {
    const currentPath = useKernel(state => state.currentPath);
    const navigateToPath = useKernel(state => state.navigateToPath);
    const openFile = useKernel(state => state.openFile);
    const openWindow = useKernel(state => state.openWindow);

    const [files, setFiles] = useState<VirtualFile[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        setFiles(getFilesInPath(currentPath));
    }, [currentPath]);

    const handleNavigate = (path: string) => {
        navigateToPath(path);
        setSearchQuery('');
    };

    const handleUp = () => {
        const parent = getParentPath(currentPath);
        handleNavigate(parent);
    };

    const handleItemClick = (file: VirtualFile) => {
        if (file.type === 'folder') {
            handleNavigate(file.path);
        } else {
            if (file.type === 'link' && file.content?.url) {
                window.open(file.content.url, '_blank');
            } else {
                // Open file in FileViewer window
                openWindow('fileViewer', { width: 720, height: 520 }, { fileId: file.id });
            }
        }
    };

    const breadcrumbs = getPathBreadcrumbs(currentPath);

    return (
        <div className="h-full flex flex-col bg-[hsl(var(--background-hsl))] text-[hsl(var(--foreground-hsl))]">
            {/* Toolbar / Navigation Bar */}
            <div className="flex items-center gap-2 p-2 border-b border-[hsl(var(--border-hsl))] bg-[hsl(var(--card-hsl))]">
                <button
                    onClick={handleUp}
                    disabled={currentPath === '/'}
                    className="p-1.5 rounded hover:bg-[hsl(var(--secondary-hsl))] disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Go Up"
                >
                    <ArrowUp size={18} />
                </button>

                <div className="flex-1 flex items-center px-3 py-1.5 bg-[hsl(var(--secondary-hsl))] rounded border border-[hsl(var(--border-hsl))] overflow-hidden">
                    <Home
                        size={16}
                        className="mr-2 cursor-pointer hover:text-[hsl(var(--accent-strong-hsl))]"
                        onClick={() => handleNavigate('/')}
                    />
                    <div className="flex items-center text-sm whitespace-nowrap overflow-x-auto scrollbar-hide">
                        {breadcrumbs.map((crumb, index) => (
                            <React.Fragment key={crumb.path}>
                                {index > 0 && <ChevronRight size={14} className="mx-1 text-[hsl(var(--muted-foreground-hsl))]" />}
                                <span
                                    className={`cursor-pointer hover:text-[hsl(var(--accent-strong-hsl))] ${index === breadcrumbs.length - 1 ? 'font-semibold' : ''}`}
                                    onClick={() => handleNavigate(crumb.path)}
                                >
                                    {crumb.name}
                                </span>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                <div className="relative">
                    <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground-hsl))]" />
                    <input
                        id="searchInput"
                        name="search"
                        type="text"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8 pr-3 py-1.5 text-sm bg-[hsl(var(--secondary-hsl))] border border-[hsl(var(--border-hsl))] rounded focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring-hsl))] w-48"
                    />
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar — Youniverse quick links */}
                <div className="w-48 border-r border-[hsl(var(--border-hsl))] bg-[hsl(var(--card-hsl))] p-2 hidden md:block">
                    <div className="text-xs font-semibold text-[hsl(var(--muted-foreground-hsl))] mb-2 px-2 uppercase tracking-wider">Locations</div>
                    <nav className="space-y-1">
                        <button onClick={() => handleNavigate('/')} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm ${currentPath === '/' ? 'bg-[hsl(var(--accent-strong-hsl))] text-white' : 'hover:bg-[hsl(var(--secondary-hsl))]'}`}>
                            <Home size={16} /> Home
                        </button>
                        <button onClick={() => handleNavigate('/youniverse')} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm ${currentPath.startsWith('/youniverse') ? 'bg-[hsl(var(--accent-strong-hsl))] text-white' : 'hover:bg-[hsl(var(--secondary-hsl))]'}`}>
                            <Folder size={16} /> Youniverse
                        </button>
                        <button onClick={() => handleNavigate('/projects')} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm ${currentPath.startsWith('/projects') ? 'bg-[hsl(var(--accent-strong-hsl))] text-white' : 'hover:bg-[hsl(var(--secondary-hsl))]'}`}>
                            <Folder size={16} /> Projects
                        </button>
                        <button onClick={() => handleNavigate('/network')} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm ${currentPath.startsWith('/network') ? 'bg-[hsl(var(--accent-strong-hsl))] text-white' : 'hover:bg-[hsl(var(--secondary-hsl))]'}`}>
                            <Folder size={16} /> Network
                        </button>
                        <button onClick={() => handleNavigate('/notnotes')} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm ${currentPath.startsWith('/notnotes') ? 'bg-[hsl(var(--accent-strong-hsl))] text-white' : 'hover:bg-[hsl(var(--secondary-hsl))]'}`}>
                            <Folder size={16} /> NotNotes
                        </button>
                        <button onClick={() => handleNavigate('/contact')} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm ${currentPath.startsWith('/contact') ? 'bg-[hsl(var(--accent-strong-hsl))] text-white' : 'hover:bg-[hsl(var(--secondary-hsl))]'}`}>
                            <Folder size={16} /> Contact
                        </button>
                    </nav>
                </div>

                {/* Main Content */}
                <div className="flex-1 overflow-auto p-6 bg-black/40">
                    {files.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-white/30">
                            <Folder className="w-16 h-16 mb-4 opacity-50" />
                            <p className="font-mono uppercase tracking-widest text-xs">Directory is empty</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                            {files.map(file => (
                                <div
                                    key={file.id}
                                    onDoubleClick={() => handleItemClick(file)}
                                    className="group relative flex flex-col items-center p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-cyan-500/30 cursor-pointer transition-all duration-200"
                                >
                                    {/* Hover glow effect */}
                                    <div className="absolute inset-0 bg-cyan-500/0 group-hover:bg-cyan-500/5 rounded-xl transition-colors pointer-events-none" />
                                    
                                    <div className="w-16 h-16 mb-3 flex items-center justify-center text-cyan-400/80 group-hover:text-cyan-400 group-hover:scale-110 transition-transform duration-300 drop-shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                                        <FileIcon type={file.type} className="w-12 h-12" />
                                    </div>
                                    <div className="w-full text-center">
                                        <span className="text-xs text-white/80 font-medium group-hover:text-white break-words line-clamp-3 leading-snug">
                                            {file.name}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Status Bar */}
            <div className="px-3 py-1 border-t border-[hsl(var(--border-hsl))] bg-[hsl(var(--card-hsl))] text-xs text-[hsl(var(--muted-foreground-hsl))] flex justify-between">
                <span>{files.length} item{files.length !== 1 ? 's' : ''}</span>
                <span>{currentPath}</span>
            </div>
        </div>
    );
};

export default FileManager;
