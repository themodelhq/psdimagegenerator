import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { getGuestId, isGuestMode } from "./hooks/useGuest";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;
  // Don't redirect guests — they'll see an error toast instead
  if (isGuestMode()) return;
  if (error.message === UNAUTHED_ERR_MSG) {
    window.location.href = getLoginUrl();
  }
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    redirectToLoginIfUnauthorized(event.query.state.error);
    console.error("[API Query Error]", event.query.state.error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    redirectToLoginIfUnauthorized(event.mutation.state.error);
    console.error("[API Mutation Error]", event.mutation.state.error);
  }
});

function getTrpcUrl(): string {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (apiUrl && apiUrl.startsWith("http")) {
    return `${apiUrl.replace(/\/$/, "")}/api/trpc`;
  }
  return `${window.location.origin}/api/trpc`;
}

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: getTrpcUrl(),
      transformer: superjson,
      fetch(input, init) {
        const headers: Record<string, string> = {};
        const guestId = getGuestId();
        if (guestId) headers['x-guest-id'] = guestId;

        // Abort after 10 s so auth.me (and all tRPC calls) never hang the UI.
        // AbortSignal.any merges an existing signal (if any) with the timeout.
        const timeoutSignal = AbortSignal.timeout?.(120_000);
        const signal = (init?.signal && timeoutSignal)
          ? (AbortSignal as any).any([init.signal, timeoutSignal])
          : (timeoutSignal ?? init?.signal);

        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
          signal,
          headers: {
            ...(init?.headers ?? {}),
            ...headers,
          },
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
