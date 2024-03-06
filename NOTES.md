https://create.t3.gg/

https://trpc.io/docs/quickstart

```bash
npm create t3-app@latest
cd chirp-t3
npm install
./start-database.sh
npm run db:push
npm run dev
git commit -m "initial commit"
```

# 1 tRPC 基本使用

src 结构

```bash
./src
├── app # next页面及api
│   ├── _components
│   │   └── create-post.tsx
│   ├── api
│   │   └── trpc
│   │       └── [trpc]
│   │           └── route.ts # trpc接管next api
│   ├── layout.tsx
│   └── page.tsx
├── env.js
├── middleware.ts
├── server # 服务（数据库 + tRPC服务）
│   ├── api
│   │   ├── root.ts # appRouter
│   │   ├── routers
│   │   │   └── post.ts # procedure子路由函数
│   │   └── trpc.ts # tRPC初始化
│   └── db.ts
├── styles
│   └── globals.css
└── trpc # tRPC 客户端
    ├── react.tsx # 客户端渲染所需api及Provider
    ├── server.ts # 服务端渲染所需api
    └── shared.ts # trpc相关工具函数
```

## 1.1 定义后端路由器

### 1.1.1 创建路由器实例

初始化 tRPC 服务

`src/server/api/trpc.ts` 这个文件分为两部分，**上下文创建**和 **tRPC 初始化**

#### 1  上下文创建

定义传递给的 tRPC 路由函数的上下文。上下文就是一个数据对象，你定义的所有 tRPC 路由函数都会访问它来获取数据，它被用来存放了一些例如**数据库的连接**、**认证信息**等数据。在 create-t3-app 里，当我们不需要获取整个请求对象时，我们分别使用两个函数来取得上下文的部分数据：

- `createInnerTRPCContext`:  这里你可以定义不依赖请求的上下文，例如数据库的连接。你可以使用这个函数来做集成测试或 ssg-helpers，这些场景下你都没有一个请求对象。

- `createTRPCContext`:  你可以在这里定义依赖于请求的上下文，例如用户的 session。你通过使用 `opts.req` 来获取 session，然后将它传给 `createInnerTRPCContext` 函数来创建最后完整的上下文。

#### 2 初始化 tRPC

初始化 tRPC，并定义可复用的 procedure 路由函数和中间件。按照惯例，你不应该将整个 `t` 对象导出，而是通过转换创建复用的路由和中间件，并导出它们

你会注意到我们使用了 superjson 作为数据解析工具。在数据被发送到客户端时，它会帮你保留数据类型。例如你发送了一个 Date类型的对象，客户端会返回一个相同类型的 Date，而不是像其他大多数 API 一样返回一个字符串

```tsx
// src/server/api/trpc.ts
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import { db } from "~/server/db";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  return {
    db,
    ...opts,
  };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
```

### 1.1.2 整合 appRouter

接下来，我们将初始化我们的主路由器实例，通常称为 `appRouter` ，稍后我们将在其中添加过程。

在这里我们把所有在 `routers/**` 中定义的子路由合并到一个单一的应用路由里

```tsx
// src/server/api/root.ts
import { postRouter } from "~/server/api/routers/post";
import { createTRPCRouter } from "~/server/api/trpc";

/**
 * 这里是服务器路由的主入口
 * /api/routers 下的全部路由应该被手动添加到这里
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
});

// 导出路由器类型供客户端使用
export type AppRouter = typeof appRouter;
```

最后，我们需要导出路由器的类型，稍后将在客户端使用。你在 routers 中定义许多 procedure 路由函数，它表示这些相关路由函数的公共命名空间。你可以有不同的路由，然后将这些路由统一集中合并到 appRouter 里

### 1.1.3 procedure 路由函数

tRPC procedure 相当于于传统后端中的路由函数）

在定义输入校验之后，我们链式地添加了一个 resolver 函数，它可以被用于查询(query)、修改(mutation) 或 订阅(subscription)

下面创建了一个名为 `create` 的 mutation procedure 以及名为 `getLatest` 的 query procedure，并使用 zod 作为入参验证器

```tsx
// src/server/api/routers/post.ts
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const postRouter = createTRPCRouter({
  create: publicProcedure
    .input(z.object({ content: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.post.create({
        data: {
          content: input.content,
          authorId: '1',
        },
      });
    }),

  getLatest: publicProcedure.query(({ ctx }) => {
    return ctx.db.post.findFirst({
      orderBy: { createdAt: "desc" },
    });
  }),
});
```

## 1.2 提供 API

