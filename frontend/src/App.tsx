import { useAuth } from "./hooks/useAuth"
import { Layout } from "./components/Layout"
import { SubjectsPage } from "./pages/SubjectsPage"

export default function App() {
  const { authed } = useAuth()

  return (
    <Layout>
      {authed ? (
        <SubjectsPage />
      ) : (
        <div className="text-center py-20">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Tugas</h1>
          <p className="text-gray-500 mb-8">Your AI-powered study OS on BOT Chain</p>
          <p className="text-sm text-gray-400">Connect your wallet to get started</p>
        </div>
      )}
    </Layout>
  )
}
