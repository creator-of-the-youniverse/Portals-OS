import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

interface WeaverSandboxProps {
  /** The raw JSX code to render */
  code: string | null;
  /** The name of the exported component */
  componentName: string | null;
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

export const WeaverSandbox: React.FC<WeaverSandboxProps> = ({ code, componentName }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isReadyRef = useRef(false);
  const latestPayloadRef = useRef<{ code: string | null; componentName: string | null }>({
    code,
    componentName,
  });
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [runtimeWarning, setRuntimeWarning] = useState<string | null>(null);

  latestPayloadRef.current = { code, componentName };

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
  </style>
</head>
<body>
  <div id="root"></div>
  <script>
    let rootInstance = null;
    const warnedModules = new Set();

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

    function requireMock(moduleName) {
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
      const code = payload && payload.code;
      const componentName = payload && payload.componentName;
      const rootElement = document.getElementById('root');

      try {
        if (rootInstance) {
          rootInstance.unmount();
          rootInstance = null;
        }
        rootElement.innerHTML = '';

        if (!code || !componentName) {
          window.parent.postMessage({ type: 'RENDER_SUCCESS' }, '*');
          return;
        }

        if (!window.React || !window.ReactDOM || !window.Babel) {
          renderFallbackWithoutCdn(rootElement, componentName, code);
          window.parent.postMessage({
            type: 'RENDER_WARNING',
            payload: 'CDN runtime unavailable; rendered static safe preview.'
          }, '*');
          window.parent.postMessage({ type: 'RENDER_SUCCESS' }, '*');
          return;
        }

        const transpiled = window.Babel.transform(code, {
          sourceType: 'module',
          presets: [
            ['env', { modules: 'commonjs' }],
            ['react', { runtime: 'classic' }]
          ]
        }).code;

        const moduleObj = { exports: {} };
        const evaluate = new Function('require', 'exports', 'module', 'React', transpiled);
        evaluate(requireMock, moduleObj.exports, moduleObj, window.React);

        const resolvedExports = moduleObj.exports || {};
        const ComponentToRender =
          resolvedExports[componentName] ||
          resolvedExports.default ||
          Object.values(resolvedExports).find(function (v) { return typeof v === 'function'; });

        if (!ComponentToRender) {
          throw new Error('Could not find export for component: ' + componentName);
        }

        rootInstance = window.ReactDOM.createRoot(rootElement);
        rootInstance.render(window.React.createElement(ComponentToRender));
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
      if (!event.data || event.data.type !== 'RENDER_COMPONENT') return;
      executeRender(event.data.payload);
    });

    window.addEventListener('error', function (e) {
      window.parent.postMessage({
        type: 'RENDER_ERROR',
        payload: (e && e.message) ? e.message : 'Sandbox runtime error'
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

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;

      const { type, payload } = event.data || {};
      if (type === "SANDBOX_READY") {
        isReadyRef.current = true;
        postRenderMessage();
      } else if (type === "RENDER_ERROR") {
        setRuntimeError(typeof payload === "string" ? payload : "Sandbox error");
      } else if (type === "RENDER_WARNING") {
        setRuntimeWarning(typeof payload === "string" ? payload : null);
      } else if (type === "RENDER_SUCCESS") {
        setRuntimeError(null);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [postRenderMessage]);

  useEffect(() => {
    if (isReadyRef.current) {
      postRenderMessage();
    }
  }, [code, componentName, postRenderMessage]);

  return (
    <div className="relative w-full h-full flex flex-col bg-transparent">
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
          className="mx-2 mt-2 px-2.5 py-1 rounded bg-amber-950/50 border border-amber-700/40 text-amber-300 text-[10px] font-mono truncate"
        >
          {runtimeWarning}
        </div>
      )}

      <iframe
        ref={iframeRef}
        title="Weaver Component Sandbox"
        srcDoc={srcdoc}
        sandbox="allow-scripts"
        onLoad={() => {
          if (isReadyRef.current) postRenderMessage();
        }}
        className="flex-1 w-full border-0 bg-transparent rounded-b-xl"
        style={{ minHeight: 0 }}
      />
    </div>
  );
};

export default WeaverSandbox;
