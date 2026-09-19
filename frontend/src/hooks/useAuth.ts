import { useAccount, useSignMessage } from "wagmi"
import { useState, useEffect, createContext, useContext } from "react"
import { api } from "../lib/api"

interface AuthCtx {
  address: string | undefined
  isConnected: boolean
  authed: boolean
  login: () => Promise<void>
}

export const AuthContext = createContext<AuthCtx>({
  address: undefined,
  isConnected: false,
  authed: false,
  login: async () => {},
})

export function useAuthProvider(): AuthCtx {
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

export function useAuth() {
  return useContext(AuthContext)
}
