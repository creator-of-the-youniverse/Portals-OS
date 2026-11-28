import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  validateWeaverSandboxMessage,
  type WeaverElementAnnotation,
} from "../../lib/windowMessageSecurity";

export interface SandboxVirtualFile {
  path: string;
  content: string;
  language?: string;
}

export interface WeaverSandboxProps {
  /** Legacy raw JSX code to render (used when `files` is omitted) */
  code?: string | null;
  /** The name of the exported component */
  componentName?: string | null;
  /** Multi-file virtual file tree map */
  files?: Record<string, SandboxVirtualFile | string> | null;
  /** Entry file path in `files` (defaults to "App.tsx") */
  entryFile?: string;
  /** Viewport framing mode */
  viewport?: "desktop" | "mobile";
  /** Enables interactive Point & Edit DOM element selection overlay */
  annotationMode?: boolean;
  /** Increment to force a clean re-render inside the iframe */
  refreshKey?: number;
  /** Callbacks for host runtime console & annotation wiring */
  onRuntimeError?: (error: string | null) => void;
  onRuntimeWarning?: (warning: string | null) => void;
  onRenderSuccess?: () => void;
  onElementSelected?: (annotation: WeaverElementAnnotation) => void;
}

const SANDBOX_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://unpkg.com",
  "style-src 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com",
  "img-src data: https: blob:",
  "font-src data: https:",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function normalizeFilesForSandbox(
  files?: Record<string, SandboxVirtualFile | string> | null
): Record<string, string> | null {
  if (!files || typeof files !== "object") return null;
  const out: Record<string, string> = {};
  for (const [path, val] of Object.entries(files)) {
    if (typeof val === "string") {
      out[path] = val;
    } else if (val && typeof val.content === "string") {
      out[val.path || path] = val.content;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

export const WeaverSandbox: React.FC<WeaverSandboxProps> = ({
  code = null,
  componentName = null,
  files = null,
  entryFile = "App.tsx",
  viewport = "desktop",
  annotationMode = false,
  refreshKey = 0,
  onRuntimeError,
  onRuntimeWarning,
  onRenderSuccess,
  onElementSelected,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isReadyRef = useRef(false);
  const normalizedFiles = useMemo(() => normalizeFilesForSandbox(files), [files]);

  const latestPayloadRef = useRef<{
    code: string | null;
    componentName: string | null;
    files: Record<string, string> | null;
    entryFile: string;
  }>({
    code,
    componentName,
    files: normalizedFiles,
    entryFile,
  });

  const callbacksRef = useRef({
    onRuntimeError,
    onRuntimeWarning,
    onRenderSuccess,
    onElementSelected,
  });
  callbacksRef.current = {
    onRuntimeError,
    onRuntimeWarning,
    onRenderSuccess,
    onElementSelected,
  };

  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [runtimeWarning, setRuntimeWarning] = useState<string | null>(null);

  latestPayloadRef.current = {
    code,
    componentName,
    files: normalizedFiles,
    entryFile,
  };

  // Stable srcDoc template so state updates never remount the sandbox iframe.
  const srcdoc = useMemo(
    () => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}" />
  <title>Weaver Sandbox</title>
  <script src="https://cdn.tailwindcss.com/3.4.17"></script>
  <script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js" integrity="sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js" integrity="sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/@babel/standalone@7.26.10/babel.min.js" integrity="sha384-BcI7nduYchENm39cFMEVJXHEE7fwHONANyn/pY2YTa+BNtrWF2bKBZeI0wqVithi" crossorigin="anonymous"></script>
  <style>
    body { background: transparent; color: #e4e4e7; font-family: system-ui, sans-serif; margin: 0; padding: 16px; min-height: 100vh; overflow-y: auto; overflow-x: hidden; }
    #root { width: 100%; height: 100%; display: flex; flex-direction: column; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #52525b; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #71717a; }
    #weaver-annotate-box {
      position: fixed;
      pointer-events: none;
      z-index: 2147483646;
      border: 2px solid #a78bfa;
      background: rgba(139, 92, 246, 0.12);
      border-radius: 4px;
      display: none;
      box-sizing: border-box;
      transition: all 60ms ease-out;
    }
    #weaver-annotate-label {
      position: fixed;
      pointer-events: none;
      z-index: 2147483647;
      background: #4c1d95;
      color: #f5f3ff;
      font: 600 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid #a78bfa;
      display: none;
      max-width: 240px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  </style>
  <style id="weaver-virtual-styles"></style>
</head>
<body>
  <div id="root"></div>
  <div id="weaver-annotate-box" aria-hidden="true"></div>
  <div id="weaver-annotate-label" aria-hidden="true"></div>
  <script>
    let rootInstance = null;
    const warnedModules = new Set();
    let annotationEnabled = false;

    const annotateBox = document.getElementById('weaver-annotate-box');
    const annotateLabel = document.getElementById('weaver-annotate-label');

    function hideAnnotationOverlay() {
      if (annotateBox) annotateBox.style.display = 'none';
      if (annotateLabel) annotateLabel.style.display = 'none';
    }

    function buildDomPath(el) {
      const parts = [];
      let cur = el;
      let depth = 0;
      while (cur && cur.nodeType === 1 && cur.id !== 'root' && depth < 6) {
        let seg = cur.tagName.toLowerCase();
        if (cur.id && cur.id !== 'root') {
          seg += '#' + cur.id;
        } else if (typeof cur.className === 'string' && cur.className.trim()) {
          const firstClass = cur.className.trim().split(/\\s+/).slice(0, 2).join('.');
          if (firstClass) seg += '.' + firstClass;
        }
        parts.unshift(seg);
        cur = cur.parentElement;
        depth++;
      }
      return parts.join(' > ').slice(0, 300) || (el && el.tagName ? el.tagName.toLowerCase() : 'div');
    }

    function getTargetElement(rawTarget) {
      if (!rawTarget || rawTarget.nodeType !== 1) return null;
      if (rawTarget.id === 'weaver-annotate-box' || rawTarget.id === 'weaver-annotate-label') return null;
      const rootEl = document.getElementById('root');
      if (!rootEl || !rootEl.contains(rawTarget) || rawTarget === rootEl) return null;
      return rawTarget;
    }

    document.addEventListener('mousemove', function (e) {
      if (!annotationEnabled) return;
      const el = getTargetElement(e.target);
      if (!el) {
        hideAnnotationOverlay();
        return;
      }
      const rect = el.getBoundingClientRect();
      annotateBox.style.display = 'block';
      annotateBox.style.left = rect.left + 'px';
      annotateBox.style.top = rect.top + 'px';
      annotateBox.style.width = rect.width + 'px';
      annotateBox.style.height = rect.height + 'px';

      const tag = el.tagName.toLowerCase();
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
      annotateLabel.textContent = '<' + tag + (cls ? '.' + cls : '') + '> ' + Math.round(rect.width) + 'x' + Math.round(rect.height);
      annotateLabel.style.display = 'block';
      annotateLabel.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - 220)) + 'px';
      annotateLabel.style.top = Math.max(4, rect.top - 22) + 'px';
    }, true);

    document.addEventListener('mouseleave', function () {
      if (annotationEnabled) hideAnnotationOverlay();
    });

    document.addEventListener('click', function (e) {
      if (!annotationEnabled) return;
      const el = getTargetElement(e.target);
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const textSnippet = String(el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 240);
      const className = typeof el.className === 'string' ? el.className.trim().slice(0, 400) : '';
      window.parent.postMessage({
        type: 'ELEMENT_SELECTED',
        annotation: {
          tagName: el.tagName.toLowerCase().slice(0, 32),
          domPath: buildDomPath(el),
          className: className,
          textSnippet: textSnippet,
          rect: {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        }
      }, '*');
    }, true);

    function joinClasses() {
      const out = [];
      for (let i = 0; i < arguments.length; i++) {
        const arg = arguments[i];
        if (!arg) continue;
        if (typeof arg === 'string') out.push(arg);
        else if (Array.isArray(arg)) out.push(joinClasses.apply(null, arg));
      }
      return out.join(' ');
    }

    const MOTION_PROP_KEYS = new Set([
      'initial', 'animate', 'exit', 'transition', 'variants',
      'whileHover', 'whileTap', 'whileFocus', 'whileInView', 'viewport',
      'layout', 'layoutId', 'drag', 'dragConstraints', 'onPan', 'onPanStart', 'onPanEnd'
    ]);

    function stripMotionProps(props) {
      if (!props || typeof props !== 'object') return {};
      const clean = {};
      for (const key in props) {
        if (Object.prototype.hasOwnProperty.call(props, key) && !MOTION_PROP_KEYS.has(key)) {
          clean[key] = props[key];
        }
      }
      return clean;
    }

    function makeMotionProxy() {
      return new Proxy({}, {
        get(_, tag) {
          if (typeof tag === 'symbol') return undefined;
          return function MotionStub(props) {
            return window.React.createElement(String(tag), stripMotionProps(props), props && props.children);
          };
        }
      });
    }

    function requireExternalMock(moduleName) {
      if (moduleName === 'react') return window.React;
      if (moduleName === 'react-dom' || moduleName === 'react-dom/client') return window.ReactDOM;
      if (moduleName === 'clsx' || moduleName === 'tailwind-merge') {
        return { __esModule: true, clsx: joinClasses, twMerge: joinClasses, default: joinClasses };
      }
      if (moduleName === 'framer-motion' || moduleName === 'motion/react') {
        return {
          __esModule: true,
          motion: makeMotionProxy(),
          AnimatePresence: function AnimatePresenceStub(props) {
            return window.React.createElement(window.React.Fragment, null, props && props.children);
          }
        };
      }

      if (!warnedModules.has(moduleName)) {
        warnedModules.add(moduleName);
        window.parent.postMessage({
          type: 'RENDER_WARNING',
          payload: 'Optional module "' + moduleName + '" is stubbed in isolated preview.'
        }, '*');
      }

      return new Proxy({}, {
        get(_, prop) {
          if (typeof prop === 'symbol') return undefined;
          if (prop === '__esModule') return true;
          if (prop === 'then') return undefined;
          return function UnavailableModuleStub(props) {
            return window.React.createElement(
              'span',
              {
                className: props && props.className ? props.className : 'inline-block w-3 h-3 rounded-sm bg-current opacity-60 align-middle',
                'data-sandbox-stub': moduleName + ':' + String(prop),
                'aria-hidden': 'true'
              },
              props && props.children ? props.children : null
            );
          };
        }
      });
    }

    function normalizePath(p) {
      const parts = String(p || '').replace(/\\\\/g, '/').split('/');
      const stack = [];
      for (let i = 0; i < parts.length; i++) {
        const seg = parts[i];
        if (!seg || seg === '.') continue;
        if (seg === '..') stack.pop();
        else stack.push(seg);
      }
      return stack.join('/');
    }

    function resolveVirtualPath(filesMap, fromPath, request) {
      const fromDir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')) : '';
      const rawJoined = request.startsWith('/') ? request.slice(1) : (fromDir ? fromDir + '/' + request : request);
      const base = normalizePath(rawJoined);
      const candidates = [
        base,
        base + '.tsx',
        base + '.ts',
        base + '.jsx',
        base + '.js',
        base + '.json',
        base + '.css',
        base + '/index.tsx',
        base + '/index.ts',
        base + '/index.jsx',
        base + '/index.js'
      ];
      for (let i = 0; i < candidates.length; i++) {
        if (Object.prototype.hasOwnProperty.call(filesMap, candidates[i])) {
          return candidates[i];
        }
      }
      return null;
    }

    function createErrorBoundaryClass() {
      class WeaverErrorBoundary extends window.React.Component {
        constructor(props) {
          super(props);
          this.state = { hasError: false, message: '' };
        }
        static getDerivedStateFromError(error) {
          return { hasError: true, message: (error && error.message) ? error.message : String(error) };
        }
        componentDidCatch(error) {
          window.parent.postMessage({
            type: 'RENDER_ERROR',
            payload: (error && error.message) ? error.message : String(error)
          }, '*');
        }
        render() {
          if (this.state.hasError) {
            return window.React.createElement(
              'div',
              { className: 'p-4 rounded-xl border border-rose-500/40 bg-rose-950/40 text-rose-200 font-mono text-xs' },
              'Render Error: ' + this.state.message
            );
          }
          return this.props.children;
        }
      }
      return WeaverErrorBoundary;
    }

    function renderFallbackWithoutCdn(rootElement, componentName, code) {
      rootElement.innerHTML = '';
      const card = document.createElement('div');
      card.setAttribute('data-sandbox-fallback', 'cdn-unavailable');
      card.style.cssText = 'border:1px solid #3f3f46;border-radius:10px;padding:14px;background:rgba(24,24,27,0.85);color:#e4e4e7;font-family:monospace;';
      const title = document.createElement('div');
      title.style.cssText = 'font-weight:700;font-size:13px;color:#34d399;margin-bottom:6px;';
      title.textContent = (componentName || 'Widget') + ' (Static Safe Preview)';
      const note = document.createElement('div');
      note.style.cssText = 'font-size:11px;color:#a1a1aa;margin-bottom:8px;';
      note.textContent = 'External React/Babel CDN runtime unavailable; showing sanitized source summary.';
      const pre = document.createElement('pre');
      pre.style.cssText = 'font-size:11px;color:#d4d4d8;white-space:pre-wrap;word-break:break-word;margin:0;max-height:140px;overflow:auto;';
      pre.textContent = String(code || '').slice(0, 600);
      card.appendChild(title);
      card.appendChild(note);
      card.appendChild(pre);
      rootElement.appendChild(card);
    }

    function executeRender(payload) {
      const filesMap = payload && payload.files && typeof payload.files === 'object' ? payload.files : null;
      const entryFile = (payload && payload.entryFile) || 'App.tsx';
      const legacyCode = payload && payload.code;
      const componentName = payload && payload.componentName;
      const rootElement = document.getElementById('root');
      const styleEl = document.getElementById('weaver-virtual-styles');

      try {
        if (rootInstance) {
          rootInstance.unmount();
          rootInstance = null;
        }
        rootElement.innerHTML = '';
        if (styleEl) styleEl.textContent = '';

        const effectiveFiles = filesMap
          ? filesMap
          : (legacyCode ? { [entryFile]: legacyCode } : null);

        if (!effectiveFiles || !effectiveFiles[entryFile]) {
          window.parent.postMessage({ type: 'RENDER_SUCCESS' }, '*');
          return;
        }

        // Inject all virtual .css files safely via textContent
        if (styleEl) {
          const cssChunks = [];
          Object.keys(effectiveFiles).forEach(function (path) {
            if (path.toLowerCase().endsWith('.css')) {
              cssChunks.push('/* ' + path + ' */\\n' + String(effectiveFiles[path] || ''));
            }
          });
          styleEl.textContent = cssChunks.join('\\n\\n');
        }

        if (!window.React || !window.ReactDOM || !window.Babel) {
          renderFallbackWithoutCdn(rootElement, componentName || entryFile, effectiveFiles[entryFile]);
          window.parent.postMessage({
            type: 'RENDER_WARNING',
            payload: 'CDN runtime unavailable; rendered static safe preview.'
          }, '*');
          window.parent.postMessage({ type: 'RENDER_SUCCESS' }, '*');
          return;
        }

        const moduleCache = {};
        const evaluating = new Set();

        function loadVirtualModule(filePath) {
          if (Object.prototype.hasOwnProperty.call(moduleCache, filePath)) {
            return moduleCache[filePath].exports;
          }
          if (evaluating.has(filePath)) {
            return moduleCache[filePath] ? moduleCache[filePath].exports : {};
          }

          const source = effectiveFiles[filePath];
          if (typeof source !== 'string') {
            throw new Error('Virtual file not found: ' + filePath);
          }

          const mod = { exports: {} };
          moduleCache[filePath] = mod;

          if (filePath.toLowerCase().endsWith('.css')) {
            return mod.exports;
          }
          if (filePath.toLowerCase().endsWith('.json')) {
            mod.exports = JSON.parse(source || '{}');
            return mod.exports;
          }

          evaluating.add(filePath);
          try {
            const transpiled = window.Babel.transform(source, {
              filename: filePath,
              sourceType: 'module',
              presets: [
                ['env', { modules: 'commonjs' }],
                ['react', { runtime: 'classic' }],
                ['typescript', { isTSX: true, allExtensions: true }]
              ]
            }).code;

            function localRequire(reqPath) {
              if (reqPath.startsWith('./') || reqPath.startsWith('../') || reqPath.startsWith('/')) {
                const resolved = resolveVirtualPath(effectiveFiles, filePath, reqPath);
                if (!resolved) {
                  throw new Error('Cannot resolve virtual module "' + reqPath + '" from "' + filePath + '"');
                }
                return loadVirtualModule(resolved);
              }
              return requireExternalMock(reqPath);
            }

            const evaluate = new Function('require', 'exports', 'module', 'React', transpiled);
            evaluate(localRequire, mod.exports, mod, window.React);
            return mod.exports;
          } finally {
            evaluating.delete(filePath);
          }
        }

        const resolvedExports = loadVirtualModule(entryFile) || {};
        const ComponentToRender =
          (componentName && resolvedExports[componentName]) ||
          resolvedExports.default ||
          resolvedExports.App ||
          Object.values(resolvedExports).find(function (v) { return typeof v === 'function'; });

        if (!ComponentToRender) {
          throw new Error('Could not find React component export in ' + entryFile);
        }

        const ErrorBoundary = createErrorBoundaryClass();
        rootInstance = window.ReactDOM.createRoot(rootElement);
        rootInstance.render(
          window.React.createElement(
            ErrorBoundary,
            null,
            window.React.createElement(ComponentToRender)
          )
        );
        window.parent.postMessage({ type: 'RENDER_SUCCESS' }, '*');
      } catch (err) {
        if (rootInstance) {
          try { rootInstance.unmount(); } catch (e) {}
          rootInstance = null;
        }
        rootElement.innerHTML = '';
        window.parent.postMessage({
          type: 'RENDER_ERROR',
          payload: (err && err.message) ? err.message : String(err)
        }, '*');
      }
    }

    window.addEventListener('message', function (event) {
      if (event.source !== window.parent) return;
      if (!event.data || typeof event.data !== 'object') return;
      if (event.data.type === 'RENDER_COMPONENT') {
        executeRender(event.data.payload);
      } else if (event.data.type === 'SET_ANNOTATION_MODE') {
        annotationEnabled = Boolean(event.data.payload && event.data.payload.enabled);
        document.body.style.cursor = annotationEnabled ? 'crosshair' : '';
        if (!annotationEnabled) hideAnnotationOverlay();
      }
    });

    window.addEventListener('error', function (e) {
      window.parent.postMessage({
        type: 'RENDER_ERROR',
        payload: (e && e.message) ? e.message : 'Sandbox runtime error'
      }, '*');
    });

    window.addEventListener('unhandledrejection', function (e) {
      const reason = e && e.reason;
      const msg = (reason && reason.message) ? reason.message : String(reason || 'Unhandled promise rejection');
      window.parent.postMessage({
        type: 'RENDER_ERROR',
        payload: msg
      }, '*');
    });

    window.parent.postMessage({ type: 'SANDBOX_READY' }, '*');
  </script>
</body>
</html>`,
    []
  );

  const postRenderMessage = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    setRuntimeWarning(null);
    win.postMessage(
      {
        type: "RENDER_COMPONENT",
        payload: latestPayloadRef.current,
      },
      "*"
    );
  }, []);

  const postAnnotationMode = useCallback((enabled: boolean) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      {
        type: "SET_ANNOTATION_MODE",
        payload: { enabled },
      },
      "*"
    );
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const validated = validateWeaverSandboxMessage(event, iframeRef.current?.contentWindow);
      if (!validated.ok) return;

      const { type, payload, annotation } = validated.message;
      if (type === "SANDBOX_READY") {
        isReadyRef.current = true;
        postRenderMessage();
        postAnnotationMode(annotationMode);
      } else if (type === "RENDER_ERROR") {
        const msg = payload ?? "Sandbox error";
        setRuntimeError(msg);
        callbacksRef.current.onRuntimeError?.(msg);
      } else if (type === "RENDER_WARNING") {
        setRuntimeWarning(payload ?? null);
        callbacksRef.current.onRuntimeWarning?.(payload ?? null);
      } else if (type === "RENDER_SUCCESS") {
        setRuntimeError(null);
        callbacksRef.current.onRuntimeError?.(null);
        callbacksRef.current.onRenderSuccess?.();
      } else if (type === "ELEMENT_SELECTED" && annotation) {
        callbacksRef.current.onElementSelected?.(annotation);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [annotationMode, postAnnotationMode, postRenderMessage]);

  useEffect(() => {
    if (isReadyRef.current) {
      postRenderMessage();
    }
  }, [code, componentName, normalizedFiles, entryFile, refreshKey, postRenderMessage]);

  useEffect(() => {
    if (isReadyRef.current) {
      postAnnotationMode(annotationMode);
    }
  }, [annotationMode, postAnnotationMode]);

  return (
    <div
      className={`relative w-full h-full flex flex-col bg-transparent ${
        viewport === "mobile" ? "items-center justify-center p-3 bg-zinc-950/60 overflow-auto" : ""
      }`}
    >
      {runtimeError && (
        <div
          role="alert"
          className="absolute top-2 left-2 right-2 z-10 flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-rose-950/90 border border-rose-700/40 text-rose-300 text-xs font-mono leading-relaxed backdrop-blur-md shadow-lg overflow-y-auto max-h-32"
        >
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-rose-400" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-rose-200">Sandbox Runtime Error</span>
            <span className="opacity-90 whitespace-pre-wrap">{runtimeError}</span>
          </div>
        </div>
      )}

      {!runtimeError && runtimeWarning && (
        <div
          role="status"
          className="mx-2 mt-2 px-2.5 py-1 rounded bg-amber-950/50 border border-amber-700/40 text-amber-300 text-[10px] font-mono truncate self-stretch"
        >
          {runtimeWarning}
        </div>
      )}

      <div
        className={
          viewport === "mobile"
            ? "w-[390px] max-w-full h-full max-h-[844px] rounded-[28px] border-2 border-zinc-700/80 bg-zinc-950 shadow-2xl overflow-hidden flex flex-col shrink-0"
            : "flex-1 w-full h-full flex flex-col min-h-0"
        }
      >
        <iframe
          ref={iframeRef}
          title="Weaver Component Sandbox"
          srcDoc={srcdoc}
          sandbox="allow-scripts"
          onLoad={() => {
            if (isReadyRef.current) {
              postRenderMessage();
              postAnnotationMode(annotationMode);
            }
          }}
          className="flex-1 w-full border-0 bg-transparent rounded-b-xl"
          style={{ minHeight: 0 }}
        />
      </div>
    </div>
  );
};

export default WeaverSandbox;
