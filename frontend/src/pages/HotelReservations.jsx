import React, { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BedDouble, Search, AlertCircle, RefreshCw, Calendar, User, Phone, Mail, DollarSign, Moon } from "lucide-react";
import { hotelService } from "@/api/hotelService";

const STATUS_COLORS = {
    PENDING: "bg-yellow-500/15 text-yellow-700",
    CONFIRMED: "bg-blue-500/15 text-blue-700",
    CHECKED_IN: "bg-emerald-500/15 text-emerald-700",
    COMPLETED: "bg-gray-500/15 text-gray-600",
    CANCELLED: "bg-red-500/15 text-red-700",
    NO_SHOW: "bg-orange-500/15 text-orange-700",
    EXPIRED: "bg-gray-500/15 text-gray-500",
    REJECTED: "bg-red-500/15 text-red-600",
};

export default function HotelReservations() {
    const [searchParams] = useSearchParams();
    const hotelId = searchParams.get("hotel");
    const [statusFilter, setStatusFilter] = useState("all");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    const { data: payload, isLoading, error, refetch } = useQuery({
        queryKey: ["hotel-reservations", hotelId, statusFilter, dateFrom, dateTo],
        queryFn: async () => {
            const params = { page: 1, page_size: 100 };
            if (hotelId) params.hotel_id = hotelId;
            if (statusFilter && statusFilter !== "all") params.status = statusFilter;
            if (dateFrom) params.date_from = dateFrom;
            if (dateTo) params.date_to = dateTo;
            const res = await hotelService.getHotelReservations(params);
            return res?.data?.message || res?.data || {};
        },
    });

    const reservations = Array.isArray(payload?.data) ? payload.data : [];

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">Failed to load hotel reservations</h2>
                <Button onClick={() => refetch()} variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" /> Retry
                </Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <BedDouble className="w-6 h-6 text-indigo-500" /> Hotel Reservations
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {isLoading ? "…" : `${reservations.length} reservations`}
                        {hotelId ? ` for ${hotelId}` : ""}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-40" placeholder="From" />
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-40" placeholder="To" />
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-36 h-9">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="PENDING">Pending</SelectItem>
                            <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                            <SelectItem value="CHECKED_IN">Checked In</SelectItem>
                            <SelectItem value="COMPLETED">Completed</SelectItem>
                            <SelectItem value="CANCELLED">Cancelled</SelectItem>
                            <SelectItem value="NO_SHOW">No Show</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9">
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            <div className="space-y-3">
                {isLoading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <Card key={i} className="border border-border">
                            <CardContent className="p-5 space-y-3">
                                <Skeleton className="h-5 w-60" />
                                <Skeleton className="h-4 w-full" />
                            </CardContent>
                        </Card>
                    ))
                    : reservations.map((res) => (
                        <motion.div key={res.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                            <Card className="border border-border shadow-sm hover:shadow-md transition-all">
                                <CardContent className="p-5">
                                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                        <div className="space-y-2 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-sm font-semibold text-foreground">{res.name}</span>
                                                <Badge className={STATUS_COLORS[res.status] || "bg-gray-500/15 text-gray-600"}>
                                                    {res.status}
                                                </Badge>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm text-muted-foreground">
                                                {res.contact_name && (
                                                    <div className="flex items-center gap-1.5">
                                                        <User className="w-3.5 h-3.5" /> {res.contact_name}
                                                    </div>
                                                )}
                                                {res.contact_phone && (
                                                    <div className="flex items-center gap-1.5">
                                                        <Phone className="w-3.5 h-3.5" /> {res.contact_phone}
                                                    </div>
                                                )}
                                                {res.contact_email && (
                                                    <div className="flex items-center gap-1.5">
                                                        <Mail className="w-3.5 h-3.5" /> {res.contact_email}
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-1.5">
                                                    <BedDouble className="w-3.5 h-3.5" /> {res.experience_name || res.experience}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-1">
                                                {res.check_in_date && (
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="w-3 h-3" /> In: {res.check_in_date}
                                                    </span>
                                                )}
                                                {res.check_out_date && (
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="w-3 h-3" /> Out: {res.check_out_date}
                                                    </span>
                                                )}
                                                {res.nights && (
                                                    <span className="flex items-center gap-1">
                                                        <Moon className="w-3 h-3" /> {res.nights} night{res.nights !== 1 ? "s" : ""}
                                                    </span>
                                                )}
                                                {res.rooms_requested && (
                                                    <span className="flex items-center gap-1">
                                                        <BedDouble className="w-3 h-3" /> {res.rooms_requested} room{res.rooms_requested !== 1 ? "s" : ""}
                                                    </span>
                                                )}
                                                {res.total_price != null && (
                                                    <span className="flex items-center gap-1">
                                                        <DollarSign className="w-3 h-3" /> {Number(res.total_price).toFixed(2)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
            </div>

            {!isLoading && reservations.length === 0 && (
                <div className="text-center py-16">
                    <BedDouble className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-muted-foreground">No reservations found</h3>
                    <p className="text-sm text-muted-foreground mt-1">Hotel reservations will appear here when guests book.</p>
                </div>
            )}
        </motion.div>
    );
}
