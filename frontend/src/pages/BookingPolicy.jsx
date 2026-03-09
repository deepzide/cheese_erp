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
import { Shield, Search, AlertCircle, RefreshCw, Loader2, Plus, Clock, MoreHorizontal, Sparkles } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useFrappeList, useFrappeCreate, useFrappeUpdate } from "@/lib/useApiData";

export default function BookingPolicy() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [editPolicy, setEditPolicy] = useState(null);
    const [form, setForm] = useState({ experience: searchParams.get('experience') || "", cancel_until_hours_before: "24", modify_until_hours_before: "12", min_hours_before_booking: "2" });

    const { data: policies = [], isLoading, error, refetch } = useFrappeList("Cheese Booking Policy", {
        fields: ["name", "experience", "cancel_until_hours_before", "modify_until_hours_before", "min_hours_before_booking", "creation", "modified"],
        pageSize: 100,
    });

    const createMutation = useFrappeCreate("Cheese Booking Policy");
    const updateMutation = useFrappeUpdate("Cheese Booking Policy");

    const filtered = (Array.isArray(policies) ? policies : []).filter(p => {
        if (searchTerm) return (p.experience || p.name || '').toLowerCase().includes(searchTerm.toLowerCase());
        return true;
    });

    const handleCreate = () => {
        if (!form.experience) { toast.error("Experience is required"); return; }
        createMutation.mutate({
            experience: form.experience,
            cancel_until_hours_before: parseInt(form.cancel_until_hours_before) || 24,
            modify_until_hours_before: parseInt(form.modify_until_hours_before) || 12,
            min_hours_before_booking: parseInt(form.min_hours_before_booking) || 2,
        }, {
            onSuccess: () => { setCreateOpen(false); toast.success("Policy created"); },
            onError: (err) => toast.error(err?.message || "Failed"),
        });
    };

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">Failed to load booking policies</h2>
                <p className="text-sm text-muted-foreground mb-4">{error?.message}</p>
                <Button onClick={() => refetch()} variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> Retry</Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Shield className="w-6 h-6 text-cheese-600" /> Booking Policies</h1>
                    <p className="text-sm text-muted-foreground mt-1">{isLoading ? '...' : `${filtered.length} policies`}</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
                    <Button className="cheese-gradient text-black font-semibold border-0 h-9" onClick={() => navigate("/cheese/booking-policy/new")}><Plus className="w-4 h-4 mr-1" /> New Policy</Button>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9"><RefreshCw className="w-4 h-4" /></Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {isLoading ? Array.from({ length: 3 }).map((_, i) => (
                    <Card key={i} className="border border-border"><CardContent className="p-5 space-y-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-full" /></CardContent></Card>
                )) : filtered.map((policy) => (
                    <motion.div key={policy.name} whileHover={{ y: -3 }}>
                        <Card className="border border-border shadow-sm hover:shadow-md transition-all group">
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <h3 className="font-semibold text-foreground">{policy.name}</h3>
                                        <span className="text-xs text-muted-foreground">Experience: {policy.experience || '—'}</span>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => navigate(`/cheese/experiences?search=${policy.experience}`)}><Sparkles className="w-3 h-3 mr-2" /> View Experience</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm"><Clock className="w-3.5 h-3.5 text-muted-foreground" /><span>Cancel before: <strong>{policy.cancel_until_hours_before || 0}h</strong></span></div>
                                    <div className="flex items-center gap-2 text-sm"><Clock className="w-3.5 h-3.5 text-muted-foreground" /><span>Modify before: <strong>{policy.modify_until_hours_before || 0}h</strong></span></div>
                                    <div className="flex items-center gap-2 text-sm"><Clock className="w-3.5 h-3.5 text-muted-foreground" /><span>Min booking: <strong>{policy.min_hours_before_booking || 0}h</strong> ahead</span></div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {!isLoading && filtered.length === 0 && (
                <div className="text-center py-16"><Shield className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" /><p className="text-muted-foreground">No policies found</p></div>
            )}

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-cheese-600" /> New Booking Policy</DialogTitle><DialogDescription>Set booking rules for an experience</DialogDescription></DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2"><Label>Experience *</Label><Input placeholder="Experience ID" value={form.experience} onChange={(e) => setForm(f => ({ ...f, experience: e.target.value }))} /></div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-2"><Label className="text-xs">Cancel (hrs)</Label><Input type="number" min="0" value={form.cancel_until_hours_before} onChange={(e) => setForm(f => ({ ...f, cancel_until_hours_before: e.target.value }))} /></div>
                            <div className="space-y-2"><Label className="text-xs">Modify (hrs)</Label><Input type="number" min="0" value={form.modify_until_hours_before} onChange={(e) => setForm(f => ({ ...f, modify_until_hours_before: e.target.value }))} /></div>
                            <div className="space-y-2"><Label className="text-xs">Min Book (hrs)</Label><Input type="number" min="0" value={form.min_hours_before_booking} onChange={(e) => setForm(f => ({ ...f, min_hours_before_booking: e.target.value }))} /></div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button className="cheese-gradient text-black font-semibold border-0" onClick={handleCreate} disabled={createMutation.isPending}>
                            {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} Create
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
