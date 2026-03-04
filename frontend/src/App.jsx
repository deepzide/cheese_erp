import './App.css'
import Pages from "@/pages/index.jsx"
import { Toaster } from "sonner"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider, useTheme } from "@/components/ThemeProvider"

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 5 * 60 * 1000,
        },
    },
})

function ThemedToaster() {
    const { resolvedTheme } = useTheme();
    return (
        <Toaster
            duration={2000}
            theme={resolvedTheme}
            toastOptions={{
                style: {
                    background: 'hsl(var(--card))',
                    color: 'hsl(var(--card-foreground))',
                    border: '1px solid hsl(var(--border))',
                },
            }}
        />
    );
}

function App() {
    return (
        <ThemeProvider defaultTheme="system" storageKey="cheese-theme">
            <QueryClientProvider client={queryClient}>
                <Pages />
                <ThemedToaster />
            </QueryClientProvider>
        </ThemeProvider>
    )
}

export default App
