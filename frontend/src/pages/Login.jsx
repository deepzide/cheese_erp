import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { authService } from "@/api/authService";
import { setBaseUrl, getBaseUrl } from "@/api/client";
import { Loader2, Eye, EyeOff } from "lucide-react";

export default function Login() {
    const navigate = useNavigate();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [serverUrl, setServerUrl] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showServer, setShowServer] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Restore base URL from localStorage on mount
    useEffect(() => {
        const storedBaseUrl = getBaseUrl();
        if (storedBaseUrl) {
            setServerUrl(storedBaseUrl);
        }
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            if (serverUrl) setBaseUrl(serverUrl);
            await authService.login(username, password);
            navigate("/cheese/dashboard");
        } catch (err) {
            setError(err?.message || "Login failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-yellow-500/10 rounded-full blur-3xl animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-amber-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-yellow-600/5 rounded-full blur-3xl" />
            </div>

            {/* Grid Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,235,59,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,235,59,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="relative z-10 w-full max-w-md px-4"
            >
                <Card className="bg-[#111111]/90 border-white/10 backdrop-blur-xl shadow-2xl shadow-yellow-500/5">
                    <CardHeader className="text-center pb-2 pt-8">
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
                            className="flex flex-col items-center gap-4"
                        >
                            <div className="w-16 h-16 cheese-gradient rounded-2xl flex items-center justify-center shadow-lg shadow-yellow-500/30 rotate-3 hover:rotate-0 transition-transform duration-300">
                                <span className="text-3xl">🧀</span>
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-white">Cheese</h1>
                                <p className="text-sm text-white/40 mt-1">Control Center</p>
                            </div>
                        </motion.div>
                    </CardHeader>

                    <CardContent className="pt-6 pb-8 px-8">
                        <form onSubmit={handleLogin} className="space-y-5">
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg"
                                >
                                    {error}
                                </motion.div>
                            )}

                            <div className="space-y-2">
                                <Label className="text-white/70 text-sm">Username or Email</Label>
                                <Input
                                    id="login-username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="admin@example.com"
                                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-cheese-500 focus:ring-cheese-500/20 h-11"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-white/70 text-sm">Password</Label>
                                <div className="relative">
                                    <Input
                                        id="login-password"
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-cheese-500 focus:ring-cheese-500/20 h-11 pr-10"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setShowServer(!showServer)}
                                className="text-xs text-white/30 hover:text-cheese-400 transition-colors"
                            >
                                {showServer ? "Hide" : "Show"} server settings
                            </button>

                            {showServer && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    className="space-y-2"
                                >
                                    <Label className="text-white/70 text-sm">Server URL</Label>
                                    <Input
                                        id="login-server-url"
                                        type="url"
                                        value={serverUrl}
                                        onChange={(e) => setServerUrl(e.target.value)}
                                        placeholder="https://your-site.frappe.cloud"
                                        className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-cheese-500 focus:ring-cheese-500/20 h-11"
                                    />
                                </motion.div>
                            )}

                            <Button
                                type="submit"
                                disabled={loading}
                                className="w-full h-11 cheese-gradient text-black font-semibold hover:shadow-lg hover:shadow-yellow-500/20 transition-all duration-300 border-0"
                            >
                                {loading ? (
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : null}
                                {loading ? "Signing in..." : "Sign in to Cheese"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <p className="text-center text-white/20 text-xs mt-6">
                    Cheese Control Center • Flow-driven operations
                </p>
            </motion.div>
        </div>
    );
}
