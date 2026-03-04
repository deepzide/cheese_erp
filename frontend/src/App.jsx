import './App.css'
import Pages from "@/pages/index.jsx"
import { Toaster } from "sonner"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 5 * 60 * 1000,
        },
    },
})

function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <Pages />
            <Toaster
                duration={2000}
                toastOptions={{
                    style: {
                        background: '#1a1a1a',
                        color: '#FDD835',
                        border: '1px solid #333',
                    },
                }}
            />
        </QueryClientProvider>
    )
}

export default App
