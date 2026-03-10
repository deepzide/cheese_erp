import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Route, Search, Plus, ChevronRight, Sparkles, Globe, WifiOff, Archive, MoreHorizontal, AlertCircle, RefreshCw, Loader2, DollarSign, Ticket, Eye } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { routeService } from "@/api/routeService";
import { experienceService } from "@/api/experienceService";
import { extractData } from "@/lib/useApiData";

const STATUS_CONFIG = {
    ONLINE: { label: "Online", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", icon: Globe },
    OFFLINE: { label: "Offline", badge: "bg-gray-500/15 text-gray-600 dark:text-gray-400", icon: WifiOff },
    ARCHIVED: { label: "Archived", badge: "bg-red-500/15 text-red-700 dark:text-red-400", icon: Archive },
};

export default function RoutesPage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const [createOpen, setCreateOpen] = useState(false);
    const [detailRoute, setDetailRoute] = useState(null);
    const [form, setForm] = useState({ name: "", description: "", price: "" });

    const { data: routesRaw, isLoading, error, refetch } = useQuery({
        queryKey: ['routes'],
        queryFn: async () => {
            const result = await routeService.listRoutes({ page_size: 100 });
            const payload = result?.data?.message || result?.data || result;
            return payload?.data || [];
        },
    });

    const { data: experiencesRaw } = useQuery({
        queryKey: ['experiences-for-routes'],
        queryFn: async () => {
            const result = await experienceService.listExperiences({ page_size: 100 });
            const payload = result?.data?.message || result?.data || result;
            return payload?.data || [];
        },
    });

    const routes = Array.isArray(routesRaw) ? routesRaw : [];
    const experiences = Array.isArray(experiencesRaw) ? experiencesRaw : [];

    const createMutation = useMutation({
        mutationFn: (data) => routeService.createRoute(data),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['routes'] }); setCreateOpen(false); setForm({ name: "", description: "", price: "" }); toast.success("Route created"); },
        onError: (err) => toast.error(err?.message || "Failed"),
    });

    const publishMutation = useMutation({
        mutationFn: (routeId) => routeService.publishRoute(routeId),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['routes'] }); toast.success("Route published"); },
    });

    const unpublishMutation = useMutation({
        mutationFn: (routeId) => routeService.unpublishRoute(routeId),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['routes'] }); toast.success("Route unpublished"); },
    });

    const archiveMutation = useMutation({
        mutationFn: (routeId) => routeService.archiveRoute(routeId),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['routes'] }); toast.success("Route archived"); },
    });

    const filtered = routes.filter(r => {
        if (filterStatus !== "all" && r.status !== filterStatus) return false;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return (r.name || '').toLowerCase().includes(term) || (r.description || '').toLowerCase().includes(term);
        }
        return true;
    });

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">Failed to load routes</h2>
                <p className="text-sm text-muted-foreground mb-4">{error?.message}</p>
                <Button onClick={() => refetch()} variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> Retry</Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Route className="w-6 h-6 text-cheese-600" /> Routes</h1>
                    <p className="text-sm text-muted-foreground mt-1">{isLoading ? '...' : `${filtered.length} routes`}</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Button className="cheese-gradient text-black font-semibold border-0 h-9" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" /> New Route</Button>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9"><RefreshCw className="w-4 h-4" /></Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {isLoading ? Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i} className="border border-border"><CardContent className="p-5 space-y-3">
                        <Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-full" /><Skeleton className="h-8 w-20" />
                    </CardContent></Card>
                )) : filtered.map((route) => {
                    const config = STATUS_CONFIG[route.status] || STATUS_CONFIG.OFFLINE;
                    const StatusIcon = config.icon;
                    return (
                        <motion.div key={route.name || route.route_id} whileHover={{ y: -3 }}>
                            <Card className="border border-border shadow-sm hover:shadow-md transition-all group cursor-pointer" onClick={(e) => {
                                if (!e.target.closest('[role="menuitem"]') && !e.target.closest('button')) {
                                    navigate(`/cheese/routes/${route.name}`);
                                }
                            }}>
                                <CardContent className="p-5">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 cheese-gradient rounded-xl flex items-center justify-center shadow-lg shadow-yellow-500/10">
                                                <Route className="w-5 h-5 text-black" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-foreground line-clamp-1">{route.route_info || route.name}</h3>
                                                <span className="text-xs text-muted-foreground">{route.route_id || route.name}</span>
                                            </div>
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="w-4 h-4" /></Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => navigate(`/cheese/routes/${route.name}`)}><Eye className="w-3 h-3 mr-2" /> View Details</DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                {route.status === "ONLINE" ? (
                                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); updateStatus(route.name, "OFFLINE"); }}><WifiOff className="w-3 h-3 mr-2" /> Take Offline</DropdownMenuItem>
                                                ) : (
                                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); updateStatus(route.name, "ONLINE"); }}><Globe className="w-3 h-3 mr-2" /> Publish Online</DropdownMenuItem>
                                                )}
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem className="text-red-600" onClick={(e) => { e.stopPropagation(); archiveMutation.mutate(route.name); }}><Archive className="w-3 h-3 mr-2" /> Archive</DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/cheese/bank-accounts?route=${route.name}`); }}>Bank Account</DropdownMenuItem>
                                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/cheese/documents?entity_type=Route&entity_id=${route.name}`); }}>Documents</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                    {route.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{route.description}</p>}
                                    <div className="flex items-center justify-between">
                                        <Badge className={config.badge}><StatusIcon className="w-3 h-3 mr-1" />{config.label}</Badge>
                                        {route.price != null && (
                                            <span className="text-sm font-semibold text-foreground flex items-center"><DollarSign className="w-3.5 h-3.5" />{Number(route.price).toLocaleString()}</span>
                                        )}
                                    </div>
                                    {route.experiences?.length > 0 && (
                                        <div className="mt-3 pt-3 border-t border-border">
                                            <div className="flex items-center gap-1 flex-wrap">
                                                <Sparkles className="w-3 h-3 text-cheese-600" />
                                                {route.experiences.slice(0, 3).map((exp, i) => (
                                                    <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">{exp.experience_info || exp.experience_id || exp.name}</Badge>
                                                ))}
                                                {route.experiences.length > 3 && <span className="text-[10px] text-muted-foreground">+{route.experiences.length - 3}</span>}
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </motion.div>
                    );
                })}
            </div>

            {!isLoading && filtered.length === 0 && (
                <div className="text-center py-16">
                    <Route className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
                    <p className="text-muted-foreground">No routes found</p>
                </div>
            )}

            {/* Create Route Dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-cheese-600" /> New Route</DialogTitle>
                        <DialogDescription>Create a new experience route</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2"><Label>Name *</Label><Input placeholder="Golden Route" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                        <div className="space-y-2"><Label>Description</Label><Input placeholder="A tour through the finest..." value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} /></div>
                        <div className="space-y-2"><Label>Price</Label><Input type="number" min="0" placeholder="150" value={form.price} onChange={(e) => setForm(f => ({ ...f, price: e.target.value }))} /></div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button className="cheese-gradient text-black font-semibold border-0" onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending}>
                            {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} Create
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Route Detail Dialog */}
            <Dialog open={!!detailRoute} onOpenChange={(open) => !open && setDetailRoute(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Route className="w-5 h-5 text-cheese-600" /> {detailRoute?.route_info || detailRoute?.name}</DialogTitle>
                    </DialogHeader>
                    {detailRoute && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div><p className="text-xs text-muted-foreground">Status</p><Badge className={STATUS_CONFIG[detailRoute.status]?.badge}>{STATUS_CONFIG[detailRoute.status]?.label}</Badge></div>
                                <div><p className="text-xs text-muted-foreground">Price</p><p className="font-semibold">${Number(detailRoute.price || 0).toLocaleString()}</p></div>
                            </div>
                            {detailRoute.description && <div><p className="text-xs text-muted-foreground">Description</p><p className="text-sm">{detailRoute.description}</p></div>}
                            {detailRoute.experiences?.length > 0 && (
                                <div>
                                    <p className="text-xs text-muted-foreground mb-2">Experiences ({detailRoute.experiences.length})</p>
                                    <div className="space-y-1">
                                        {detailRoute.experiences.map((exp, i) => (
                                            <div key={i} className="flex items-center gap-2 text-sm p-2 bg-muted rounded-lg">
                                                <span className="w-5 h-5 rounded-full bg-cheese-500 text-black text-xs flex items-center justify-center font-bold">{exp.sequence || i + 1}</span>
                                                <span>{exp.experience_info || exp.experience_id || exp.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <DialogFooter className="gap-2">
                                <Button variant="outline" onClick={() => navigate(`/cheese/tickets?route=${detailRoute.name}`)}><Ticket className="w-4 h-4 mr-1" /> View Tickets</Button>
                                <Button variant="outline" onClick={() => navigate(`/cheese/bookings?route=${detailRoute.name}`)}>Bookings</Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
