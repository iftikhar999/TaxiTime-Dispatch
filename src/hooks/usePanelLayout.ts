import { useCallback, useState } from 'react';
import { Layout } from 'react-grid-layout';

const LAYOUT_STORAGE_KEY = 'dispatch-panel-layout';

// Default layout: 2x2 grid
const defaultLayout: Layout[] = [
  { i: 'jobs', x: 0, y: 0, w: 6, h: 12, minW: 3, minH: 6 },
  { i: 'map', x: 6, y: 0, w: 6, h: 12, minW: 3, minH: 6 },
  { i: 'drivers', x: 0, y: 12, w: 6, h: 10, minW: 3, minH: 5 },
  { i: 'zones', x: 6, y: 12, w: 6, h: 10, minW: 3, minH: 5 },
];

export const usePanelLayout = () => {
  const [layout, setLayout] = useState<Layout[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          return defaultLayout;
        }
      }
    }
    return defaultLayout;
  });

  // Save layout to localStorage
  const saveLayout = useCallback((newLayout: Layout[]) => {
    setLayout(newLayout);
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(newLayout));
  }, []);

  // Reset to default layout
  const resetLayout = useCallback(() => {
    setLayout(defaultLayout);
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(defaultLayout));
  }, []);

  return {
    layout,
    saveLayout,
    resetLayout,
    defaultLayout,
  };
};
