import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LayoutDashboard, Ticket, Users, DollarSign, Clock, TrendingUp, AlertCircle, RefreshCw, CalendarDays, Shield, Sparkles } from "lucide-react";
import { dashboardService } from "@/api/dashboardService";
import { apiRequest } from "@/api/client";

export default function Dashboard() {
    const navigate = useNavigate();
    const [period, setPeriod] = useState("today");

    const { data: dashRaw, isLoading, error, refetch } = useQuery({
        queryKey: ['dashboard', period],
        queryFn: async () => {
            const result = await dashboardService.getCentralDashboard(period);
            const payload = result?.data?.message || result?.data || result;
            return payload?.data || payload || {};
        },
    });

    const { data: kpisRaw, isLoading: kpisLoading } = useQuery({
        queryKey: ['dashboard-kpis', period],
        queryFn: async () => {
            const result = await dashboardService.getDashboardKpis(null, period);
            const payload = result?.data?.message || result?.data || result;
            return payload?.data || payload || {};
        },
    });
    // Fallback: fetch tickets directly if dashboard doesn't have tickets_by_status
    const { data: ticketsRaw = [] } = useQuery({
        queryKey: ['dashboard-tickets'],
        queryFn: async () => {
            const params = new URLSearchParams();
            params.append('fields', JSON.stringify(["name", "status"]));
            params.append('limit_page_length', '500');
            const res = await apiRequest(`/api/resource/Cheese Ticket?${params}`);
            return res?.data?.data || [];
        },
    });

    const dashboard = dashRaw || {};
    const kpis = kpisRaw || {};

    // Compute tickets_by_status from raw tickets if dashboard doesn't provide it
    let ticketsByStatus = dashboard.tickets_by_status || {};
    if (Object.keys(ticketsByStatus).length === 0 && ticketsRaw.length > 0) {
        ticketsByStatus = {};
        ticketsRaw.forEach(t => {
            const s = t.status || 'Unknown';
            ticketsByStatus[s] = (ticketsByStatus[s] || 0) + 1;
        });
    }
    const totalTickets = Object.values(ticketsByStatus).reduce((sum, v) => sum + (Number(v) || 0), 0) || kpis?.conversion_rates?.total_tickets || 0;

    const convRates = kpis?.conversion_rates || {};
    const depRates = kpis?.deposit_collection_rates || {};
    const attRates = kpis?.attendance_rates || {};

    const totalLeads = convRates.total_leads || dashboard.total_leads || 0;
    const collectedRevenue = depRates.collected_amount || dashboard.total_revenue || 0;
    const pendingDeposits = (depRates.total_deposits || 0) - (depRates.paid_deposits || 0);
    const satisfaction = kpis?.average_satisfaction || 0;

    const kpiCards = [
        { title: "Total Tickets", value: totalTickets || convRates.total_tickets || 0, icon: Ticket, color: "text-blue-600", onClick: () => navigate('/cheese/tickets') },
        { title: "Revenue Collected", value: `$${Number(collectedRevenue).toLocaleString()}`, icon: DollarSign, color: "text-emerald-600", onClick: () => navigate('/cheese/deposits') },
        { title: "Leads", value: totalLeads, icon: Users, color: "text-purple-600", onClick: () => navigate('/cheese/leads') },
        { title: "Pending Deposits", value: pendingDeposits, icon: Clock, color: "text-orange-600", onClick: () => navigate('/cheese/deposits?status=PENDING') },
    ];

    // Ticket status breakdown for chart
    const statusEntries = Object.entries(ticketsByStatus);
    const maxCount = Math.max(1, ...statusEntries.map(([, v]) => v));

    const statusColors = {
        PENDING: "bg-yellow-500", CONFIRMED: "bg-emerald-500", CHECKED_IN: "bg-blue-500",
        COMPLETED: "bg-purple-500", CANCELLED: "bg-red-500", NO_SHOW: "bg-orange-500", EXPIRED: "bg-gray-500", REJECTED: "bg-rose-500",
    };

    // Recent activity / agenda
    const agenda = dashboard.agenda || dashboard.day_agenda || [];
    const pendingActions = dashboard.pending_actions || [];

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">Failed to load dashboard</h2>
                <p className="text-sm text-muted-foreground mb-4">{error?.message}</p>
                <Button onClick={() => refetch()} variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> Retry</Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <LayoutDashboard className="w-6 h-6 text-cheese-600" /> Dashboard
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">Overview of your cheese operations</p>
                </div>
                <div className="flex gap-2">
                    <Select value={period} onValueChange={setPeriod}>
                        <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="today">Today</SelectItem>
                            <SelectItem value="yesterday">Yesterday</SelectItem>
                            <SelectItem value="7">Last 7 Days</SelectItem>
                            <SelectItem value="30">Last 30 Days</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9"><RefreshCw className="w-4 h-4" /></Button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {kpiCards.map((kpi) => (
                    <motion.div key={kpi.title} whileHover={{ y: -3, scale: 1.02 }}>
                        <Card className="border-0 shadow-lg cursor-pointer hover:shadow-xl transition-all" onClick={kpi.onClick}>
                            <CardContent className="p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <kpi.icon className={`w-8 h-8 ${kpi.color}`} />
                                    <TrendingUp className="w-4 h-4 text-muted-foreground" />
                                </div>
                                {isLoading || kpisLoading ? (
                                    <><Skeleton className="h-8 w-20 mb-1" /><Skeleton className="h-3 w-24" /></>
                                ) : (
                                    <><p className="text-2xl font-bold text-foreground">{kpi.value}</p><p className="text-xs text-muted-foreground">{kpi.title}</p></>
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Ticket Status Chart */}
                <Card className="border-0 shadow-lg">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2"><Ticket className="w-4 h-4 text-cheese-600" /> Tickets by Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                        ) : statusEntries.length > 0 ? (
                            <div className="space-y-3">
                                {statusEntries.map(([status, count]) => (
                                    <div key={status} className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 p-1 rounded-lg" onClick={() => navigate(`/cheese/tickets?status=${status}`)}>
                                        <span className="text-xs font-medium w-20 text-muted-foreground uppercase">{status.replace('_', ' ')}</span>
                                        <div className="flex-1 bg-muted rounded-full h-4">
                                            <div className={`h-4 rounded-full ${statusColors[status] || 'bg-gray-500'} transition-all`} style={{ width: `${(count / maxCount) * 100}%` }} />
                                        </div>
                                        <span className="text-sm font-bold w-8 text-right">{count}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-center text-muted-foreground py-8">No ticket data for this period</p>
                        )}
                    </CardContent>
                </Card>

                {/* Quick Actions / Pending */}
                <Card className="border-0 shadow-lg">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2"><Shield className="w-4 h-4 text-cheese-600" /> Quick Links</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { label: "Tickets", icon: Ticket, path: "/cheese/tickets", color: "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400" },
                                { label: "Routes", icon: Sparkles, path: "/cheese/routes", color: "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400" },
                                { label: "Experiences", icon: Sparkles, path: "/cheese/experiences", color: "bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-400" },
                                { label: "Calendar", icon: CalendarDays, path: "/cheese/calendar", color: "bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-400" },
                                { label: "Deposits", icon: DollarSign, path: "/cheese/deposits", color: "bg-yellow-50 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-400" },
                                { label: "Support", icon: Shield, path: "/cheese/support", color: "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400" },
                                { label: "Contacts", icon: Users, path: "/cheese/contacts", color: "bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-400" },
                                { label: "Events Log", icon: Clock, path: "/cheese/events", color: "bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-400" },
                            ].map((item) => (
                                <Button key={item.label} variant="ghost" className={`h-auto flex flex-col items-center gap-2 py-4 rounded-xl ${item.color}`} onClick={() => navigate(item.path)}>
                                    <item.icon className="w-5 h-5" />
                                    <span className="text-xs font-medium">{item.label}</span>
                                </Button>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Agenda / Recent Activity */}
            {(Array.isArray(agenda) && agenda.length > 0) && (
                <Card className="border-0 shadow-lg">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="w-4 h-4 text-cheese-600" /> Today's Agenda</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {agenda.map((item, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                                    <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">{item.title || item.experience || item.name}</p>
                                        <p className="text-xs text-muted-foreground">{item.time || item.slot_time || '—'} • {item.description || `${item.booked || 0}/${item.capacity || 0} booked`}</p>
                                    </div>
                                    {item.status && <Badge variant="outline">{item.status}</Badge>}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </motion.div>
    );
}
