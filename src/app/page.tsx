import { SignInButton, currentUser } from "@clerk/nextjs";
import { unstable_noStore as noStore } from "next/cache";

import { CreatePost } from "~/app/_components/create-post";
import { api } from "~/trpc/server";
import { RouterOutputs } from "~/trpc/shared";

import dayjs from 'dayjs'
import relativeTime from "dayjs/plugin/relativeTime"
import Image from "next/image";

dayjs.extend(relativeTime)

export default async function Home() {
  noStore();

  const user = await currentUser()

  const data = await api.post.getAll.query()

  return (
    <main className="flex h-screen justify-center">
      <div className="w-full h-full md:max-w-2xl border-x border-slate-400">
        <div className="border-b flex border-slate-400 p-4">
          {user ?
            (
              <CreatePostWizard />
            ) :
            (
              <div className="flex justify-center">
                <SignInButton />
              </div>
            )
          }
        </div>
        <div>
          {[...data].map((postWithUser) => (
            <PostView postWithUser={postWithUser} key={postWithUser.post.id} />
          ))}
        </div>
      </div>
    </main>
  );
}

async function CrudShowcase() {
  const latestPost = await api.post.getLatest.query();

  return (
    <div className="w-full max-w-xs">
      {latestPost ? (
        <p className="truncate">Your most recent post: {latestPost.content}</p>
      ) : (
        <p>You have no posts yet.</p>
      )}

      <CreatePost />
    </div>
  );
}

async function CreatePostWizard() {
  const user = await currentUser()

  if (!user) return null

  return (
    <div className="flex gap-4 w-full">
      <Image
        className="rounded-full"
        src={user.imageUrl}
        alt="Profile image"
        width={64}
        height={64}
      />
      <input
        type="text"
        placeholder="Type some emojis!"
        className="bg-transparent grow outline-none"
      />
    </div>
  )
}

type PostWithUser = RouterOutputs["post"]["getAll"][number]

async function PostView({ postWithUser }: { postWithUser: PostWithUser }) {
  const { post, author } = postWithUser
  return (
    <div className="border-b border-slate-400 p-4 flex gap-4">
      <Image
        src={author.imageUrl}
        className="rounded-full"
        alt="Profile image"
        height={48}
        width={48}
      />
      <div className="flex flex-col">
        <div className="flex text-slate-300 gap-1">
          <span>@{author.username}</span>
          <span className="text-zinc-400">{dayjs(post.createdAt).fromNow()}</span>
        </div>
        <span>{post.content}</span>
      </div>
    </div>
  )
}