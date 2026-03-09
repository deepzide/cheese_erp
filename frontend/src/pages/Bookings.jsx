import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingCart, Search, Filter, DollarSign, Clock, CheckCircle, XCircle, AlertCircle, RefreshCw, Users, Route, Ticket, MoreHorizontal, Eye, Wallet } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useFrappeList } from "@/lib/useApiData";

const STATUS_CONFIG = {
    PENDING: { label: "Pending", badge: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
    PARTIALLY_CONFIRMED: { label: "Partial", badge: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
    CONFIRMED: { label: "Confirmed", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    CANCELLED: { label: "Cancelled", badge: "bg-red-500/15 text-red-700 dark:text-red-400" },
    COMPLETED: { label: "Completed", badge: "bg-purple-500/15 text-purple-700 dark:text-purple-400" },
    EXPIRED: { label: "Expired", badge: "bg-gray-500/15 text-gray-600 dark:text-gray-400" },
};

export default function Bookings() {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const [selectedBooking, setSelectedBooking] = useState(null);

    const statusFilter = filterStatus !== "all" ? { status: filterStatus } : {};

    const { data: bookings = [], isLoading, error, refetch } = useFrappeList("Cheese Route Booking", {
        filters: statusFilter,
        fields: ["name", "contact", "route", "status", "total_price", "deposit_required", "deposit_amount", "expires_at"],
        pageSize: 100,
    });

    const filtered = (Array.isArray(bookings) ? bookings : []).filter(b => {
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return (b.name || '').toLowerCase().includes(term) || (b.contact || '').toLowerCase().includes(term) || (b.route || '').toLowerCase().includes(term);
        }
        return true;
    });

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">Failed to load bookings</h2>
                <p className="text-sm text-muted-foreground mb-4">{error?.message}</p>
                <Button onClick={() => refetch()} variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> Retry</Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><ShoppingCart className="w-6 h-6 text-cheese-600" /> Route Bookings</h1>
                    <p className="text-sm text-muted-foreground mt-1">{isLoading ? '...' : `${filtered.length} bookings`}</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger className="w-40 h-9"><Filter className="w-3 h-3 mr-1" /><SelectValue /></SelectTrigger>
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
                )) : filtered.map((booking) => {
                    const config = STATUS_CONFIG[booking.status] || STATUS_CONFIG.PENDING;
                    return (
                        <motion.div key={booking.name} whileHover={{ x: 4 }}>
                            <Card className="border border-border shadow-sm hover:shadow-md transition-all group cursor-pointer" onClick={() => setSelectedBooking(booking)}>
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-cheese-100 dark:bg-cheese-900/30 flex items-center justify-center">
                                        <ShoppingCart className="w-5 h-5 text-cheese-700 dark:text-cheese-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-sm text-foreground">{booking.name}</h3>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Contact: {booking.contact || '—'} • Route: {booking.route || '—'}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        {booking.total_price != null && <p className="font-bold text-foreground flex items-center"><DollarSign className="w-3.5 h-3.5" />{Number(booking.total_price || 0).toLocaleString()}</p>}
                                    </div>
                                    <Badge className={config.badge}>{config.label}</Badge>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="w-4 h-4" /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedBooking(booking); }}><Eye className="w-3 h-3 mr-2" /> View</DropdownMenuItem>
                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/cheese/routes?search=${booking.route}`); }}><Route className="w-3 h-3 mr-2" /> View Route</DropdownMenuItem>
                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/cheese/deposits?search=${booking.name}`); }}><Wallet className="w-3 h-3 mr-2" /> Deposits</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/cheese/support?route_booking=${booking.name}`); }}>Support Case</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </CardContent>
                            </Card>
                        </motion.div>
                    );
                })}
            </div>

            {!isLoading && filtered.length === 0 && (
                <div className="text-center py-16"><ShoppingCart className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" /><p className="text-muted-foreground">No bookings found</p></div>
            )}

            {/* Detail Dialog */}
            <Dialog open={!!selectedBooking} onOpenChange={(open) => !open && setSelectedBooking(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-cheese-600" /> {selectedBooking?.name}</DialogTitle>
                        <DialogDescription>Route Booking Details</DialogDescription>
                    </DialogHeader>
                    {selectedBooking && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div><p className="text-xs text-muted-foreground">Status</p><Badge className={STATUS_CONFIG[selectedBooking.status]?.badge}>{STATUS_CONFIG[selectedBooking.status]?.label}</Badge></div>
                                <div><p className="text-xs text-muted-foreground">Total</p><p className="font-semibold">${Number(selectedBooking.total_price || 0).toLocaleString()}</p></div>
                                <div><p className="text-xs text-muted-foreground">Contact</p><p className="text-sm font-medium">{selectedBooking.contact || '—'}</p></div>
                                <div><p className="text-xs text-muted-foreground">Route</p><p className="text-sm font-medium">{selectedBooking.route || '—'}</p></div>
                                <div><p className="text-xs text-muted-foreground">Deposit Required</p><p className="text-sm">{selectedBooking.deposit_required ? 'Yes' : 'No'}</p></div>
                                <div><p className="text-xs text-muted-foreground">Expires</p><p className="text-sm">{selectedBooking.expires_at || '—'}</p></div>
                            </div>
                            <DialogFooter className="gap-2">
                                <Button variant="outline" onClick={() => navigate(`/cheese/contacts?search=${selectedBooking.contact}`)}><Users className="w-4 h-4 mr-1" /> Contact</Button>
                                <Button variant="outline" onClick={() => navigate(`/cheese/routes?search=${selectedBooking.route}`)}><Route className="w-4 h-4 mr-1" /> Route</Button>
                                <Button variant="outline" onClick={() => navigate(`/cheese/deposits?search=${selectedBooking.name}`)}><Wallet className="w-4 h-4 mr-1" /> Deposits</Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
