import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

interface WeaverSandboxProps {
  /** The raw JSX code to render */
  code: string | null;
  /** The name of the exported component */
  componentName: string | null;
}

export const WeaverSandbox: React.FC<WeaverSandboxProps> = ({ code, componentName }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  // The srcDoc for the sandbox
  const srcdoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Weaver Sandbox</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    body { background: transparent; color: #e4e4e7; font-family: system-ui, sans-serif; margin: 0; padding: 16px; min-height: 100vh; overflow-y: auto; overflow-x: hidden; }
    #root { width: 100%; height: 100%; display: flex; flex-direction: column; }
    /* Hide scrollbars for a cleaner look, but preserve scrollability */
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

    // A simple mock require to handle CommonJS transpiled imports (like 'react')
    function requireMock(moduleName) {
      if (moduleName === 'react') return window.React;
      if (moduleName === 'react-dom') return window.ReactDOM;
      // Fallback for unsupported dependencies in this lightweight sandbox
      return new Proxy({}, {
        get: () => () => { throw new Error('Module "' + moduleName + '" is not fully supported in this sandbox yet.'); }
      });
    }

    window.addEventListener('message', (event) => {
      // In a strict sandbox (without allow-same-origin), origin is 'null'
      if (!event.data || event.data.type !== 'RENDER_COMPONENT') return;

      const { code, componentName } = event.data.payload;
      const rootElement = document.getElementById('root');

      try {
        if (rootInstance) {
          rootInstance.unmount();
          rootInstance = null;
        }
        rootElement.innerHTML = '';

        if (!code || !componentName) return;

        // Transpile JSX and modern syntax to CommonJS
        const transpiled = Babel.transform(code, { 
          presets: ['env', 'react']
        }).code;

        // Evaluate the transpiled code
        const evaluate = new Function('require', 'exports', 'React', transpiled);
        const exportsObj = {};
        evaluate(requireMock, exportsObj, window.React);

        // Find the component to render
        const ComponentToRender = exportsObj[componentName] || exportsObj.default;

        if (!ComponentToRender) {
          throw new Error('Could not find export for component: ' + componentName);
        }

        rootInstance = ReactDOM.createRoot(rootElement);
        rootInstance.render(React.createElement(ComponentToRender));

        window.parent.postMessage({ type: 'RENDER_SUCCESS' }, '*');
      } catch (err) {
        console.error("Sandbox Render Error:", err);
        if (rootInstance) {
          try { rootInstance.unmount(); } catch (e) {}
          rootInstance = null;
        }
        rootElement.innerHTML = '';
        
        window.parent.postMessage({ 
          type: 'RENDER_ERROR', 
          payload: err.message || err.toString(),
          stack: err.stack
        }, '*');
      }
    });

    window.addEventListener('error', (e) => {
      window.parent.postMessage({ type: 'RENDER_ERROR', payload: e.message }, '*');
    });
  </script>
</body>
</html>`;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;

      const { type, payload } = event.data;
      if (type === "RENDER_ERROR") {
        setRuntimeError(payload);
      } else if (type === "RENDER_SUCCESS") {
        setRuntimeError(null);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      // Send code to the iframe after a short delay to ensure it has loaded
      const timer = setTimeout(() => {
        iframeRef.current?.contentWindow?.postMessage(
          {
            type: "RENDER_COMPONENT",
            payload: { code, componentName },
          },
          "*"
        );
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [code, componentName]);

  return (
    <div className="relative w-full h-full flex flex-col bg-transparent">
      {runtimeError && (
        <div className="absolute top-2 left-2 right-2 z-10 flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-rose-950/90 border border-rose-700/40 text-rose-300 text-xs font-mono leading-relaxed backdrop-blur-md shadow-lg overflow-y-auto max-h-32">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-rose-400" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-rose-200">Sandbox Runtime Error</span>
            <span className="opacity-90 whitespace-pre-wrap">{runtimeError}</span>
          </div>
        </div>
      )}
      
      <iframe
        ref={iframeRef}
        title="Weaver Component Sandbox"
        srcDoc={srcdoc}
        sandbox="allow-scripts"
        className="flex-1 w-full border-0 bg-transparent rounded-b-xl"
        style={{ minHeight: 0 }}
      />
    </div>
  );
};

export default WeaverSandbox;
