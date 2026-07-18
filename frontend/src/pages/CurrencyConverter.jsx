import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeftRight, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { currencyService } from "@/api/currencyService";
import { unwrapFrappeMethodData } from "@/api/client";

const FALLBACK_CURRENCIES = ["UYU", "USD", "EUR", "BRL", "ARS"];

export default function CurrencyConverter() {
    const { t } = useTranslation();
    const [currencies, setCurrencies] = useState(FALLBACK_CURRENCIES);
    const [amount, setAmount] = useState("100");
    const [fromCurrency, setFromCurrency] = useState("USD");
    const [toCurrency, setToCurrency] = useState("UYU");
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        currencyService.getSupportedCurrencies()
            .then((res) => {
                const list = unwrapFrappeMethodData(res, {})?.currencies;
                if (Array.isArray(list) && list.length) setCurrencies(list);
            })
            .catch(() => {});
    }, []);

    const handleConvert = async () => {
        const value = parseFloat(amount);
        if (isNaN(value) || value <= 0) {
            toast.error(t("currencyConverter.amountRequired", "Ingresa un monto válido"));
            return;
        }
        setLoading(true);
        setResult(null);
        try {
            const res = await currencyService.convert(value, fromCurrency, toCurrency);
            setResult(unwrapFrappeMethodData(res, null));
        } catch (err) {
            toast.error(err?.message || t("currencyConverter.error", "Error al convertir"));
        } finally {
            setLoading(false);
        }
    };

    const handleSwap = () => {
        setFromCurrency(toCurrency);
        setToCurrency(fromCurrency);
        setResult(null);
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6 max-w-2xl">
            <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <ArrowLeftRight className="w-6 h-6 text-cheese-600" />
                    {t("currencyConverter.title", "Convertidor de Monedas")}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    {t("currencyConverter.description", "Aplica la tasa de cambio actual (open.er-api.com, sincronizada diariamente) para convertir entre monedas. Es una consulta manual — no queda registrada en el historial de conversiones automáticas.")}
                </p>
            </div>

            <Card className="glass-surface">
                <CardHeader>
                    <CardTitle className="text-base">{t("currencyConverter.cardTitle", "Convertir monto")}</CardTitle>
                    <CardDescription>{t("currencyConverter.cardDescription", "Tasas de mercado; un administrador puede corregirlas manualmente en Currency Exchange si hace falta.")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
                        <div className="space-y-1">
                            <Label>{t("currencyConverter.from", "Desde")}</Label>
                            <select
                                value={fromCurrency}
                                onChange={(e) => setFromCurrency(e.target.value)}
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                            >
                                {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <Button variant="outline" size="icon" onClick={handleSwap} className="shrink-0 mb-0.5">
                            <ArrowLeftRight className="w-4 h-4" />
                        </Button>
                        <div className="space-y-1">
                            <Label>{t("currencyConverter.to", "Hacia")}</Label>
                            <select
                                value={toCurrency}
                                onChange={(e) => setToCurrency(e.target.value)}
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                            >
                                {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <Label>{t("currencyConverter.amount", "Monto")}</Label>
                        <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleConvert(); }}
                        />
                    </div>

                    <Button
                        className="w-full bg-cheese-500 hover:bg-cheese-600 text-black font-semibold"
                        onClick={handleConvert}
                        disabled={loading}
                    >
                        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                        {t("currencyConverter.convert", "Convertir")}
                    </Button>

                    {result && (
                        <div className="p-4 bg-cheese-500/5 border border-cheese-500/20 rounded-lg text-center space-y-1">
                            <p className="text-2xl font-bold text-foreground">
                                {result.converted_amount?.toLocaleString(undefined, { maximumFractionDigits: 2 })} {result.to_currency}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {result.original_amount?.toLocaleString(undefined, { maximumFractionDigits: 2 })} {result.from_currency}
                                {" = "}{result.converted_amount?.toLocaleString(undefined, { maximumFractionDigits: 2 })} {result.to_currency}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                                {t("currencyConverter.rateInfo", "Tasa: 1 {{from}} = {{rate}} {{to}} · {{date}}", {
                                    from: result.from_currency,
                                    rate: result.exchange_rate?.toFixed(6),
                                    to: result.to_currency,
                                    date: result.rate_date,
                                })}
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </motion.div>
    );
}
