import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, Search, Filter, DollarSign, Clock, CheckCircle, AlertTriangle, XCircle, AlertCircle, RefreshCw, Ticket, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { depositService } from "@/api/depositService";

const STATUS_CONFIG = {
    PENDING: { label: "Pending", badge: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400", icon: Clock },
    PAID: { label: "Paid", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", icon: CheckCircle },
    PARTIAL: { label: "Partial", badge: "bg-blue-500/15 text-blue-700 dark:text-blue-400", icon: AlertTriangle },
    OVERDUE: { label: "Overdue", badge: "bg-red-500/15 text-red-700 dark:text-red-400", icon: XCircle },
    REFUNDED: { label: "Refunded", badge: "bg-gray-500/15 text-gray-600 dark:text-gray-400", icon: XCircle },
    FORFEITED: { label: "Forfeited", badge: "bg-orange-500/15 text-orange-700 dark:text-orange-400", icon: XCircle },
};

export default function Deposits() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");

    const { data: depositsRaw, isLoading, error, refetch } = useQuery({
        queryKey: ['deposits', filterStatus],
        queryFn: async () => {
            const params = {};
            if (filterStatus !== "all") params.status = filterStatus;
            const result = await depositService.listDeposits(params);
            const payload = result?.data?.message || result?.data || result;
            return payload?.data || [];
        },
    });

    const deposits = Array.isArray(depositsRaw) ? depositsRaw : [];

    const verifyMutation = useMutation({
        mutationFn: (depositId) => depositService.verifyDeposit(depositId),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['deposits'] }); toast.success("Deposit verified"); },
        onError: (err) => toast.error(err?.message || "Verification failed"),
    });

    const filtered = deposits.filter(d => {
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return (d.name || '').toLowerCase().includes(term) || (d.entity_id || '').toLowerCase().includes(term);
        }
        return true;
    });

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">Failed to load deposits</h2>
                <p className="text-sm text-muted-foreground mb-4">{error?.message}</p>
                <Button onClick={() => refetch()} variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> Retry</Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Wallet className="w-6 h-6 text-cheese-600" /> Deposits</h1>
                    <p className="text-sm text-muted-foreground mt-1">{isLoading ? '...' : `${filtered.length} deposits`}</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger className="w-36 h-9"><Filter className="w-3 h-3 mr-1" /><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9"><RefreshCw className="w-4 h-4" /></Button>
                </div>
            </div>

            <div className="space-y-3">
                {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                    <Card key={i} className="border border-border"><CardContent className="p-4 flex items-center gap-4">
                        <Skeleton className="w-10 h-10 rounded-lg" /><div className="flex-1"><Skeleton className="h-4 w-40 mb-2" /><Skeleton className="h-3 w-24" /></div><Skeleton className="h-6 w-20" />
                    </CardContent></Card>
                )) : filtered.map((deposit) => {
                    const config = STATUS_CONFIG[deposit.status] || STATUS_CONFIG.PENDING;
                    const StatusIcon = config.icon;
                    const remaining = (deposit.amount_required || 0) - (deposit.amount_paid || 0);
                    return (
                        <motion.div key={deposit.name} whileHover={{ x: 4 }}>
                            <Card className="border border-border shadow-sm hover:shadow-md transition-all group">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-cheese-100 dark:bg-cheese-900/30 flex items-center justify-center">
                                        <Wallet className="w-5 h-5 text-cheese-700 dark:text-cheese-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-sm text-foreground">{deposit.name}</h3>
                                            <Badge variant="outline" className="text-[10px]">{deposit.entity_type || '—'}</Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">Entity: {deposit.entity_id || '—'} • Due: {deposit.due_at || '—'}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-lg text-foreground flex items-center justify-end"><DollarSign className="w-4 h-4" />{Number(deposit.amount_required || 0).toLocaleString()}</p>
                                        {deposit.amount_paid > 0 && <p className="text-xs text-emerald-600">Paid: ${Number(deposit.amount_paid).toLocaleString()}</p>}
                                        {remaining > 0 && <p className="text-xs text-red-500">Remaining: ${remaining.toLocaleString()}</p>}
                                    </div>
                                    <Badge className={config.badge}><StatusIcon className="w-3 h-3 mr-1" />{config.label}</Badge>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100"><MoreHorizontal className="w-4 h-4" /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {deposit.status === "PENDING" && <DropdownMenuItem onClick={() => verifyMutation.mutate(deposit.name)}><CheckCircle className="w-3 h-3 mr-2" /> Verify</DropdownMenuItem>}
                                            {deposit.entity_id && <DropdownMenuItem onClick={() => navigate(`/cheese/tickets?search=${deposit.entity_id}`)}><Ticket className="w-3 h-3 mr-2" /> View Related Ticket</DropdownMenuItem>}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </CardContent>
                            </Card>
                        </motion.div>
                    );
                })}
            </div>

            {!isLoading && filtered.length === 0 && (
                <div className="text-center py-16"><Wallet className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" /><p className="text-muted-foreground">No deposits found</p></div>
            )}
        </motion.div>
    );
}
