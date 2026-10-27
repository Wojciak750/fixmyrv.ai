// Harness stand-in for "@/integrations/supabase/client". Same functions.invoke shape as supabase-js:
// errors carry the HTTP Response in `context`, like FunctionsHttpError.
export const supabase = {
  functions: {
    async invoke(name: string, opts: { body: unknown }) {
      const isForm = opts.body instanceof FormData;
      let res: Response;
      try {
        res = await fetch(`/functions/v1/${name}`, {
          method: "POST",
          headers: isForm ? { authorization: "Bearer harness-admin" } : { authorization: "Bearer harness-admin", "content-type": "application/json" },
          body: isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
        });
      } catch (e) {
        return { data: null, error: { name: "FunctionsFetchError", message: String(e) } };
      }
      if (!res.ok) return { data: null, error: { name: "FunctionsHttpError", message: "Edge Function returned a non-2xx status code", context: res } };
      return { data: await res.json(), error: null };
    },
  },
};
