import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
    Ticket, Route, Sparkles, CalendarDays, Users, TrendingUp,
    Clock, AlertCircle, Plus, ArrowUpRight, CheckCircle2,
    XCircle, Timer, Eye
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } }
};

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4 } }
};

const TICKET_COLORS = {
    Pending: "#FDD835",
    Confirmed: "#4CAF50",
    "Checked-In": "#2196F3",
    Completed: "#9C27B0",
    Cancelled: "#F44336",
    "No-Show": "#FF9800",
};

const mockTicketStats = [
    { name: "Pending", value: 12, color: TICKET_COLORS.Pending },
    { name: "Confirmed", value: 28, color: TICKET_COLORS.Confirmed },
    { name: "Checked-In", value: 8, color: TICKET_COLORS["Checked-In"] },
    { name: "Completed", value: 45, color: TICKET_COLORS.Completed },
    { name: "Cancelled", value: 5, color: TICKET_COLORS.Cancelled },
    { name: "No-Show", value: 2, color: TICKET_COLORS["No-Show"] },
];

const mockWeeklyData = [
    { day: "Mon", tickets: 18 },
    { day: "Tue", tickets: 24 },
    { day: "Wed", tickets: 32 },
    { day: "Thu", tickets: 28 },
    { day: "Fri", tickets: 35 },
    { day: "Sat", tickets: 42 },
    { day: "Sun", tickets: 15 },
];

const mockAgenda = [
    { time: "09:00", title: "Wine Tasting Tour", slots: 3, booked: 12, capacity: 15 },
    { time: "10:30", title: "Cheese Factory Visit", slots: 2, booked: 8, capacity: 20 },
    { time: "12:00", title: "Gourmet Lunch Experience", slots: 1, booked: 18, capacity: 20 },
    { time: "14:00", title: "Artisan Workshop", slots: 2, booked: 5, capacity: 12 },
    { time: "16:00", title: "Sunset Vineyard Walk", slots: 1, booked: 10, capacity: 10 },
];