这里是 Nextjs 项目 API 的入口，使用 trpc 接管 Nextjs 的 API 方法， 从而暴露了 tRPC 的路由。

```tsx
// src/app/api/trpc/[trpc]/route.ts
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";

import { env } from "~/env";
import { appRouter } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

const createContext = async (req: NextRequest) => {
  return createTRPCContext({
    headers: req.headers,
  });
};

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req),
    onError:
      env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(
              `❌ tRPC failed on ${path ?? "<no-path>"}: ${error.message}`
            );
          }
        : undefined,
  });

export { handler as GET, handler as POST };
```

## 1.3 客户端使用

### 1.3.1 设置 tRPC 客户端

tRPC 中的链接类似于 GraphQL 中的链接，它们让我们在发送到服务器之前控制数据流。

#### 1 客户端渲染

使用 createTRPCReact 函数创建客户端渲染所需的 api 实例，并以及 TRPCReactProvider，向全局提供 queryClient 和 trpcClient

```tsx
// src/trpc/react.tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { loggerLink, unstable_httpBatchStreamLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { useState } from "react";

import { type AppRouter } from "~/server/api/root";
import { getUrl, transformer } from "./shared";

const createQueryClient = () => new QueryClient();

let clientQueryClientSingleton: QueryClient | undefined = undefined;
const getQueryClient = () => {
  if (typeof window === "undefined") {
    // 服务端：永远创建新的 QueryClient
    return createQueryClient();
  }
  // 浏览器：使用单例模式保证使用相同的 QueryClient
  return (clientQueryClientSingleton ??= createQueryClient());
};

export const api = createTRPCReact<AppRouter>();

export function TRPCReactProvider(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  const [trpcClient] = useState(() =>
    api.createClient({
      transformer,
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === "development" ||
            (op.direction === "down" && op.result instanceof Error),
        }),
        unstable_httpBatchStreamLink({
          url: getUrl(),
        }),
      ],
    })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={trpcClient} queryClient={queryClient}>
        {props.children}
      </api.Provider>
    </QueryClientProvider>
  );
}

```

#### 2 服务端渲染

创建和配置了一个用于服务端渲染的 tRPC 客户端代理实例，这个实例会包含预先定义的 APP 路由，并且配置了传输器和中间件，其中包括一个日志 link（中间件）和一个自定义的link（中间件）

这个实例能够直接通过调用 tRPC 的过程来与服务端的 APP 路由进行通讯，而不需要通过 HTTP 请求

```tsx
// src/trpc/server.ts
import "server-only";

import {
  createTRPCProxyClient,
  loggerLink,
  TRPCClientError,
} from "@trpc/client";
import { callProcedure } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { type TRPCErrorResponse } from "@trpc/server/rpc";
import { headers } from "next/headers";
import { cache } from "react";

import { appRouter, type AppRouter } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { transformer } from "./shared";

/**
 * 当在 RSC 中处理 tRPC 调用时，使用辅助函数 `createTRPCContext`
 * 可以为 tRPC API 创建必要的上下文数据
 */
const createContext = cache(() => {
  const heads = new Headers(headers());
  heads.set("x-trpc-source", "rsc");

  return createTRPCContext({
    headers: heads,
  });
});

export const api = createTRPCProxyClient<AppRouter>({
  transformer,
  links: [
    loggerLink({
      enabled: (op) =>
        process.env.NODE_ENV === "development" ||
        (op.direction === "down" && op.result instanceof Error),
    }),
    /**
     * 自定义的 RSC link 可以让我们无需使用 http request 就可以访问 procedures
     */
    () =>
      ({ op }) =>
        observable((observer) => {
          createContext()
            .then((ctx) => {
              return callProcedure({
                procedures: appRouter._def.procedures,
                path: op.path,
                rawInput: op.input,
                ctx,
                type: op.type,
              });
            })
            .then((data) => {
              observer.next({ result: { data } });
              observer.complete();
            })
            .catch((cause: TRPCErrorResponse) => {
              observer.error(TRPCClientError.from(cause));
            });
        }),
  ],
});
```

### 1.3.2 Querying & mutating

tRPC 为 @tanstack/react-query 做了一层封装，这既可以让你充分利用它所提供的各种 hooks 功能，又能在调用 API 时享受类型安全和类型推断带来的好处。我们可以这样调用后端的路由函数

```tsx
// RSC query
import { api } from "~/trpc/server";
const latestPost = await api.post.getLatest.query();

// Client mutation
import { api } from "~/trpc/react";
const createPost = api.post.create.useMutation({
  onSuccess: () => {
    router.refresh();
    setContent("");
  },
}).mutate({ content })
```







asdfasf
