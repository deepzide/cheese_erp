import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { 
    AlertCircle, RefreshCw, BedDouble, ChevronLeft, MapPin, 
    Calendar, Moon, Check, X, CreditCard, ExternalLink,
    User, Phone, Mail, DollarSign
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { hotelService } from "@/api/hotelService";
import { ticketService } from "@/api/ticketService";

const STATUS_COLORS = {
    PENDING: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
    CONFIRMED: "bg-blue-500/15 text-blue-700 border-blue-500/30",
    CHECKED_IN: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
    COMPLETED: "bg-gray-500/15 text-gray-600 border-gray-500/30",
    CANCELLED: "bg-red-500/15 text-red-700 border-red-500/30",
    NO_SHOW: "bg-orange-500/15 text-orange-700 border-orange-500/30",
    EXPIRED: "bg-gray-500/15 text-gray-500 border-gray-500/30",
    REJECTED: "bg-red-500/15 text-red-600 border-red-500/30",
};

export default function HotelReservationDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { t } = useTranslation();

    const { data: payload, isLoading, error, refetch } = useQuery({
        queryKey: ["hotel-reservation-detail", id],
        queryFn: async () => {
            const res = await hotelService.getHotelReservationDetails(id);
            // API returns: { success, message, data: { ticket, contact, payments } }
            const msg = res?.data?.message;
            return msg?.data || msg || res?.data || {};
        },
        enabled: !!id,
    });

    const reservation = payload?.ticket;
    const contact = payload?.contact;
    const payments = payload?.payments || [];

    const updateStatusMutation = useMutation({
        mutationFn: (newStatus) => ticketService.updateTicketStatus(id, newStatus),
        onSuccess: (_, newStatus) => {
            queryClient.invalidateQueries(["hotel-reservation-detail", id]);
            queryClient.invalidateQueries(["hotel-reservations"]);
            toast.success(`Reservation marked as ${newStatus.replace("_", " ")}`);
        },
        onError: (err) => {
            toast.error(err?.response?.data?.exception || err?.message || "Failed to update status");
        }
    });

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">{t("hotelReservations.failedToLoad", "Failed to load reservation details")}</h2>
                <Button onClick={() => refetch()} variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" /> {t("common.retry", "Retry")}
                </Button>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="p-6 max-w-4xl mx-auto space-y-6">
                <div className="flex gap-4">
                    <Skeleton className="h-10 w-24" />
                    <Skeleton className="h-10 flex-1" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 space-y-6">
                        <Skeleton className="h-64 w-full" />
                        <Skeleton className="h-64 w-full" />
                    </div>
                    <Skeleton className="h-96 w-full" />
                </div>
            </div>
        );
    }

    if (!reservation) {
        return (
            <div className="p-6 max-w-4xl mx-auto text-center py-20">
                <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2 text-foreground">{t("hotelReservations.notFound", "Reservation Not Found")}</h2>
                <p className="text-muted-foreground mb-6">{t("hotelReservations.notFoundDesc", "This reservation does not exist or you don't have access.")}</p>
                <Button onClick={() => navigate("/cheese/hotels/reservations")} variant="outline">
                    <ChevronLeft className="w-4 h-4 mr-2" /> {t("hotelReservations.backToReservations", "Back to Reservations")}
                </Button>
            </div>
        );
    }

    const isActive = ["PENDING", "CONFIRMED", "CHECKED_IN"].includes(reservation.status);

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 max-w-5xl mx-auto space-y-6">
            {/* Header Area */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={() => navigate("/cheese/hotels/reservations")} className="shrink-0 rounded-full h-10 w-10">
                        <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold font-mono tracking-tight text-foreground">{reservation.name}</h1>
                            <Badge variant="outline" className={`px-2.5 py-0.5 uppercase tracking-wide text-xs ${STATUS_COLORS[reservation.status] || "bg-gray-500/10 text-gray-500"}`}>
                                {t(`status.${reservation.status}`, reservation.status.replace("_", " "))}
                            </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                            <BedDouble className="w-4 h-4" /> {reservation.experience} {t("common.at", "at")} {reservation.company}
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                    {reservation.status === "PENDING" && (
                        <>
                            <Button variant="outline" onClick={() => updateStatusMutation.mutate("CANCELLED")} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                                <X className="w-4 h-4 mr-2" /> {t("common.cancel", "Cancel")}
                            </Button>
                            <Button onClick={() => updateStatusMutation.mutate("CONFIRMED")} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                <Check className="w-4 h-4 mr-2" /> {t("common.confirm", "Confirm")}
                            </Button>
                        </>
                    )}
                    {reservation.status === "CONFIRMED" && (
                        <>
                            <Button variant="outline" onClick={() => updateStatusMutation.mutate("CANCELLED")} className="text-red-600">
                                <X className="w-4 h-4 mr-2" /> {t("common.cancel", "Cancel")}
                            </Button>
                            <Button onClick={() => updateStatusMutation.mutate("CHECKED_IN")} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                <MapPin className="w-4 h-4 mr-2" /> {t("hotelReservations.checkIn", "Check-In")}
                            </Button>
                        </>
                    )}
                    {reservation.status === "CHECKED_IN" && (
                        <Button onClick={() => updateStatusMutation.mutate("COMPLETED")} className="bg-blue-600 hover:bg-blue-700 text-white">
                            <Check className="w-4 h-4 mr-2" /> {t("hotelReservations.completeStay", "Complete Stay")}
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Stay Details */}
                    <Card className="border-border shadow-sm overflow-hidden">
                        <div className="h-2 bg-indigo-500/20 w-full" />
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Moon className="w-5 h-5 text-indigo-500" /> {t("hotelReservations.stayDetails", "Stay Details")}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{t("hotelReservations.checkInDate", "Check-in")}</p>
                                        <div className="flex items-center gap-2 text-foreground font-medium text-lg">
                                            <Calendar className="w-5 h-5 text-emerald-500" />
                                            {reservation.check_in_date || t("common.notSet", "Not set")}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{t("hotelReservations.checkOutDate", "Check-out")}</p>
                                        <div className="flex items-center gap-2 text-foreground font-medium text-lg">
                                            <Calendar className="w-5 h-5 text-rose-500" />
                                            {reservation.check_out_date || t("common.notSet", "Not set")}
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-4 bg-muted/30 p-4 rounded-xl border border-border/50">
                                    <div className="flex justify-between items-center pb-2 border-b border-border/50">
                                        <span className="text-sm text-muted-foreground">{t("hotelReservations.duration", "Duration")}</span>
                                        <span className="font-semibold">{reservation.nights} {reservation.nights !== 1 ? t("common.nights", "Nights") : t("common.night", "Night")}</span>
                                    </div>
                                    <div className="flex justify-between items-center pb-2 border-b border-border/50">
                                        <span className="text-sm text-muted-foreground">{t("hotelReservations.roomsRequested", "Rooms Requested")}</span>
                                        <span className="font-semibold">{reservation.rooms_requested}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">{t("hotelReservations.partySize", "Party Size")}</span>
                                        <span className="font-semibold">{reservation.party_size} {reservation.party_size !== 1 ? t("common.guests", "Guests") : t("common.guest", "Guest")}</span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Guest Information */}
                    <Card className="border-border shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <User className="w-5 h-5 text-indigo-500" /> {t("hotelReservations.guestInfo", "Guest Information")}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {contact ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div>
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{t("common.fullName", "Full Name")}</p>
                                        <p className="font-medium">{contact.full_name || contact.name}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{t("common.phone", "Phone")}</p>
                                        <div className="flex items-center gap-2">
                                            <Phone className="w-4 h-4 text-muted-foreground" />
                                            <span>{contact.phone || t("common.notProvided", "Not provided")}</span>
                                        </div>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{t("common.email", "Email")}</p>
                                        <div className="flex items-center gap-2">
                                            <Mail className="w-4 h-4 text-muted-foreground" />
                                            <span>{contact.email || t("common.notProvided", "Not provided")}</span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-6 text-muted-foreground italic">
                                    {t("hotelReservations.noGuestInfo", "No guest information associated.")}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    {/* Financials */}
                    <Card className="border-border shadow-sm overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                            <DollarSign className="w-32 h-32" />
                        </div>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <CreditCard className="w-5 h-5 text-indigo-500" /> {t("hotelReservations.financialSummary", "Financial Summary")}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex justify-between items-end">
                                <p className="text-sm text-muted-foreground">{t("common.totalPrice", "Total Price")}</p>
                                <p className="text-3xl font-bold font-mono">${Number(reservation.total_price).toFixed(2)}</p>
                            </div>
                            
                            <Separator />
                            
                            <div className="space-y-2.5">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">{t("hotelReservations.paymentStatus", "Payment Status")}</span>
                                    <Badge variant={reservation.is_paid ? "default" : "destructive"} className={reservation.is_paid ? "bg-emerald-500" : ""}>
                                        {reservation.is_paid ? t("status.PAID", "PAID") : t("status.UNPAID", "UNPAID")}
                                    </Badge>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">{t("hotelReservations.amountPaid", "Amount Paid")}</span>
                                    <span className="font-semibold text-emerald-600">${Number(reservation.amount_paid_total || 0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">{t("hotelReservations.remainingBalance", "Remaining Balance")}</span>
                                    <span className={`font-semibold ${Number(reservation.remaining_balance || 0) > 0 ? "text-red-600" : "text-emerald-600"}`}>
                                        ${Number(reservation.remaining_balance || 0).toFixed(2)}
                                    </span>
                                </div>
                                {reservation.deposit_amount > 0 && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">{t("hotelReservations.depositRequired", "Deposit Required")}</span>
                                        <span className="font-semibold">${Number(reservation.deposit_amount).toFixed(2)}</span>
                                    </div>
                                )}
                            </div>
                            
                            {/* Show pay button whenever there's a remaining balance (including when paid=0) */}
                            {!reservation.is_paid && isActive && (
                                <Button 
                                    className="w-full cheese-gradient text-black font-semibold mt-2"
                                    onClick={() => navigate(`/cheese/deposits/new?ticket=${reservation.name}&from=reservation`)}
                                >
                                    <CreditCard className="w-4 h-4 mr-2" />
                                    {Number(reservation.amount_paid_total || 0) === 0
                                        ? t("hotelReservations.logPayment", "Log Payment")
                                        : t("hotelReservations.payRemainingBalance", "Pay Remaining Balance")}
                                </Button>
                            )}
                        </CardContent>
                    </Card>

                    {/* Payment History */}
                    {payments.length > 0 && (
                        <Card className="border-border shadow-sm">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t("hotelReservations.paymentHistory", "Payment History")}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {payments.map((p) => (
                                    <div key={p.name} className="flex justify-between items-center p-3 bg-muted/40 rounded-lg border border-border/50 text-sm hover:border-primary/30 transition-colors cursor-pointer" onClick={() => navigate(`/cheese/deposits/${p.name}`)}>
                                        <div className="space-y-1">
                                            <p className="font-medium font-mono text-xs">{p.name}</p>
                                            <p className="text-xs text-muted-foreground">{p.deposit_date}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-semibold">${Number(p.amount).toFixed(2)}</p>
                                            <Badge variant="outline" className={`text-[10px] uppercase h-5 px-1.5 ${p.status === "CONFIRMED" ? "text-emerald-600 border-emerald-200 bg-emerald-50" : ""}`}>{p.status}</Badge>
                                        </div>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
