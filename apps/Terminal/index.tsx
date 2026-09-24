import React, { useState, useEffect, useRef } from 'react';
import { useKernel } from '../../store/kernel';
import {
    resolvePath,
    getFilesInPath,
    getFileByPath,
    getFileIcon,
    buildTreeView,
    searchFiles
} from '../../lib/filesystemUtils';

type OutputLine = {
    type: 'input' | 'output' | 'error';
    text: string;
    isFolder?: boolean;
};

const HELP_MESSAGE = `Available commands:

SYSTEM:
  help      - Show this help message
  clear     - Clear the terminal screen
  date      - Display current date and time
  matrix    - Enter the matrix
  neofetch  - Display system information

FILESYSTEM:
  ls [path]     - List directory contents
  cd <path>     - Change directory
  pwd           - Print working directory
  tree [path]   - Show directory tree
  cat <file>    - Display file contents
  open <file>   - Open file/folder in GUI
  find <name>   - Search for files

YOUNIVERSE:
  youniverse  - View your Youniverse root
  projects    - View all projects
  network     - View your network (Atom + connections)
  contact     - View contact info

OTHER:
  emails    - List collected emails`;

const NEOFETCH_OUTPUT = `
        ,.=:!!t3Z3z.,                -----------
       :i:i|i|i|i|i|i:iH3s.,           OS: Portals OS · The Youniverse
      |i|i|i|i|i|i|i|i|i|i|iHS.        Kernel: 1.0.0-sovereign
      ;i|i|i|i|i|i|i|i|i|i|i|i|i:       Uptime: since your first @
     .i|i|i|i|i|i|i|i|i|i|i|i|i|i:      Shell: youniverse.sh
     :|i|i|i|i|i|i|i|i|i|i|i|i|i|i|      Resolution: infinite
     ;i|i|i|i|i|i|i|i|i|i|i|i|i|i|i      DE: Portals WM
    :i|i|i|i|i|i|i|i|i|i|i|i|i|i|i|i     CPU: Your Sovereignty
   .i|i|i|i|i|i|i|i|i|i|i|i|i|i|i|i|i    GPU: Imagination
   |i|i|i|i|i|i|i|i|i|i|i|i|i|i|i|i|i|   Memory: Atom has it
`;

