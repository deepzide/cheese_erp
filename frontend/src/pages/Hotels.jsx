import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Hotel, Search, Plus, AlertCircle, RefreshCw, BedDouble, Calendar } from "lucide-react";
import { hotelService } from "@/api/hotelService";
import { useTranslation } from "react-i18next";

export default function Hotels() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState("");

    const { data: payload, isLoading, error, refetch } = useQuery({
        queryKey: ["hotels"],
        queryFn: async () => {
            const res = await hotelService.listHotels({ page: 1, page_size: 200 });
            return res?.data?.message || res?.data || {};
        },
    });

    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const filtered = rows.filter((h) => {
        if (!searchTerm) return true;
        const t = searchTerm.toLowerCase();
        return (h.company_name || "").toLowerCase().includes(t) || (h.name || "").toLowerCase().includes(t);
    });

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">{t("hotels.loadFailed", "Failed to load hotels")}</h2>
                <Button onClick={() => refetch()} variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" /> {t("common.retry", "Retry")}
                </Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Hotel className="w-6 h-6 text-cheese-600" /> {t("hotels.title", "Hotels")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {isLoading ? "…" : t("hotels.establishmentsCount", { count: filtered.length, defaultValue: `${filtered.length} hotel establishments` })}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input placeholder={t("hotels.search", "Search hotels…")} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" />
                    </div>
                    <Button variant="outline" className="h-9" onClick={() => navigate("/cheese/hotels/rooms/new")}>
                        <Plus className="w-4 h-4 mr-1" /> {t("hotelReservations.newRoomType", "New Room Type")}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9">
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {isLoading
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <Card key={i} className="border border-border">
                            <CardContent className="p-5 space-y-3">
                                <Skeleton className="h-5 w-40" />
                                <Skeleton className="h-4 w-full" />
                            </CardContent>
                        </Card>
                    ))
                    : filtered.map((hotel) => (
                        <motion.div key={hotel.name} whileHover={{ y: -3 }}>
                            <Card className="border border-border shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={() => navigate(`/cheese/hotel-reservations?hotel=${encodeURIComponent(hotel.name)}`)}>
                                <CardContent className="p-5">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                                                <Hotel className="w-5 h-5 text-indigo-500" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-foreground">{hotel.company_name || hotel.name}</h3>
                                                <span className="text-xs font-mono text-muted-foreground">{hotel.name}</span>
                                            </div>
                                        </div>
                                        <Badge className="bg-indigo-500/15 text-indigo-600">{t("hotels.hotelBadge", "Hotel")}</Badge>
                                    </div>
                                    <div className="space-y-1.5 text-xs text-muted-foreground">
                                        <div className="flex items-center gap-2">
                                            <BedDouble className="w-3.5 h-3.5" />
                                            {t("hotels.roomTypesCount", {
                                                count: hotel.experience_count ?? 0,
                                                defaultValue: `${hotel.experience_count ?? 0} room type${(hotel.experience_count ?? 0) !== 1 ? "s" : ""}`,
                                            })}
                                        </div>
                                        {hotel.cheese_operating_hours && (
                                            <div className="flex items-center gap-2">
                                                <Calendar className="w-3.5 h-3.5" />
                                                {hotel.cheese_operating_hours}
                                            </div>
                                        )}
                                        {hotel.administrator_contact && (
                                            <p className="truncate">{t("hotels.contactLabel", "Contact")}: {hotel.administrator_contact}</p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
            </div>

            {!isLoading && filtered.length === 0 && (
                <div className="text-center py-16">
                    <Hotel className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-muted-foreground">{t("hotels.noneFound", "No hotels found")}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t("hotels.markAsHotelHint", "Mark an establishment as \"Is Hotel\" to see it here.")}
                    </p>
                </div>
            )}
        </motion.div>
    );
}
