"use client";

import { useUser } from "@clerk/nextjs"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { api } from "~/trpc/react"

export function CreatePostWizard() {
  const { user, isLoaded } = useUser()
  const router = useRouter();
  const [input, setInput] = useState("")

  
  const {mutate, isLoading} = api.post.create.useMutation({
    onSuccess: () => {
      router.refresh();
      setInput("");
    },
    onError: (err) => {
      console.error('[CREATE_POST_ERROR]', err)
    }
  })
  
  if (!isLoaded) return <div>Loading user...</div>
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
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <button
        onClick={() => { mutate({ content: input }) }}
      >
        {isLoading ? "Submitting..." : "POST"}
      </button>
    </div>
  )
}