// A fake fetch that answers from a queue and records each request.
export function fakeFetch(...answers) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: new URL(url), method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    const a = answers.shift();
    if (!a) throw new Error(`Unexpected request ${init.method} ${url}`);
    if (a instanceof Error) throw a;
    const [status, body, headers = {}] = a;
    return new Response(body === undefined ? "" : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  };
  fn.calls = calls;
  return fn;
}
