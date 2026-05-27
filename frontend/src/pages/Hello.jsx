import { motion } from 'framer-motion';
import { HandMetal } from 'lucide-react';

const POC_ID = 'cheese-poc-2026-05-27-a7f3b';

export default function Hello() {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center min-h-[60vh] p-6"
        >
            <div className="text-center space-y-4">
                <HandMetal className="w-16 h-16 mx-auto text-yellow-500" />
                <h1 className="text-4xl font-bold tracking-tight">Hello from Cheese PoC!</h1>
                <p className="text-lg text-muted-foreground">
                    Deploy pipeline verification &mdash; build ID: <code className="bg-muted px-2 py-1 rounded text-sm">{POC_ID}</code>
                </p>
                <p className="text-sm text-muted-foreground">
                    If you see this page, the local dev &rarr; push &rarr; CI/CD &rarr; staging pipeline is working.
                </p>
            </div>
        </motion.div>
    );
}
