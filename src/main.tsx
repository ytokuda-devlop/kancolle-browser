import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ShipInfo from './components/ShipInfo';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Reactの描画先 #root が見つかりません。');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {window.location.hash === '#ships' ? <ShipInfo /> : <App />}
  </React.StrictMode>,
);
