import { Buffer } from 'buffer';

// Polyfill Node.js globals for browser capability (required by Mammoth)
globalThis.Buffer = Buffer;
globalThis.process = { env: {} } as any;

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
