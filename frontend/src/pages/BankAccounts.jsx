import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Landmark, Search, Plus, AlertCircle, RefreshCw, Loader2, MoreHorizontal, Route, CheckCircle, XCircle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useFrappeList, useFrappeCreate } from "@/lib/useApiData";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "react-i18next";

const STATUS_BADGE = {
    ACTIVE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    INACTIVE: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
    PENDING: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
};

export default function BankAccounts() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState({ entity_type: "Cheese Route", entity_id: searchParams.get('route') || "", holder: "", bank: "", account: "", iban: "", currency: "EUR" });
    const routeFilter = searchParams.get('route');

    const { data: accounts = [], isLoading, error, refetch } = useFrappeList("Cheese Bank Account", {
        fields: ["name", "entity_type", "entity_id", "route", "status", "holder", "bank", "account", "iban", "currency", "creation"],
        filters: routeFilter ? { entity_id: routeFilter } : undefined,
        pageSize: 100,
    });

    const createMutation = useFrappeCreate("Cheese Bank Account");

    const filtered = (Array.isArray(accounts) ? accounts : []).filter(a => {
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return (a.holder || '').toLowerCase().includes(term)
                || (a.bank || '').toLowerCase().includes(term)
                || (a.entity_id || a.route || '').toLowerCase().includes(term);
        }
        return true;
    });

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">{t("bankAccounts.loadFailed", "Failed to load bank accounts")}</h2>
                <Button onClick={() => refetch()} variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> {t("common.retry", "Retry")}</Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Landmark className="w-6 h-6 text-cheese-600" /> {t("bankAccounts.title", "Bank Accounts")}</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {isLoading ? "..." : t("bankAccounts.accountsCount", { count: filtered.length, defaultValue: `${filtered.length} accounts` })}
                        {routeFilter ? ` (${t("bankAccounts.filteredByRoute", "Filtered by Route")}: ${routeFilter})` : ""}
                    </p>
                </div>
                <div className="flex gap-2">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder={t("bankAccounts.search", "Search...")} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
                    <Button className="cheese-gradient text-black font-semibold border-0 h-9" onClick={() => navigate("/cheese/bank-accounts/new")}><Plus className="w-4 h-4 mr-1" /> {t("bankAccounts.addAccount", "Add Account")}</Button>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9"><RefreshCw className="w-4 h-4" /></Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {isLoading ? Array.from({ length: 3 }).map((_, i) => (
                    <Card key={i} className="border border-border"><CardContent className="p-5 space-y-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-full" /></CardContent></Card>
                )) : filtered.map((account) => (
                    <motion.div key={account.name} whileHover={{ y: -3 }}>
                        <Card className="border border-border shadow-sm hover:shadow-md transition-all group cursor-pointer" onClick={() => navigate(`/cheese/bank-accounts/${encodeURIComponent(account.name)}`)}>
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center"><Landmark className="w-5 h-5 text-white" /></div>
                                        <div>
                                            <h3 className="font-semibold text-foreground">{account.holder || account.name}</h3>
                                            <span className="text-xs text-muted-foreground">{account.bank || "—"}</span>
                                        </div>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {account.entity_type === "Cheese Route" && (
                                                <DropdownMenuItem onClick={() => navigate(`/cheese/routes?search=${account.entity_id || account.route}`)}><Route className="w-3 h-3 mr-2" /> {t("bankAccounts.viewRoute", "View Route")}</DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                <div className="space-y-1 text-sm">
                                    {account.iban && <p className="text-xs font-mono text-muted-foreground">IBAN: {account.iban}</p>}
                                    {account.account && <p className="text-xs text-muted-foreground">{t("bankAccounts.account", "Account")}: {account.account}</p>}
                                </div>
                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                                    <Badge className={STATUS_BADGE[account.status] || STATUS_BADGE.PENDING}>{account.status || 'PENDING'}</Badge>
                                    <div className="flex items-center gap-1">
                                        <Badge variant="outline" className="text-[10px]">{account.currency || 'EUR'}</Badge>
                                        <span className="text-[10px] text-muted-foreground">
                                            {account.entity_type === "Company" ? t("bankAccounts.est", "Est") : t("bankAccounts.route", "Route")}: {account.entity_id || account.route || "—"}
                                        </span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {!isLoading && filtered.length === 0 && (
                <div className="text-center py-16"><Landmark className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" /><p className="text-muted-foreground">{t("bankAccounts.noAccounts", "No bank accounts found")}</p></div>
            )}

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-cheese-600" /> {t("bankAccounts.addBankAccount", "Add Bank Account")}</DialogTitle><DialogDescription>{t("bankAccounts.linkDescription", "Link a bank account to a route or establishment")}</DialogDescription></DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>{t("bankAccounts.linkTo", "Link To")} *</Label>
                            <Select value={form.entity_type} onValueChange={(v) => setForm(f => ({ ...f, entity_type: v, entity_id: "" }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Cheese Route">{t("bankAccounts.route", "Route")}</SelectItem>
                                    <SelectItem value="Company">{t("bankAccounts.establishment", "Establishment")}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2"><Label>{form.entity_type === "Company" ? t("bankAccounts.establishment", "Establishment") : t("bankAccounts.route", "Route")} *</Label><Input placeholder={form.entity_type === "Company" ? t("bankAccounts.companyId", "Company ID") : t("bankAccounts.routeId", "Route ID")} value={form.entity_id} onChange={(e) => setForm(f => ({ ...f, entity_id: e.target.value }))} /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label>{t("bankAccounts.holder", "Holder")}</Label><Input value={form.holder} onChange={(e) => setForm(f => ({ ...f, holder: e.target.value }))} /></div>
                            <div className="space-y-2"><Label>{t("bankAccounts.bank", "Bank")}</Label><Input value={form.bank} onChange={(e) => setForm(f => ({ ...f, bank: e.target.value }))} /></div>
                        </div>
                        <div className="space-y-2"><Label>IBAN</Label><Input placeholder="FR76..." value={form.iban} onChange={(e) => setForm(f => ({ ...f, iban: e.target.value }))} /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label>{t("bankAccounts.account", "Account")}</Label><Input value={form.account} onChange={(e) => setForm(f => ({ ...f, account: e.target.value }))} /></div>
                            <div className="space-y-2"><Label>{t("bankAccounts.currency", "Currency")}</Label><Input value={form.currency} onChange={(e) => setForm(f => ({ ...f, currency: e.target.value }))} /></div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel", "Cancel")}</Button>
                        <Button className="cheese-gradient text-black font-semibold border-0" onClick={() => createMutation.mutate({ ...form, route: form.entity_type === "Cheese Route" ? form.entity_id : undefined }, { onSuccess: () => { setCreateOpen(false); toast.success(t("bankAccounts.accountAdded", "Account added")); } })} disabled={createMutation.isPending}>
                            {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} {t("common.create", "Create")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
