import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { ThemeProvider } from './theme/ThemeProvider.jsx';
// NOTE: global CSS is loaded via <link> in index.html (served from /public),
// NOT imported here. Edit client/public/theme.css and client/public/styles.css.
// Importing them through JS makes Vite inject them at runtime, which is what
// caused the header to break on resize/reload until a cache-clearing refresh.

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
