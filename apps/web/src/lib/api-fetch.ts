type ApiFn = (url: string, init?: RequestInit) => Promise<Response>;

export async function getApi(): Promise<ApiFn> {
  try {
    // @ts-expect-error -- cloudflare:workers is only available at CF runtime
    const { env } = (await import('cloudflare:workers')) as unknown as {
      env: { API: { fetch: typeof fetch } };
    };
    return (url: string, init?: RequestInit) =>
      env.API.fetch(`https://api${url}`, init);
  } catch {
    return (url: string, init?: RequestInit) =>
      fetch(`http://localhost:8787${url}`, init);
  }
}
