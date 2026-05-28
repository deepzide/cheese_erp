import './App.css'
import Pages from "@/pages/index.jsx"
import { Toaster } from "sonner"
import { QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider, useTheme } from "@/components/ThemeProvider"
import { queryClient } from "@/lib/queryClient";

function ThemedToaster() {
    const { resolvedTheme } = useTheme();
    return (
        <Toaster
            duration={2500}
            closeButton
            theme={resolvedTheme}
            toastOptions={{
                duration: 2500,
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
