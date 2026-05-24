export type ScriptedResponder = (req: Request) => Response | Promise<Response>;

export const scriptedFetch = (responder: ScriptedResponder): typeof fetch => {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const req = new Request(input as string | URL, init);
    return responder(req);
  }) as typeof fetch;
};

export const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
