import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShoppingCart, Search, Plus, DollarSign, Eye, Users, Clock } from "lucide-react";

const BK_STATUS = { Pending: "bg-yellow-500/15 text-yellow-700", Confirmed: "bg-emerald-500/15 text-emerald-700", "In Progress": "bg-blue-500/15 text-blue-700", Completed: "bg-purple-500/15 text-purple-700", Cancelled: "bg-red-500/15 text-red-700" };

const mockBookings = [
    { id: "BK-001", contact: "Alice Johnson", route: "Golden Route", total: 750, party_size: 3, status: "Confirmed", date: "Mar 5, 2026", experiences: 4 },
    { id: "BK-002", contact: "Bob Smith", route: "Premium Experience", total: 1350, party_size: 3, status: "Pending", date: "Mar 6, 2026", experiences: 3 },
    { id: "BK-003", contact: "Carlos Rivera", route: "Golden Route", total: 1250, party_size: 5, status: "In Progress", date: "Today", experiences: 4 },
    { id: "BK-004", contact: "Diana Lee", route: "VIP Cave Tour", total: 960, party_size: 8, status: "Completed", date: "Mar 2, 2026", experiences: 3 },
    { id: "BK-005", contact: "Evgeny Petrov", route: "Classic Tour", total: 360, party_size: 3, status: "Cancelled", date: "Mar 1, 2026", experiences: 2 },
    { id: "BK-006", contact: "Fatima Al-Rashid", route: "Premium Experience", total: 900, party_size: 2, status: "Confirmed", date: "Mar 7, 2026", experiences: 3 },
];

export default function Bookings() {
    const [searchTerm, setSearchTerm] = useState("");
    const filtered = mockBookings.filter(b => b.contact.toLowerCase().includes(searchTerm.toLowerCase()) || b.id.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><ShoppingCart className="w-6 h-6 text-cheese-600" /> Bookings</h1>
                    <p className="text-sm text-muted-foreground mt-1">{filtered.length} bookings</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
                    <Button className="cheese-gradient text-black font-semibold border-0 h-9"><Plus className="w-4 h-4 mr-1" /> New Booking</Button>
                </div>
            </div>
            <div className="space-y-3">
                {filtered.map((bk) => (
                    <motion.div key={bk.id} whileHover={{ x: 4 }}>
                        <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-all">
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-cheese-100 flex items-center justify-center"><ShoppingCart className="w-5 h-5 text-cheese-700" /></div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2"><h3 className="font-semibold text-sm">{bk.contact}</h3><span className="text-xs font-mono text-muted-foreground">{bk.id}</span></div>
                                    <p className="text-xs text-muted-foreground">{bk.route} • {bk.experiences} experiences</p>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground hidden md:flex">
                                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {bk.party_size}</span>
                                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {bk.date}</span>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-lg flex items-center"><DollarSign className="w-4 h-4" />{bk.total.toLocaleString()}</p>
                                    <Badge className={BK_STATUS[bk.status]}>{bk.status}</Badge>
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8"><Eye className="w-4 h-4" /></Button>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}
