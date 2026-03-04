import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
    Route, Search, Plus, Globe, GlobeLock, Archive, ChevronRight,
    Sparkles, DollarSign, MoreHorizontal, ArrowRight
} from "lucide-react";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0 } };

const STATUS_MAP = {
    ONLINE: { label: "Online", color: "bg-emerald-500/15 text-emerald-700 border-emerald-200", icon: Globe },
    OFFLINE: { label: "Offline", color: "bg-gray-500/15 text-gray-600 border-gray-200", icon: GlobeLock },
    ARCHIVED: { label: "Archived", color: "bg-red-500/15 text-red-600 border-red-200", icon: Archive },
};

const mockRoutes = [
    { id: "RT-001", name: "Golden Route", description: "Premium full-day experience combining the best of our offerings", status: "ONLINE", experiences: ["Wine Tasting", "Cheese Factory", "Gourmet Lunch", "Sunset Walk"], price: 250, bookings_today: 12, capacity: 20, deposit_required: true },
    { id: "RT-002", name: "Classic Tour", description: "A traditional half-day exploration of our finest selections", status: "ONLINE", experiences: ["Cheese Factory", "Artisan Workshop"], price: 120, bookings_today: 8, capacity: 15, deposit_required: false },
    { id: "RT-003", name: "Premium Experience", description: "Exclusive VIP access to rare and limited experiences", status: "ONLINE", experiences: ["VIP Cave Tour", "Wine Tasting", "Private Dinner"], price: 450, bookings_today: 4, capacity: 8, deposit_required: true },
    { id: "RT-004", name: "Family Fun", description: "Kid-friendly adventure through our interactive stations", status: "OFFLINE", experiences: ["Interactive Workshop", "Taste & Play"], price: 80, bookings_today: 0, capacity: 25, deposit_required: false },
    { id: "RT-005", name: "Weekend Special", description: "Limited weekend-only route with exclusive tastings", status: "ARCHIVED", experiences: ["Special Tasting", "Garden Walk"], price: 180, bookings_today: 0, capacity: 12, deposit_required: true },
];

export default function RoutesPage() {
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedRoute, setSelectedRoute] = useState(null);
    const [detailOpen, setDetailOpen] = useState(false);

    const filtered = mockRoutes.filter(r =>
        r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <motion.div variants={container} initial="hidden" animate="show" className="p-6 space-y-6">
            <motion.div variants={item} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Route className="w-6 h-6 text-cheese-600" />
                        Route Management
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">{filtered.length} routes configured</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input placeholder="Search routes..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" />
                    </div>
                    <Button className="cheese-gradient text-black font-semibold border-0 h-9">
                        <Plus className="w-4 h-4 mr-1" /> New Route
                    </Button>
                </div>
            </motion.div>

            <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((route) => {
                    const statusConfig = STATUS_MAP[route.status];
                    const StatusIcon = statusConfig.icon;
                    const occupancy = route.capacity > 0 ? Math.round((route.bookings_today / route.capacity) * 100) : 0;

                    return (
                        <motion.div key={route.id} whileHover={{ y: -4 }} transition={{ duration: 0.2 }}>
                            <Card className="border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-300 group overflow-hidden">
                                <div className={`h-1 ${route.status === 'ONLINE' ? 'cheese-gradient' : route.status === 'OFFLINE' ? 'bg-gray-300' : 'bg-red-300'}`} />
                                <CardContent className="p-5">
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-mono text-muted-foreground">{route.id}</span>
                                                <Badge className={statusConfig.color}>
                                                    <StatusIcon className="w-3 h-3 mr-1" />
                                                    {statusConfig.label}
                                                </Badge>
                                            </div>
                                            <h3 className="text-lg font-bold text-gray-900">{route.name}</h3>
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <MoreHorizontal className="w-4 h-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem><Globe className="w-3 h-3 mr-2" /> Publish</DropdownMenuItem>
                                                <DropdownMenuItem><GlobeLock className="w-3 h-3 mr-2" /> Unpublish</DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem className="text-red-600"><Archive className="w-3 h-3 mr-2" /> Archive</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>

                                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{route.description}</p>

                                    {/* Experience Flow */}
                                    <div className="flex items-center gap-1 mb-4 overflow-hidden">
                                        {route.experiences.map((exp, i) => (
                                            <React.Fragment key={i}>
                                                <span className="text-[10px] bg-cheese-50 text-cheese-800 px-2 py-1 rounded-full whitespace-nowrap font-medium border border-cheese-200">
                                                    {exp}
                                                </span>
                                                {i < route.experiences.length - 1 && (
                                                    <ArrowRight className="w-3 h-3 text-cheese-400 flex-shrink-0" />
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </div>

                                    {/* Stats */}
                                    <div className="flex items-center justify-between text-sm mb-2">
                                        <span className="text-muted-foreground">Today's bookings</span>
                                        <span className="font-semibold">{route.bookings_today}/{route.capacity}</span>
                                    </div>
                                    <Progress value={occupancy} className="h-1.5 mb-3" />

                                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                                        <div className="flex items-center gap-1">
                                            <DollarSign className="w-3.5 h-3.5 text-cheese-600" />
                                            <span className="font-bold text-gray-900">${route.price}</span>
                                            {route.deposit_required && (
                                                <Badge variant="outline" className="text-[10px] ml-1">Deposit</Badge>
                                            )}
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-cheese-600 hover:text-cheese-700 hover:bg-cheese-50 h-7 text-xs"
                                            onClick={() => { setSelectedRoute(route); setDetailOpen(true); }}
                                        >
                                            Details <ChevronRight className="w-3 h-3 ml-1" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    );
                })}
            </motion.div>

            {/* Route Detail Dialog */}
            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Route className="w-5 h-5 text-cheese-600" />
                            {selectedRoute?.name}
                        </DialogTitle>
                        <DialogDescription>{selectedRoute?.id} • {selectedRoute?.description}</DialogDescription>
                    </DialogHeader>
                    {selectedRoute && (
                        <div className="space-y-4">
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Experience Flow</p>
                                <div className="flex flex-wrap items-center gap-2">
                                    {selectedRoute.experiences.map((exp, i) => (
                                        <React.Fragment key={i}>
                                            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                                                <div className="w-6 h-6 rounded-full bg-cheese-100 flex items-center justify-center text-xs font-bold text-cheese-700">{i + 1}</div>
                                                <span className="text-sm font-medium">{exp}</span>
                                            </div>
                                            {i < selectedRoute.experiences.length - 1 && (
                                                <ChevronRight className="w-4 h-4 text-cheese-400" />
                                            )}
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gray-50 rounded-lg p-3">
                                    <p className="text-xs text-muted-foreground">Price</p>
                                    <p className="text-xl font-bold text-gray-900">${selectedRoute.price}</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-3">
                                    <p className="text-xs text-muted-foreground">Capacity</p>
                                    <p className="text-xl font-bold text-gray-900">{selectedRoute.capacity}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
