import { createRootRoute, Outlet, HeadContent, Scripts } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1_000,
      retry: 1,
    },
  },
});

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>aimani G's V2</title>
        <style dangerouslySetInnerHTML={{ __html: GLOBAL_STYLES }} />
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <Outlet />
        </QueryClientProvider>
        {/* これが無いとクライアントentryが注入されずhydrationしない（全ページ静止画になる） */}
        <Scripts />
      </body>
    </html>
  );
}

const GLOBAL_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; padding: 0; background: #fafafa; color: #333; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  input:focus { border-color: #007AFF; }
`;
