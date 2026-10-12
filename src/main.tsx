import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// 不使用 StrictMode：阅读页的初始化 effect 依赖「仅执行一次」语义，
// 双调用会导致断点恢复被 reset 清掉。
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
