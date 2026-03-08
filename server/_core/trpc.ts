import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

// Allows both authenticated users AND guests.
// Guests pass an `x-guest-id` header (a UUID generated client-side).
// ctx.actorId is set to user.id (string) for real users, or "guest-<uuid>" for guests.
const allowGuestOrUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  let actorId: string;

  if (ctx.user) {
    actorId = String(ctx.user.id);
  } else {
    const guestHeader = ctx.req.headers['x-guest-id'];
    const guestId = Array.isArray(guestHeader) ? guestHeader[0] : guestHeader;
    if (!guestId || !/^[a-zA-Z0-9_-]{8,64}$/.test(guestId)) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    actorId = `guest-${guestId}`;
  }

  return next({
    ctx: {
      ...ctx,
      actorId,
    },
  });
});

export const guestOrUserProcedure = t.procedure.use(allowGuestOrUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
