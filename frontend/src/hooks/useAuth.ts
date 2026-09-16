import { useAccount, useSignMessage } from "wagmi"
import { useState, useEffect } from "react"
import { api } from "../lib/api"

export function useAuth() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [authed, setAuthed] = useState(!!localStorage.getItem("tugas_token"))

  useEffect(() => {
    if (!isConnected) {
      localStorage.removeItem("tugas_token")
      setAuthed(false)
    }
  }, [isConnected])

  async function login() {
    if (!address) return
    const { nonce } = await api.nonce(address)
    const signature = await signMessageAsync({ message: nonce })
    const { token } = await api.verify(address, signature)
    localStorage.setItem("tugas_token", token)
    setAuthed(true)
  }

  return { address, isConnected, authed, login }
}
