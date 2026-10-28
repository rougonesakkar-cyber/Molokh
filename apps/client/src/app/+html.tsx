import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';

const performanceProbe = `(() => {
  if (!new URLSearchParams(location.search).has('__molokhPerf')) return;
  const root = document.documentElement;
  root.dataset.molokhPerf = 'active';
  let cls = 0;
  root.dataset.molokhCls = '0';
  const observe = (type, callback, options = { buffered: true }) => {
    try {
      if (!PerformanceObserver.supportedEntryTypes.includes(type)) return;
      const observer = new PerformanceObserver((list) => list.getEntries().forEach(callback));
      observer.observe({ type, ...options });
    } catch {}
  };
  observe('paint', (entry) => {
    if (entry.name === 'first-contentful-paint') root.dataset.molokhFcp = String(entry.startTime);
  });
  observe('largest-contentful-paint', (entry) => {
    root.dataset.molokhLcp = String(entry.startTime);
  });
  observe('layout-shift', (entry) => {
    if (!entry.hadRecentInput) cls += entry.value;
    root.dataset.molokhCls = String(cls);
  });
  observe('event', (entry) => {
    if (entry.interactionId && entry.duration) {
      const previous = Number(root.dataset.molokhInp || 0);
      root.dataset.molokhInp = String(Math.max(previous, entry.duration));
    }
  }, { durationThreshold: 16 });
  addEventListener('load', () => {
    const navigation = performance.getEntriesByType('navigation')[0];
    root.dataset.molokhLoad = String(navigation?.loadEventEnd || performance.now());
  }, { once: true });
})();`;

export default function RootHtml({ children }: { readonly children: React.ReactNode }) {
  const { bodyAttributes, bodyNodes, htmlAttributes, headNodes } = useServerDocumentContext();
  return (
    <html lang="ru" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <meta
          name="description"
          content="Molokh — партнёры по тренировкам и спортивное Community зала."
        />
        <title>Molokh</title>
        <ScrollViewStyleReset />
        <script dangerouslySetInnerHTML={{ __html: performanceProbe }} />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
