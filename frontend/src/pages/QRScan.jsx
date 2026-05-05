import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    QrCode, Camera, CheckCircle, XCircle, AlertTriangle, User,
    Clock, MapPin, Users as UsersIcon, Loader2, RefreshCw,
    ArrowRight, Star, ScanLine
} from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/api/client";
import { useTranslation } from "react-i18next";

const STATUS_COLORS = {
    PENDING: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-200",
    CONFIRMED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200",
    CHECKED_IN: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-200",
    COMPLETED: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-200",
    CANCELLED: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-200",
    EXPIRED: "bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-200",
};

export default function QRScan() {
    const { t } = useTranslation();
    const [scanning, setScanning] = useState(false);
    const [scanResult, setScanResult] = useState(null);
    const [error, setError] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [completing, setCompleting] = useState(false);
    const [manualToken, setManualToken] = useState("");
    const scannerRef = useRef(null);
    const scannerInstanceRef = useRef(null);

    const startScanner = async () => {
        setError(null);
        setScanResult(null);
        setScanning(true);

        try {
            const { Html5Qrcode } = await import("html5-qrcode");

            // Small delay to ensure DOM is ready
            await new Promise(r => setTimeout(r, 100));

            if (!scannerRef.current) return;

            const scanner = new Html5Qrcode("qr-reader");
            scannerInstanceRef.current = scanner;

            await scanner.start(
                { facingMode: "environment" },
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1,
                },
                (decodedText) => {
                    // Success callback
                    handleScan(decodedText);
                    stopScanner();
                },
                () => {
                    // Error callback (ignored — fires on every failed frame)
                }
            );
        } catch (err) {
            setError("Camera access denied or not available. Use manual token entry below.");
            setScanning(false);
        }
    };

    const stopScanner = async () => {
        try {
            if (scannerInstanceRef.current) {
                await scannerInstanceRef.current.stop();
                scannerInstanceRef.current = null;
            }
        } catch {}
        setScanning(false);
    };

    useEffect(() => {
        return () => {
            stopScanner();
        };
    }, []);

    const handleScan = async (token) => {
        if (!token || processing) return;
        setProcessing(true);
        setError(null);

        try {
            const res = await apiRequest("/api/method/cheese.api.v1.qr_controller.validate_qr", {
                method: "POST",
                body: JSON.stringify({ token }),
            });

            const payload = res?.data?.message || res?.data || res;
            if (payload?.success === false) {
                throw new Error(payload?.error?.message || payload?.message || "Invalid QR code");
            }

            const data = payload?.data || payload;
            setScanResult({
                ...data,
                token,
            });
            toast.success("Check-in successful!");
        } catch (err) {
            setError(err?.message || "Failed to validate QR code");
            toast.error(err?.message || "Invalid QR code");
        } finally {
            setProcessing(false);
        }
    };

    const handleManualSubmit = () => {
        if (!manualToken.trim()) {
            toast.error("Enter a QR token");
            return;
        }
        handleScan(manualToken.trim());
    };

    const handleComplete = async () => {
        if (!scanResult?.ticket_id) return;
        setCompleting(true);
        try {
            const res = await apiRequest("/api/method/cheese.api.v1.ticket_controller.update_ticket_status", {
                method: "POST",
                body: JSON.stringify({
                    ticket_id: scanResult.ticket_id,
                    new_status: "COMPLETED",
                }),
            });
            const payload = res?.data?.message || res?.data || res;
            if (payload?.success === false) {
                throw new Error(payload?.error?.message || payload?.message || "Failed to complete ticket");
            }
            setScanResult(prev => ({ ...prev, new_status: "COMPLETED" }));
            toast.success("Ticket marked as COMPLETED!");
        } catch (err) {
            toast.error(err?.message || "Failed to complete ticket");
        } finally {
            setCompleting(false);
        }
    };

    const resetScan = () => {
        setScanResult(null);
        setError(null);
        setManualToken("");
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6 max-w-2xl mx-auto">
            {/* Header */}
            <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl cheese-gradient shadow-lg shadow-yellow-500/20 mb-4">
                    <ScanLine className="w-8 h-8 text-black" />
                </div>
                <h1 className="text-2xl font-bold text-foreground">{t("qrScan.title", "Registro QR")}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Scan a guest's QR code to verify attendance
                </p>
            </div>

            {/* Scanner or Result */}
            <AnimatePresence mode="wait">
                {!scanResult ? (
                    <motion.div key="scanner" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                        {/* Camera Scanner */}
                        <Card className="border border-border overflow-hidden">
                            <CardContent className="p-0">
                                {scanning ? (
                                    <div className="relative">
                                        <div
                                            id="qr-reader"
                                            ref={scannerRef}
                                            className="w-full"
                                            style={{ minHeight: "300px" }}
                                        />
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            className="absolute top-3 right-3 z-10"
                                            onClick={stopScanner}
                                        >
                                            <XCircle className="w-4 h-4 mr-1" /> Stop
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="p-12 text-center space-y-4">
                                        <div className="w-24 h-24 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center">
                                            <Camera className="w-10 h-10 text-muted-foreground/50" />
                                        </div>
                                        <Button
                                            className="cheese-gradient text-black font-semibold border-0 h-12 px-8 text-base"
                                            onClick={startScanner}
                                            disabled={processing}
                                        >
                                            {processing ? (
                                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                            ) : (
                                                <Camera className="w-5 h-5 mr-2" />
                                            )}
                                            Open Camera Scanner
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Manual Token Entry */}
                        <Card className="mt-4 border border-border">
                            <CardContent className="p-4">
                                <p className="text-xs text-muted-foreground mb-3 font-medium">{t("qrScan.manualEntry", "O ingresar token manualmente:")}</p>
                                <div className="flex gap-2">
                                    <Input
                                        placeholder={t("qrScan.pasteToken", "Pegar token QR...")}
                                        value={manualToken}
                                        onChange={(e) => setManualToken(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
                                        className="font-mono text-sm"
                                    />
                                    <Button
                                        onClick={handleManualSubmit}
                                        disabled={processing || !manualToken.trim()}
                                        className="cheese-gradient text-black font-semibold border-0"
                                    >
                                        {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Error Display */}
                        {error && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
                                <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
                                    <CardContent className="p-4 flex items-start gap-3">
                                        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-sm font-medium text-red-700 dark:text-red-400">Scan Error</p>
                                            <p className="text-xs text-red-600 dark:text-red-400/80 mt-1">{error}</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}
                    </motion.div>
                ) : (
                    <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                        {/* Success Result */}
                        <Card className="border-emerald-200 dark:border-emerald-800 overflow-hidden">
                            <div className="h-1.5 bg-gradient-to-r from-emerald-400 to-green-500" />
                            <CardContent className="p-6 space-y-5">
                                {/* Check-in confirmation */}
                                <div className="text-center">
                                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/50 mb-3">
                                        <CheckCircle className="w-7 h-7 text-emerald-600" />
                                    </div>
                                    <h2 className="text-lg font-bold text-foreground">
                                        {scanResult.checked_in ? "Check-In Successful" : "QR Validated"}
                                    </h2>
                                </div>

                                {/* Ticket info */}
                                <div className="grid grid-cols-2 gap-4 bg-muted/30 rounded-xl p-4">
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Ticket</p>
                                        <p className="text-sm font-mono font-bold text-foreground mt-0.5">{scanResult.ticket_id}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Status</p>
                                        <Badge className={`mt-1 ${STATUS_COLORS[scanResult.new_status] || STATUS_COLORS.CONFIRMED}`}>
                                            {scanResult.new_status}
                                        </Badge>
                                    </div>
                                    {scanResult.old_status && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Previous</p>
                                            <p className="text-sm text-muted-foreground mt-0.5">{scanResult.old_status}</p>
                                        </div>
                                    )}
                                    {scanResult.checked_in_at && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Checked In At</p>
                                            <p className="text-sm text-muted-foreground mt-0.5">
                                                {new Date(scanResult.checked_in_at).toLocaleTimeString()}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Action buttons */}
                                <div className="flex flex-col gap-2">
                                    {scanResult.new_status === "CHECKED_IN" && (
                                        <Button
                                            className="w-full bg-purple-600 hover:bg-purple-700 text-white h-11"
                                            onClick={handleComplete}
                                            disabled={completing}
                                        >
                                            {completing ? (
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            ) : (
                                                <CheckCircle className="w-4 h-4 mr-2" />
                                            )}
                                            Mark as Completed
                                        </Button>
                                    )}
                                    {(scanResult.new_status === "COMPLETED" || scanResult.new_status === "CHECKED_IN") && (
                                        <Button
                                            variant="outline"
                                            className="w-full h-11 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                            onClick={() => window.open(`/api/method/cheese.api.v1.survey_controller.get_survey_link?ticket_id=${scanResult.ticket_id}`, "_blank")}
                                        >
                                            <Star className="w-4 h-4 mr-2" />
                                            Submit Survey
                                        </Button>
                                    )}
                                    <Button
                                        variant="outline"
                                        className="w-full h-11"
                                        onClick={resetScan}
                                    >
                                        <RefreshCw className="w-4 h-4 mr-2" />
                                        Scan Another QR
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