export default function Dashboard() {
    const navigate = useNavigate();
    const totalTickets = mockTicketStats.reduce((a, b) => a + b.value, 0);

    const kpiCards = [
        { title: "Total Tickets Today", value: totalTickets, icon: Ticket, change: "+12%", color: "from-yellow-500 to-amber-500", textColor: "text-black" },
        { title: "Active Routes", value: 8, icon: Route, change: "+2", color: "from-emerald-500 to-green-600", textColor: "text-white" },
        { title: "Pending Actions", value: 12, icon: AlertCircle, change: "3 urgent", color: "from-red-500 to-rose-600", textColor: "text-white" },
        { title: "Occupancy Rate", value: "73%", icon: TrendingUp, change: "+5%", color: "from-blue-500 to-indigo-600", textColor: "text-white" },
    ];

    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="p-6 space-y-6"
        >
            {/* Page Header */}
            <motion.div variants={item} className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                    <p className="text-sm text-muted-foreground mt-1">Welcome back to your control center</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        onClick={() => navigate(createPageUrl("tickets"))}
                        className="cheese-gradient text-black font-semibold border-0 hover:shadow-lg hover:shadow-yellow-500/20"
                    >
                        <Plus className="w-4 h-4 mr-1" /> New Ticket
                    </Button>
                </div>
            </motion.div>

            {/* KPI Cards */}
            <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {kpiCards.map((kpi, i) => (
                    <Card key={i} className="overflow-hidden border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
                        <div className={`bg-gradient-to-br ${kpi.color} p-5`}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className={`text-sm font-medium ${kpi.textColor} opacity-80`}>{kpi.title}</p>
                                    <p className={`text-3xl font-bold ${kpi.textColor} mt-1`}>{kpi.value}</p>
                                </div>
                                <div className={`w-12 h-12 rounded-xl ${kpi.textColor}/10 bg-white/20 flex items-center justify-center`}>
                                    <kpi.icon className={`w-6 h-6 ${kpi.textColor}`} />
                                </div>
                            </div>
                            <div className="mt-3 flex items-center gap-1">
                                <ArrowUpRight className={`w-3 h-3 ${kpi.textColor} opacity-70`} />
                                <span className={`text-xs font-medium ${kpi.textColor} opacity-70`}>{kpi.change} from yesterday</span>
                            </div>
                        </div>
                    </Card>
                ))}
            </motion.div>

            {/* Charts Row */}
            <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Ticket Status Donut */}
                <Card className="border-0 shadow-lg">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center">
                                <Ticket className="w-4 h-4 text-yellow-600" />
                            </div>
                            Ticket Status
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={mockTicketStats}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={50}
                                        outerRadius={75}
                                        paddingAngle={3}
                                        dataKey="value"
                                    >
                                        {mockTicketStats.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', color: '#fff' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                            {mockTicketStats.map((stat) => (
                                <div key={stat.name} className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stat.color }} />
                                    <span className="text-xs text-muted-foreground">{stat.name}</span>
                                    <span className="text-xs font-semibold ml-auto">{stat.value}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Weekly Trend */}
                <Card className="border-0 shadow-lg lg:col-span-2">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                                <TrendingUp className="w-4 h-4 text-blue-600" />
                            </div>
                            Weekly Ticket Trend
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={mockWeeklyData}>
                                    <XAxis dataKey="day" axisLine={false} tickLine={false} className="text-xs" />
                                    <YAxis axisLine={false} tickLine={false} className="text-xs" />
                                    <Tooltip
                                        contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', color: '#fff' }}
                                        cursor={{ fill: 'rgba(253, 216, 53, 0.1)' }}
                                    />
                                    <Bar dataKey="tickets" fill="#FDD835" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Today's Agenda + Quick Actions */}
            <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Today's Agenda */}
                <Card className="border-0 shadow-lg lg:col-span-2">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                                <Clock className="w-4 h-4 text-purple-600" />
                            </div>
                            Today's Agenda
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {mockAgenda.map((event, i) => {
                            const occupancy = Math.round((event.booked / event.capacity) * 100);
                            return (
                                <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors group">
                                    <div className="text-center min-w-[48px]">
                                        <span className="text-sm font-bold text-gray-900">{event.time}</span>
                                    </div>
                                    <div className="w-px h-10 bg-cheese-300" />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm text-gray-900 truncate">{event.title}</p>
                                        <div className="flex items-center gap-3 mt-1">
                                            <span className="text-xs text-muted-foreground">
                                                {event.booked}/{event.capacity} booked
                                            </span>
                                            <Progress value={occupancy} className="h-1.5 flex-1 max-w-[120px]" />
                                            <Badge variant={occupancy >= 90 ? "destructive" : occupancy >= 70 ? "warning" : "success"} className="text-[10px]">
                                                {occupancy}%
                                            </Badge>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className="text-xs">
                                        {event.slots} slots
                                    </Badge>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card className="border-0 shadow-lg">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                                <Sparkles className="w-4 h-4 text-amber-600" />
                            </div>
                            Quick Actions
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {[
                            { label: "Create Ticket", icon: Ticket, path: "tickets", color: "bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/20" },
                            { label: "New Route", icon: Route, path: "routes", color: "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20" },
                            { label: "Add Experience", icon: Sparkles, path: "experiences", color: "bg-blue-500/10 text-blue-700 hover:bg-blue-500/20" },
                            { label: "View Calendar", icon: CalendarDays, path: "calendar", color: "bg-purple-500/10 text-purple-700 hover:bg-purple-500/20" },
                            { label: "Manage Contacts", icon: Users, path: "contacts", color: "bg-rose-500/10 text-rose-700 hover:bg-rose-500/20" },
                        ].map((action) => (
                            <Button
                                key={action.label}
                                variant="ghost"
                                onClick={() => navigate(createPageUrl(action.path))}
                                className={`w-full justify-start h-11 ${action.color} transition-all duration-200`}
                            >
                                <action.icon className="w-4 h-4 mr-3" />
                                {action.label}
                            </Button>
                        ))}
                    </CardContent>
                </Card>
            </motion.div>
        </motion.div>
    );
}
