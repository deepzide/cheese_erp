import React, { useState, useMemo } from "react";
import { useAutoFillCompany } from "@/lib/useHotelAccess";
import { useActiveEstablishment } from "@/lib/ActiveEstablishmentContext";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingCart, Search, Filter, DollarSign, AlertCircle, RefreshCw, Users, Route, Ticket, MoreHorizontal, Eye, Wallet, Building2, TicketIcon, Plus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useFrappeList } from "@/lib/useApiData";
import { useHotelAccess } from "@/lib/useHotelAccess";

const STATUS_CONFIG = {
    PENDING: { label: "Pending", badge: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
    PARTIALLY_CONFIRMED: { label: "Partial", badge: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
    CONFIRMED: { label: "Confirmed", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    CHECKED_IN: { label: "Checked In", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    CANCELLED: { label: "Cancelled", badge: "bg-red-500/15 text-red-700 dark:text-red-400" },
    COMPLETED: { label: "Completed", badge: "bg-purple-500/15 text-purple-700 dark:text-purple-400" },
    EXPIRED: { label: "Expired", badge: "bg-gray-500/15 text-gray-600 dark:text-gray-400" },
};

export default function Bookings() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { isAdmin, userCompanies, companyLocked } = useHotelAccess();
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const { activeEstablishment } = useActiveEstablishment();
    const [filterEstablishment, setFilterEstablishment] = useState("all");
    React.useEffect(() => { setFilterEstablishment(activeEstablishment || "all"); }, [activeEstablishment]);

    useAutoFillCompany(
        filterEstablishment === "all" ? "" : filterEstablishment,
        (v) => setFilterEstablishment(v)
    );

    // Fetch Establishments (Companies)
    const { data: companies = [] } = useFrappeList("Company", {
        fields: ["name", "company_name"],
        pageSize: 100,
        enabled: isAdmin,
    });

    const companyOptions = useMemo(() => {
        if (isAdmin) return Array.isArray(companies) ? companies : [];
        return (Array.isArray(userCompanies) ? userCompanies : []).map((name) => ({
            name,
            company_name: name,
        }));
    }, [isAdmin, companies, userCompanies]);

    // 1. Fetch Route Bookings
    const { data: routeBookings = [], isLoading: rbLoading, error: rbError, refetch: rbRefetch } = useFrappeList("Cheese Route Booking", {
        fields: ["name", "contact", "route", "status", "total_price", "deposit_required", "deposit_amount", "expires_at", "creation"],
        pageSize: 200,
        orderBy: "creation desc"
    });

    // 2. Fetch Tickets (representing single experiences)
    const { data: tickets = [], isLoading: tLoading, error: tError, refetch: tRefetch } = useFrappeList("Cheese Ticket", {
        filters: { status: "CONFIRMED" },
        fields: ["name", "contact", "experience", "route", "company", "status", "deposit_amount", "creation"],
        pageSize: 200,
        orderBy: "creation desc"
    });

    const isLoading = rbLoading || tLoading;
    const error = rbError || tError;

    const refetchAll = () => {
        rbRefetch();
        tRefetch();
    };

    // Combine and Normalize the Bookings
    const allBookings = useMemo(() => {
        const rb = (Array.isArray(routeBookings) ? routeBookings : []).map(b => ({
            _type: "route_booking",
            name: b.name,
            contact: b.contact,
            entityInfo: b.route ? `${t("routes.route", "Route")}: ${b.route}` : t("bookings.customRoute", "Custom Route"),
            entityLink: b.route,
            company: null,
            status: b.status,
            price: b.total_price,
            creation: b.creation
        }));

        const tkts = (Array.isArray(tickets) ? tickets : []).map(ticketItem => ({
            _type: "ticket",
            name: ticketItem.name,
            contact: ticketItem.contact,
            entityInfo: ticketItem.experience ? `${t("routes.experiences", "Experience")}: ${ticketItem.experience}` : (ticketItem.route ? `${t("routes.route", "Route")}: ${ticketItem.route}` : t("nav.tickets", "Ticket")),
            entityLink: ticketItem.experience,
            company: ticketItem.company,
            status: ticketItem.status,
            price: ticketItem.deposit_amount, // fallback if price not explicitly available
            creation: ticketItem.creation
        }));

        // Merge and sort
        return [...rb, ...tkts].sort((a, b) => new Date(b.creation) - new Date(a.creation));
    }, [routeBookings, tickets]);

    // Apply client-side filters
    const filtered = allBookings.filter(b => {
        // Status filter
        if (filterStatus !== "all" && b.status !== filterStatus) return false;

        // Establishment filter
        if (filterEstablishment !== "all") {
            // For route bookings, if they don't have a company mapped, they are hidden if an establishment is selected.
            if (b.company !== filterEstablishment) return false;
        }

        // Search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return (b.name || '').toLowerCase().includes(term) ||
                (b.contact || '').toLowerCase().includes(term) ||
                (b.entityInfo || '').toLowerCase().includes(term);
        }

        return true;
    });

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">{t("bookings.loadFailed", "Failed to load bookings data")}</h2>
                <p className="text-sm text-muted-foreground mb-4">{error?.message}</p>
                <Button onClick={refetchAll} variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> {t("common.retry", "Retry")}</Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <ShoppingCart className="w-6 h-6 text-cheese-600" /> {t("bookings.title", "Bookings & Reservations")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {isLoading ? '...' : `${t("common.showing", "Showing")} ${filtered.length} ${t("bookings.reservations", "reservations")}`}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input placeholder={t("bookings.search", "Search bookings...")} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-48 h-9" />
                    </div>

                    <Select value={filterEstablishment} onValueChange={setFilterEstablishment} disabled={companyLocked}>
                        <SelectTrigger className="w-48 h-9">
                            <Building2 className="w-3 h-3 mr-1 text-muted-foreground" />
                            <SelectValue placeholder={t("bookings.allEstablishments", "All Establishments")} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t("bookings.allEstablishments", "All Establishments")}</SelectItem>
                            {Array.isArray(companyOptions) && companyOptions.map(c => (
                                <SelectItem key={c.name} value={c.name}>{c.company_name || c.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger className="w-36 h-9">
                            <Filter className="w-3 h-3 mr-1 text-muted-foreground" />
                            <SelectValue placeholder={t("common.allStatus", "All Status")} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t("common.allStatus", "All Status")}</SelectItem>
                            {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{t(`status.${k}`, v.label)}</SelectItem>)}
                        </SelectContent>
                    </Select>

                    <Button variant="ghost" size="icon" onClick={refetchAll} className="h-9 w-9">
                        <RefreshCw className="w-4 h-4" />
                    </Button>

                    <Button className="h-9 bg-cheese-500 hover:bg-cheese-600 text-black font-semibold" onClick={() => navigate("/cheese/bookings/new-route")}>
                        <Plus className="w-4 h-4 mr-1.5" /> {t("bookings.newRouteBooking", "New Route Reservation")}
                    </Button>
                </div>
            </div>

            <div className="space-y-3">
                {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                    <Card key={i} className="border border-border"><CardContent className="p-4 flex items-center gap-4">
                        <Skeleton className="w-10 h-10 rounded-lg" /><div className="flex-1"><Skeleton className="h-4 w-40 mb-2" /><Skeleton className="h-3 w-24" /></div><Skeleton className="h-6 w-20" />
                    </CardContent></Card>
                )) : filtered.map((booking) => {
                    const config = STATUS_CONFIG[booking.status] || STATUS_CONFIG.PENDING;
                    const isTicket = booking._type === "ticket";

                    return (
                        <motion.div key={booking.name} whileHover={{ x: 4 }}>
                            <Card
                                className="border border-border shadow-sm hover:shadow-md transition-all group cursor-pointer"
                                onClick={() => {
                                    if (isTicket) navigate(`/cheese/tickets/${booking.name}`);
                                    else navigate(`/cheese/bookings/${booking.name}`);
                                }}
                            >
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isTicket
                                        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                                        : "bg-cheese-100 dark:bg-cheese-900/30 text-cheese-700 dark:text-cheese-400"
                                        }`}>
                                        {isTicket ? <TicketIcon className="w-5 h-5" /> : <ShoppingCart className="w-5 h-5" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-sm text-foreground">{booking.name}</h3>
                                            {booking.company && <Badge variant="outline" className="text-[10px] font-normal px-1.5 py-0 h-4">{booking.company}</Badge>}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {t("nav.contacts", "Contact")}: {booking.contact || '—'} • {booking.entityInfo}
                                        </p>
                                    </div>
                                    <div className="text-right flex flex-col items-end gap-1">
                                        <Badge className={config.badge}>{t(`status.${booking.status}`, config.label)}</Badge>
                                        {booking.price != null && (
                                            <p className="font-semibold text-xs text-foreground flex items-center">
                                                <DollarSign className="w-3 h-3 text-muted-foreground mr-0.5" />
                                                {Number(booking.price || 0).toLocaleString()}
                                            </p>
                                        )}
                                    </div>

                                    {/* Action Menu */}
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                                <MoreHorizontal className="w-4 h-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(isTicket ? `/cheese/tickets/${booking.name}` : `/cheese/bookings/${booking.name}`);
                                            }}>
                                                <Eye className="w-3 h-3 mr-2" /> {t("common.viewDetails", "View Details")}
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); booking?.contact && navigate(`/cheese/contacts/${booking.contact}`); }}>
                                                <Users className="w-3 h-3 mr-2" /> {t("bookings.contactRecord", "Contact Record")}
                                            </DropdownMenuItem>

                                            {booking._type === "route_booking" && booking.entityLink && (
                                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/cheese/routes/${booking.entityLink}`); }}>
                                                    <Route className="w-3 h-3 mr-2" /> {t("bookings.routeDefinition", "Route Definition")}
                                                </DropdownMenuItem>
                                            )}

                                            <DropdownMenuItem onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(`/cheese/deposits/new?entity_type=${encodeURIComponent(isTicket ? "Cheese Ticket" : "Cheese Route Booking")}&entity_id=${encodeURIComponent(booking.name || "")}`);
                                            }}>
                                                <Wallet className="w-3 h-3 mr-2" /> {t("experiences.registerDeposit", "Register Deposit")}
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </CardContent>
                            </Card>
                        </motion.div>
                    );
                })}
            </div>

            {!isLoading && filtered.length === 0 && (
                <div className="text-center py-16">
                    <ShoppingCart className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
                    <p className="text-muted-foreground">{t("bookings.noReservations", "No reservations found for the selected filters")}</p>
                </div>
            )}
        </motion.div>
    );
}