const Terminal: React.FC = () => {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState<OutputLine[]>([
        { type: 'output', text: 'Portals OS Terminal [Version 1.0.0]' },
        { type: 'output', text: '(c) ItsYouOnline. All rights reserved.' },
        { type: 'output', text: 'Type "help" for a list of commands.' },
    ]);
    const inputRef = useRef<HTMLInputElement>(null);
    const endOfOutputRef = useRef<HTMLDivElement>(null);

    const collectedEmails = useKernel(state => state.collectedEmails);
    const toggleMatrixEffect = useKernel(state => state.toggleMatrixEffect);
    const closeWindow = useKernel(state => state.closeWindow);
    const windows = useKernel(state => state.windows);
    const currentPath = useKernel(state => state.currentPath);
    const navigateToPath = useKernel(state => state.navigateToPath);
    const openWindow = useKernel(state => state.openWindow);

    const thisWindow = windows.find(w => w.appId === 'terminal');

    const handleCommand = (command: string) => {
        const [cmd, ...args] = command.trim().split(' ');
        let cmdOutput: OutputLine[] = [];

        switch (cmd.toLowerCase()) {
            case 'help':
                cmdOutput = HELP_MESSAGE.split('\n').map(text => ({ type: 'output' as const, text }));
                break;

            case 'clear':
                setOutput([]);
                return;

            case 'date':
                cmdOutput = [{ type: 'output', text: new Date().toString() }];
                break;

            case 'emails':
                if (collectedEmails.length > 0) {
                    cmdOutput = [
                        { type: 'output', text: 'Collected Emails:' },
                        ...collectedEmails.map(email => ({ type: 'output' as const, text: `- ${email}` }))
                    ];
                } else {
                    cmdOutput = [{ type: 'output', text: 'No emails collected yet.' }];
                }
                break;

            case 'matrix':
                toggleMatrixEffect(true);
                if (thisWindow) {
                    closeWindow(thisWindow.id);
                }
                return;

            case 'neofetch':
                cmdOutput = NEOFETCH_OUTPUT.split('\n').map(text => ({ type: 'output', text }));
                break;

            // === FILESYSTEM COMMANDS ===

            case 'pwd':
                cmdOutput = [{ type: 'output', text: currentPath }];
                break;

            case 'ls': {
                const targetPath = args[0] ? resolvePath(currentPath, args[0]) : currentPath;
                const files = getFilesInPath(targetPath);

                if (files.length === 0) {
                    cmdOutput = [{ type: 'output', text: 'Directory is empty' }];
                } else {
                    cmdOutput = files.map(file => {
                        const icon = getFileIcon(file.type);
                        const displayName = file.name;
                        const isFolder = file.type === 'folder';
                        return {
                            type: 'output' as const,
                            text: `${icon} ${displayName}`,
                            isFolder
                        };
                    });
                }
                break;
            }

            case 'cd': {
                if (!args[0]) {
                    cmdOutput = [{ type: 'error', text: 'cd: missing path argument' }];
                    break;
                }

                const newPath = resolvePath(currentPath, args[0]);
                const targetFolder = getFileByPath(newPath);

                if (!targetFolder) {
                    cmdOutput = [{ type: 'error', text: `cd: ${args[0]}: No such file or directory` }];
                } else if (targetFolder.type !== 'folder') {
                    cmdOutput = [{ type: 'error', text: `cd: ${args[0]}: Not a directory` }];
                } else {
                    navigateToPath(newPath);
                    cmdOutput = [];
                }
                break;
            }

            case 'cat': {
                if (!args[0]) {
                    cmdOutput = [{ type: 'error', text: 'cat: missing file argument' }];
                    break;
                }

                const filePath = resolvePath(currentPath, args[0]);
                const file = getFileByPath(filePath);

                if (!file) {
                    cmdOutput = [{ type: 'error', text: `cat: ${args[0]}: No such file or directory` }];
                } else if (file.type === 'folder') {
                    cmdOutput = [{ type: 'error', text: `cat: ${args[0]}: Is a directory` }];
                } else if (file.type === 'markdown' && file.content?.markdown) {
                    cmdOutput = file.content.markdown.split('\n').map((text: string) => ({ type: 'output' as const, text }));
                } else if (file.type === 'text' && file.content?.text) {
                    cmdOutput = file.content.text.split('\n').map((text: string) => ({ type: 'output' as const, text }));
                } else if (file.type === 'link' && file.content?.url) {
                    cmdOutput = [
                        { type: 'output', text: `Link: ${file.content.url}` },
                        { type: 'output', text: 'Use "open" command to visit' }
                    ];
                } else {
                    cmdOutput = [{ type: 'error', text: `cat: Cannot display ${file.type} file. Use "open" instead.` }];
                }
                break;
            }

            case 'open': {
                if (!args[0]) {
                    cmdOutput = [{ type: 'error', text: 'open: missing file argument' }];
                    break;
                }

                const filePath = resolvePath(currentPath, args[0]);
                const file = getFileByPath(filePath);

                if (!file) {
                    cmdOutput = [{ type: 'error', text: `open: ${args[0]}: No such file or directory` }];
                } else if (file.type === 'folder') {
                    openWindow('fileManager');
                    navigateToPath(filePath);
                    cmdOutput = [{ type: 'output', text: `Opening folder: ${file.name}` }];
                } else if (file.type === 'link' && file.content?.url) {
                    window.open(file.content.url, '_blank');
                    cmdOutput = [{ type: 'output', text: `Opening link: ${file.content.url}` }];
                } else {
                    // Open file in FileViewer window
                    openWindow('fileViewer', { width: 700, height: 500 }, { fileId: file.id });
                    cmdOutput = [{ type: 'output', text: `Opening: ${file.name}` }];
                }
                break;
            }

            case 'tree': {
                const targetPath = args[0] ? resolvePath(currentPath, args[0]) : currentPath;
                const file = getFileByPath(targetPath);

                if (!file) {
                    cmdOutput = [{ type: 'error', text: `tree: ${args[0] || currentPath}: No such file or directory` }];
                } else {
                    cmdOutput = buildTreeView(targetPath).map(text => ({ type: 'output' as const, text }));
                }
                break;
            }

            case 'find': {
                if (!args[0]) {
                    cmdOutput = [{ type: 'error', text: 'find: missing search term' }];
                    break;
                }

                const results = searchFiles(args[0]);

                if (results.length === 0) {
                    cmdOutput = [{ type: 'output', text: `No files found matching: ${args[0]}` }];
                } else {
                    cmdOutput = results.map(f => ({ type: 'output' as const, text: f.path }));
                }
                break;
            }

            // Youniverse shortcuts
            case 'youniverse':
                navigateToPath('/youniverse');
                openWindow('fileManager');
                cmdOutput = [{ type: 'output', text: 'Opening Youniverse...' }];
                break;

            case 'projects':
                navigateToPath('/projects');
                openWindow('fileManager');
                cmdOutput = [{ type: 'output', text: 'Opening Projects...' }];
                break;

            case 'network':
                navigateToPath('/network');
                openWindow('fileManager');
                cmdOutput = [{ type: 'output', text: 'Opening Network...' }];
                break;

            case 'about':
                navigateToPath('/youniverse');
                openWindow('fileManager');
                cmdOutput = [{ type: 'output', text: 'Opening Youniverse...' }];
                break;

            case 'contact':
                navigateToPath('/contact');
                openWindow('fileManager');
                cmdOutput = [{ type: 'output', text: 'Opening Contact...' }];
                break;

            case '':
                break;

            default:
                cmdOutput = [{ type: 'error', text: `command not found: ${cmd}` }];
                break;
        }

        setOutput(prev => [...prev, { type: 'input' as const, text: `> ${command}` }, ...cmdOutput]);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleCommand(input);
        setInput('');
    };

    useEffect(() => {
        endOfOutputRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [output]);

    return (
        <div
            className="h-full w-full bg-black text-white font-mono p-2 text-sm overflow-y-auto"
            onClick={() => inputRef.current?.focus()}
        >
            {output.map((line, index) => (
                <div key={index} className={
                    line.type === 'error' ? 'text-red-500' :
                        line.type === 'input' ? 'text-green-400' : ''
                }>
                    <pre className={line.isFolder ? 'text-blue-400' : ''}>{line.text}</pre>
                </div>
            ))}
            <form onSubmit={handleSubmit} className="flex">
                <span className="text-green-400">{'>'}</span>
                <input
                    id="terminalInput"
                    name="terminalInput"
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="grow bg-transparent border-none outline-none pl-2"
                    placeholder="Type a command..."
                    autoFocus
                    aria-label="Terminal command input"
                />
            </form>
            <div ref={endOfOutputRef} />
        </div>
    );
};

export default Terminal;
